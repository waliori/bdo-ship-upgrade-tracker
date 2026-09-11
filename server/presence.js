// How many sailors are out, and how many there have ever been.
//
// The tracker is a browser-only tool for anyone who never signs in, and
// this does not change that: what is kept is a random token the browser
// made up for itself and two timestamps. No address, no account, no
// save, nothing that says who or where -- the same shape as the push
// subscriptions, which are anonymous for the same reason. A row is a
// browser that has opened the page, and that is the whole of it.
//
// The count is the point. A tool like this looks abandoned when it is
// silent, and a line saying seven others are at sea right now is worth
// more to the person reading it than anything else that small could be.
//
// With a database the roll survives a restart; without one it is held
// in memory for as long as the process lives, which still answers "how
// many now" honestly and simply cannot answer "how many ever".

import express from 'express';
import { perAddress } from './limit.js';

// A browser counts as out if it has said hello inside this. The client
// says so every minute, so two minutes of grace covers a slow phone.
const ONLINE_MS = 5 * 60 * 1000;

// The counts are read for every hello, and a hundred sailors asking a
// minute apart do not need a hundred COUNT(*)s. One pair, held briefly.
const CACHE_MS = 20_000;

// No database: the roll for the life of this process. Swept as it is
// read, so an empty deployment does not grow a map of every browser
// that ever called.
const local = new Map();       // token -> seen_at

let cached = null;

/** A token is the browser's own: 8 to 64 characters of the alphabet it
 *  was given. Anything else is not answered, rather than stored. */
const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

export function presenceRoutes({ db = null } = {}) {
	const router = express.Router();
	const limit = perAddress(20, 600, 'That is a lot of hellos; try again shortly.');
	// A token and nothing else: the parser is sized for exactly that.
	const body = express.json({ limit: 1024 });

	router.post('/presence', limit, body, async (req, res) => {
		res.set('Cache-Control', 'no-store');
		const token = String((req.body && req.body.token) || '');
		if (!TOKEN.test(token)) return res.status(400).json({ error: 'bad token' });
		try {
			const counts = db ? await viaDb(db, token) : viaMemory(token);
			res.json(counts);
		} catch {
			// A database that is asleep is not worth a 500 over a number
			// nobody is depending on: the page simply shows nothing.
			res.json({ online: 0, sailors: 0, off: true });
		}
	});

	return router;
}

function viaMemory(token) {
	const now = Date.now();
	local.set(token, now);
	let online = 0;
	for (const [key, at] of local) {
		if (now - at > ONLINE_MS) local.delete(key);
		else online++;
	}
	return { online, sailors: 0 };
}

async function viaDb(db, token) {
	const now = Date.now();
	await db.touchPresence(token, now);
	if (cached && now - cached.at < CACHE_MS) return { ...cached.counts };
	const counts = await db.countPresence(now - ONLINE_MS);
	cached = { at: now, counts };
	return { ...counts };
}

/** For the tests: forget everything counted so far. */
export function forgetPresence() {
	local.clear();
	cached = null;
}
