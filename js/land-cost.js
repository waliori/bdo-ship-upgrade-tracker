// What a land good costs the run.
//
// A chain that starts ashore starts with something bought or made:
// ten Copper Ingots, five hundred Star Anise. The sale at the end is
// not the run's silver until that is taken off. Three ways a sailor
// comes by a land good, and three prices: made by their own workers,
// which costs the run nothing; bought on the Market, at the Market's
// last price; or a currency item with a fixed value, the Gold Bar a
// few shore barterers take. A good the Market has not priced costs 0
// and is marked so, since a guess would be worse than a gap.
//
// A price is not a good in the hand, though. The Market's last price
// stands when nothing is listed, and a run that says "buy 500 Star
// Anise" of a good with none for sale sends a sailor to the counter for
// nothing -- so a Market good also carries how many are listed, and the
// run buys no more than that.

import { marketPrice, marketStock } from './market.js';
import { isLandGood } from './land_goods.js';

/** Currency items with a value of their own: silver for the bar. */
export const FIXED = {
	'Gold Bar 100G': 10000000
};

/** Whether a good is marked as made by the sailor's own workers. */
export function homemade(name, made) {
	return Array.isArray(made) && made.includes(name);
}

/**
 * The price of one land good under the sailor's list of what they make
 * themselves: { each, how } with `how` one of 'made' | 'fixed' |
 * 'market' | 'unpriced', and for a Market good `stock`, how many are
 * listed there.
 */
export function landCost(name, made = []) {
	if (!isLandGood(name)) return { each: 0, how: 'unpriced' };
	if (homemade(name, made)) return { each: 0, how: 'made' };
	if (FIXED[name]) return { each: FIXED[name], how: 'fixed' };
	const p = marketPrice(name);
	// `stock` is how many are listed, null where the Market did not say
	return p > 0 ? { each: p, how: 'market', stock: marketStock(name) } : { each: 0, how: 'unpriced' };
}

/** The prices of every land good, as the run takes them: name -> { each, how }. */
export function landPrices(names, made = []) {
	const out = {};
	for (const n of names) out[n] = landCost(n, made);
	return out;
}
