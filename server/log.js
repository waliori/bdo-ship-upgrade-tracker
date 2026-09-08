// One line per request that is not a file, and a few counters.
//
// The static half of the site says nothing: a page load is a hundred
// files and a log that lists them all buries the one line that matters.
// What is logged is the API, sign-in and sign-out -- one JSON object a
// request, so a `grep` or a log shipper can read it without a parser
// being written for it. The account is a short hash of the id: enough
// to follow one player's requests through a log, not enough to name
// them in a file that gets pasted into an issue.

import crypto from 'node:crypto';
import { sessionUser } from './session.js';

/** Totals since boot, reported by /healthz. */
export const counters = {
	requests: { '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
	savesFlushed: 0,
	pushSent: 0
};

const STATIC = /^\/(css|js|icons|map|guide|docs)\/|^\/[^/]*\.(png|json|webmanifest|ico|html)$|^\/(sw\.js)?$/;
const enabled = process.env.LOG_REQUESTS !== '0';
const who = req => {
	const uid = sessionUser(req);
	return uid ? crypto.createHash('sha256').update(uid).digest('hex').slice(0, 12) : undefined;
};

export function accessLog() {
	return (req, res, next) => {
		const started = process.hrtime.bigint();
		// Taken now, from the URL as it arrived: by the time the response
		// is finished a mounted router has cut its own prefix off req.url.
		const path = req.originalUrl.split('?')[0];
		res.on('finish', () => {
			const status = res.statusCode;
			const cls = `${Math.floor(status / 100)}xx`;
			if (cls in counters.requests) counters.requests[cls]++;
			// The healthcheck asks every half minute; it only earns a line
			// when the answer is bad.
			if (!enabled || STATIC.test(path) || (path === '/healthz' && status < 400)) return;
			console.log(JSON.stringify({
				t: new Date().toISOString(), method: req.method, path, status,
				ms: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10, acct: who(req)
			}));
		});
		next();
	};
}
