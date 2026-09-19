// A ceiling on how often one account may push.
//
// Keyed by the signed-in account, not by IP, and deliberately so. Behind
// Cloudflare and a proxy the client's address is several headers deep and
// easy to get wrong -- `trust proxy` counts hops, and counting them wrong
// puts every player in the world in one bucket. The session id is already
// verified, cannot be forged without the server's key, and names exactly
// the thing being protected: the account whose save is being written.
//
// Address-level abuse -- the sign-in route, floods from one host -- is
// Cloudflare's job, and it is much better placed to do it.

const WINDOW_MS = 60_000;

/**
 * Allow `max` requests per account per minute.
 *
 * The client debounces a push to one every 500ms and backs off when a
 * push fails, so a browser behaving itself never comes close. This is
 * here for one that is not.
 */
export function perAccount(max, message = 'That is a lot of saving. Your data is safe here; try again shortly.') {
	const seen = new Map();   // userId -> { count, until }

	// Old entries are dropped as they are met, but an account that pushed
	// once and left would sit there forever, so sweep occasionally too.
	const sweep = setInterval(() => {
		const now = Date.now();
		for (const [id, bucket] of seen) if (bucket.until <= now) seen.delete(id);
	}, WINDOW_MS);
	if (sweep.unref) sweep.unref();

	return (req, res, next) => {
		const now = Date.now();
		let bucket = seen.get(req.userId);
		if (!bucket || bucket.until <= now) {
			bucket = { count: 0, until: now + WINDOW_MS };
			seen.set(req.userId, bucket);
		}
		if (++bucket.count > max) {
			const retry = Math.ceil((bucket.until - now) / 1000);
			res.set('Retry-After', String(retry));
			return res.status(429).json({ error: message });
		}
		next();
	};
}

/**
 * A ceiling for the routes that have no account to key on.
 *
 * The market relay and the push subscription are open by design -- a
 * price is not a secret, and a push subscription is anonymous -- so the
 * account limiter above cannot cover them. Two ceilings do instead, and
 * the second is the one that matters:
 *
 *   - per address, `max` a minute. Coarse: behind a proxy that is not
 *     trusted every caller shares one address, and `trust proxy` is
 *     only set for an HTTPS deployment (server.js). It is a speed bump
 *     for one browser gone wrong, not a wall.
 *   - across the whole process, `total` a minute. This is what stops a
 *     deployment being used as a lever on the upstream market API, or
 *     a table being filled with endpoints, whoever is asking.
 *
 * Both are ordinary sliding windows kept in memory, swept as they lapse.
 */
export function perAddress(max, total = max * 20, message = 'Too many requests; try again shortly.') {
	const seen = new Map();   // address -> { count, until }
	let all = { count: 0, until: 0 };

	const sweep = setInterval(() => {
		const now = Date.now();
		for (const [key, bucket] of seen) if (bucket.until <= now) seen.delete(key);
	}, WINDOW_MS);
	if (sweep.unref) sweep.unref();

	const refuse = (res, until, now) => {
		res.set('Retry-After', String(Math.max(1, Math.ceil((until - now) / 1000))));
		return res.status(429).json({ error: message });
	};

	return (req, res, next) => {
		const now = Date.now();
		if (all.until <= now) all = { count: 0, until: now + WINDOW_MS };
		if (++all.count > total) return refuse(res, all.until, now);

		const key = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
		let bucket = seen.get(key);
		if (!bucket || bucket.until <= now) {
			bucket = { count: 0, until: now + WINDOW_MS };
			seen.set(key, bucket);
		}
		if (++bucket.count > max) return refuse(res, bucket.until, now);
		next();
	};
}
