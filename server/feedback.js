// What people write in from More -> Feedback.
//
// A report is a post now, not a line: a kind, words in the small markup
// of js/markup.js, and up to a few screenshots. That is the shape of the
// thing people were already trying to send -- three steps to reproduce,
// a picture of the number that is wrong -- and the old single field made
// them flatten it into a paragraph.
//
// Two rules changed with it, and both are about the same thing. Sending
// needs an account: a report worth answering is worth being able to
// answer, the pictures have to belong to somebody before they can be
// shown to anybody, and a box open to the whole internet with a file
// upload on it is a different object entirely. And an account may have
// only so many reports open at once -- see config.maxOpenReports -- so
// the inbox stays a list of things to do rather than a feed.
//
// The list of what has been written in is public: anyone can read the
// reports, with the pictures on them and the name of whoever sent them,
// the way an issue tracker is public. What stays behind the door is the
// part that is nobody else's business -- the contact someone left to be
// answered on, the account id, the browser string -- and every button
// that changes anything. Marking an entry done, hiding one, reopening
// it and throwing one away are for the accounts named in ADMIN_IDS.
//
// Hidden is the third status and the reason it exists: a report can
// carry something that should not have been public -- a name, an
// address, a screenshot with the wrong window behind it -- and the
// answer to that should not have to be deleting what somebody wrote.
//
// Nothing here is a ticket system. There is no reply from this side; the
// reply happens wherever the contact left in the report points, or in
// Discord, which is where these conversations already were.

import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, uploadsEnabled } from './config.js';
import {
	insertFeedback, listFeedback, setFeedbackStatus, deleteFeedback, feedbackStanding, feedbackShown,
	insertFile, getFile, pendingFiles, attachFiles, deleteFile, staleFiles
} from './db.js';
import { sniff, EXTENSION } from './images.js';
import { sessionUser, requireUser } from './session.js';
import { perAddress, perAccount } from './limit.js';
import { wrap } from './wrap.js';

export const KINDS = ['bug', 'idea', 'other'];
// The same ceiling js/markup.js keeps for a post. Long enough for steps,
// a quoted error and a paragraph either side of it.
export const MAX_TEXT = 8000;
const DAY_MS = 86_400_000;
const FILE_ID = /^[A-Za-z0-9_-]{4,64}$/;

/** What an entry may be: waiting, answered, or out of the public list. */
export const STATUSES = ['open', 'done', 'hidden'];

/** Is this account an admin -- the one who may change anything here? */
export const isAdmin = id => Boolean(id) && config.adminIds.has(String(id));

/**
 * One entry as anybody may read it.
 *
 * The words, the kind, whether it has been answered, who wrote it and
 * the pictures they sent -- and nothing that was only ever meant for
 * the person answering: no contact, no account id, no browser string.
 * `mine` is there so the box can say "yours" beside your own.
 */
function publicEntry(entry, uid) {
	return {
		id: entry.id, kind: entry.kind, status: entry.status,
		text: entry.text, format: entry.format,
		page: entry.page, version: entry.version,
		username: entry.username, createdAt: entry.createdAt,
		files: entry.files, mine: Boolean(uid) && entry.userId === uid
	};
}

/** Express guard for the inbox: signed in, and named as an admin. */
export function requireAdmin(req, res, next) {
	requireUser(req, res, () => {
		if (!isAdmin(req.userId)) return res.status(403).json({ error: 'Not an admin.' });
		next();
	});
}

/** Where one picture's bytes are. */
const onDisk = file => path.resolve(config.uploadDir, `${file.id}.${EXTENSION[file.mime] || 'bin'}`);

/** Unlink a picture, and do not care if it was already gone -- the row
 *  is the record, and a file the disk has lost is not worth an error. */
async function unlink(file) {
	try {
		await fs.unlink(onDisk(file));
	} catch (err) {
		if (err.code !== 'ENOENT') console.warn('[feedback] could not remove an image:', err.message);
	}
}

/** The words of an entry, or a complaint. */
function readEntry(body) {
	if (!body || typeof body !== 'object') return { error: 'Expected a feedback entry.' };
	const kind = KINDS.includes(body.kind) ? body.kind : null;
	if (!kind) return { error: 'Say what kind of feedback it is.' };
	const text = typeof body.text === 'string' ? body.text.trim() : '';
	const files = readFiles(body.files);
	if (files.error) return files;
	// A post that is nothing but a screenshot is a real report -- "look
	// at this" -- so the words are only required when there is nothing
	// else in it.
	if (text.length < 3 && !files.ids.length) return { error: 'Say a little more than that.' };
	if (text.length > MAX_TEXT) return { error: `Keep it under ${MAX_TEXT} characters.` };
	const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
	return {
		kind, text,
		// Everything the box sends now is markup; the word is stored so
		// that the entries written before it are still read as they were.
		format: body.format === 'plain' ? 'plain' : 'md',
		ids: files.ids,
		page: str(body.page, 80),
		contact: str(body.contact, 120),
		version: str(body.version, 64)
	};
}

function readFiles(given) {
	if (given === undefined || given === null) return { ids: [] };
	if (!Array.isArray(given)) return { error: 'Attachments must be a list.' };
	const ids = given.map(String).filter(id => FILE_ID.test(id));
	if (ids.length !== given.length) return { error: 'That is not an image this box gave out.' };
	if (ids.length > config.maxFilesPerEntry) {
		return { error: `Up to ${config.maxFilesPerEntry} images, please.` };
	}
	return { ids: [...new Set(ids)] };
}

/**
 * May this account send one right now?
 *
 * Three ceilings, and the first one it meets is the one it is told
 * about. Admins are outside all of them: the operator testing their own
 * box should not be locked out of it.
 */
async function standing(userId) {
	if (isAdmin(userId)) return null;
	const now = Date.now();
	const { open, lately, last } = await feedbackStanding(userId, now - DAY_MS);
	if (last && now - last < config.reportGapMs) {
		const wait = Math.ceil((config.reportGapMs - (now - last)) / 1000);
		return { wait, error: `One at a time — try again in ${wait} second${wait === 1 ? '' : 's'}.` };
	}
	if (open >= config.maxOpenReports) {
		return {
			wait: 0,
			error: `You already have ${open} reports waiting on an answer. Add to one of those in Discord rather than opening another.`
		};
	}
	if (lately >= config.maxReportsPerDay) {
		return { wait: 3600, error: 'That is as many as one account may send in a day. Tomorrow, gladly.' };
	}
	return null;
}

/**
 * A copy to the webhook. Fire and forget: the entry is already in the
 * table, so a webhook that is down loses nothing but the ping. Discord
 * is on the far side of the internet, so the wait has a deadline.
 *
 * The words go across as they were written. Discord's own markup is
 * near enough the box's that bold stays bold and a list stays a list --
 * the pictures are the part that cannot travel through a webhook, so
 * they are counted instead and read in the box itself.
 */
async function ping(entry, id) {
	if (!config.feedbackWebhook) return;
	const label = { bug: 'Something is wrong', idea: 'An idea', other: 'Something else' }[entry.kind] || entry.kind;
	const who = entry.username ? `${entry.username} (${entry.userId})` : `account ${entry.userId}`;
	const shots = entry.ids.length
		? `${entry.ids.length} image${entry.ids.length === 1 ? '' : 's'} attached — in the box`
		: '';
	const lines = [
		`**${label}** #${id} from ${who}`,
		entry.page ? `on: ${entry.page}` : '',
		entry.version ? `build: ${entry.version}` : '',
		entry.contact ? `reach: ${entry.contact}` : '',
		shots,
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

	// A post is a few kilobytes of text at most -- the pictures come up
	// their own route, as bytes -- and an address gets a handful a
	// minute on top of the per-account ceilings below.
	const body = express.json({ limit: 64 * 1024 });
	const limit = perAddress(20, 300, 'That is a lot of feedback at once; try again in a minute.');

	/* -------------------------------------------------------------- *
	 * Composing one
	 * -------------------------------------------------------------- */

	/** What the box may do, and what this account has already sent.
	 *  Asked as the dialog opens, so the ceilings are the server's to
	 *  state and the browser never has to guess at them. */
	router.get('/feedback/mine', requireUser, wrap(async (req, res) => {
		const now = Date.now();
		const { open, lately, last } = await feedbackStanding(req.userId, now - DAY_MS);
		res.json({
			open, lately,
			waitMs: last ? Math.max(0, config.reportGapMs - (now - last)) : 0,
			// Pictures uploaded and never sent -- an abandoned draft, or
			// a browser that was closed. The dialog picks them back up
			// rather than leaving them to be swept unseen.
			files: uploadsEnabled ? await pendingFiles(req.userId) : [],
			limits: {
				images: uploadsEnabled ? config.maxFilesPerEntry : 0,
				bytes: config.maxImageBytes,
				pixels: config.imagePixels,
				text: MAX_TEXT,
				open: config.maxOpenReports,
				exempt: isAdmin(req.userId)
			}
		});
	}));

	/**
	 * A picture, as bytes.
	 *
	 * Raw rather than a multipart form: one image per request, the type
	 * is read from the file itself, and there is no parser here that has
	 * to be trusted with a boundary. The browser has already shrunk it
	 * (js/feedback.js), so anything arriving at the ceiling is something
	 * that would not shrink.
	 */
	const image = express.raw({ type: Object.keys(EXTENSION), limit: config.maxImageBytes });

	router.post('/feedback/image', requireUser, perAccount(40, 'That is a lot of images at once; try again in a minute.'), image, wrap(async (req, res) => {
		if (!uploadsEnabled) return res.status(503).json({ error: 'This copy of the app cannot take images.' });
		const buf = Buffer.isBuffer(req.body) ? req.body : null;
		if (!buf || !buf.length) return res.status(415).json({ error: 'Send the image itself, as image/png, image/jpeg, image/gif or image/webp.' });

		// The bytes decide what this is; the filename and the declared
		// type are the sender's to invent and are used for neither the
		// extension on disk nor the type it is served with.
		const seen = sniff(buf);
		if (!seen) return res.status(415).json({ error: 'That file is not a PNG, JPEG, GIF or WebP.' });

		const held = await pendingFiles(req.userId);
		if (held.length >= config.maxFilesPerEntry * 2) {
			return res.status(429).json({ error: 'There are already that many images waiting to be sent. Send the report, or take one off.' });
		}

		const id = crypto.randomBytes(12).toString('base64url');
		const name = typeof req.query.name === 'string'
			// eslint-disable-next-line no-control-regex -- a filename with a newline in it is not a filename
			? req.query.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120) || null
			: null;
		const file = { id, userId: req.userId, mime: seen.mime, bytes: buf.length, width: seen.width, height: seen.height, name };
		await fs.writeFile(onDisk(file), buf);
		try {
			await insertFile(file);
		} catch (err) {
			// The row is the record. Without it the bytes are unreachable
			// and unsweepable, so they go back with it.
			await unlink(file);
			throw err;
		}
		res.status(201).json({ id, mime: file.mime, bytes: file.bytes, width: file.width, height: file.height, name });
	}));

	/** Take one off again, while it is still nobody's report. */
	router.delete('/feedback/image/:id', requireUser, wrap(async (req, res) => {
		const file = await getFile(String(req.params.id));
		if (!file || file.userId !== req.userId) return res.status(404).json({ error: 'No such image.' });
		if (file.feedbackId !== null) return res.status(409).json({ error: 'That one has already been sent.' });
		await deleteFile(file.id);
		await unlink(file);
		res.json({ ok: true });
	}));

	/**
	 * A picture, served.
	 *
	 * A picture that has been sent with a report is as public as the
	 * report is: it is usually the whole of what the report says, and a
	 * list of bugs whose screenshots only the operator can see is a list
	 * nobody else can read. A hidden report takes its pictures out of
	 * sight with it.
	 *
	 * One that has not been sent yet is a different thing -- a draft, a
	 * browser closed mid-sentence -- and stays between its sender and the
	 * admins. Missing and forbidden are the same answer either way, which
	 * is what keeps the id from being something to probe with.
	 */
	router.get('/feedback/file/:id', wrap(async (req, res) => {
		const uid = sessionUser(req);
		const id = String(req.params.id);
		const file = FILE_ID.test(id) ? await getFile(id) : null;
		if (!file) return res.status(404).json({ error: 'No such image.' });
		const sent = file.feedbackId !== null;
		const shown = sent ? await feedbackShown(file.feedbackId) : false;
		const ours = Boolean(uid) && (file.userId === uid || isAdmin(uid));
		if (!shown && !ours) return res.status(404).json({ error: 'No such image.' });
		// A picture under a random id never changes, so the browser may
		// keep it: publicly once it is part of a report anyone can read,
		// privately while it is still only its sender's.
		res.set('Cache-Control', shown ? 'public, max-age=86400' : 'private, max-age=86400');
		res.type(file.mime);
		res.sendFile(onDisk(file), err => {
			if (!err || res.headersSent) return;
			res.status(404).json({ error: 'That image is no longer on disk.' });
		});
	}));

	/* -------------------------------------------------------------- *
	 * Sending one
	 * -------------------------------------------------------------- */

	/** Send one. Signed in: see the note at the top of this file. */
	router.post('/feedback', limit, requireUser, body, wrap(async (req, res) => {
		const entry = readEntry(req.body);
		if (entry.error) return res.status(400).json({ error: entry.error });

		const held = await standing(req.userId);
		if (held) {
			if (held.wait) res.set('Retry-After', String(held.wait));
			return res.status(429).json({ error: held.error });
		}

		entry.userId = req.userId;
		// The name rides in from the client's own /me answer: a user row
		// lookup here would be one more query on the way in, and the id
		// is the part that is verified.
		entry.username = typeof req.body.username === 'string' ? req.body.username.slice(0, 40) : null;
		entry.agent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 200) : null;
		const id = await insertFeedback(entry);
		// Only this account's own unsent pictures can be attached, so an
		// id guessed or borrowed from somewhere else simply does not
		// arrive -- the post still lands, with the text that mentions it.
		if (entry.ids.length) await attachFiles(entry.ids, id, req.userId);
		ping(entry, id);   // not awaited
		res.status(201).json({ ok: true, id });
	}));

	/* -------------------------------------------------------------- *
	 * The inbox
	 * -------------------------------------------------------------- */

	/**
	 * What people have written in: open first, newest first, pictures
	 * and all. Anyone may read it.
	 *
	 * An admin gets the entries whole -- the contact, the account, the
	 * browser, and the hidden ones -- because answering is what the
	 * inbox is for. Everybody else gets the post and its pictures.
	 */
	router.get('/feedback', perAddress(120, 300, 'That is a lot of reading at once; try again in a minute.'), wrap(async (req, res) => {
		const uid = sessionUser(req);
		const entries = await listFeedback(200);
		if (isAdmin(uid)) return res.json({ entries, admin: true });
		res.json({
			entries: entries.filter(e => e.status !== 'hidden').map(e => publicEntry(e, uid)),
			admin: false
		});
	}));

	/** Mark one done, hide it, or open it again. */
	router.post('/feedback/:id/status', requireAdmin, body, wrap(async (req, res) => {
		const id = Number(req.params.id);
		const asked = req.body && req.body.status;
		const status = STATUSES.includes(asked) ? asked : 'done';
		if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Which entry?' });
		await setFeedbackStatus(id, status);
		res.json({ ok: true, id, status });
	}));

	/** Throw one away, with its pictures. For the spam, which is the one
	 *  thing "done" is the wrong word for. */
	router.delete('/feedback/:id', requireAdmin, wrap(async (req, res) => {
		const id = Number(req.params.id);
		if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Which entry?' });
		for (const file of await deleteFeedback(id)) await unlink(file);
		res.json({ ok: true, id });
	}));

	// A body over the ceiling is refused by the parser, which throws with
	// the status already on it. The handler at the foot of server.js
	// answers that with a word about saves, which is the wrong subject
	// here -- so these two routes say what was actually too large.
	router.use('/feedback', (err, req, res, next) => {
		if (!err || Number(err.status || err.statusCode) !== 413) return next(err);
		res.status(413).json({
			error: req.path.endsWith('/image')
				? `That image is larger than ${Math.round(config.maxImageBytes / 1048576)} MB.`
				: 'That report is longer than the box takes.'
		});
	});

	return router;
}

/**
 * Pictures uploaded for a report that was never sent.
 *
 * A browser closed mid-sentence leaves bytes on the disk that nothing
 * will ever ask for. They are given a day -- long enough that coming
 * back to a draft finds them still there -- and then they go.
 */
export function startUploadSweep() {
	const sweep = async () => {
		try {
			for (const file of await staleFiles(Date.now() - config.uploadTtlMs)) {
				await unlink(file);
				await deleteFile(file.id);
			}
		} catch (err) {
			console.warn('[feedback] the sweep did not run:', err.message);
		}
	};
	const timer = setInterval(sweep, Math.max(600_000, config.uploadTtlMs / 12));
	if (timer.unref) timer.unref();
	sweep();
	return () => clearInterval(timer);
}
