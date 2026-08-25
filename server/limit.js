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
export function perAccount(max) {
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
			return res.status(429).json({
				error: 'That is a lot of saving. Your data is safe here; try again shortly.'
			});
		}
		next();
	};
}
