// Push: the Vell reminder, and an account's own chimes.
//
// Vell by push: a reminder a quarter of an hour before, tab open or not.
//
// The page can only remind while it is open. A push subscription lets
// the browser be woken by the server instead, so the reminder reaches a
// phone in a pocket. The server keeps each subscription with the region
// whose timetable it follows -- the same timetable the page shows,
// from js/clock.js -- and once a minute asks whether any region's next
// spawn has just come inside the window. Subscriptions are anonymous:
// an endpoint is its own key and says nothing about who holds it.

import express from 'express';
import webpush from 'web-push';
import { config } from './config.js';
import { putPushSub, deletePushSub, listPushSubs, countPushSubs, listUserPushSubs, putPushAlerts, deletePushAlerts, countPushAlerts, duePushAlerts, dropPushAlerts } from './db.js';
import { VELL, nextSpawn } from '../js/clock.js';
import { perAddress } from './limit.js';
import { sessionUser, requireUser } from './session.js';
import { counters } from './log.js';

// How many subscriptions the table will hold. Each one is an endpoint
// the server posts to every Vell, so an open, anonymous route needs a
// ceiling on the list it is filling -- this is far past any real
// readership, and reached only by someone filling it on purpose.
export const MAX_SUBSCRIPTIONS = Number(process.env.PUSH_MAX_SUBSCRIPTIONS) || 10000;

// The push services browsers actually use. An endpoint is a URL the
// server will POST to every Vell, forever, on the word of whoever
// posted it -- an open route that would take any URL is a way to make
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
// in the table failing to encrypt at every spawn.
const b64url = (value, min, max) =>
	typeof value === 'string' && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+=*$/.test(value);

export const looksLikeSubscription = s =>
	s && typeof s === 'object' && typeof s.endpoint === 'string' && s.endpoint.length < 2048
	&& pushService(s.endpoint) && s.keys && b64url(s.keys.p256dh, 80, 128) && b64url(s.keys.auth, 16, 64);

export function pushRoutes() {
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
		res.json({ key: config.vapid.publicKey, regions: Object.keys(VELL), beforeMinutes: config.pushBeforeMs / 60000 });
	});

	// A browser subscribes once and unsubscribes once; a few a minute
	// from one address is generous, and the process-wide ceiling keeps
	// the table from being filled from many.
	const limited = perAddress(6, 60, 'Too many subscription changes just now; try again shortly.');
	// A clock is set, restarted and stopped by hand: a few a minute is
	// more than a person does, and far less than a loop would.
	const limitedAlerts = perAddress(30, 60, 'Too many chimes set just now; try again shortly.');

	router.post('/push/subscribe', limited, async (req, res) => {
		const { subscription, region, vell } = req.body || {};
		if (!looksLikeSubscription(subscription)) return res.status(400).json({ error: 'Expected a push subscription.' });
		if (!VELL[region]) return res.status(400).json({ error: 'No timetable for that region.' });
		try {
			if (await countPushSubs() >= MAX_SUBSCRIPTIONS) {
				return res.status(503).json({ error: 'No room for another reminder right now.' });
			}
			// Signed in, the subscription is also this account's, which is
			// what lets a chime set on one device reach the others. Signed
			// out it stays what it always was: an endpoint and a region,
			// saying nothing about who holds it.
			await putPushSub(subscription.endpoint, subscription, region, sessionUser(req) || null, typeof vell === 'boolean' ? vell : null);
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
 * The regions whose next spawn has just come inside the window: within
 * `before` of now, not by more than a beat, and not already sent for
 * that instant. Pure, so it can be tested against a clock.
 */
export function dueRegions(now, sent = {}, before = config.pushBeforeMs, beat = 60e3) {
	const out = [];
	for (const [region, plan] of Object.entries(VELL)) {
		const next = nextSpawn(plan.zone, plan.times, now);
		if (!next) continue;
		const left = next.at - now;
		if (left <= before && left > before - beat && sent[region] !== next.at) out.push({ region, at: next.at });
	}
	return out;
}

const hhmm = at => new Date(at).toISOString().slice(11, 16);

async function notifyRegion(region, at, now = Date.now()) {
	const subs = await listPushSubs(region);
	if (!subs.length) return 0;
	const payload = JSON.stringify({
		title: 'Vell is coming up',
		body: `Spawns at ${hhmm(at)} UTC on ${region.toUpperCase()} — in about ${Math.max(1, Math.round((at - now) / 60000))} minutes.`,
		url: '/#plan',
		tag: 'vell'
	});
	let sent = 0;
	await Promise.all(subs.map(async s => {
		try {
			await webpush.sendNotification(s.sub, payload, { TTL: 15 * 60 });
			sent++;
			counters.pushSent++;
		} catch (err) {
			// Gone: the browser dropped the subscription. Anything else is
			// weather, and the next spawn is another chance.
			if (err.statusCode === 404 || err.statusCode === 410) await deletePushSub(s.endpoint).catch(() => {});
		}
	}));
	return sent;
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
	const subs = new Map();
	for (const a of due) {
		if (!subs.has(a.userId)) subs.set(a.userId, await listUserPushSubs(a.userId));
		const payload = JSON.stringify({ title: a.title, body: a.body, url: '/#barter', tag: `sail-${a.tag}` });
		await Promise.all((subs.get(a.userId) || []).map(async s => {
			try {
				await webpush.sendNotification(s.sub, payload, { TTL: 5 * 60 });
				counters.pushSent++;
			} catch (err) {
				if (err.statusCode === 404 || err.statusCode === 410) await deletePushSub(s.endpoint).catch(() => {});
			}
		}));
	}
	await dropPushAlerts(due.map(a => a.id));
	return due.length;
}

/**
 * The sweep for an account's own chimes. Every few seconds rather than
 * every minute: the legs of a barter run are two or three minutes
 * apart, and a chime a minute late is a chime for the wrong island.
 */
export function startAlertPushes(every = 10e3) {
	const beat = async () => {
		try {
			await sendDueAlerts();
		} catch (err) {
			console.warn('[push] chimes failed:', err.message);
		}
	};
	const timer = setInterval(beat, every);
	if (timer.unref) timer.unref();
	return timer;
}

/** Once a minute, for the life of the process. */
export function startVellPushes() {
	webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
	const sent = {};
	const beat = async () => {
		for (const d of dueRegions(Date.now(), sent)) {
			sent[d.region] = d.at;
			try {
				const n = await notifyRegion(d.region, d.at);
				if (n) console.log(`[push] Vell reminder to ${n} on ${d.region}`);
			} catch (err) {
				console.warn('[push] reminder failed:', err.message);
			}
		}
	};
	const timer = setInterval(beat, 60e3);
	if (timer.unref) timer.unref();
	return timer;
}
