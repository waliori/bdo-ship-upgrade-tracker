// A thing shared as a short link.
//
// A plan, a ship setup, a drawing or a route used to travel whole in
// the address -- gzipped and base64'd, which is as small as an address
// can make them and still runs to thousands of characters for a
// drawing, since a drawing is its points. Signed in, the thing is kept
// here instead under a ten-character id, and the address is the id.
//
// Opening a link needs no account: whoever holds the address may read
// what it carries, exactly as with the long form. Making one does,
// which is what keeps this from being a pastebin -- every link has an
// owner, goes with the account, and counts against it.
//
// The server is incurious as ever. It checks that a payload is the
// kind of thing it says it is -- a save has a stock, a setup names a
// hull -- and stores the JSON as given. What a stock means, whether a
// hull exists, what a stroke is: the browser answers those on the way
// in, with the same code that reads the long links.

import crypto from 'node:crypto';
import express from 'express';
import { insertLink, getLink, touchLink, trimLinks } from './db.js';
import { requireUser } from './session.js';
import { perAccount, perAddress } from './limit.js';
import { wrap } from './wrap.js';
import { config } from './config.js';

/** The four things a link may carry. */
export const KINDS = ['plan', 'ship', 'trace', 'route'];

const ID_LEN = 10;
const ID_RE = /^[A-Za-z0-9_-]{10}$/;

/** Ten address-safe characters: sixty random bits, which is plenty
 *  for a table nobody can list. */
export const newId = () => crypto.randomBytes(ID_LEN).toString('base64url').slice(0, ID_LEN);

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Is this the kind of thing it claims to be? The least that tells a
 * link apart from a stranger's essay, in the shape the browser's own
 * readers expect: a plan is a save with a stock, a setup names its
 * hull, a drawing says it is one, a route lists its stops.
 */
export function readLink(body) {
	if (!isObj(body)) return { error: 'Expected a link.' };
	const { kind, data } = body;
	if (!KINDS.includes(kind)) return { error: 'A link carries a plan, a ship, a trace or a route.' };
	if (!isObj(data)) return { error: 'A link needs something to carry.' };
	if (kind === 'plan' && !isObj(data.stock)) return { error: 'A plan needs a stock.' };
	if (kind === 'ship' && !(typeof data.ship === 'string' && data.ship)) return { error: 'A ship setup names its hull.' };
	if (kind === 'trace' && data.kind !== 'trace') return { error: 'A trace says so.' };
	if (kind === 'route' && !(Array.isArray(data.r) && data.r.length)) return { error: 'A route lists its stops.' };
	return { kind, payload: JSON.stringify(data) };
}

export function linkRoutes() {
	const router = express.Router();
	const body = express.json({ limit: config.maxLinkBytes });
	const keepLimit = perAccount(config.maxLinksPerMinute, 'That is a lot of links at once; try again shortly.');
	// Reading is open to anyone with the address, so the ceiling is
	// per address and generous: a chat channel opening one link is a
	// few dozen reads, a scraper guessing ids is not.
	const openLimit = perAddress(60, 600, 'That is a lot of links at once; try again shortly.');

	/** Keep this, and say what to call it. */
	// The ceiling before the parser, as /state has it: a refused request
	// is refused before a quarter of a megabyte of it is read.
	router.post('/links', requireUser, keepLimit, body, wrap(async (req, res) => {
		const read = readLink(req.body);
		if (read.error) return res.status(400).json({ error: read.error });
		if (Buffer.byteLength(read.payload) > config.maxLinkBytes) {
			return res.status(413).json({ error: 'That is too much for a link.' });
		}
		// Sixty random bits do not collide; a second draw is for the day
		// they do.
		let id = null;
		for (let tries = 0; tries < 3 && !id; tries++) {
			const draw = newId();
			if (await insertLink({ id: draw, userId: req.userId, kind: read.kind, payload: read.payload })) id = draw;
		}
		if (!id) return res.status(503).json({ error: 'Could not keep the link just now; try again.' });
		// Not awaited: the oldest links going is tidiness, and the
		// answer should not wait on it.
		trimLinks(req.userId, config.maxLinksPerAccount, config.maxLinkBytesPerAccount).catch(() => { /* next time */ });
		res.set('Cache-Control', 'no-store');
		res.json({ id });
	}));

	/** What a link carries. The payload goes out as stored, dropped
	 *  into the response whole, as /state does. */
	router.get('/links/:id', openLimit, wrap(async (req, res) => {
		const id = String(req.params.id || '');
		res.set('Cache-Control', 'no-store');
		if (!ID_RE.test(id)) return res.status(404).json({ error: 'No such link.' });
		const link = await getLink(id);
		if (!link) return res.status(404).json({ error: 'No such link.' });
		touchLink(id).catch(() => { /* a count nobody needs */ });
		res.type('application/json').send(`{"kind":${JSON.stringify(link.kind)},"data":${link.payload},"at":${link.at}}`);
	}));

	return router;
}
