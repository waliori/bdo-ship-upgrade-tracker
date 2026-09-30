// The Load step: the packing list, a tick that loads the hold for real,
// the trips of a run the hold cannot carry at once, and the storage after.

import { esc, F, FC } from '../fmt.js';
import { T, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img, copyName } from '../ui-bits.js';
import { SILVER } from '../ui-state.js';
import { shownHold } from '../ship.js';
import { npcById, isleShort } from '../barter_npcs.js';
import { floorOf } from '../barter-orders.js';
import { marketStatus } from '../market.js';
import { COIN, levelOf } from '../barter.js';
import { weightOf, sellOf } from '../barter-plan.js';
import { tailOf } from '../barter-chains.js';
import { V } from './state.js';
import { lvTag } from './cockpit.js';
import { aboardStock, unloadTo } from './hold.js';
import { n1, TIER } from './route.js';
import { sailing, moveKey, mergeApplied } from './sail.js';
import { coinsOf, coinRange } from './short.js';
import { persist } from './view.js';

/**
 * What to load before casting off, and what is in the storage after:
 * the run as two shelves, with an arrow between them.
 *
 * Everything here is already in the sheet further down, item by item
 * with its price and its buttons. This is the other thing a sailor
 * wants from a plan and could not get: the two ends of it, side by
 * side, in the shape the game's own storage window has -- one tile a
 * kind, the count on it -- so it can be read against the screen while
 * loading, or sent to a guildmate as one picture.
 */
/**
 * One entry a good, the counts added up: what a run buys or fetches for
 * two chains is bought or fetched once, in one trip to the counter.
 *
 * What the row says and what its button does are the same number. They
 * were not: merging two lines of two added the counts for the reader
 * and left the button on the first line's two, so the list asked for
 * four and moved half of them -- the very thing a sailor wrote in
 * about, in a corner of the app nobody had looked at for it.
 */
function oneEach(list) {
	const by = new Map();
	for (const x of list) {
		const had = by.get(x.item);
		if (had) had.n += x.n; else by.set(x.item, { ...x });
	}
	for (const x of by.values()) if (x.load) x.load = { ...x.load, n: x.n };
	return [...by.values()];
}

/**
 * Whether a thing on the packing list is marked as aboard.
 *
 * What the hold already holds starts ticked -- there is nothing to
 * fetch -- and everything else starts clear. Either way the sailor's
 * own press is what decides: `packed` carries the marks they have
 * made, and for a row that starts ticked a mark means "take it off".
 */
// A row that a tick loads is ticked when its goods are really in the
// hold -- so the tick survives a reload and can never buy twice. The
// rows already aboard keep a plain mark, "checked against the hold".
const inHold = item => store.stockAt(item, store.ABOARD) + (levelOf(item) !== null ? store.stockAt(item, '') : 0);
export const packedNow = x => {
	const k = String(x.key || '');
	// A good the run starts from that is aboard is ticked by being
	// aboard: the tick that loaded it is the only tick it needs.
	if (k.startsWith('a|')) return (aboardStock()[x.item] || 0) > 0;
	if (k.startsWith('b|') || k.startsWith('t|')) return inHold(x.item) >= x.n;
	return V.packed.has(k);
};

/**
 * A packing row's tick, done for real: bought at the Market is goods in
 * the hold and silver out of the purse; from a storage is goods moved
 * into the hold; from the pile is the pile's goods moved aboard. Handed
 * back as the delta and moves of one change, so a whole group ticked at
 * once is one Undo. `want` is the state asked for.
 */
function packChange(x, want, from) {
	const k = String(x.key || '');
	const delta = {}, moves = [];
	if (k.startsWith('b|')) {
		const has = store.stockAt(x.item, store.ABOARD);
		if (want && has < x.n) {
			const n = x.n - has;
			delta[x.item] = n;
			if (x.cost) delta[SILVER] = -Math.round(x.cost * n / x.n);
			moves.push({ item: x.item, from: '', to: store.ABOARD, n });
		} else if (!want && has > 0) {
			const n = Math.min(has, x.n);
			moves.push({ item: x.item, from: store.ABOARD, to: '', n });
			delta[x.item] = -n;
			if (x.cost) delta[SILVER] = Math.round(x.cost * n / x.n);
		}
	} else if (k.startsWith('u|') && want) {
		const to = from ? from.name : unloadTo();
		if (to) moves.push(...unloadMoves(x.item, to, x.n));
	} else if (k.startsWith('s|') && want) {
		delta[x.item] = -x.n;
		delta[SILVER] = x.n * sellOf(x.item);
	} else if (k.startsWith('a|') && !want) {
		// Unticked: off the ship, into the storage the run sails from.
		const to = from ? from.name : unloadTo();
		if (to) moves.push(...unloadMoves(x.item, to, x.n));
	} else if (k.startsWith('l|') && want && from) {
		moves.push({ item: x.item, from: from.name, to: '', n: Math.min(x.n, store.stockAt(x.item, from.name)) });
	} else if (k.startsWith('t|')) {
		const has = store.stockAt(x.item, store.ABOARD);
		if (want && has < x.n) {
			let need = x.n - has;
			const towns = Object.entries((store.getProfile('stash', {}) || {})[x.item] || {}).filter(([t]) => t !== store.ABOARD)
				.sort((a, b) => (from && a[0] === from.name ? -1 : from && b[0] === from.name ? 1 : b[1] - a[1]));
			for (const [t, n] of towns) { if (need <= 0) break; const m = Math.min(n, need); moves.push({ item: x.item, from: t, to: store.ABOARD, n: m }); need -= m; }
			if (need > 0) moves.push({ item: x.item, from: '', to: store.ABOARD, n: need });
		} else if (!want && has > 0) moves.push({ item: x.item, from: store.ABOARD, to: from ? from.name : '', n: Math.min(has, x.n) });
	}
	return { delta, moves };
}
/** The moves that put `n` of a good ashore at `to`: off the ship's hold
 *  first, then -- a trade good -- out of the bags, which is where the
 *  app has always kept the ones aboard. */
/**
 * What is aboard that the run will not touch: goods no ticked chain
 * starts from or hands over, and of a good a chain starts from, what is
 * past what its first island takes. On a run out of a harbour they are
 * dealt with there, before the lines are let go -- sold at its wharf
 * when the day sells that level and a barterer pays for it, else put in
 * its storage -- rather than carried round the route to a call later
 * on, weighing the ship down all the way. Each is { item, n, sell }.
 */
export function sparesOf(chosen, from, o, stocking = false) {
	if (!from || sailing()) return [];
	const demand = new Map();
	for (const c of chosen) {
		c.rungs.forEach((r, i) => {
			if (demand.get(r.give) === Infinity) return;
			// A rung past the first can take the good from anywhere -- made
			// on the way or held -- so a good given there is never spare.
			if (i === 0 && c.from !== 'land' && c.item === r.give) demand.set(r.give, (demand.get(r.give) || 0) + r.tries * r.giveN);
			else demand.set(r.give, Infinity);
		});
	}
	const out = [];
	for (const [item, n] of Object.entries(aboardStock())) {
		const lv = levelOf(item);
		if (!lv || !(n > 0)) continue;
		const spare = n - Math.min(n, demand.get(item) || 0);
		if (spare <= 0) continue;
		// Sold only what the day sells and a floor does not keep.
		const keep = stocking ? spare : Math.min(spare, Math.max(0, floorOf(item, o) - (store.getStock(item) - n)));
		const sell = !stocking && lv >= o.sell && sellOf(item) > 0 ? spare - keep : 0;
		if (sell > 0) out.push({ item, n: sell, sell: true });
		if (spare - sell > 0) out.push({ item, n: spare - sell, sell: false });
	}
	return out;
}

export function unloadMoves(item, to, n = Infinity) {
	const moves = [];
	for (const src of levelOf(item) === null ? [store.ABOARD] : [store.ABOARD, '']) {
		const m = Math.min(n, store.stockAt(item, src));
		if (m > 0) { moves.push({ item, from: src, to, n: m }); n -= m; }
	}
	return moves;
}
export function packApply(rows, want, from) {
	const delta = {}, moves = [];
	for (const x of rows) {
		const c = packChange(x, want, from);
		for (const [i, n] of Object.entries(c.delta)) delta[i] = (delta[i] || 0) + n;
		moves.push(...c.moves.filter(m => m.n > 0));
	}
	if (!Object.keys(delta).length && !moves.length) return false;
	// Loaded after casting off: the checklist was frozen with this load
	// still to make, and Record makes whatever loads it still lists.
	if (V.sail && Array.isArray(V.sail.loaded)) {
		for (const m of moves.filter(x => x.to === '' && from && x.from === from.name)) {
			V.sail.loaded = V.sail.loaded.map(l => (l.item === m.item ? { ...l, n: Math.max(0, l.n - m.n) } : l)).filter(l => l.n > 0);
			if (V.sail.applied) V.sail.applied = { ...V.sail.applied, moves: V.sail.applied.moves.map(a => (moveKey(a) === moveKey(m) ? { ...a, n: Math.max(0, a.n - m.n) } : a)).filter(a => a.n > 0) };
		}
		persist();
	}
	// Kept, net, for Abandon to put back: the run's own log once it is
	// cast off, the wharf step's until then.
	if (V.sail) V.sail.packLog = mergeApplied(V.sail.packLog, { delta, moves });
	else V.packLog = mergeApplied(V.packLog, { delta, moves });
	persist();
	const n = rows.length;
	const sold = new Set(rows.filter(x => want && String(x.key).startsWith('s|')).map(x => x.item));
	if (rows.every(x => /^[su]\|/.test(String(x.key)))) {
		store.applyTrip({ delta, moves, at: item => (sold.has(item) ? store.ABOARD : false), label: n === 1 ? (sold.size ? T('Sold {item} at the wharf', { item: gameName(rows[0].item) }) : T('{item} put in storage before casting off', { item: gameName(rows[0].item) })) : T('{n} goods dealt with before casting off', { n }) });
		return true;
	}
	store.applyTrip({ delta, moves, label: !want && rows.every(x => String(x.key).startsWith('a|')) ? (n === 1 ? T('{item} put back ashore', { item: gameName(rows[0].item) }) : T('{n} goods put back ashore', { n })) : want ? (n === 1 ? T('Loaded {item} at the wharf', { item: gameName(rows[0].item) }) : T('Loaded {n} goods at the wharf', { n })) : (n === 1 ? T('Took {item} off the ship', { item: gameName(rows[0].item) }) : T('Took {n} goods off the ship', { n })) });
	return true;
}

/** What the packing list holds, in its three piles: to buy at the
 *  Market, to take out of a storage or off the pile of shore goods, and
 *  what the run starts from that is aboard already. */
export function packingOf(plan, from, chosen = []) {
	const perTrade = item => {
		const st = (plan.stops || []).find(x => x.npcId && x.give === item);
		if (!st) return '';
		const times = st.times === 1 ? T('{n} trade', { n: F(st.times) }) : T('{n} trades', { n: F(st.times) });
		return st.giveN > 1 ? `${T('{n} a trade', { n: F(st.giveN) })} · ${times}` : times;
	};
	const market = (plan.bought || []).filter(b => b.n > 0).map(b => ({
		item: b.item, n: Math.ceil(b.n), cost: Math.round(Number(b.total) || 0), per: perTrade(b.item), key: `b|${b.item}`,
		where: b.how === 'made' ? T('your workers make it') : b.each ? T('bought · {silver}', { silver: FC(b.total) }) : marketStatus().count ? T('no Market price for it') : T('unpriced until the Market answers'),
		act: `${copyName(b.item)}<button class="chip tiny${b.how === 'made' ? ' active' : ''}" aria-pressed="${b.how === 'made' ? 'true' : 'false'}" data-act="barter-homemade" data-item="${esc(b.item)}" title="${b.how === 'made' ? T('Bought after all: price it from the Market') : T('Your workers make this: it costs the run nothing')}">${b.how === 'made' ? `✓ ${T('mine')}` : T('my workers')}</button>`
	}));
	const storage = [
		...(plan.loaded || []).filter(l => l.n > 0).map(l => ({ item: l.item, n: l.n, per: perTrade(l.item), where: from ? T('from {town}', { town: gameName(from.name) }) : T('from the storage'), load: from ? { town: from.name, n: l.n } : null, key: `l|${l.item}` })),
		...(plan.taken || []).filter(t => t.n > 0).map(t => ({ item: t.item, n: Math.ceil(t.n), per: perTrade(t.item), where: T('from your pile · {n} left', { n: F(t.left) }), key: `t|${t.item}` })),
		// Into the sailor's own bag, not the hold: ticked, never moved to
		// the hold's count, which the next laying would read as cargo.
		...(plan.bagLoaded || []).filter(l => l.n > 0).map(l => ({ item: l.item, n: l.n, per: perTrade(l.item), where: from ? T('into your bag, from {town}', { town: gameName(from.name) }) : T('into your bag, from the storage'), key: `g|${l.item}` })),
		// And out of the hold, when it is too heavy to cast off with them.
		...(plan.bagFromHold || []).filter(l => l.n > 0).map(l => ({ item: l.item, n: l.n, per: perTrade(l.item), where: T('into your bag, out of the hold'), key: `g|hold|${l.item}` }))
	];
	// What the run starts from that is in the hold already. It is there
	// to be seen and counted against the game's own window, and where
	// there is a harbour to put it back at, to be put back: a sailor who
	// loaded the wrong thing should not have to go looking for the hold
	// to undo it.
	const at = from ? from.name : unloadTo();
	// One line a good, and the count is the hold's own. Two chains can
	// start from the same pile -- a [Level 3] that climbs two ways --
	// and the list drew it twice, with one tick box between them:
	// ticking either turned both, which is the plainest way there is of
	// looking broken. Adding the two up was no better, since the six
	// goods the two chains share are six goods, not twelve.
	const hold = aboardStock();
	const aboardItems = [...new Set(chosen.filter(c => c.from !== 'land' && c.have > 0).map(c => c.item))];
	const aboard = aboardItems.map(item => ({
		item, n: hold[item] || 0, per: perTrade(item), where: T('in the hold now'), key: `a|${item}`,
		act: at ? `<button class="chip tiny" data-act="barter-unload" data-item="${esc(item)}" title="${T('Put them back in the storage at {town}', { town: esc(gameName(at)) })}">${T('put it back')}</button>` : ''
	})).filter(x => x.n > 0);
	// Aboard and not wanted: sold at the wharf, or put in the storage,
	// before the lines are let go. A row goes once it is done.
	const town = from ? from.name : '';
	const ashore = town ? (plan.spares || []).map(x => ({
		item: x.item, n: x.n, key: `${x.sell ? 's' : 'u'}|${x.item}`, per: '',
		where: x.sell
			? T('the run does not use it · sell it at {town} wharf for {silver}', { town: gameName(town), silver: FC(x.n * sellOf(x.item)) })
			: T('the run does not use it · put it in the storage at {town}', { town: gameName(town) })
	})) : [];
	// What goes into the sailor's bag is a group of its own: it is not
	// the hold's, and it is loaded in the Inventory window, not the ship's.
	const inBag = x => x.key.startsWith('g|');
	return { market: oneEach(market), storage: oneEach(storage.filter(x => !inBag(x))), bag: oneEach(storage.filter(inBag)), aboard, ashore };
}

/**
 * The packing list as a tally: how many things it names, and how many
 * are aboard already. What the run starts from is aboard by definition;
 * a good taken out of a storage leaves the list the moment it is
 * loaded, since the plan is laid again from the Inventory; the rest is
 * ticked by hand and remembered for as long as the page is open.
 */
/** What the ticks on the packing list change about the hold's weight:
 *  goods ticked as fetched that the app still counts ashore weigh in,
 *  goods aboard with their tick taken off come out. */
export function packingLT(plan, from, chosen) {
	const p = packingOf(plan, from, chosen);
	// Ticking loads for real now, so the hold already weighs the market
	// and storage rows; only a row aboard marked "not after all" is taken
	// off, and the shore goods in the hold are added, since the hold's
	// own count is of trade goods.
	const shoreAboard = Object.keys(store.getAllStock()).filter(n => levelOf(n) === null).reduce((a, n) => a + store.stockAt(n, store.ABOARD) * weightOf(n), 0);
	return shoreAboard - p.aboard.filter(x => !packedNow(x)).reduce((a, x) => a + x.n * weightOf(x.item), 0);
}

export function packingCount(plan, from, chosen) {
	const p = packingOf(plan, from, chosen);
	const list = [...p.ashore, ...p.market, ...p.storage, ...p.bag, ...p.aboard];
	// What is already in the hold needs no fetching, so it counts as
	// done unless the sailor has taken the tick off to check it again.
	return { all: list.length, done: list.filter(x => packedNow(x)).length };
}

/**
 * The run as trips out of the harbour it sails from.
 *
 * A run whose chains' first goods do not all fit aboard at once is
 * sailed in lots, and between lots the ship calls back at the harbour
 * to sell and to pick up the next lot's goods. To a sailor that is a
 * run of several trips: what to load now, and what waits in the
 * storage for a call later. `staged` is whether this run has any such
 * later pick-up; a run that loads once is not a run of trips at all.
 */
export function tripsOf(plan) {
	const lots = (plan && plan.lots) || [];
	const stops = (plan && plan.stops) || [];
	const trips = lots.map((chains, j) => {
		const first = j === 0 ? -1 : stops.findIndex(s => s.npcId && chains.includes(s.chain));
		// The call where the lot's goods come aboard: the one before its
		// first island, or an earlier call at the harbour that picked them
		// up while the hold had room; a lot with nothing to pick up starts
		// on the way. `head` is where the trip is said to begin: that
		// call when the trip starts from it, else the trip's first island.
		// Or the call that takes them out of the sailor's bag.
		let at = stops.findIndex(s => s.wharf && ((s.loads && s.loads.some(l => l.lot === j)) || (s.fromBag && s.fromBag.some(l => l.lot === j))));
		if (at < 0 && first > 0) for (let i = first - 1; i >= 0; i--) { if (stops[i].npcId) break; if (stops[i].wharf && stops[i].loads && stops[i].loads.length && !stops[i].loads.some(l => l.lot !== undefined && l.lot !== null)) { at = i; break; } }
		const straight = at >= 0 && first > at && !stops.slice(at + 1, first).some(s => s.npcId);
		return { n: j + 1, chains, at, first, head: j === 0 ? -1 : straight ? at : first, loads: j === 0 ? (plan.loaded || []) : at >= 0 ? [...(stops[at].loads || []).filter(l => l.lot === undefined || l.lot === null || l.lot === j), ...(stops[at].fromBag || []).filter(l => l.lot === j).map(l => ({ ...l, bag: true }))] : [] };
	});
	trips.forEach((t, j) => {
		const next = trips[j + 1];
		const end = next && next.head >= 0 ? next.head : stops.length;
		const from = t.head >= 0 ? t.head : 0;
		t.stops = stops.slice(from, end);
		t.peak = t.stops.reduce((a, s) => Math.max(a, s.weightAfter || 0), t.head < 0 ? plan.weightStart || 0 : 0);
		// What the call at the end of the trip sells: the next trip's
		// start, or the run's last call.
		const sold = next && next.head >= 0 ? [...stops.slice(0, next.head + 1)].reverse().find(s => s.wharf && s.sale) : [...stops].reverse().find(s => s.wharf && s.sale);
		t.sale = sold && sold.sale ? sold.sale : null;
	});
	return trips;
}
export const stagedRun = plan => !!(plan && plan.stops && plan.stops.some(s => s.wharf && s.loads && s.loads.length));

/**
 * The trips of a staged run on the wharf step: one section a trip.
 * Trip 1 carries the packing list to tick; each later trip lists the
 * goods that come aboard for it, says at which stop the ship picks
 * them up -- the call before the trip, or an earlier call at the
 * harbour that had room for them -- and why they cannot all come now,
 * and can be left out of the run from here: a trip is the chains it
 * climbs, and unticking them on the plan is a long way round for
 * "not today". The route below is the whole run from the start, so a
 * sailor packing trip 1 sees where the day goes.
 */
export function tripsHTML(plan, from, chosen, hold) {
	const trips = tripsOf(plan);
	const port = from ? gameName(from.name) : T('the wharf');
	const cn = k => { const c = plan.order[k]; return T('{isle} chain', { isle: esc(isleShort(npcById.get(c.rungs[0].npcId)) || c.rungs[0].npc) }); };
	const later = trips.slice(1).reduce((a, t) => a + t.loads.length, 0);
	const l7 = t => (t.sale ? t.sale.items.filter(i => levelOf(i.item) === 7).reduce((a, i) => a + i.n, 0) : 0);
	const line = t => {
		const isl = t.stops.filter(s => s.npcId).length;
		return `${t.chains.map(cn).join(' · ')} · ${isl === 1 ? T('{n} island', { n: isl }) : T('{n} islands', { n: isl })}${t.sale ? ` · ${T('back at {port}: sells {n} [Level 7]', { port: esc(port), n: n1(l7(t)) })}` : ''}`;
	};
	const w = lt => shownHold(hold, lt).text;
	// The chains a trip climbs, and the ticked chains folded into them:
	// leaving the trip out unticks them all.
	const idsOf = t => { const hosts = t.chains.map(k => plan.order[k]); return chosen.filter(c => hosts.includes(c) || hosts.some(h => tailOf(h, c))).map(c => c.id); };
	// Every trip can be sailed sooner or later: the order is the sailor's
	// to set, better or worse, and ↺ on the route puts the planner's back.
	const keyOf = t => t.chains.map(k => plan.order[k].id).sort().join('+');
	const keys = trips.map(keyOf).join('\n');
	const moveBtns = t => `<span class="trip-move"><button class="chip tiny" data-act="barter-trip-move" data-key="${esc(keyOf(t))}" data-keys="${esc(keys)}" data-by="-1"${t.n === 1 ? ' disabled' : ''} title="${T('Sail this trip one sooner')}" aria-label="${T('Sooner')}">↑</button><button class="chip tiny" data-act="barter-trip-move" data-key="${esc(keyOf(t))}" data-keys="${esc(keys)}" data-by="1"${t.n === trips.length ? ' disabled' : ''} title="${T('Sail this trip one later')}" aria-label="${T('Later')}">↓</button></span>`;
	const head = `<div class="trips-head"><b>${trips.length === 1 ? T('{n} trip out of {port}', { n: trips.length, port: esc(port) }) : T('{n} trips out of {port}', { n: trips.length, port: esc(port) })}</b><span>${T('load {a} now, {b} picked up on the way', { a: trips[0].loads.length + packingCount(plan, from, chosen).all - trips[0].loads.length, b: later })} · ${T('the hold cannot carry every chain\u2019s first goods at once, so the run calls back for the rest; a trip can be left out below')}</span>${(V.routeEdit.trips || []).length || V.routeEdit.skip.length || Object.keys(V.routeEdit.nudge).length ? `<span class="panel-spacer"></span><button class="chip tiny primary" data-act="barter-route-reset" title="${T('Every change taken back: the route the planner found shortest')}">↺ ${T('back to the optimised route')}</button>` : ''}</div>`;
	const first = `<section class="trip-card now"><div class="trip-head"><span class="trip-k">${T('Trip {n}', { n: 1 })}</span><b>${T('load now at {port}', { port: esc(port) })}</b><span class="trip-line">${line(trips[0])}</span><span class="panel-spacer"></span><span class="trip-state">${(() => { const c = packingCount(plan, from, chosen); return T('{n} of {of} aboard', { n: c.done, of: c.all }); })()}</span>${moveBtns(trips[0])}</div>
		${packingHTML(plan, from, chosen)}
		<div class="trip-foot">${T('hold at its fullest on this trip: {w}', { w: esc(w(trips[0].peak)) })}</div></section>`;
	const rest = trips.slice(1).map(t => {
		// Goods riding in the bag weigh nothing on the hold, and come out
		// of it at whichever wharf the trip starts from.
		const heavy = l => !l.bag;
		const over = plan.weightStart + t.loads.filter(heavy).reduce((a, l) => a + l.n * weightOf(l.item), 0) + trips.slice(1, t.n - 1).reduce((a, x) => a + x.loads.filter(heavy).reduce((b, l) => b + l.n * weightOf(l.item), 0), 0);
		const bagOnly = t.loads.length > 0 && t.loads.every(l => l.bag);
		const atStart = shownHold(hold, over);
		const early = t.at >= 0 && t.head >= 0 && t.at < t.head;
		const when = t.at < 0 ? T('on the way') : bagOnly ? T('out of your bag at {port} wharf, stop {k}', { port: esc(gameName((plan.stops[t.at].wharf || {}).at || '')), k: t.at + 1 }) : early ? T('picked up early, at {port} wharf, stop {k}, while the trip before is still under way', { port: esc(port), k: t.at + 1 }) : T('picked up at {port} wharf, stop {k}', { port: esc(port), k: t.at + 1 });
		const drop = `<button class="chip tiny trip-drop" data-act="barter-trip-drop" data-ids="${esc(idsOf(t).join('\n'))}" title="${T('Untick this trip\u2019s chains: the run is laid again without them')}">${T('leave this trip out')}</button>`;
		return `<section class="trip-card later"><div class="trip-head"><span class="trip-k">${T('Trip {n}', { n: t.n })}</span><b>${when}</b><span class="trip-line">${line(t)}</span><span class="panel-spacer"></span><span class="trip-state">${t.loads.length === 1 ? T('{n} thing picked up on the way', { n: t.loads.length }) : T('{n} things picked up on the way', { n: t.loads.length })}</span>${moveBtns(t)}${drop}</div>
			${t.loads.map(l => `<div class="trip-row"><i class="trip-dot"></i><span class="pack-icon"${levelOf(l.item) ? ` style="--tier:${TIER(levelOf(l.item))}"` : ''}>${img(l.item, 'row-icon')}</span><span class="pack-what"><b>${esc(gameName(l.item))}</b><em>${l.bag ? T('rides in your bag') : T('waits in the storage at {port}', { port: esc(port) })}${weightOf(l.item) ? ` · ${T('{lt} LT', { lt: (Math.round(l.n * weightOf(l.item) * 10) / 10).toLocaleString() })}` : ''}</em></span><span class="pack-n"><b>${n1(l.n)}</b></span></div>`).join('')}
			<div class="trip-foot">${bagOnly ? T('in your bag from the start, not the hold') : atStart.total > atStart.limit ? T('not now: with the trips before it aboard the hold would be {w}, over the limit', { w: esc(atStart.text) })
				// It would fit at the start: the lots are cut for the whole
				// climb and then for the shortest run, so the reason is
				// there, not in the start's weight.
				: T('it would fit at the start ({w}), but the run is shorter, or the hold lighter along the way, picking it up later', { w: esc(atStart.text) })} · ${T('hold at its fullest on this trip: {w}', { w: esc(w(t.peak)) })}</div></section>`;
	}).join('');
	return `<div class="trips">${head}${first}${rest}</div>`;
}

/**
 * The packing list: a sailor standing at the wharf with the game open
 * beside the app, fetching one thing at a time. Three piles by where
 * the thing comes from, a box to tick on each, the count large enough
 * to read at a glance and the name there to copy into the Market.
 */
/**
 * What to do at the harbour before casting off with what is aboard and
 * not wanted: its own group at the head of the wharf step, a row a good,
 * ticked to sell it or put it ashore for real.
 */
export function leaveHomeHTML(plan, from, chosen) {
	if (!plan || !plan.stops || !plan.stops.length || !from) return '';
	const p = packingOf(plan, from, chosen);
	if (!p.ashore.length) return '';
	const html = packingHTML({ ...plan, bought: [], loaded: [], taken: [] }, from, [], p.ashore);
	return html;
}

export function packingHTML(plan, from, chosen = [], only = null) {
	if (!plan || !plan.stops || !plan.stops.length) return '';
	const p = packingOf(plan, from, chosen);
	const row = x => {
		const on = packedNow(x);
		const lv = levelOf(x.item);
		// One box a row, and it always turns both ways. It is the
		// sailor's own mark -- "I have this" -- and nothing else: moving
		// goods between a storage and the hold is what the chip beside it
		// does, and a box that sometimes moved things and sometimes did
		// not was a box nobody could trust.
		const box = `<button class="pack-box${on ? ' on' : ''}" data-act="barter-pack" data-k="${esc(x.key)}" data-item="${esc(x.item)}" data-n="${x.n}" data-cost="${x.cost || 0}" aria-pressed="${on}" aria-label="${on ? T('Not aboard after all') : T('Load them aboard')}">${on ? '✓' : ''}</button>`;
		const act = x.act || '';
		return `<div class="pack-row${on ? ' on' : ''}">${box}<span class="pack-icon"${lv ? ` style="--tier:${TIER(lv)}"` : ''}>${img(x.item, 'row-icon')}</span><span class="pack-what"><b>${esc(gameName(x.item))}</b><em>${esc(x.where)}${weightOf(x.item) ? ` · ${T('{lt} LT', { lt: (Math.round(x.n * weightOf(x.item) * 10) / 10).toLocaleString() })}` : ''}</em></span><span class="pack-n"><b>${n1(x.n)}</b><em>${esc(x.per)}</em></span>${act ? `<span class="pack-act">${act}</span>` : ''}</div>`;
	};
	// The whole group at once, for the sailor who bought the lot in one
	// go at the Market: a press ticks every row, a second takes them off.
	const all = list => {
		if (list.length < 2) return '';
		const on = list.every(packedNow);
		return `<button class="chip tiny pack-all${on ? ' active' : ''}" aria-pressed="${on ? 'true' : 'false'}" data-act="barter-pack-all" data-rows="${esc(JSON.stringify(list.map(x => ({ key: x.key, item: x.item, n: x.n, cost: x.cost || 0 }))))}" data-on="${on ? 1 : 0}" aria-pressed="${on}">${on ? `✓ ${T('all aboard')}` : T('Tick them all')}</button>`;
	};
	const group = (title, sub, list, none) => `<section class="panel pack-group"><div class="panel-head"><h2 class="panel-title">${title}</h2><span class="panel-sub">${sub}</span><span class="panel-spacer"></span>${all(list)}</div>${list.length ? list.map(row).join('') : `<p class="empty">${none}</p>`}</section>`;
	const where = from ? gameName(from.name) : '';
	if (only) return `<div class="pack-groups pack-first">${group(T('Before casting off'), esc(T('aboard at {at}, and not used by this run', { at: where })), only, '')}</div>`;
	return `<div class="pack-groups">
		${group(T('Buy at the Market'), `${plan.cost ? T('{silver} to buy', { silver: FC(Math.round(plan.cost)) }) : T('before casting off')}${p.market.length ? ` · ${T('{lt} LT to carry', { lt: (Math.round(p.market.reduce((w, x) => w + x.n * weightOf(x.item), 0) * 10) / 10).toLocaleString() })}` : ''}`, p.market, T('nothing to buy — the run starts from what is held'))}
		${group(T('Take from storage'), where ? esc(T('{at} wharf', { at: where })) : T('before casting off'), p.storage, T('nothing in storage is needed'))}
		${p.bag.length ? group(T('Into your bag'), `${T('your inventory, not the hold')} · ${(lt => (plan.bag ? T('{lt} LT of the {free} it takes', { lt, free: F(plan.bag.free) }) : T('{lt} LT', { lt })))((Math.round(p.bag.reduce((w, x) => w + x.n * weightOf(x.item), 0) * 10) / 10).toLocaleString())}`, p.bag, '') : ''}
		${group(T('Already aboard'), T('checked against the hold'), p.aboard, T('nothing the run starts from is aboard yet'))}
	</div>`;
}

/** What is in hand when the run is over: carried home, left at a wharf
 *  on the way, the silver and the coins. One tile a kind, as the game's
 *  own storage window draws them. */
export function afterShelfHTML(plan, from) {
	if (!plan || !plan.kept) return '';
	const tile = (item, n, note = '') => {
		const lv = levelOf(item);
		return `<span class="shelf-tile"${note ? ` title="${esc(gameName(item))} — ${esc(note)}"` : ''}>
			<i class="shelf-lv${lv ? '' : ' shore'}"${lv ? ` style="--tier:${TIER(lv)}"` : ''}>${lv ? lvTag(lv) : '⌂'}</i>
			${img(item, 'shelf-icon')}
			<b>${n1(n)}</b>
			<span>${esc(gameName(item))}</span>
			${note ? `<em>${esc(note)}</em>` : ''}
		</span>`;
	};
	const back = new Map();
	const add = (item, n, at, how) => {
		const key = `${item}|${at}|${how}`;
		back.set(key, { item, n: (back.get(key) ? back.get(key).n : 0) + n, at, how });
	};
	for (const g of plan.kept || []) {
		// What is inside the floor is the stock; what is over it is what
		// the next board climbs with. The two are different answers to
		// "what is this for", so the tile says which.
		if (g.stock > 1e-9) add(g.item, g.stock, from ? from.name : '', 'stock');
		if (g.n - g.stock > 1e-9) add(g.item, g.n - g.stock, from ? from.name : '', 'spare');
	}
	for (const g of plan.stashed || []) add(g.item, g.n, g.at || '', 'left');
	const noteOf = x => [x.at ? T('at {where}', { where: gameName(x.at) }) : '', x.how === 'stock' ? T('kept for the stock') : x.how === 'left' ? T('left on the way') : ''].filter(Boolean).join(' · ');
	const backRows = [...back.values()].filter(x => x.n > 0).sort((a, b) => (levelOf(b.item) || 0) - (levelOf(a.item) || 0) || b.n - a.n);
	const kinds = n => (n === 1 ? T('{n} kind', { n }) : T('{n} kinds', { n }));
	const sold = plan.silver > 0 ? `<span class="shelf-tile silver"><b>${FC(Math.round(plan.silver))}</b><span>${T('sold at the wharf')}</span></span>` : '';
	// Coins are not cargo, so they are not a tile like a good is -- but
	// they are the whole of what a coin run brings back, and a shelf
	// that did not show them would be telling half the story.
	const purse = coinsOf(plan);
	const paid = plan.coins > 0 ? `<span class="shelf-tile silver coin">${img(COIN, 'shelf-icon')}<b>${coinRange(purse.min, purse.max)}</b><span>${T('Crow Coins')}</span>${purse.pct ? `<em>${T('+{pct}% for {n} barters', { pct: purse.pct, n: F(purse.count) })}</em>` : ''}</span>` : '';
	if (!backRows.length && !sold && !paid) return '';
	return `<section class="panel run-shelves after"><div class="shelf">
		<div class="shelf-head"><h2 class="panel-title">${T('In the storage after')}</h2><span class="panel-sub">${backRows.length ? `${kinds(backRows.length)} · ${T('{n} goods', { n: F(Math.round(backRows.reduce((a, x) => a + x.n, 0))) })}${plan.silver ? ` · ${T('{silver} sold', { silver: FC(Math.round(plan.silver)) })}` : ''}${plan.coins ? ` · ${T('{n} coins', { n: coinRange(purse.min, purse.max) })}` : ''}` : plan.coins ? T('{n} Crow Coins, and nothing else to carry', { n: coinRange(purse.min, purse.max) }) : plan.silver ? T('all of it sold at the wharf') : T('nothing comes back')}</span></div>
		<div class="shelf-tiles">${paid}${sold}${backRows.map(x => tile(x.item, x.n, noteOf(x))).join('')}</div>
	</div></section>`;
}

/**
 * What the wharf step said, kept with the run when it is cast off: what
 * was to be sold or left before casting off, bought, taken from storage,
 * put in the bag, already aboard, and picked up on the way by the later
 * trips. The live step is laid again from the hold as it is, so once
 * the run is under way it no longer says what it said at the wharf --
 * and "was I told to leave that ashore?" had no answer but abandoning
 * the run to see the step again.
 */
export function toldOf(plan, from) {
	const r = n => Math.round((Number(n) || 0) * 10) / 10;
	const at = from ? from.name : '';
	const out = [];
	for (const x of plan.spares || []) if (x.n > 0) out.push({ g: x.sell ? 'sell' : 'store', item: x.item, n: r(x.n), at });
	for (const b of plan.bought || []) if (b.n > 0) out.push({ g: 'buy', item: b.item, n: Math.ceil(b.n) });
	for (const l of plan.loaded || []) if (l.n > 0) out.push({ g: 'take', item: l.item, n: r(l.n), at });
	for (const t of plan.taken || []) if (t.n > 0) out.push({ g: 'pile', item: t.item, n: Math.ceil(t.n) });
	for (const l of plan.bagLoaded || []) if (l.n > 0) out.push({ g: 'bag', item: l.item, n: r(l.n), at });
	for (const l of plan.bagFromHold || []) if (l.n > 0) out.push({ g: 'bagHold', item: l.item, n: r(l.n) });
	const hold = aboardStock();
	for (const item of new Set((plan.stops || []).filter(s => s.npcId && s.give).map(s => s.give))) if (hold[item] > 0) out.push({ g: 'aboard', item, n: hold[item] });
	for (const t of tripsOf(plan).slice(1)) for (const l of t.loads) out.push({ g: 'later', item: l.item, n: r(l.n), trip: t.n, stop: t.at + 1, bag: !!l.bag });
	return out.slice(0, 120);
}

/** The wharf step as it was at cast-off, to read: no ticks, no presses. */
export function toldHTML(on) {
	const told = (on && on.told) || [];
	if (!told.length) return '';
	const at = x => (x.at ? gameName(x.at) : '');
	const groups = [
		['sell', T('Before casting off'), x => (x.g === 'sell' ? T('sold at the wharf') : T('into storage'))],
		['buy', T('Buy at the Market'), () => ''],
		['take', T('Take from storage'), x => (x.g === 'pile' ? T('from your pile') : at(x))],
		['bag', T('Into your bag'), x => (x.g === 'bagHold' ? T('into your bag, out of the hold') : at(x))],
		['aboard', T('Already aboard'), () => ''],
		['later', T('Picked up on the way'), x => `${T('Trip {n}', { n: x.trip })}${x.stop > 0 ? ` · ${T('stop {n}', { n: x.stop })}` : ''}${x.bag ? ` · ${T('rides in your bag')}` : ''}`]
	];
	const inGroup = { sell: ['sell', 'store'], buy: ['buy'], take: ['take', 'pile'], bag: ['bag', 'bagHold'], aboard: ['aboard'], later: ['later'] };
	const body = groups.map(([id, title, note]) => {
		const rows = told.filter(x => inGroup[id].includes(x.g));
		if (!rows.length) return '';
		return `<div class="told-group"><h3 class="told-k">${title}</h3>${rows.map(x => `<div class="told-row"><span class="pack-icon"${levelOf(x.item) ? ` style="--tier:${TIER(levelOf(x.item))}"` : ''}>${img(x.item, 'row-icon sm')}</span><span class="told-name">${esc(gameName(x.item))}${note(x) ? `<em>${esc(note(x))}</em>` : ''}</span><b>${n1(x.n)}</b></div>`).join('')}</div>`;
	}).join('');
	return `<section class="panel told"><div class="panel-head"><h2 class="panel-title">${T('What the wharf step said at cast-off')}</h2><span class="panel-sub">${T('to read, as it was when the lines were let go · the run’s own copy')}</span></div><div class="panel-body told-body">${body}</div></section>`;
}
