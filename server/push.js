// Push: an account's own chimes.
//
// The page can only chime while it is open. A push subscription lets the
// browser be woken by the server instead, so a chime set on one device
// reaches a phone in a pocket. Signed in, a subscription is filed under
// the account; a sweep every few seconds sends whatever chimes are due.
//
// There used to be a second purpose, the Vell reminder, sent by region
// on a timetable. It is gone: the timetable moved with every event and
// was never the app's to keep. Rows subscribed only for it are left in
// the table and sent nothing.

import express from 'express';
import webpush from 'web-push';
import { config, dmEnabled } from './config.js';
import { sendDm, getDiscordAlerts } from './discord-dm.js';
import { putPushSub, getPushSub, deletePushSub, countPushSubs, listUserPushSubs, putPushAlerts, deletePushAlerts, countPushAlerts, duePushAlerts, dropPushAlerts } from './db.js';
import { perAddress } from './limit.js';
import { sessionUser, requireUser } from './session.js';
import { counters } from './log.js';

// How many subscriptions the table will hold. Each one is an endpoint
// the server may post to, so an open route needs a ceiling on the list
// it is filling -- this is far past any real readership, and reached
// only by someone filling it on purpose.
export const MAX_SUBSCRIPTIONS = Number(process.env.PUSH_MAX_SUBSCRIPTIONS) || 10000;

// The push services browsers actually use. An endpoint is a URL the
// server will POST to on the word of whoever posted it -- an open route that would take any URL is a way to make
// this deployment knock on someone else's door. So only the services a
// subscription can genuinely come from are kept: Chrome, Firefox, Edge
// and Safari, and nothing else.
const PUSH_SERVICES = [
	/^fcm\.googleapis\.com$/,
	/(^|\.)push\.services\.mozilla\.com$/,
	/\.notify\.windows\.com$/,
	/(^|\.)push\.apple\.com$/
];

export function pushService(endpoint) {
	let url;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	return url.protocol === 'https:' && PUSH_SERVICES.some(re => re.test(url.hostname));
}

// The keys are what they are by RFC 8291: an uncompressed P-256 point
// (87 chars of base64url, 88 with padding) and a 16-byte secret (22 or
// 24). Anything far off that is not a subscription, and would only sit
// in the table failing to encrypt at every send.
const b64url = (value, min, max) =>
	typeof value === 'string' && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+=*$/.test(value);

export const looksLikeSubscription = s =>
	s && typeof s === 'object' && typeof s.endpoint === 'string' && s.endpoint.length < 2048
	&& pushService(s.endpoint) && s.keys && b64url(s.keys.p256dh, 80, 128) && b64url(s.keys.auth, 16, 64);

/**
 * May this caller change what is filed under an endpoint that is already
 * kept? An endpoint is not public, but it is not a secret either -- it
 * passes through logs and devtools -- and the route is open. So holding
 * one is not enough to re-file a device under another account, or to
 * take its reminders away: the caller must also hold the subscription's
 * own secret (`auth`, which only the browser that subscribed has), or be
 * the account the row is already filed under.
 */
export function mayChange(row, auth, uid) {
	if (!row) return true;
	const held = row.sub && row.sub.keys ? row.sub.keys.auth : null;
	if (held && typeof auth === 'string' && auth === held) return true;
	return Boolean(uid) && row.userId === uid;
}

/* The keys are set once, as the routes are made, and again by the
 * sweep in case it is started first. */
let keysSet = false;
function setKeys() {
	if (keysSet || !config.vapid.publicKey || !config.vapid.privateKey) return;
	webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
	keysSet = true;
}

// A push service that does not answer is given this long. Without it a
// hung connection held a sweep open past the next beat.
const SEND_TIMEOUT_MS = 10_000;
// How many sends are in the air at once: an account's devices are a
// handful, but a ceiling costs nothing.
const FAN_OUT = 50;

/** Run `fn` over `items`, `limit` at a time. */
async function inTurns(items, limit, fn) {
	let next = 0;
	const lane = async () => {
		while (next < items.length) await fn(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

export function pushRoutes() {
	setKeys();
	const router = express.Router();
	// Scoped to these routes rather than to everything under /api: the
	// sync API's own parser allows a megabyte for a save, and whichever
	// parser runs first is the one that counts. A subscription is a few
	// hundred bytes.
	router.use('/push', express.json({ limit: 8 * 1024 }), (req, res, next) => {
		res.set('Cache-Control', 'no-store');
		next();
	});

	router.get('/push/key', (req, res) => {
		res.json({ key: config.vapid.publicKey });
	});

	// A browser subscribes once and unsubscribes once; a few a minute
	// from one address is generous, and the process-wide ceiling keeps
	// the table from being filled from many.
	const limited = perAddress(6, 60, 'Too many subscription changes just now; try again shortly.');
	// A clock is set, restarted and stopped by hand: a few a minute is
	// more than a person does, and far less than a loop would.
	const limitedAlerts = perAddress(30, 60, 'Too many chimes set just now; try again shortly.');

	router.post('/push/subscribe', limited, async (req, res) => {
		// An older tab still sends a region and whether it wanted the Vell
		// reminder; both are ignored now.
		const { subscription } = req.body || {};
		if (!looksLikeSubscription(subscription)) return res.status(400).json({ error: 'Expected a push subscription.' });
		try {
			const uid = sessionUser(req) || null;
			const kept = await getPushSub(subscription.endpoint);
			if (!mayChange(kept, subscription.keys.auth, uid)) {
				return res.status(403).json({ error: 'That subscription is not this browser’s to change.' });
			}
			if (!kept && await countPushSubs() >= MAX_SUBSCRIPTIONS) {
				return res.status(503).json({ error: 'No room for another reminder right now.' });
			}
			// Signed in, the subscription is also this account's, which is
			// what lets a chime set on one device reach the others. The
			// table's region and Vell columns are left over from the Vell
			// reminder: kept empty and off, and read by nothing.
			await putPushSub(subscription.endpoint, subscription, '', uid, false);
			res.status(204).end();
		} catch (err) {
			console.warn('[push] could not keep a subscription:', err.message);
			res.status(503).json({ error: 'The database did not answer.' });
		}
	});

	router.delete('/push/subscribe', limited, async (req, res) => {
		const endpoint = req.body && req.body.endpoint;
		if (typeof endpoint !== 'string' || !endpoint) return res.status(400).json({ error: 'Which subscription?' });
		try {
			const kept = await getPushSub(endpoint);
			if (!mayChange(kept, req.body.auth, sessionUser(req))) {
				return res.status(403).json({ error: 'That subscription is not this browser’s to change.' });
			}
			await deletePushSub(endpoint);
			res.status(204).end();
		} catch (err) {
			console.warn('[push] could not drop a subscription:', err.message);
			res.status(503).json({ error: 'The database did not answer.' });
		}
	});
	/* -------------------------------------------------------------- *
	 * The chimes an account has asked for
	 * -------------------------------------------------------------- */

	// A run's worth of stops at once, replacing whatever stood under the
	// same tag -- a clock restarted is the same clock, not a second one.
	router.put('/push/alerts', requireUser, limitedAlerts, async (req, res) => {
		const { tag, alerts } = req.body || {};
		if (!ALERT_TAG.test(String(tag || ''))) return res.status(400).json({ error: 'Which set of chimes?' });
		// Not `alerts.map(readAlert)`: map hands the index along as the
		// second argument, and the second argument is what "now" is.
		const list = Array.isArray(alerts) ? alerts.map(a => readAlert(a)).filter(Boolean) : null;
		if (!list) return res.status(400).json({ error: 'Expected a list of chimes.' });
		if (list.length > MAX_ALERTS) return res.status(400).json({ error: `No more than ${MAX_ALERTS} chimes at a time.` });
		try {
			// The ceiling counts what is already there under other tags,
			// so a single account cannot fill the table from many runs.
			if (list.length && (await countPushAlerts(req.userId)) > MAX_ALERTS * 2) {
				return res.status(429).json({ error: 'Too many chimes waiting already.' });
			}
			await putPushAlerts(req.userId, tag, list);
			res.status(204).end();
		} catch (err) {
			console.warn('[push] could not keep the chimes:', err.message);
			res.status(503).json({ error: 'The database did not answer.' });
		}
	});

	router.delete('/push/alerts', requireUser, limitedAlerts, async (req, res) => {
		const tag = req.body && req.body.tag;
		if (tag !== undefined && !ALERT_TAG.test(String(tag || ''))) return res.status(400).json({ error: 'Which set of chimes?' });
		try {
			await deletePushAlerts(req.userId, tag ? String(tag) : null);
			res.status(204).end();
		} catch (err) {
			console.warn('[push] could not drop the chimes:', err.message);
			res.status(503).json({ error: 'The database did not answer.' });
		}
	});
	return router;
}

/** A tag names one set of chimes -- one run's, say -- so that setting
 *  it again replaces it. Short and plain, since it is a key. */
export const ALERT_TAG = /^[a-z0-9][a-z0-9-]{0,23}$/;
export const MAX_ALERTS = 40;
// How far ahead a chime may be set. A barter run is minutes; half a day
// is far past anything real and keeps a row from sitting there for ever.
export const MAX_AHEAD_MS = 12 * 3600e3;

/** One alert as it may be kept: a moment, and the words to show. */
export function readAlert(raw, now = Date.now()) {
	if (!raw || typeof raw !== 'object') return null;
	const at = Math.round(Number(raw.at));
	if (!Number.isFinite(at) || at > now + MAX_AHEAD_MS) return null;
	const title = String(raw.title || '').trim().slice(0, 80);
	const body = String(raw.body || '').trim().slice(0, 200);
	if (!title) return null;
	// A moment already past is kept as "now": a clock set while the tab
	// was asleep should still say what it was going to say.
	return { at: Math.max(at, now), title, body };
}

/**
 * The chimes due now, sent to every device the account has subscribed.
 * Returns how many rows were dealt with, whether or not a device was
 * there to hear them: a row is done either way, or it would be tried
 * again for ever.
 */
export async function sendDueAlerts(now = Date.now()) {
	const due = await duePushAlerts(now);
	if (!due.length) return 0;
	// Claimed before a single one is sent: taken off the table first, so
	// a sweep that overlaps this one -- or a send that hangs past the
	// next beat -- finds nothing to send twice. A chime lost to a push
	// service that was down is one chime; a chime sent twice is every
	// chime for as long as the service is slow.
	await dropPushAlerts(due.map(a => a.id));
	const subs = new Map();
	const dms = new Map();
	for (const a of due) {
		if (dmEnabled) {
			if (!dms.has(a.userId)) dms.set(a.userId, await getDiscordAlerts(a.userId).catch(() => false));
			if (dms.get(a.userId)) await sendDm(a.userId, a);
		}
		if (!subs.has(a.userId)) subs.set(a.userId, await listUserPushSubs(a.userId));
		const payload = JSON.stringify({ title: a.title, body: a.body, url: '/#barter', tag: `sail-${a.tag}` });
		await inTurns(subs.get(a.userId) || [], FAN_OUT, async s => {
			try {
				await webpush.sendNotification(s.sub, payload, { TTL: 5 * 60, timeout: SEND_TIMEOUT_MS });
				counters.pushSent++;
			} catch (err) {
				if (err.statusCode === 404 || err.statusCode === 410) await deletePushSub(s.endpoint).catch(() => {});
			}
		});
	}
	return due.length;
}

/**
 * The sweep for an account's own chimes. Every few seconds rather than
 * every minute: the legs of a barter run are two or three minutes
 * apart, and a chime a minute late is a chime for the wrong island.
 */
export function startAlertPushes(every = 10e3) {
	setKeys();
	// One sweep at a time: a beat that comes round while the last is
	// still sending waits for the next.
	let running = false;
	const beat = async () => {
		if (running) return;
		running = true;
		try {
			await sendDueAlerts();
		} catch (err) {
			console.warn('[push] chimes failed:', err.message);
		} finally {
			running = false;
		}
	};
	const timer = setInterval(beat, every);
	if (timer.unref) timer.unref();
	return timer;
}
