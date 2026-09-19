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
import { isAdmin } from './feedback.js';
import { communityRoutes, ensureOnBoards, leaveBoards } from './community.js';
import { boardRoutes } from './boards.js';
import { readSave, writeSaveFor, forget } from './saves.js';
import { sessionUser, requireUser, endSession } from './session.js';
import { perAccount } from './limit.js';
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
	if (body.profile !== undefined
		&& (typeof body.profile !== 'object' || body.profile === null || Array.isArray(body.profile))) {
		return 'Profile must be an object.';
	}
	return null;
}

export function apiRoutes() {
	const router = express.Router();

	// Nothing here may be cached by anything, ever.
	//
	// A save is one account's, and the only thing telling it apart from
	// another account's is a cookie. Without these headers a proxy that
	// has been told to cache generously -- a Cloudflare "Cache Everything"
	// rule, an nginx block someone added for speed -- would be within its
	// rights to keep one player's inventory and hand it to the next.
	router.use((req, res, next) => {
		res.set('Cache-Control', 'no-store');
		res.set('Vary', 'Cookie');
		next();
	});

	// The one route that takes a body gets the one parser that allows a
	// save's worth of it. Mounted on everything under /api, this parser
	// used to run first for the push subscription too and let a megabyte
	// through a route meant to take a few hundred bytes -- Express keeps
	// the first parse and the 8 KB parser behind it never saw the body.
	// After the sign-in check, so a stranger's megabyte is never read.
	const saveBody = express.json({ limit: config.maxSaveBytes });

	// A browser pushes at most twice a second and backs off when refused,
	// so this is far above anything the app does and only bites something
	// that is not the app.
	const pushLimit = perAccount(config.maxPushesPerMinute);

	// Every page load asks /me, and it has no limiter of its own -- so the
	// user row is held briefly instead of read every time. Half a minute of
	// staleness costs nothing: the row only changes on sign-in, and a
	// deleted account is dropped from here at the moment of deletion.
	const ME_TTL_MS = 30_000;
	const meCache = new Map();   // uid -> { user, until }

	async function cachedUser(uid) {
		const held = meCache.get(uid);
		if (held && held.until > Date.now()) return held.user;
		// Only real accounts get in here -- a uid comes from a signed
		// cookie -- so the map cannot be grown by strangers. Expired rows
		// are swept when it gets crowded rather than on a timer.
		if (meCache.size > 5000) {
			const now = Date.now();
			for (const [id, entry] of meCache) if (entry.until <= now) meCache.delete(id);
		}
		const user = await getUser(uid);
		if (user) meCache.set(uid, { user, until: Date.now() + ME_TTL_MS });
		else meCache.delete(uid);
		return user;
	}

	/** Who is signed in, if anyone. Answers 200 either way -- being signed
	 *  out is a normal state for this app, not an error. */
	router.get('/me', wrap(async (req, res) => {
		const uid = sessionUser(req);
		if (!uid) return res.json({ signedIn: false });
		const user = await cachedUser(uid);
		if (!user) {
			// The session outlived the account it names.
			endSession(res);
			return res.json({ signedIn: false });
		}
		res.json({
			signedIn: true,
			user: { id: user.id, username: user.username, avatar: user.avatar },
			// How the account stands on the community boards, and whether
			// it may read the feedback inbox. The share is read fresh: it
			// changes from the boards page and must show there at once --
			// and this is where an account that has never said is put on
			// them, since the boards are opt-out rather than opt-in.
			share: await ensureOnBoards(uid),
			admin: isAdmin(uid)
		});
	}));

	router.use(communityRoutes());
	// What the sea is showing today, as the fleet saw it: the one thing
	// in this app that is genuinely common property.
	router.use(boardRoutes());

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
	router.put('/state', requireUser, saveBody, pushLimit, wrap(async (req, res) => {
		const body = req.body || {};
		const complaint = looksLikeSave(body.data);
		if (complaint) return res.status(400).json({ error: complaint });

		const expected = Number.isInteger(body.rev) && body.rev >= 0 ? body.rev : null;
		if (expected === null) {
			return res.status(400).json({ error: 'A push must say which revision it is based on.' });
		}

		// Rebuilt rather than stored as sent, so a client cannot park
		// arbitrary keys in another device's save. `profile` is only
		// written when the client actually sent one -- an older browser
		// that has not reloaded still pushes three fields, and adding an
		// empty fourth on its behalf would change the stored bytes out
		// from under every save that already exists.
		const shape = {
			stock: body.data.stock,
			targets: body.data.targets || [],
			strategy: body.data.strategy || {}
		};
		if (body.data.profile) shape.profile = body.data.profile;
		const payload = JSON.stringify(shape);
		if (Buffer.byteLength(payload) > config.maxSaveBytes) {
			return res.status(413).json({ error: 'That save is too large to sync.' });
		}

		// Sessions are stateless, so a cookie outlives the account it names.
		// A push that would create the first save row is therefore checked
		// against the users table -- without this, a device still signed in
		// after DELETE /api/account would push revision 0 and quietly
		// resurrect the save the owner just asked to be rid of. 410, not
		// 401: the client reads it as "this account is gone", signs out
		// locally, and keeps its copy.
		if (expected === 0 && !await getUser(req.userId)) {
			meCache.delete(req.userId);
			endSession(res);
			return res.status(410).json({ error: 'This account has been deleted.' });
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
		meCache.delete(req.userId);
		leaveBoards(req.userId);
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
