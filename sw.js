// Offline, kept honest.
//
// The tracker calls itself local-first, and the localStorage half of
// that was always true -- but every module was served no-cache, so with
// no network the page itself would not load. This closes that gap
// without touching the invariant the no-cache policy exists for: there
// is no build step, so two modules from different deploys can break
// each other, and a cache must never mix them.
//
// So the strategies are chosen by what a path can afford:
//
//   * Code and data (js/, css/, the page, icon_mapping.json) go
//     network-first. Online, every load revalidates exactly as before
//     -- the server's ETags still answer 304 and this cache only files
//     the copy away. Offline, what runs is the shell precached below:
//     the whole module graph taken in one install, so it is one
//     deploy's, never half of one and half of another.
//   * Icons and map tiles are content-addressed -- a name keeps its
//     pixels -- so they are cache-first: hit the cache, fetch on a
//     miss, and never spend the network twice on the same square of
//     sea. They outlive deploys in a cache of their own.
//   * /api and /auth are never touched. A save is one account's, a
//     sign-in is a redirect dance; neither has any business in a cache.
//   * The walkthrough films are left alone entirely: a <video> asks in
//     ranges, and a 206 is something cache.put refuses.
//
// The app cache is named for the deploy -- the Docker build stamps
// VERSION -- and activate sweeps every cache that is not this deploy's
// or the assets', so an update starts clean.

const VERSION = '__BUILD__';   // stamped at image build; unstamped, the literal names the dev cache
const APP_CACHE = `sail-${VERSION}`;
const ASSET_CACHE = 'sail-assets';

// The whole app shell: the page, the styles, every module the page can
// reach, and the data files they fetch. Taken with one addAll so the
// offline copy is atomic -- all of a deploy or none of it.
const SHELL = [
	'/',
	'/index.html',
	'/manifest.webmanifest',
	'/icon_mapping.json',
	'/css/tracker.css',
	'/css/driver.css',
	'/js/all_barter.json',
	'/js/barter.js',
	'/js/barter_npcs.js',
	'/js/boot.js',
	'/js/dialogs.js',
	'/js/driver.iife.js',
	'/js/enhancement.js',
	'/js/falasi_vendor.js',
	'/js/fmt.js',
	'/js/guide.js',
	'/js/guided-tour.js',
	'/js/icon-loader.js',
	'/js/map.js',
	'/js/peek.js',
	'/js/planner.js',
	'/js/pouch.js',
	'/js/realistic-water-ripples.js',
	'/js/recipes.js',
	'/js/screen-builds.js',
	'/js/screen-get.js',
	'/js/screen-inventory.js',
	'/js/screen-map.js',
	'/js/screen-plan.js',
	'/js/screen-tree.js',
	'/js/screen-workshop.js',
	'/js/ship_stats.js',
	'/js/sailors.js',
	'/js/screen-crew.js',
	'/js/market.js',
	'/js/sea_coins.js',
	'/js/ships.js',
	'/js/state.js',
	'/js/sync.js',
	'/js/ui-bits.js',
	'/js/ui-state.js',
	'/js/ui.js',
	'/js/vendor_items.js'
];

self.addEventListener('install', evt => {
	evt.waitUntil((async () => {
		const cache = await caches.open(APP_CACHE);
		await cache.addAll(SHELL);
		await self.skipWaiting();
	})());
});

self.addEventListener('activate', evt => {
	evt.waitUntil((async () => {
		for (const key of await caches.keys()) {
			if (key !== APP_CACHE && key !== ASSET_CACHE) await caches.delete(key);
		}
		await self.clients.claim();
	})());
});

const contentAddressed = path => path.startsWith('/icons/') || path.startsWith('/map/');
const neverCached = path =>
	path.startsWith('/api/') || path.startsWith('/auth/') || path.startsWith('/docs/media/');

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

// Only a plain 200 is worth keeping: a 206 is a fragment cache.put
// rejects, and an opaque or errored response is not a copy of anything.
const keepable = res => res.status === 200;

async function cacheFirst(req) {
	const held = await caches.match(req);
	if (held) return held;
	try {
		const res = await fetch(req);
		if (keepable(res)) {
			const cache = await caches.open(ASSET_CACHE);
			// The sea is large and the tiles add up. Shed the oldest
			// tenth rather than growing forever.
			const keys = await cache.keys();
			if (keys.length > 800) {
				await Promise.all(keys.slice(0, 100).map(key => cache.delete(key)));
			}
			await cache.put(req, res.clone());
		}
		return res;
	} catch {
		// An offline miss must still answer, or respondWith rejects.
		return new Response('', { status: 404, statusText: 'offline' });
	}
}

async function networkFirst(req) {
	try {
		const res = await fetch(req);
		if (keepable(res)) (await caches.open(APP_CACHE)).put(req, res.clone());
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
