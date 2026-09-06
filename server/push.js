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
import { putPushSub, deletePushSub, listPushSubs, countPushSubs } from './db.js';
import { VELL, nextSpawn } from '../js/clock.js';
import { perAddress } from './limit.js';
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

	router.post('/push/subscribe', limited, async (req, res) => {
		const { subscription, region } = req.body || {};
		if (!looksLikeSubscription(subscription)) return res.status(400).json({ error: 'Expected a push subscription.' });
		if (!VELL[region]) return res.status(400).json({ error: 'No timetable for that region.' });
		try {
			if (await countPushSubs() >= MAX_SUBSCRIPTIONS) {
				return res.status(503).json({ error: 'No room for another reminder right now.' });
			}
			await putPushSub(subscription.endpoint, subscription, region);
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
	return router;
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
