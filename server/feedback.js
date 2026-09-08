// What people write in from More -> Feedback.
//
// Three routes. Anyone may send one -- a bug is found by strangers as
// often as by accounts -- and it lands in a table, with a copy to a
// Discord webhook when the deployment has one, so the operator hears of
// it without opening the inbox. The inbox itself, and marking an entry
// done, are for the accounts named in ADMIN_IDS.
//
// Nothing here is a ticket system. An entry is a kind, some words and
// where the person was; the reply, if there is one, happens wherever the
// contact they left points.

import express from 'express';
import { config } from './config.js';
import { insertFeedback, listFeedback, setFeedbackStatus } from './db.js';
import { sessionUser, requireUser } from './session.js';
import { perAddress } from './limit.js';
import { wrap } from './wrap.js';

export const KINDS = ['bug', 'idea', 'other'];
export const MAX_TEXT = 4000;

/** Is this account allowed into the inbox? */
export const isAdmin = id => Boolean(id) && config.adminIds.has(String(id));

/** Express guard for the inbox: signed in, and named as an admin. */
export function requireAdmin(req, res, next) {
	requireUser(req, res, () => {
		if (!isAdmin(req.userId)) return res.status(403).json({ error: 'Not an admin.' });
		next();
	});
}

/** The words of an entry, or a complaint. */
function readEntry(body) {
	if (!body || typeof body !== 'object') return { error: 'Expected a feedback entry.' };
	const kind = KINDS.includes(body.kind) ? body.kind : null;
	if (!kind) return { error: 'Say what kind of feedback it is.' };
	const text = typeof body.text === 'string' ? body.text.trim() : '';
	if (text.length < 3) return { error: 'Say a little more than that.' };
	if (text.length > MAX_TEXT) return { error: `Keep it under ${MAX_TEXT} characters.` };
	const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
	return {
		kind, text,
		page: str(body.page, 80),
		contact: str(body.contact, 120),
		version: str(body.version, 64)
	};
}

/**
 * A copy to the webhook. Fire and forget: the entry is already in the
 * table, so a webhook that is down loses nothing but the ping. Discord
 * is on the far side of the internet, so the wait has a deadline.
 */
async function ping(entry, id) {
	if (!config.feedbackWebhook) return;
	const label = { bug: 'Something is wrong', idea: 'An idea', other: 'Something else' }[entry.kind] || entry.kind;
	const who = entry.username ? `${entry.username} (${entry.userId})` : 'a visitor';
	const lines = [
		`**${label}** #${id} from ${who}`,
		entry.page ? `on: ${entry.page}` : '',
		entry.version ? `build: ${entry.version}` : '',
		entry.contact ? `reach: ${entry.contact}` : '',
		'',
		entry.text.length > 1800 ? `${entry.text.slice(0, 1800)}…` : entry.text
	].filter(Boolean);
	try {
		await fetch(config.feedbackWebhook, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			// Discord renders markdown, and a stranger's text must not be
			// allowed to ping a role or everyone by writing @here.
			body: JSON.stringify({ content: lines.join('\n'), allowed_mentions: { parse: [] } }),
			signal: AbortSignal.timeout(8000)
		});
	} catch (err) {
		console.warn('[feedback] the webhook did not take it:', err.message);
	}
}

export function feedbackRoutes() {
	const router = express.Router();

	router.use('/feedback', (req, res, next) => {
		res.set('Cache-Control', 'no-store');
		res.set('Vary', 'Cookie');
		next();
	});

	// An entry is a few kilobytes at most; the parser is sized for it,
	// and an address gets a handful a minute -- enough to report three
	// things in a row, not enough to fill a table.
	const body = express.json({ limit: 16 * 1024 });
	const limit = perAddress(6, 120, 'That is a lot of feedback at once; try again in a minute.');

	/** Send one. Signed in or not. */
	router.post('/feedback', limit, body, wrap(async (req, res) => {
		const entry = readEntry(req.body);
		if (entry.error) return res.status(400).json({ error: entry.error });
		const uid = sessionUser(req);
		entry.userId = uid || null;
		// The name rides in from the client's own /me answer: a user row
		// lookup here would be one more query on a route strangers hit,
		// and the id is the part that is verified.
		entry.username = uid && typeof req.body.username === 'string' ? req.body.username.slice(0, 40) : null;
		entry.agent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 200) : null;
		const id = await insertFeedback(entry);
		ping(entry, id);   // not awaited
		res.status(201).json({ ok: true, id });
	}));

	/** The inbox: open first, newest first. Admins only. */
	router.get('/feedback', requireAdmin, wrap(async (req, res) => {
		res.json({ entries: await listFeedback(200) });
	}));

	/** Mark one done, or open it again. */
	router.post('/feedback/:id/status', requireAdmin, body, wrap(async (req, res) => {
		const id = Number(req.params.id);
		const status = req.body && req.body.status === 'open' ? 'open' : 'done';
		if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Which entry?' });
		await setFeedbackStatus(id, status);
		res.json({ ok: true, id, status });
	}));

	return router;
}
