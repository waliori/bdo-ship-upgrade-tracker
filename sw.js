// Offline, kept honest.
//
// The tracker calls itself local-first, and localStorage half of that
// was always true -- but every module was served no-cache, so with no
// network the page itself would not load. This closes that gap without
// touching the invariant the no-cache policy exists for: there is no
// build step, so two modules from different deploys can break each
// other, and a cache must never mix them while the network is there to
// say otherwise.
//
// So the strategies are chosen by what a path can afford:
//
//   * Code and data (js/, css/, the page, icon_mapping.json) go
//     network-first. Online, every load revalidates exactly as before
//     -- the server's ETags still answer 304 and this cache only files
//     the copy away. Offline, the last complete set the browser saw is
//     what runs.
//   * Icons and map tiles are content-addressed -- a name keeps its
//     pixels -- so they are cache-first: hit the cache, fetch on a
//     miss, and never spend the network twice on the same square of
//     sea.
//   * /api and /auth are never touched. A save is one account's, a
//     sign-in is a redirect dance; neither has any business in a cache.
//
// One versioned cache, swept on activate, so an update to this file can
// start clean.

const CACHE = 'sail-v1';

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', evt => {
	evt.waitUntil((async () => {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
		await self.clients.claim();
	})());
});

const contentAddressed = path => path.startsWith('/icons/') || path.startsWith('/map/');
const neverCached = path => path.startsWith('/api/') || path.startsWith('/auth/');

self.addEventListener('fetch', evt => {
	const req = evt.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== location.origin) return;   // fonts fall back to the stack
	if (neverCached(url.pathname)) return;

	evt.respondWith(
		contentAddressed(url.pathname) ? cacheFirst(req) : networkFirst(req)
	);
});

async function cacheFirst(req) {
	const held = await caches.match(req);
	if (held) return held;
	const res = await fetch(req);
	if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
	return res;
}

async function networkFirst(req) {
	try {
		const res = await fetch(req);
		if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
		return res;
	} catch {
		const held = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
		if (held) return held;
		// A navigation that was never cached still deserves the app shell.
		if (req.mode === 'navigate') {
			const home = await caches.match('/');
			if (home) return home;
		}
		return Response.error();
	}
}
