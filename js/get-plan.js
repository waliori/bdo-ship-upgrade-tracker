// The way to get each thing.
//
// To Get says how each missing material *can* be got: the shop price,
// the barter forecast, the quests that pay in it, the water it drops
// on. This says how it *should* be, once every shortfall is on the
// table at once -- because the sources compete. A Candidum daily pays
// fourteen Tidal Black Stones or one Violent Wave Plywood, not both;
// the Crow Coins spent on plywood are not there for the tendons; two
// materials off the ship-material list share the same draws a day.
// Read one at a time, every item's best route is "buy it". Read
// together, the coins run out and the answer changes.
//
// The plan follows a stated goal, as the crew and the sailing orders
// do, because "efficient" depends on what is scarce for the player and
// the app does not decide that: soonest, keep the coins, or keep the
// silver. Then it finds the shortest horizon -- days from today, today
// included -- on which everything fits: the dailies on the days the
// player says they sail, each pick-one resolved toward the item with
// the fewest other ways to it, the material and trade lists' draws
// shared out, the purse and what the scheduled quests pay into it
// spent where nothing else pays. Every leg says why in one line. What
// has no rate -- a drop, a worker node -- is named, never timed.
//
// Pure: no store, no screen. The caller hands over the prices, the
// barter forecaster and the quests, and reads back legs.

import { cadenceOf } from './quests.js';
import { oddsText } from './barter-odds.js';
import { T, TT, said, gameName } from './i18n.js';

export const PRESETS = [
	{
		id: 'soon', label: TT('Soonest'),
		sub: TT('the purse spent wherever it buys days; the quests every day you sail; barter for what is left')
	},
	{
		id: 'coins', label: TT('Keep the coins'),
		sub: TT('Crow Coins only where nothing else sells it; the quests and the barter lists carry the rest')
	},
	{
		id: 'silver', label: TT('Keep the silver'),
		sub: TT('nothing off the Central Market; Falasi only for what only he sells')
	}
];

/** How many days a week the sea gets: the dailies and the draws. */
export const DAY_CHOICES = [[7, TT('every day')], [5, TT('five days a week')], [3, TT('three days a week')], [2, TT('two days a week')], [1, TT('one day a week')]];

/**
 * What the player is actually willing to do.
 *
 * A plan that assumes every activity is on the table is a plan for
 * somebody else. Bartering is hours at sea; the dailies are a circuit
 * of errands; hunting a sea monster for what it drops is a fight and a
 * guild. Turning one off does not make the plan worse, it makes it
 * theirs. Hunting turned ON gives what only a sea monster drops a way
 * of its own -- never a date: it takes nothing the barter or the shop
 * can count, and it is never in the days.
 */
export const DOING = [
	['quests', TT('Dailies & weeklies'), TT('The sailing quests, on the days you are at sea')],
	['barter', TT('Bartering'), TT('The trade-good and ship-material lists')],
	['hunt', TT('Hunt what drops'), TT('What only a sea monster drops is yours to go and kill for; a hunt is never counted in the days')]
];

export const DEFAULT_ORDERS = { preset: 'soon', days: 7, reserve: 0, quests: true, barter: true, hunt: false };

/** The longest horizon looked for, in days. Past it the plan says so. */
export const HORIZON = 365;

/** Clean orders from whatever was saved. */
export function readGetOrders(raw) {
	const o = { ...DEFAULT_ORDERS };
	if (!raw || typeof raw !== 'object') return o;
	if (PRESETS.some(p => p.id === raw.preset)) o.preset = raw.preset;
	if (DAY_CHOICES.some(([d]) => d === Number(raw.days))) o.days = Number(raw.days);
	const reserve = Math.floor(Number(raw.reserve));
	if (Number.isFinite(reserve) && reserve > 0) o.reserve = Math.min(Number.MAX_SAFE_INTEGER, reserve);
	for (const [id] of DOING) if (typeof raw[id] === 'boolean') o[id] = raw[id];
	return o;
}

const COIN = 'Crow Coin';
const fmt = n => Math.round(n).toLocaleString('en-GB');
const dayText = n => (n === 1 ? T('{n} day', { n: fmt(n) }) : T('{n} days', { n: fmt(n) }));
const drawText = n => (n === 1 ? T('{n} draw', { n: fmt(n) }) : T('{n} draws', { n: fmt(n) }));
const itemText = n => (n === 1 ? T('{n} item', { n: fmt(n) }) : T('{n} items', { n: fmt(n) }));
const andMoreQuests = n => (n === 1 ? T('and {n} more quest', { n: fmt(n) }) : T('and {n} more quests', { n: fmt(n) }));
const listDraws = (n, list) => (list === 'material'
	? (n === 1 ? T('{n} draw of the material list', { n: fmt(n) }) : T('{n} draws of the material list', { n: fmt(n) }))
	: (n === 1 ? T('{n} draw of the trade list', { n: fmt(n) }) : T('{n} draws of the trade list', { n: fmt(n) })));

/** A quest's name without its [Daily] / [Weekly] / [Barter] tags. */
const shortName = q => q.name.replace(/\[[^\]]*\]\s*/g, '').replace(/\s+—.*$/, '');

/** The pick-one options of a quest as [{ item, n }], and its fixed rewards likewise. */
const options = q => (q.choice || []).map(c => Object.entries(c).map(([item, n]) => ({ item, n })));
const fixed = q => Object.entries(q.rewards || {}).map(([item, n]) => ({ item, n }));

/**
 * What the plan knows about one shortfall: every priced way to it, and
 * where it stands when a pick-one has to choose between it and
 * something else. Tier 0 is a thing nothing sells or barters -- a
 * quest is the only counted way to it; 1 is bartered for and nothing
 * else; 2 has a coin price; 3 a silver one. A lower tier wins a pick,
 * because the other item can still be got another way.
 */
function factsFor(item, qty, sources, orders) {
	const { coins = {}, silver = {}, market = {}, barter = null, grounds = null, bulk = {}, acquisition = {} } = sources;
	const f = { item, qty, coin: 0, falasi: 0, market: 0, forecast: null, perRefresh: 0, list: null, grounds: [], bulk: bulk[item] || null, node: '' };
	if (coins[item] > 0) f.coin = coins[item];
	if (silver[item] > 0) f.falasi = silver[item];
	else if (market[item] > 0 && orders.preset !== 'silver') f.market = market[item];
	f.forecast = barter ? barter(item, qty) : null;
	if (f.forecast && !f.forecast.gate && f.forecast.limit && f.forecast.limit.refreshes > 0) {
		f.perRefresh = qty / f.forecast.limit.refreshes;
		f.list = f.forecast.limit.list === 'material' ? 'material' : 'trade';
	}
	if (grounds) f.grounds = grounds(item) || [];
	const methods = acquisition[item] || {};
	if (methods.Gathering) f.node = methods.Gathering.join(', ');
	// What drops it, as the catalogue names it. The chart only knows the
	// water for the species it has habitats for, so `grounds` is a subset
	// of this and never a replacement: Khan drops a tendon whether or not
	// the map can point at him.
	f.drops = (methods['Monster Drop'] || []).slice();
	f.quested = (methods['Quest Reward'] || []).slice();
	// Sold, but at a price the app does not hold: the Market before its
	// prices are fetched, a vendor the data only names.
	if (methods.Market && !f.market && !f.falasi) f.unpriced = 'market';
	if (methods.Purchase && !f.coin && !f.falasi) f.buy = methods.Purchase.join(', ');
	f.instant = f.falasi > 0 || f.market > 0;
	f.timed = f.perRefresh > 0;
	f.tier = f.instant ? 3 : f.coin ? 2 : f.timed ? 1 : 0;
	return f;
}

/**
 * How much a unit of `item` is worth to a pick-one: the tier first,
 * then what the other way to it costs. Larger is better.
 */
function worth(f, lists) {
	if (f.tier === 1) return 1 / (f.perRefresh * (lists[f.list] || 1));
	if (f.tier === 2) return f.coin;
	if (f.tier === 3) return f.falasi || f.market;
	return 1;
}

/**
 * The plan at one horizon of `H` days. Returns the legs, what was
 * spent and what could not be fitted; `feasible` says whether more
 * days would help with what is left.
 */
function allocate(H, facts, sources, state, orders) {
	const quests = orders.quests ? (sources.quests || []) : [];
	const { purse = { coins: 0, silver: 0 }, isDone = () => false, capacity = null } = state;
	const lists = capacity && capacity.lists ? capacity.lists : { trade: 4, material: 4 };
	const playDays = Math.max(1, Math.ceil(H * orders.days / 7));
	const weeks = Math.ceil(H / 7);

	const short = new Map(facts.map(f => [f.item, f.qty]));
	const byItem = new Map(facts.map(f => [f.item, f]));
	const legs = new Map(facts.map(f => [f.item, []]));
	const leg = (item, entry) => legs.get(item).push(entry);

	/* ---- quests: free, capped by the calendar ---- */
	const capOf = q => {
		const c = cadenceOf(q);
		const base = c === 'daily' ? playDays : c === 'weekly' ? weeks : 1;
		return Math.max(0, base - (isDone(q) ? 1 : 0));
	};
	const groupLeft = {};
	for (const q of quests) {
		if (!q.group) continue;
		if (!(q.group in groupLeft)) groupLeft[q.group] = playDays;
		if (isDone(q)) groupLeft[q.group] = Math.max(0, groupLeft[q.group] - 1);
	}
	const sched = new Map();   // id -> { q, completions, picks: {i: n}, pays: {item: n}, coins }
	const take = (q, pick, over = null) => {
		const s = sched.get(q.id) || { q, completions: 0, picks: {}, pays: {}, coins: 0, forCoins: false, over: null };
		s.completions += 1;
		for (const { item, n } of fixed(q)) {
			if (item === COIN) { s.coins += n; continue; }
			const left = short.get(item);
			if (left > 0) {
				const got = Math.min(left, n);
				short.set(item, left - got);
				s.pays[item] = (s.pays[item] || 0) + got;
			}
		}
		if (pick !== null && pick !== undefined) {
			s.picks[pick] = (s.picks[pick] || 0) + 1;
			if (over && !s.over) s.over = over;
			for (const { item, n } of options(q)[pick]) {
				const left = short.get(item);
				if (left > 0) {
					const got = Math.min(left, n);
					short.set(item, left - got);
					s.pays[item] = (s.pays[item] || 0) + got;
				}
			}
		}
		if (q.group) groupLeft[q.group] -= 1;
		sched.set(q.id, s);
	};
	const used = q => (sched.get(q.id) || { completions: 0 }).completions;
	const room = q => used(q) < capOf(q) && (!q.group || groupLeft[q.group] > 0);
	// Which pick-one option does the most good right now, by the tier of
	// what it pays and then by what that would otherwise cost; null when
	// none of them pays anything still short.
	const bestPick = q => {
		const scored = [];
		options(q).forEach((opt, i) => {
			let tier = 9;
			let mag = 0;
			const pays = [];
			for (const { item, n } of opt) {
				const left = short.get(item) || 0;
				if (left <= 0) continue;
				const f = byItem.get(item);
				tier = Math.min(tier, f.tier);
				mag += Math.min(n, left) * worth(f, lists);
				pays.push({ item, n: Math.min(n, left) });
			}
			if (tier === 9) return;
			scored.push({ i, tier, mag, pays });
		});
		if (!scored.length) return null;
		scored.sort((a, b) => a.tier - b.tier || b.mag - a.mag);
		// The runner-up is kept so the plan can say what the pick was
		// made against. A choice with nothing on the other side of it is
		// not a choice, and saying so would be noise.
		return { ...scored[0], over: scored[1] || null };
	};
	const paysShort = q => fixed(q).some(({ item }) => (short.get(item) || 0) > 0);
	// Round by round, so competing quests share the days rather than
	// the first in the list taking them all.
	const order = ['once', 'weekly', 'daily'];
	const queue = quests.filter(q => capOf(q) > 0).sort((a, b) => order.indexOf(cadenceOf(a)) - order.indexOf(cadenceOf(b)));
	for (let round = 0; round < HORIZON + 7; round++) {
		let took = false;
		for (const q of queue) {
			if (!room(q)) continue;
			const pick = q.choice ? bestPick(q) : null;
			if (!paysShort(q) && !pick) continue;
			take(q, pick ? pick.i : null, pick ? pick.over : null);
			took = true;
		}
		if (!took) break;
	}
	for (const item of byItem.keys()) {
		const from = [...sched.values()].filter(s => s.pays[item] > 0);
		if (!from.length) continue;
		const qty = from.reduce((a, s) => a + s.pays[item], 0);
		leg(item, {
			kind: 'quest', qty,
			quests: from.map(s => ({ id: s.q.id, name: shortName(s.q), completions: s.completions, qty: s.pays[item], cadence: cadenceOf(s.q),
				pick: Object.keys(s.picks).length ? Number(Object.keys(s.picks).sort((a, b) => s.picks[b] - s.picks[a])[0]) : null })),
			// One line a quest, not one sentence for all of them: four
			// quests paying into the same material is four facts, and
			// strung together with dots they read as one long one.
			lines: from.slice(0, 5).map(s => {
				const c = cadenceOf(s.q);
				const each = s.pays[item] / s.completions;
				const per = c === 'daily' ? T('{n} a day', { n: fmt(each) }) : c === 'weekly' ? T('{n} a week', { n: fmt(each) }) : T('{n} once', { n: fmt(each) });
				const pick = Object.keys(s.picks).length
					? T('{per} from {quest} (take it)', { per, quest: gameName(shortName(s.q)) })
					: T('{per} from {quest}', { per, quest: gameName(shortName(s.q)) });
				// The count only earns its place when several quests are
				// paying into the same material and the shares differ.
				const share = from.length > 1 ? `${T('{n} of them', { n: fmt(s.pays[item]) })} · ` : '';
				return `${share}${pick}`;
			}).concat(from.length > 5 ? [andMoreQuests(from.length - 5)] : []),
			why: from.slice(0, 4).map(s => {
				const c = cadenceOf(s.q);
				const each = s.pays[item] / s.completions;
				const per = c === 'daily' ? T('{n} a day', { n: fmt(each) }) : c === 'weekly' ? T('{n} a week', { n: fmt(each) }) : T('{n} once', { n: fmt(each) });
				return Object.keys(s.picks).length
					? T('{per} from {quest} (take it)', { per, quest: gameName(shortName(s.q)) })
					: T('{per} from {quest}', { per, quest: gameName(shortName(s.q)) });
			}).join(' · ') + (from.length > 4 ? ` · ${andMoreQuests(from.length - 4)}` : '')
		});
	}

	/* ---- silver: instant, and the purse is reported rather than capped ---- */
	let silverSpend = 0;
	for (const f of facts) {
		const left = short.get(f.item);
		if (left <= 0) continue;
		if (f.falasi) {
			leg(f.item, { kind: 'falasi', qty: left, silver: f.falasi * left, why: T('{n} silver each at Falasi', { n: fmt(f.falasi) }) });
			silverSpend += f.falasi * left;
			short.set(f.item, 0);
		} else if (f.market) {
			leg(f.item, { kind: 'market', qty: left, silver: f.market * left, why: T('about {n} silver each on the Central Market, last sold', { n: fmt(f.market) }) });
			silverSpend += f.market * left;
			short.set(f.item, 0);
		}
	}

	/* ---- coins and the lists ---- */
	const purseCoins = Math.max(0, (purse.coins || 0) - orders.reserve);
	const scheduledCoins = () => [...sched.values()].reduce((a, s) => a + s.coins, 0);
	let coinSpend = 0;
	const buy = (f, units, why) => {
		leg(f.item, { kind: 'coin', qty: units, coins: f.coin * units, unit: T('{n} coins each', { n: fmt(f.coin) }), why });
		coinSpend += f.coin * units;
		short.set(f.item, short.get(f.item) - units);
	};
	const budget = () => purseCoins + scheduledCoins() - coinSpend;
	// Nothing else sells it: the coins go here first, whatever the goal.
	const mustBuy = facts.filter(f => f.coin && !f.timed && !f.instant);
	for (const f of mustBuy) {
		const left = short.get(f.item);
		if (left <= 0) continue;
		const units = Math.min(left, Math.floor(budget() / f.coin));
		// "Nothing else sells it" was said of things a sea monster drops
		// all day long, which is false in the way that matters. The shop
		// is the only route the app can put a number on; what drops it is
		// named on the row instead of being written out of the answer.
		if (units > 0) buy(f, units, f.drops.length ? T('the only way with a price on it') : T('nothing else sells it'));
	}
	// The lists: the days' draws, shared out. What only barter sells
	// goes first; then what is dearest in coins, since every draw spent
	// on it is coins kept. Each material is given draws of its own, never
	// one shared with another, so the Parley a draw needs is one
	// material's: four attempts at most, which a bar pays for four times
	// over (the forecast holds a draw to what the bar pays regardless).
	// Several materials bartered on one draw would be quicker than this,
	// and could be held up by Parley -- the days here are the slower,
	// sure count.
	const cap = { trade: playDays * lists.trade, material: playDays * lists.material };
	const usedRefreshes = { trade: 0, material: 0 };
	const bartered = orders.barter
		? facts.filter(f => f.timed && short.get(f.item) > 0)
			.sort((a, b) => (a.coin ? 1 : 0) - (b.coin ? 1 : 0) || b.coin - a.coin)
		: [];
	for (const f of bartered) {
		const left = short.get(f.item);
		const avail = cap[f.list] - usedRefreshes[f.list];
		if (avail <= 0) continue;
		// Whole goods: an island pays whole ones, and a third of one left to
		// the coins was shown as 3 bartered and 7 bought for a shortfall of 10.
		const units = Math.min(left, Math.floor(avail * f.perRefresh + 1e-9));
		if (units <= 0) continue;
		const refreshes = units / f.perRefresh;
		const days = refreshes / lists[f.list];
		usedRefreshes[f.list] += refreshes;
		short.set(f.item, left - units);
		const chance = f.forecast && f.forecast.limit && f.forecast.limit.odds;
		const span = days < 1 ? T('a day') : dayText(Math.ceil(days));
		const rare = chance && chance.recorded && chance.per < 1;
		// Three different sentences, because there are three different
		// states of knowledge and reading them as one was the whole
		// problem: measured and scarce, measured and always there, and
		// never measured at all. The last one keeps the old best-case
		// number and says out loud that that is what it is.
		leg(f.item, {
			kind: 'barter', qty: units, refreshes, list: f.list, days, odds: chance,
			why: `${listDraws(Math.ceil(refreshes), f.list)} · ${rare ? T('about {span}', { span }) : T('{span} at best', { span })}`
				+ ` · ${oddsText(chance)}`
		});
	}
	// The rest, with coins where the goal allows.
	const coinRest = facts.filter(f => f.coin && short.get(f.item) > 0 && !mustBuy.includes(f));
	if (orders.preset !== 'coins') {
		for (const f of coinRest) {
			const left = short.get(f.item);
			const units = Math.min(left, Math.floor(budget() / f.coin));
			if (units <= 0) continue;
			const hadBarter = legs.get(f.item).some(l => l.kind === 'barter');
			const fc = f.forecast;
			const why = hadBarter ? (f.list === 'material' ? T('the material list is full for these days') : T('the trade list is full for these days'))
				: f.timed && fc ? (fc.bestDays && fc.days > fc.bestDays + 0.5
					? T('bartering would take {span} at the rate the boards show', { span: dayText(Math.ceil(fc.days)) })
					: T('bartering would take {span}', { span: dayText(Math.ceil(fc.days)) }))
				: T('the lists will not carry it in time');
			buy(f, units, why);
		}
	}
	// Coins short: the coin quests, dearest first, until the purse
	// stretches -- and the purchase made once it does.
	const coinsShort = () => facts.filter(f => f.coin && short.get(f.item) > 0 && (orders.preset !== 'coins' || mustBuy.includes(f)))
		.reduce((a, f) => a + f.coin * short.get(f.item), 0);
	if (coinsShort() > budget()) {
		const payers = quests.filter(q => (q.rewards || {})[COIN] > 0 && capOf(q) > used(q))
			.sort((a, b) => b.rewards[COIN] - a.rewards[COIN]);
		for (const q of payers) {
			while (room(q) && coinsShort() > budget()) {
				// A pick-one still picks: the coins are the reason for
				// the run, not a reason to waste the reward.
				const pick = q.choice ? bestPick(q) : null;
				take(q, pick ? pick.i : null, pick ? pick.over : null);
				sched.get(q.id).forCoins = true;
			}
		}
		for (const f of facts) {
			const left = short.get(f.item);
			if (!f.coin || left <= 0) continue;
			if (orders.preset === 'coins' && !mustBuy.includes(f)) continue;
			const units = Math.min(left, Math.floor(budget() / f.coin));
			if (units > 0) buy(f, units, T('the coin quests pay for it'));
		}
	}

	/* ---- what is left ---- */
	const residual = [];
	let growable = false;
	for (const f of facts) {
		const left = short.get(f.item);
		if (left <= 0) continue;
		// A daily or a weekly comes back whatever today's cap says.
		const repeating = quests.some(q => cadenceOf(q) !== 'once'
			&& (fixed(q).some(r => r.item === f.item) || options(q).some(o => o.some(r => r.item === f.item))));
		const coinable = f.coin && (orders.preset !== 'coins' || mustBuy.includes(f));
		if (coinable && coinsShort() > 0) {
			leg(f.item, { kind: 'short', qty: left, coins: f.coin * left, why: T('{n} coins short', { n: fmt(f.coin * left) }) });
			residual.push({ item: f.item, qty: left, reason: 'coins' });
			growable = growable || quests.some(q => (q.rewards || {})[COIN] > 0 && cadenceOf(q) !== 'once');
			continue;
		}
		if ((f.timed && orders.barter) || repeating) {
			leg(f.item, { kind: 'short', qty: left, why: T('more days than this horizon holds') });
			residual.push({ item: f.item, qty: left, reason: 'days' });
			growable = true;
			continue;
		}
		// What the player said they would go and kill for -- but only what
		// no counted way reaches. A hunt is never timed: one sailor spends
		// an evening at sea and comes home with a stack, another cannot
		// go at all, so taking a thing off the barter or the shop because
		// it drops would shorten the days on a promise nobody can make.
		if (orders.hunt && f.drops.length) {
			leg(f.item, {
				kind: 'hunt', qty: left,
				why: `${T('yours to hunt')} · ${T('drops from {names}', { names: f.drops.slice(0, 3).map(gameName).join(', ') })} · ${T('never counted in the days')}`
			});
			continue;
		}
		if (f.unpriced === 'market' && orders.preset !== 'silver') {
			leg(f.item, { kind: 'market', qty: left, silver: 0, unpriced: true, why: `${T('on the Central Market')} · ${T('no price fetched yet')}` });
			continue;
		}
		const ways = [];
		if (f.buy) ways.push(T('sold by {who}', { who: f.buy }));
		if (f.grounds.length) ways.push(T('drops from {names}', { names: f.grounds.map(g => gameName(g.name || g)).slice(0, 3).join(', ') }));
		if (f.bulk) ways.push(T('{n}× {give} buys {gets} at a time', { n: fmt(Math.ceil(left / f.bulk.gets)), give: gameName(f.bulk.give), gets: fmt(f.bulk.gets) }));
		if (f.node) ways.push(f.node);
		if (f.forecast && f.forecast.gate) ways.push(T('barter opens after {n} more barters', { n: fmt(f.forecast.gate.short) }));
		if (quests.some(q => fixed(q).some(r => r.item === f.item) || options(q).some(o => o.some(r => r.item === f.item)))) ways.push(T('its quests are done for now'));
		if (f.coin && orders.preset === 'coins') ways.push(T('{n} coins each at the shop, kept back by your orders', { n: fmt(f.coin) }));
		if (f.timed && !orders.barter) ways.push(T('bartered for at sea, which you have switched off'));
		if (!orders.quests && f.quested.length) ways.push(T('a quest reward, which you have switched off'));
		const unrated = f.grounds.length || f.node;
		leg(f.item, {
			kind: 'find', qty: left,
			why: !ways.length ? T('no source the app can count')
				: unrated ? `${ways.join(' · ')} · ${T('no rate is known, so it is not counted in the days')}`
				: ways.join(' · ')
		});
	}

	return {
		legs, sched, residual, feasible: !growable,
		coins: { spend: coinSpend, purse: purse.coins || 0, reserve: orders.reserve, income: scheduledCoins(), short: Math.max(0, coinsShort() - budget()) },
		silver: { spend: silverSpend, purse: purse.silver || 0, short: Math.max(0, silverSpend - (purse.silver || 0)) },
		refreshes: { ...usedRefreshes, cap, lists },
		playDays
	};
}

/**
 * The way to get everything in `missing`.
 *
 * @param {object} missing   item -> quantity short
 * @param {object} sources   { coins, silver, market, barter(item, qty),
 *                             quests, grounds(item), bulk, acquisition }
 * @param {object} state     { purse: {coins, silver}, isDone(quest),
 *                             capacity: barter.dailyCapacity(...) }
 * @param {object} orders    { preset, days, reserve }
 */
export function wayToGet({ missing = {}, sources = {}, state = {}, orders = {} } = {}) {
	const o = readGetOrders(orders);
	const facts = Object.entries(missing).filter(([, q]) => q > 0).map(([item, qty]) => factsFor(item, qty, sources, o));
	const empty = { orders: o, days: 0, reachable: true, stalled: false, legs: [], quests: [], groups: [], longPole: null, coins: null, silver: null, residual: [] };
	if (!facts.length) return empty;

	// The shortest horizon everything fits in: a widening scan to bracket
	// it, then the bracket walked. An allocation is cheap and the scan
	// stops on the first day that fits.
	const at = H => allocate(H, facts, sources, state, o);
	let H = 1;
	let result = at(H);
	if (!result.feasible) {
		let lo = 1;
		let step = 1;
		let hi = null;
		while (H < HORIZON) {
			H = Math.min(HORIZON, H + step);
			result = at(H);
			if (result.feasible) { hi = H; break; }
			lo = H;
			step = Math.min(28, step * 2);
		}
		// Bracketed: walk it for the first day that fits. Not bracketed:
		// the year's allocation stands, with what it could not fit.
		if (hi !== null) {
			for (let day = lo + 1; day < hi; day++) {
				const r = at(day);
				if (r.feasible) { hi = day; result = r; break; }
			}
			H = hi;
		}
	}
	// Reachable: everything with a counted way fits inside the horizon.
	// Stalled: a year was not enough for something more days would help.
	const reachable = result.feasible && !result.residual.length;

	// One row an item a way. The purse is spent in two passes -- what
	// nothing else sells, then what the coin quests later pay for -- and
	// unmerged that put the same material in the same shop twice, at the
	// same price, with two different reasons. Both reasons are true and
	// they belong on one line.
	const legs = [];
	for (const [item, list] of result.legs) {
		const byKind = new Map();
		for (const l of list) {
			const had = byKind.get(l.kind);
			if (!had) { byKind.set(l.kind, { item, ...l, whys: [l.why], lines: (l.lines || []).slice() }); continue; }
			had.qty += l.qty;
			had.coins = (had.coins || 0) + (l.coins || 0);
			had.silver = (had.silver || 0) + (l.silver || 0);
			had.refreshes = (had.refreshes || 0) + (l.refreshes || 0);
			had.days = Math.max(had.days || 0, l.days || 0);
			if (!had.whys.includes(l.why)) had.whys.push(l.why);
			for (const line of l.lines || []) if (!had.lines.includes(line)) had.lines.push(line);
		}
		for (const l of byKind.values()) {
			l.why = l.whys.join(' · ');
			delete l.whys;
			if (!l.lines.length) l.lines = [l.why];
			legs.push(l);
		}
	}

	// The ways the plan did not count, said once an item, on the leg that
	// carries most of it. A sea monster drops a great many of these
	// materials and no rate for that exists anywhere, so it can never be
	// a leg -- but leaving it out entirely is how a shopping list ends up
	// telling somebody to buy a thing they could have killed for.
	for (const f of facts) {
		const mine = legs.filter(l => l.item === f.item).sort((a, b) => b.qty - a.qty);
		if (!mine.length) continue;
		const also = [];
		if (f.drops.length) also.push(T('drops from {names}', { names: f.drops.slice(0, 3).map(gameName).join(', ') }));
		if (f.bulk) also.push(T('{give} exchanges for {n} at once', { give: gameName(f.bulk.give), n: fmt(f.bulk.gets) }));
		if (f.node && !mine.some(l => l.kind === 'find' || l.kind === 'hunt')) also.push(f.node);
		if (f.coin && !mine.some(l => l.kind === 'coin')) also.push(T('{n} coins each at the shop', { n: fmt(f.coin) }));
		if (f.timed && !mine.some(l => l.kind === 'barter')) also.push(T('bartered for at sea'));
		if (also.length) mine[0].also = also.join(' · ');
	}

	const quests = [...result.sched.values()].map(s => ({
		id: s.q.id, quest: s.q, name: shortName(s.q), cadence: cadenceOf(s.q), completions: s.completions,
		pick: Object.keys(s.picks).length ? Number(Object.keys(s.picks).sort((a, b) => s.picks[b] - s.picks[a])[0]) : null,
		pays: Object.entries(s.pays).map(([it, n]) => ({ item: it, qty: n })),
		// What the reward it takes was chosen over, when the other side
		// of the choice was also something the plan wants. Without this
		// the pick reads as arbitrary, which is exactly how it read.
		over: s.over ? s.over.pays.map(x => ({ item: x.item, qty: x.n })) : [],
		coins: s.coins,
		// "For the coins" only when the coins are all it pays toward.
		forCoins: s.forCoins && !Object.keys(s.pays).length
	})).sort((a, b) =>
		// The errands that pay in materials come first; the ones run only
		// to fill the purse are still errands, but they are not why any
		// of this is being done.
		(a.pays.length ? 0 : 1) - (b.pays.length ? 0 : 1)
		|| ['daily', 'weekly', 'once'].indexOf(a.cadence) - ['daily', 'weekly', 'once'].indexOf(b.cadence)
		|| b.completions - a.completions);

	return {
		orders: o,
		days: H,
		reachable,
		stalled: !result.feasible,
		legs,
		quests,
		groups: groupLegs(legs),
		longPole: longPole(result, legs, quests, o),
		coins: result.coins,
		silver: result.silver,
		refreshes: result.refreshes,
		residual: result.residual
	};
}

/** The order the ways are shown in, and what each is called. */
export const WAYS = [
	['quest', TT('From the quests')],
	['coin', TT('Crow Coin Shop')],
	['barter', TT('Barter for')],
	['falasi', TT("Falasi's silver")],
	['market', TT('Central Market')],
	// A hunt you chose and a thing with no rate at all are two different
	// errands: one is a fight you asked for, the other a shrug. Keeping
	// them apart is why they are separate kinds and not a flag.
	['hunt', TT('Hunt what drops')],
	['find', TT('Go and get')],
	['short', TT('Not reachable yet')]
];

/** Legs grouped by way, in the order above, each with its totals. */
export function groupLegs(legs) {
	const out = [];
	for (const [kind, label] of WAYS) {
		const items = legs.filter(l => l.kind === kind);
		if (!items.length) continue;
		out.push({
			kind, label, items,
			coins: items.reduce((a, l) => a + (l.coins || 0), 0),
			silver: items.reduce((a, l) => a + (l.silver || 0), 0)
		});
	}
	return out;
}

/**
 * What sets the pace: the budget the horizon is stretched over. Said
 * with the item that stretches it, since "the material list" on its
 * own tells nobody what to do about it.
 */
function longPole(result, legs, quests, orders) {
	const { refreshes, coins } = result;
	const days = { quest: 0, material: 0, trade: 0, coins: 0 };
	const item = { quest: null, material: null, trade: null, coins: null };
	const perWeek = orders.days / 7;
	// A list's days are all its draws together, not its longest item's:
	// two materials off the same list wait on the same three draws.
	const most = { material: 0, trade: 0 };
	for (const l of legs) {
		if (l.kind !== 'barter') continue;
		days[l.list] = refreshes[l.list] / (refreshes.lists[l.list] || 1) / perWeek;
		if (l.refreshes > most[l.list]) { most[l.list] = l.refreshes; item[l.list] = l.item; }
	}
	// A run of completions as days: the last of n weeklies falls in
	// the nth week, not at its end.
	const span = q => q.cadence === 'daily' ? q.completions / perWeek : q.cadence === 'weekly' ? (q.completions - 1) * 7 + 1 : 0;
	for (const q of quests) {
		if (q.forCoins) continue;
		const d = span(q);
		if (d > days.quest) { days.quest = d; item.quest = q.pays[0] ? q.pays[0].item : null; }
	}
	if (coins.short > 0 || quests.some(q => q.forCoins)) {
		const d = quests.filter(q => q.forCoins).reduce((a, q) => Math.max(a, span(q)), 0);
		days.coins = coins.short > 0 ? Infinity : d;
	}
	// A list at the edge is the pole even when a weekly's second run
	// lands a day after it: the quest is free, the draws are the wait.
	for (const list of ['material', 'trade']) {
		if (days[list] > 0 && days[list] >= days.quest - 1) days.quest = Math.min(days.quest, days[list] - 0.01);
	}
	const kind = Object.keys(days).sort((a, b) => days[b] - days[a])[0];
	const n = days[kind];
	// Today needs no pole.
	if (!(n > 0) || (n < 1.5 && !(coins.short > 0))) return null;
	const stretch = n === Infinity ? '' : n < 1.5 ? T('a day') : dayText(Math.ceil(n));
	if (kind === 'coins') {
		return coins.short > 0
			? { kind, text: T('The purse sets the pace: {n} coins short, and the coin quests inside a year do not cover it', { n: fmt(coins.short) }) }
			: { kind, text: T('The purse sets the pace: the coin quests take {span} to cover {n} coins', { span: stretch, n: fmt(coins.spend) }) };
	}
	if (kind === 'quest') {
		return { kind, text: item.quest
			? T('The quests set the pace: {item} comes over {span} of them', { item: gameName(item.quest), span: stretch })
			: T('The quests set the pace: over {span} of them', { span: stretch }) };
	}
	const draws = Math.ceil(refreshes[kind]);
	// "At best" belongs only where the draws were not measured. Where the
	// boards have counted how often the offer is up, the figure already
	// carries it and calling it a best case would understate it twice.
	const measured = legs.some(l => l.kind === 'barter' && l.list === kind && l.odds && l.odds.recorded && l.odds.per < 1);
	const pace = measured ? T('about {span}', { span: stretch }) : T('{span} at best', { span: stretch });
	return { kind: `barter-${kind}`, text: kind === 'material'
		? T('The material list sets the pace: {draws} for {item}, {pace}', { draws: drawText(draws), item: gameName(item[kind]), pace })
		: T('The trade list sets the pace: {draws} for {item}, {pace}', { draws: drawText(draws), item: gameName(item[kind]), pace }) };
}

/**
 * The plan as text, for the clipboard: the ways as headings, an item a
 * line with its why.
 */
export function wayText(way) {
	if (!way || !way.legs.length) return '';
	const at = said((PRESETS.find(p => p.id === way.orders.preset) || PRESETS[0]).label);
	const head = way.stalled ? T('Not inside a year at {at}', { at })
		: way.reachable ? T('Done in {span} at {at}', { span: dayText(way.days), at })
		: T('Done in {span} at {at}, but for {items}', { span: dayText(way.days), at, items: itemText(way.residual.length) });
	const pole = way.longPole ? `\n${way.longPole.text}` : '';
	const quests = way.quests.length
		? `\n\n${T('Quests')}\n${way.quests.map(q => `  ${gameName(q.name)}${q.pick !== null && q.quest.choice ? ` — ${T('take {list}', { list: Object.entries(q.quest.choice[q.pick]).map(([i, n]) => `${n}× ${gameName(i)}`).join(', ') })}` : ''}${q.forCoins ? ` — ${T('for the coins')}` : ''} · ${q.cadence === 'once' ? T('once') : `${q.completions}×`}`
			+ (q.over.length ? `\n      ${T('chosen over {list}', { list: q.over.map(o => `${fmt(o.qty)}× ${gameName(o.item)}`).join(', ') })}` : '')).join('\n')}`
		: '';
	const groups = way.groups.map(g => {
		const total = g.coins ? ` — ${T('{n} coins', { n: fmt(g.coins) })}` : g.silver ? ` — ${T('{n} silver', { n: fmt(g.silver) })}` : '';
		return `${said(g.label)}${total}\n${g.items.map(l => `  ${fmt(l.qty)}× ${gameName(l.item)} · ${[l.unit, l.why].filter(Boolean).join(' · ')}`
			+ (l.also ? `\n      ${T('also: {text}', { text: l.also })}` : '')).join('\n')}`;
	}).join('\n\n');
	return `${head}${pole}${quests}\n\n${groups}`;
}
