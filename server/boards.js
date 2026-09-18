// What the sea is showing today, as reported by the people sailing it.
//
// The barter board is the same for everyone on a server and it changes
// at the refill, so every player works it out again from scratch:
// open the window, read a row, tell the app, read another. One of them
// doing that is enough for all of them -- which is what this is.
//
// A sighting is what one account saw today: a list of islands and the
// exchange each was showing. It carries the name of whoever sent it,
// because that is the whole social contract here -- somebody went and
// looked, and everybody else sails on their word. Others who see the
// same board say so, and a sighting several people have confirmed is
// worth more than a fresh one.
//
// The server is deliberately incurious again. It checks that a sighting
// is islands and goods rather than a stranger's essay, stores it, and
// hands it back. Which layout it is, whether it agrees with the forty
// the app knows, and what to do when it does not are all questions the
// browser answers -- it has the tables.

import express from 'express';
import { npcs } from '../js/barter_npcs.js';
import {
	listSightings, getSighting, getSightingById, insertSighting, updateSighting,
	hideSighting, confirmSighting, sightingsConfirmedBy, sweepSightings
} from './db.js';
import { isAdmin } from './feedback.js';
import { sessionUser, requireUser } from './session.js';
import { perAccount } from './limit.js';
import { wrap } from './wrap.js';
import { config } from './config.js';

/** The islands a sighting may name: the app's own list, so a row about
 *  an island that does not exist never reaches the table. */
const ISLES = new Set(npcs.map(n => n.id));

/** How much of a board one sighting may carry. Ninety-one barterers is
 *  the whole sea; the rest is slack for a client that counts twice. */
const MAX_OFFERS = 120;
const MAX_NAME = 120;

/** How long a sighting is worth anything. A board lives until the
 *  refill, so yesterday's is history -- kept a few days so a player who
 *  sails at the turn of the day is not told their own report is gone,
 *  and swept after that. */
const KEEP_DAYS = 4;

/**
 * A sighting as it may be stored, or a complaint about it.
 *
 * Nothing here knows what a good is called; it knows that a good is a
 * short piece of text and that an island is one of ninety-one. That is
 * enough to keep the table a table.
 */
export function readSighting(body) {
	if (!body || typeof body !== 'object') return { error: 'Expected a sighting.' };
	const day = String(body.day || '').slice(0, 24);
	if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(day)) return { error: 'A sighting has to say which barter day it is.' };
	if (!Array.isArray(body.offers) || !body.offers.length) return { error: 'A sighting needs at least one island.' };
	if (body.offers.length > MAX_OFFERS) return { error: 'That is more islands than there are.' };
	const seen = new Set();
	const offers = [];
	for (const row of body.offers) {
		const npcId = Number(Array.isArray(row) ? row[0] : row && row.npcId);
		const give = String((Array.isArray(row) ? row[1] : row && row.give) || '').trim().slice(0, MAX_NAME);
		const qty = String((Array.isArray(row) ? row[2] : row && row.qty) || '1').trim().slice(0, 12);
		const recv = String((Array.isArray(row) ? row[3] : row && row.recv) || '').trim().slice(0, MAX_NAME);
		if (!ISLES.has(npcId)) return { error: 'A sighting named an island this app does not know.' };
		if (!give || !recv) return { error: 'Every island in a sighting needs what it takes and what it pays.' };
		if (seen.has(npcId)) continue;        // one row an island; the last one typed wins
		seen.add(npcId);
		offers.push([npcId, give, qty || '1', recv]);
	}
	if (!offers.length) return { error: 'A sighting needs at least one island.' };
	const layout = body.layout === null || body.layout === undefined ? null : String(body.layout).slice(0, 12);
	return { day, offers, layout };
}

/* ------------------------------------------------------------------ *
 * the table
 * ------------------------------------------------------------------ */

/** Today's sightings and the last few days', newest first. */
export async function sightings(days = KEEP_DAYS) {
	return listSightings(Date.now() - days * 86_400_000);
}

/**
 * Store a sighting. One an account a day, merged rather than repeated:
 * a player reads three islands, tells the app, reads three more, and
 * the second telling is the same board with more of it seen. An island
 * answered twice takes the later answer, because they looked again.
 */
export async function putSighting(userId, { day, offers, layout }) {
	const held = await getSighting(userId, day);
	if (held) {
		const by = new Map(held.offers.filter(o => Array.isArray(o)).map(o => [o[0], o]));
		for (const o of offers) by.set(o[0], o);
		const merged = [...by.values()].slice(0, MAX_OFFERS);
		await updateSighting(held.id, { layout: layout ?? held.layout, offers: merged });
		return { id: held.id, offers: merged };
	}
	const id = await insertSighting(userId, { day, layout, offers });
	return { id, offers };
}

/** Somebody else saw the same board. */
export async function confirm(id, userId) {
	const row = await getSightingById(id);
	if (!row || row.hidden) return { error: 'No such sighting.' };
	if (row.userId === userId) return { error: 'That one is yours.' };
	const fresh = await confirmSighting(id, userId);
	return { ok: true, already: !fresh };
}

/** Take a sighting back -- the sender's to take back, and the
 *  operator's to hide. */
export async function drop(id, userId) {
	const row = await getSightingById(id);
	if (!row) return { error: 'No such sighting.' };
	if (row.userId !== userId && !isAdmin(userId)) return { error: 'That one is not yours.' };
	await hideSighting(id);
	return { ok: true };
}

/** Sightings older than a few days are history: the board they describe
 *  was redrawn long ago. */
export async function sweep() {
	return sweepSightings(Date.now() - KEEP_DAYS * 86_400_000);
}

/**
 * Sweep the old sightings, now and every few hours.
 *
 * Nothing breaks if this never runs -- the read only ever asks for the
 * last few days -- so it is a tidiness, not a correctness, and it says
 * so if the database is not there to be tidied.
 */
export function startBoardSweep() {
	const go = async () => {
		try {
			await sweep();
		} catch (err) {
			console.warn('[boards] the sweep did not run:', err.message);
		}
	};
	const timer = setInterval(go, 6 * 3600_000);
	if (timer.unref) timer.unref();
	go();
	return () => clearInterval(timer);
}

/* ------------------------------------------------------------------ *
 * the routes
 * ------------------------------------------------------------------ */

export function boardRoutes() {
	const router = express.Router();
	const body = express.json({ limit: 64 * 1024 });
	// A board is read once a day and told once a day. This is far above
	// anything the app does and only bites something that is not it.
	const limit = perAccount(config.maxBoardsPerMinute);

	/** What the fleet has seen lately. Open to anyone: a board is the
	 *  same for everybody on the server, and this is the one thing in
	 *  the app that is genuinely common property. */
	router.get('/boards', wrap(async (req, res) => {
		const uid = sessionUser(req);
		const list = await sightings();
		const seen = new Set(uid ? await sightingsConfirmedBy(uid) : []);
		res.set('Cache-Control', 'no-store');
		res.json({
			boards: list.map(b => ({
				id: b.id, day: b.day, layout: b.layout, offers: b.offers, at: b.at, seen: b.seen,
				// A name or nothing: whoever is shown anonymously on the
				// boards is shown anonymously here too.
				name: b.name, mine: uid === b.userId, confirmed: seen.has(b.id)
			}))
		});
	}));

	/** What I saw. */
	router.post('/boards', requireUser, body, limit, wrap(async (req, res) => {
		const read = readSighting(req.body);
		if (read.error) return res.status(400).json({ error: read.error });
		const stored = await putSighting(req.userId, read);
		res.set('Cache-Control', 'no-store');
		res.json({ ok: true, id: stored.id, offers: stored.offers.length });
	}));

	/** I saw the same. */
	router.post('/boards/:id/seen', requireUser, limit, wrap(async (req, res) => {
		const out = await confirm(Number(req.params.id), req.userId);
		res.set('Cache-Control', 'no-store');
		if (out.error) return res.status(400).json(out);
		res.json(out);
	}));

	/** Take it back. */
	router.delete('/boards/:id', requireUser, wrap(async (req, res) => {
		const out = await drop(Number(req.params.id), req.userId);
		res.set('Cache-Control', 'no-store');
		if (out.error) return res.status(400).json(out);
		res.json(out);
	}));

	return router;
}
