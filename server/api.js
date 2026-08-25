// The sync API: who am I, what is stored, store this.
//
// The server is deliberately incurious about what it is holding. It
// validates the shape enough to know it is a tracker save and not a
// stranger using the account as a pastebin, then stores the JSON as
// given. Every rule about what a plan means lives in the browser, and
// putting a second copy of it here is how the two drift apart.

import express from 'express';
import { config } from './config.js';
import { getUser, deleteAccount } from './db.js';
import { readSave, writeSaveFor, forget } from './saves.js';
import { sessionUser, requireUser, endSession } from './session.js';
import { wrap } from './wrap.js';

/**
 * Is this a tracker save?
 *
 * Loose on purpose. The browser normalises whatever it reads, so the
 * server does not have to police quantities or item names -- it only has
 * to refuse things that are plainly not a save at all.
 */
function looksLikeSave(body) {
	if (!body || typeof body !== 'object') return 'Expected a tracker save.';
	const { stock, targets, strategy } = body;
	if (!stock || typeof stock !== 'object' || Array.isArray(stock)) {
		return 'A save needs a stock object.';
	}
	if (targets !== undefined && !Array.isArray(targets)) {
		return 'Targets must be a list.';
	}
	if (strategy !== undefined && (typeof strategy !== 'object' || Array.isArray(strategy))) {
		return 'Strategy must be an object.';
	}
	return null;
}

export function apiRoutes() {
	const router = express.Router();

	// Only the three fields that make up a save are stored. Anything else
	// the client sends is dropped here rather than in the database.
	router.use(express.json({ limit: config.maxSaveBytes }));

	/** Who is signed in, if anyone. Answers 200 either way -- being signed
	 *  out is a normal state for this app, not an error. */
	router.get('/me', wrap(async (req, res) => {
		const uid = sessionUser(req);
		if (!uid) return res.json({ signedIn: false });
		const user = await getUser(uid);
		if (!user) {
			// The session outlived the account it names.
			endSession(res);
			return res.json({ signedIn: false });
		}
		res.json({
			signedIn: true,
			user: { id: user.id, username: user.username, avatar: user.avatar }
		});
	}));

	/** The stored save. `rev` 0 with no data means "nothing synced yet",
	 *  which the client needs to tell apart from an empty inventory.
	 *
	 *  The payload goes out as the text it was stored as, dropped into the
	 *  response whole. Parsing it here only to have `res.json` build the
	 *  same string again is work on the busiest route in the app -- a tab
	 *  coming back into view pulls, and there may be a great many tabs. */
	router.get('/state', requireUser, wrap(async (req, res) => {
		const { rev, payload, updatedAt, device } = await readSave(req.userId);
		res.type('application/json').send(
			`{"rev":${rev},"data":${payload || 'null'},` +
			`"updatedAt":${updatedAt === null ? 'null' : updatedAt},` +
			`"device":${JSON.stringify(device ?? null)}}`
		);
	}));

	/**
	 * Store a save.
	 *
	 * The client sends the revision it last pulled. If the stored save has
	 * moved on since -- another browser pushed -- the write is refused
	 * with 409 and the newer save comes back in the body, so the client
	 * can show both and let the user choose instead of quietly losing one.
	 */
	router.put('/state', requireUser, wrap(async (req, res) => {
		const body = req.body || {};
		const complaint = looksLikeSave(body.data);
		if (complaint) return res.status(400).json({ error: complaint });

		const expected = Number.isInteger(body.rev) && body.rev >= 0 ? body.rev : null;
		if (expected === null) {
			return res.status(400).json({ error: 'A push must say which revision it is based on.' });
		}

		const payload = JSON.stringify({
			stock: body.data.stock,
			targets: body.data.targets || [],
			strategy: body.data.strategy || {}
		});
		if (Buffer.byteLength(payload) > config.maxSaveBytes) {
			return res.status(413).json({ error: 'That save is too large to sync.' });
		}

		const device = typeof body.device === 'string' ? body.device.slice(0, 64) : null;
		const result = await writeSaveFor(req.userId, payload, expected, device);

		if (!result.ok) {
			return res.status(409).json({
				error: 'Someone else saved first.',
				rev: result.current ? result.current.rev : 0,
				data: result.current ? safeParse(result.current.payload) : null,
				updatedAt: result.current ? result.current.updatedAt : null,
				device: result.current ? result.current.device : null
			});
		}
		res.json({ rev: result.rev, updatedAt: result.updatedAt });
	}));

	/** Delete the account and its save. There is no undo for this one, so
	 *  the client asks twice before calling it. */
	router.delete('/account', requireUser, wrap(async (req, res) => {
		// Out of memory first, and awaited: a write that is queued or
		// already in the air must not put the save back a moment after
		// the row was dropped.
		await forget(req.userId);
		await deleteAccount(req.userId);
		endSession(res);
		res.json({ ok: true });
	}));

	return router;
}

function safeParse(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
