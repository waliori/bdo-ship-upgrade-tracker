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
import { putPushSub, deletePushSub, listPushSubs } from './db.js';
import { VELL, nextSpawn } from '../js/clock.js';

const looksLikeSubscription = s =>
	s && typeof s === 'object' && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint)
	&& s.endpoint.length < 2048 && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';

export function pushRoutes() {
	const router = express.Router();
	router.use(express.json({ limit: 8 * 1024 }));
	router.use((req, res, next) => {
		res.set('Cache-Control', 'no-store');
		next();
	});

	router.get('/push/key', (req, res) => {
		res.json({ key: config.vapid.publicKey, regions: Object.keys(VELL), beforeMinutes: config.pushBeforeMs / 60000 });
	});

	router.post('/push/subscribe', async (req, res) => {
		const { subscription, region } = req.body || {};
		if (!looksLikeSubscription(subscription)) return res.status(400).json({ error: 'Expected a push subscription.' });
		if (!VELL[region]) return res.status(400).json({ error: 'No timetable for that region.' });
		try {
			await putPushSub(subscription.endpoint, subscription, region);
			res.status(204).end();
		} catch (err) {
			console.warn('[push] could not keep a subscription:', err.message);
			res.status(503).json({ error: 'The database did not answer.' });
		}
	});

	router.delete('/push/subscribe', async (req, res) => {
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
