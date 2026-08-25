// The sync API: who am I, what is stored, store this.
//
// The server is deliberately incurious about what it is holding. It
// validates the shape enough to know it is a tracker save and not a
// stranger using the account as a pastebin, then stores the JSON as
// given. Every rule about what a plan means lives in the browser, and
// putting a second copy of it here is how the two drift apart.

import express from 'express';
import { config } from './config.js';
import { getUser, getSave, putSave, deleteAccount } from './db.js';
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
	 *  which the client needs to tell apart from an empty inventory. */
	router.get('/state', requireUser, wrap(async (req, res) => {
		const save = await getSave(req.userId);
		if (!save) return res.json({ rev: 0, data: null, updatedAt: null, device: null });

		let data;
		try {
			data = JSON.parse(save.payload);
		} catch {
			// Unreadable stored JSON should not lock an account out of
			// syncing; treating it as "nothing there" lets the next push
			// replace it.
			console.error('[api] unreadable save for', req.userId);
			return res.json({ rev: save.rev, data: null, updatedAt: save.updatedAt, device: save.device });
		}
		res.json({ rev: save.rev, data, updatedAt: save.updatedAt, device: save.device });
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
		const result = await putSave(req.userId, payload, expected, device);

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
