// What a plotted loop brings in and hands over, stop by stop.
//
// The route panel knew how far the loop was and what it cost in Parley.
// This is the other side of the ledger: the goods handed over at each
// stop and what they were worth, what comes aboard and what that is
// worth, the hold as it stands after each stop, and the goods to carry
// out of port before the first exchange can be made at all. Pure, so
// the panel's numbers can be checked without a chart.

import { GOODS, levelOf } from './barter.js';
import { overweightFactor } from './sailing.js';

/**
 * `stops` in sailing order; `tradesAt(id)` the exchanges the stop is
 * sailed for, each `{ item, give, recv, giveN }` per press; `timesAt(id)`
 * how many presses; `aboard` the weight of goods already in the hold;
 * `price(item)` silver a unit for something that is not a levelled
 * good, or 0 when nobody has said; `hold` the hull's `{ free, max }`,
 * when the legs are to be slowed by what is aboard -- each stop then
 * carries `slow`, the share of its speed the hull keeps on the leg out
 * of it, and `slowStart` is the same for the leg out of port.
 */
export function routeLedger({ stops = [], tradesAt, timesAt = () => 1, aboard = 0, price = () => 0, hold = null } = {}) {
	const slowAt = w => (hold ? overweightFactor(w, hold.free, hold.max) : 1);
	const out = {
		stops: [],
		start: aboard,
		slowStart: slowAt(aboard),
		goodsIn: 0, goodsOut: 0,
		inValue: 0,          // silver the goods received would fetch
		outValue: 0,         // silver the goods handed over would have fetched
		mats: 0,             // materials received, in units
		matValue: 0,         // what the market pays for those it has priced
		unpriced: 0,         // materials the market has no price for
		carry: new Map()     // give -> count: what the loop hands over in all
	};
	let weight = aboard;
	for (const id of stops) {
		const times = Math.max(1, Number(timesAt(id)) || 1);
		let change = 0;
		const trades = tradesAt(id) || [];
		for (const t of trades) {
			const giveN = (Number(t.giveN) || 0) * times;
			const recvN = (Number(t.recv) || 0) * times;
			const giveLv = levelOf(t.give), getLv = levelOf(t.item);
			// Whatever is handed over has to be carried out of port -- a
			// gold bar as much as a good; only a good has a weight and a
			// price here.
			if (t.give && giveN) out.carry.set(t.give, (out.carry.get(t.give) || 0) + giveN);
			if (giveLv && GOODS[giveLv]) {
				change -= giveN * GOODS[giveLv].weight;
				out.outValue += giveN * GOODS[giveLv].sell;
				out.goodsOut += giveN;
			}
			if (getLv && GOODS[getLv]) {
				change += recvN * GOODS[getLv].weight;
				out.inValue += recvN * GOODS[getLv].sell;
				out.goodsIn += recvN;
			} else if (recvN) {
				out.mats += recvN;
				const p = Number(price(t.item)) || 0;
				if (p > 0) out.matValue += p * recvN; else out.unpriced += recvN;
			}
		}
		weight += change;
		const entry = { id, change, after: weight, trades: trades.length };
		if (hold) entry.slow = slowAt(weight);
		out.stops.push(entry);
	}
	out.net = out.inValue + out.matValue - out.outValue;
	return out;
}

/** Silver an hour, given seconds under way; null when there is no time. */
export function perHour(silver, seconds) {
	return seconds > 0 ? silver / (seconds / 3600) : null;
}
