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
// The app cache is named for the deploy -- the server writes the build
// stamp into VERSION as it serves this file (server.js), and the Docker
// build bakes one in as well -- and activate sweeps every cache that is
// not this deploy's or the assets', so an update starts clean.

const VERSION = '__BUILD__';   // replaced with the build stamp when served; the literal is only ever seen on disk
const APP_CACHE = `sail-${VERSION}`;
const ASSET_CACHE = 'sail-assets';
// Tiles the Map was asked to keep offline -- an area fetched on purpose.
// Filled and emptied by the page, never by this worker: the sweep
// leaves it alone and the tile cap above does not count it.
const PINNED_CACHE = 'tiles-pinned';

// The whole app shell: the page, the styles, every module the page can
// reach, and the data files they fetch. Taken with one addAll so the
// offline copy is atomic -- all of a deploy or none of it.
const SHELL = [
	'/',
	'/index.html',
	'/manifest.webmanifest',
	'/icon_mapping.json',
	'/css/tracker-base.css',
	'/css/tracker-shell.css',
	'/css/tracker-yard.css',
	'/css/tracker-widgets.css',
	'/css/tracker-map.css',
	'/css/tracker-sea.css',
	'/css/tracker-extras.css',
	'/css/tracker-barter.css',
	'/css/tracker-recent.css',
	'/css/driver.css',
	'/js/all_barter.json',
	'/js/barter_combos.json',
	'/js/material_boards.json',
	'/js/driver.iife.js',
	'/js/about.js',
	'/js/barter-board.js',
	'/js/barter-chains.js',
	'/js/barter-material.js',
	'/js/barter-optimizer.js',
	'/js/barter-orders.js',
	'/js/barter-plan.js',
	'/js/barter-worker.js',
	'/js/barter.js',
	'/js/barter_npcs.js',
	'/js/boot.js',
	'/js/cheer.js',
	'/js/clock.js',
	'/js/courses.js',
	'/js/crystals.js',
	'/js/dialogs.js',
	'/js/digest.js',
	'/js/enhancement.js',
	'/js/falasi_vendor.js',
	'/js/feedback.js',
	'/js/fmt.js',
	'/js/gamefile.js',
	'/js/guide.js',
	'/js/guided-tour.js',
	'/js/habitats.js',
	'/js/icon-loader.js',
	'/js/item-card.js',
	'/js/jump.js',
	'/js/kinds.js',
	'/js/land-cost.js',
	'/js/land_goods.js',
	'/js/map.js',
	'/js/map/actions.js',
	'/js/map/game-map.js',
	'/js/map/gestures.js',
	'/js/map/marks.js',
	'/js/map/offline.js',
	'/js/map/paint.js',
	'/js/map/render.js',
	'/js/map/route.js',
	'/js/map/state.js',
	'/js/map/trace.js',
	'/js/map/view.js',
	'/js/market.js',
	'/js/monster_art.js',
	'/js/pace.js',
	'/js/parley-ledger.js',
	'/js/part_stats.js',
	'/js/peek.js',
	'/js/picker.js',
	'/js/planner.js',
	'/js/pouch.js',
	'/js/profile-shape.js',
	'/js/profiles.js',
	'/js/quest-places.js',
	'/js/quests.js',
	'/js/rations.js',
	'/js/realistic-water-ripples.js',
	'/js/recipes.js',
	'/js/route-ledger.js',
	'/js/sailing.js',
	'/js/sailor_rolls.js',
	'/js/sailors.js',
	'/js/saved-routes.js',
	'/js/screen-barter.js',
	'/js/screen-builds.js',
	'/js/screen-community.js',
	'/js/screen-crew.js',
	'/js/screen-get.js',
	'/js/screen-inventory.js',
	'/js/screen-map.js',
	'/js/screen-plan.js',
	'/js/screen-quests.js',
	'/js/screen-tables.js',
	'/js/screen-tree.js',
	'/js/screen-workshop.js',
	'/js/sea_coins.js',
	'/js/sea_crystals.js',
	'/js/sea_monsters.js',
	'/js/seamask.js',
	'/js/searoute.js',
	'/js/setups.js',
	'/js/share.js',
	'/js/sheet.js',
	'/js/ship.js',
	'/js/ship_skins.js',
	'/js/ship_stats.js',
	'/js/ships.js',
	'/js/state.js',
	'/js/sync.js',
	'/js/tile_alias.js',
	'/js/today.js',
	'/js/trade_goods.js',
	'/js/triplog.js',
	'/js/ui-bits.js',
	'/js/ui-state.js',
	'/js/ui.js',
	'/js/vendor_items.js',
	'/js/viewport.js',
	'/js/wharves.js',
	'/js/worldmap.js'
];

// A new deploy waits its turn. The shell is a set of modules that only
// work together, and two of them -- the tour and the water -- are
// loaded on demand. A worker that took over the moment it installed
// would delete the old cache from under a tab still running the old
// modules, and that tab's next on-demand import would come from the
// new deploy: exactly the mixing the caching exists to prevent. So it
// installs, and waits, and the browser lets it in on the next visit
// once every tab of the old deploy is closed.
self.addEventListener('install', evt => {
	evt.waitUntil((async () => {
		const cache = await caches.open(APP_CACHE);
		await cache.addAll(SHELL);
	})());
});

self.addEventListener('activate', evt => {
	evt.waitUntil((async () => {
		for (const key of await caches.keys()) {
			if (key !== APP_CACHE && key !== ASSET_CACHE && key !== PINNED_CACHE) await caches.delete(key);
		}
		await self.clients.claim();
	})());
});

// The barter table is precached with the shell and only changes with a
// deploy, which is when the shell cache is replaced -- so it is served
// from the cache first rather than re-fetched on every load.
const contentAddressed = path => path.startsWith('/icons/') || path.startsWith('/map/') || path === '/js/all_barter.json' || path === '/js/barter_combos.json';
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
	// An area kept offline answers first: those tiles were asked for by
	// name, and they are the ones that must still draw with no signal.
	const pinned = await caches.match(req, { cacheName: PINNED_CACHE });
	if (pinned) return pinned;
	const held = await caches.match(req);
	if (held) return held;
	try {
		const res = await fetch(req);
		if (keepable(res)) {
			const cache = await caches.open(ASSET_CACHE);
			// The sea is large and the tiles add up: a full-screen view
			// at the closest zoom is fifty of them, at 9 KB each. Room
			// for forty such views (~20 MB), shedding the oldest tenth
			// rather than growing forever.
			const keys = await cache.keys();
			if (keys.length > 2000) {
				await Promise.all(keys.slice(0, 200).map(key => cache.delete(key)));
			}
			await cache.put(req, res.clone());
		}
		return res;
	} catch {
		// An offline miss must still answer, or respondWith rejects.
		return new Response('', { status: 404, statusText: 'offline' });
	}
}

// A push is a reminder the page asked for -- Vell, a quarter of an hour
// out -- shown as a notification, and a tap on it opens the tracker.
self.addEventListener('push', evt => {
	let data;
	try {
		data = evt.data ? evt.data.json() : {};
	} catch {
		data = { body: evt.data ? evt.data.text() : '' };
	}
	evt.waitUntil(self.registration.showNotification(data.title || 'Ship Upgrade Tracker', {
		body: data.body || '',
		icon: '/icon-192.png',
		badge: '/icon-192.png',
		tag: data.tag || 'sail',
		data: { url: data.url || '/' }
	}));
});

self.addEventListener('notificationclick', evt => {
	evt.notification.close();
	const url = (evt.notification.data && evt.notification.data.url) || '/';
	evt.waitUntil((async () => {
		const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
		for (const c of open) {
			if ('focus' in c) return c.focus();
		}
		return self.clients.openWindow(url);
	})());
});

async function networkFirst(req) {
	try {
		const res = await fetch(req);
		// Not filed away once a newer worker is installed and waiting.
		// The network is already serving the new deploy's files by then,
		// and this cache is the old deploy's: writing one into the other
		// would build exactly the mixed shell an offline start must never
		// find. The waiting worker precached the whole new shell itself.
		if (keepable(res) && !self.registration.waiting) (await caches.open(APP_CACHE)).put(req, res.clone());
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
