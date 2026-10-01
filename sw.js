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
// The vendored OCR engine, six megabytes under names that carry their
// versions. Kept apart from the tiles so the tiles' shedding can never
// take it: an engine evicted to make room for a square of sea is an
// engine the reader cannot run offline, and six megabytes to fetch
// again on the next signal.
const READER_CACHE = 'reader-engine';

// How long a code request waits on a network that has not answered
// before the copy already held is used -- a phone at sea with one bar
// otherwise waits out the browser's own timeout on every module.
const NETWORK_WAIT_MS = 3000;
// How many shell files the install fetches at once.
const PRECACHE_LANES = 6;

// The whole app shell: the page, the styles, every module the page can
// reach, and the data files they fetch. Taken with one addAll so the
// offline copy is atomic -- all of a deploy or none of it.
//
// The language packs are deliberately not here. There are twelve of
// them in two halves, and precaching twenty-four files to serve the one
// a player reads would pay for eleven languages nobody on this browser
// will ever open. They are js/ paths like any other, so the first time
// a language is chosen online its pack is filed away with the rest of
// the code -- and a new deploy fetches again the packs the old one had
// (see install), so it keeps working offline from then on.
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
	'/js/material_boards.json',
	'/js/driver.iife.js',
	'/js/about.js',
	'/js/bag-shot.js',
	'/js/barter-board.js',
	'/js/barter-chains.js',
	'/js/barter-import.js',
	'/js/barter-layouts.js',
	'/js/barter-material.js',
	'/js/barter-odds.js',
	'/js/barter-optimizer.js',
	'/js/barter-orders.js',
	'/js/barter-plan.js',
	'/js/barter-route.js',
	'/js/barter-short.js',
	'/js/barter-shot.js',
	'/js/barter-worker.js',
	'/js/barter.js',
	'/js/barter/actions.js',
	'/js/barter/board.js',
	'/js/barter/cockpit.js',
	'/js/barter/fleet.js',
	'/js/barter/hold.js',
	'/js/barter/material.js',
	'/js/barter/packing.js',
	'/js/barter/parts.js',
	'/js/barter/plan.js',
	'/js/barter/results.js',
	'/js/barter/rolls.js',
	'/js/barter/route.js',
	'/js/barter/sail.js',
	'/js/barter/search.js',
	'/js/barter/setsail.js',
	'/js/barter/morph.js',
	'/js/barter/short.js',
	'/js/barter/state.js',
	'/js/barter/today.js',
	'/js/barter/get-today.js',
	'/js/barter/view.js',
	'/js/barter_game.js',
	'/js/barter_npcs.js',
	'/js/barter_seen.js',
	'/js/boot.js',
	'/js/cheer.js',
	'/js/clock.js',
	'/js/coin-shop.js',
	'/js/count-net.js',
	'/js/count_model.js',
	'/js/courses.js',
	'/js/crystals.js',
	'/js/dialogs.js',
	'/js/digest.js',
	'/js/enhancement.js',
	'/js/falasi_vendor.js',
	'/js/feedback.js',
	'/js/film.js',
	'/js/fmt.js',
	'/js/gamefile.js',
	'/js/get-plan.js',
	'/js/get-way.js',
	'/js/guide.js',
	'/js/guided-tour.js',
	'/js/habitats.js',
	'/js/i18n.js',
	'/js/icon-loader.js',
	'/js/item-card.js',
	'/js/jump.js',
	'/js/kinds.js',
	'/js/land-cost.js',
	'/js/land_goods.js',
	'/js/land_weights.js',
	'/js/layout-book.js',
	'/js/layouts-view.js',
	'/js/links.js',
	'/js/loading.js',
	'/js/map.js',
	'/js/map/actions.js',
	'/js/map/errands.js',
	'/js/map/game-map.js',
	'/js/map/gestures.js',
	'/js/map/marks.js',
	'/js/map/offline.js',
	'/js/map/paint.js',
	'/js/map/render.js',
	'/js/map/route.js',
	'/js/map/state.js',
	'/js/map/terrain.js',
	'/js/map/trace.js',
	'/js/map/view.js',
	'/js/market.js',
	'/js/markup.js',
	'/js/material-book-view.js',
	'/js/material-book.js',
	'/js/monster_art.js',
	'/js/pace.js',
	'/js/parley-ledger.js',
	'/js/part_stats.js',
	'/js/peek.js',
	'/js/picker.js',
	'/js/planner.js',
	'/js/pouch.js',
	'/js/presence.js',
	'/js/profile-bar.js',
	'/js/profile-shape.js',
	'/js/profiles.js',
	'/js/push-sub.js',
	'/js/quest-course.js',
	'/js/quest-places.js',
	'/js/quest-today.js',
	'/js/quest_icons.js',
	'/js/quests.js',
	'/js/rations.js',
	'/js/realistic-water-ripples.js',
	'/js/recipes.js',
	'/js/release.js',
	'/js/route-ledger.js',
	'/js/sail-scene.js',
	'/js/sail-timer.js',
	'/js/sailing.js',
	'/js/sailor-import.js',
	'/js/sailor-locales.js',
	'/js/sailor-shot.js',
	'/js/sailor_rolls.js',
	'/js/sailor_titles.js',
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
	'/js/sea-boards.js',
	'/js/sea_coins.js',
	'/js/sea_crystals.js',
	'/js/sea_dist.js',
	'/js/sea_monsters.js',
	'/js/seamask.js',
	'/js/searoute.js',
	'/js/setups.js',
	'/js/share.js',
	'/js/sheet.js',
	'/js/ship-pace.js',
	'/js/ship.js',
	'/js/ship_roles.js',
	'/js/ship_skins.js',
	'/js/ship_stats.js',
	'/js/ships.js',
	'/js/shot-reader.js',
	'/js/state.js',
	'/js/storage-import.js',
	'/js/storage-shot.js',
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
// Each file is asked for under this deploy's stamp and past every cache
// on the way: the proxy and the CDN in front of the live site have been
// seen holding a module for a day whatever the server said, and a plain
// request here would bake yesterday's copy into today's offline shell --
// under today's name, where nothing would replace it until the next
// deploy. The stamp makes the address one no cache has seen; `reload`
// tells the browser's own cache the same. Each copy is filed under its
// plain address, which is what the page asks for.
//
// Filed as a copy with no address of its own. A response remembers the
// address it was fetched from, and one fetched as `?v=` would carry that
// into the page: a worker or a module served from it would believe it
// lives at the stamped address -- a different module, as far as the
// browser's module map is concerned, from the same file asked for plain.
const fresh = async path => {
	const res = await fetch(new Request(`${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(VERSION)}`, { cache: 'reload' }));
	if (!keepable(res)) return res;
	return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
};

self.addEventListener('install', evt => {
	evt.waitUntil((async () => {
		const cache = await caches.open(APP_CACHE);
		// All fetched before any is filed, so the shell is still all of a
		// deploy or none of it: one file that fails fails the install,
		// as addAll did, and leaves nothing half-written behind.
		// A few at a time, not the whole shell at once: a first visit
		// installs this while the page is still loading, and a hundred and
		// eighty requests in the air together left the page's own -- the
		// barter search's worker among them -- queued behind them.
		const got = [];
		let next = 0;
		const lane = async () => {
			while (next < SHELL.length) {
				const path = SHELL[next++];
				const res = await fresh(path);
				if (!keepable(res)) throw new Error(`${path} answered ${res.status}`);
				got.push([path, res]);
			}
		};
		await Promise.all(Array.from({ length: PRECACHE_LANES }, lane));
		await Promise.all(got.map(([path, res]) => cache.put(path, res)));
		// The language packs this browser had, fetched again for this
		// deploy: the old cache goes at activate, and a player who then
		// opened the app with no signal was shown it in English.
		const packs = new Set();
		for (const key of await caches.keys()) {
			if (key === APP_CACHE || !key.startsWith('sail-')) continue;
			for (const req of await (await caches.open(key)).keys()) {
				const path = new URL(req.url).pathname;
				if (path.startsWith('/js/lang/')) packs.add(path);
			}
		}
		await Promise.all([...packs].map(async path => {
			try { const res = await fresh(path); if (keepable(res)) await cache.put(path, res); } catch { /* fetched again when next asked for */ }
		}));
	})());
});

self.addEventListener('activate', evt => {
	evt.waitUntil((async () => {
		for (const key of await caches.keys()) {
			if (key !== APP_CACHE && key !== ASSET_CACHE && key !== PINNED_CACHE && key !== READER_CACHE) await caches.delete(key);
		}
		await self.clients.claim();
	})());
});

// The barter table is precached with the shell and only changes with a
// deploy, which is when the shell cache is replaced -- so it is served
// from the cache first rather than re-fetched on every load.
// The vendored OCR engine belongs here too: its filenames carry their
// versions, so a given URL is a given six megabytes forever, and it
// must not be fetched again every time the app is deployed.
const contentAddressed = path => path.startsWith('/icons/') || path.startsWith('/map/') || (path.startsWith('/map3d/') && path !== '/map3d/index.json') || path.startsWith('/reader/') || path === '/js/all_barter.json';
const neverCached = path =>
	path.startsWith('/api/') || path.startsWith('/auth/') || path.startsWith('/docs/media/');

self.addEventListener('fetch', evt => {
	const req = evt.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== location.origin) return;   // fonts fall back to the stack
	if (neverCached(url.pathname)) return;

	if (contentAddressed(url.pathname)) return evt.respondWith(cacheFirst(req, url.pathname.startsWith('/reader/') ? READER_CACHE : ASSET_CACHE));
	if (req.mode === 'navigate') return evt.respondWith(navigate(evt));
	const mode = modes.get(evt.clientId);
	// A worker is a client of its own, and what it imports is asked for
	// under its own id. A worker started by a page running from the
	// cache keeps to the cache with it; anything else a worker asks for
	// goes to the network and waits, as it always did -- no clock is
	// raced on the search's own modules.
	if (req.destination === 'worker' || req.destination === 'sharedworker') {
		if (mode === 'cache') remember(evt.resultingClientId, 'cache');
		return evt.respondWith(mode === 'cache' ? code(req, 'cache') : networkFirst(req));
	}
	evt.respondWith(code(req, mode));
});

/*
 * Waiting on a slow network, without mixing deploys.
 *
 * Falling back to the held copy after a few seconds is only safe when
 * the held copy and the network are the same deploy: otherwise a page
 * whose fast modules came from the network and whose slow ones came
 * from the cache is two deploys stitched together, which is the one
 * thing this worker exists to prevent. So the page decides it for all
 * of its modules, once, as it is opened:
 *
 *   - the page itself came from the cache, because the network did not
 *     answer in time: every module it asks for comes from the cache too
 *     ('cache'), and the network only fills what is missing;
 *   - it came from the network and names this worker's deploy (the
 *     server says which in X-Build): the network is given a few seconds
 *     a module and the same deploy's held copy answers after that
 *     ('same');
 *   - it came from the network and names another deploy -- one is out
 *     and this worker is the old one: the network is waited for, as it
 *     always was, because the cache holds the wrong deploy.
 *
 * Remembered by the page's client id, for as long as this worker is
 * awake. A worker woken afresh knows nothing of the page and waits on
 * the network, which is the old behaviour and never wrong.
 */
const modes = new Map();   // clientId -> 'cache' | 'same'
const remember = (id, mode) => {
	if (!id) return;
	modes.set(id, mode);
	if (modes.size > 64) modes.delete(modes.keys().next().value);
};

async function navigate(evt) {
	const req = evt.request;
	const network = fetchAndFile(req);
	const res = await within(network, NETWORK_WAIT_MS);
	if (res) {
		if (res.headers.get('X-Build') === VERSION) remember(evt.resultingClientId, 'same');
		return res;
	}
	// Slow, or no network at all: the page this worker holds, and every
	// module of it from the same place.
	const held = (await caches.match(req, { ignoreSearch: true, cacheName: APP_CACHE })) || (await caches.match('/', { cacheName: APP_CACHE }));
	if (held) {
		network.catch(() => {});
		remember(evt.resultingClientId, 'cache');
		return held;
	}
	try {
		return await network;
	} catch {
		return Response.error();
	}
}

async function code(req, mode) {
	if (mode === 'cache') {
		const held = await caches.match(req, { cacheName: APP_CACHE });
		if (held) return held;
		return networkFirst(req);
	}
	if (mode !== 'same') return networkFirst(req);
	const network = fetchAndFile(req);
	const res = await within(network, NETWORK_WAIT_MS);
	if (res) return res;
	const held = await caches.match(req, { cacheName: APP_CACHE });
	if (held) {
		network.catch(() => {});
		return held;
	}
	return networkFirst(req, network);
}

/** The answer if it comes inside `ms`, else null. A network that fails
 *  outright inside the wait is null too: the caller looks to the cache
 *  either way. */
function within(promise, ms) {
	let timer;
	return Promise.race([
		promise.catch(() => null),
		new Promise(resolve => { timer = setTimeout(resolve, ms, null); })
	]).finally(() => clearTimeout(timer));
}

// Only a plain 200 is worth keeping: a 206 is a fragment cache.put
// rejects, and an opaque or errored response is not a copy of anything.
const keepable = res => res.status === 200;

let assetPuts = 0;
async function cacheFirst(req, into = ASSET_CACHE) {
	// An area kept offline answers first: those tiles were asked for by
	// name, and they are the ones that must still draw with no signal.
	const pinned = await caches.match(req, { cacheName: PINNED_CACHE });
	if (pinned) return pinned;
	const held = await caches.match(req);
	if (held) return held;
	try {
		const res = await fetch(req);
		if (keepable(res) && into !== ASSET_CACHE) {
			// The engine's own cache is never shed: it is a handful of
			// files, each kept until its version changes its name.
			await (await caches.open(into)).put(req, res.clone());
		} else if (keepable(res)) {
			const cache = await caches.open(ASSET_CACHE);
			// The sea is large and the tiles add up: a full-screen view
			// at the closest zoom is fifty of them, at 9 KB each. Room
			// for forty such views (~20 MB), shedding the oldest tenth
			// rather than growing forever.
			// Counted every fiftieth put, not every miss: listing two
			// thousand entries each time a tile came in cost a phone dearly
			// while panning.
			if (assetPuts++ % 50 === 0) {
				const keys = await cache.keys();
				if (keys.length > 2000) await Promise.all(keys.slice(0, 200).map(key => cache.delete(key)));
			}
			await cache.put(req, res.clone());
		}
		return res;
	} catch {
		// An offline miss must still answer, or respondWith rejects.
		return new Response('', { status: 404, statusText: 'offline' });
	}
}

// A push is a chime the page asked for -- a stop or the end of a run
// coming due -- shown as a notification, and a tap on it opens the tracker.
self.addEventListener('push', evt => {
	let data;
	try {
		data = evt.data ? evt.data.json() : {};
	} catch {
		data = { body: evt.data ? evt.data.text() : '' };
	}
	evt.waitUntil(self.registration.showNotification(data.title || 'Sailor’s Log', {
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
			if (!('focus' in c)) continue;
			const win = await c.focus();
			// The chime says where it is about -- the Barter tab for a
			// run's next island -- so an open window is taken there, not
			// only brought forward on whatever tab it was showing. Only
			// the part after the # differs, so the page changes tab
			// rather than reloading.
			const want = new URL(url, location.origin);
			const at = new URL(win.url);
			if ('navigate' in win && want.pathname === at.pathname && want.hash && want.hash !== at.hash) {
				try { return await win.navigate(want.href); } catch { /* not ours to steer; focused is enough */ }
			}
			return win;
		}
		return self.clients.openWindow(url);
	})());
});

/** The network's answer, filed in this deploy's cache on the way past. */
function fetchAndFile(req) {
	return fetch(req).then(res => {
		// Not filed away once a newer worker is installed and waiting.
		// The network is already serving the new deploy's files by then,
		// and this cache is the old deploy's: writing one into the other
		// would build exactly the mixed shell an offline start must never
		// find. The waiting worker precached the whole new shell itself.
		if (keepable(res) && !self.registration.waiting) {
			const copy = res.clone();
			caches.open(APP_CACHE).then(cache => cache.put(req, copy)).catch(() => {});
		}
		return res;
	});
}

async function networkFirst(req, already = null) {
	try {
		return await (already || fetchAndFile(req));
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
