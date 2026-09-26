// Level 0: the app's own planner, as a solver on the bench.
//
// The board's chains are searched as the Barter tab searches them
// (propose), the set it would offer as "the most an hour" is laid in
// full (chainRun at the screen's effort), and the run is written out as
// a plan. The planner reads the app's objects, not the instance, so the
// bench hands it the case's setup; setupOf builds both from the same
// arguments, and they describe the same day.

import { propose } from '../../../js/barter-optimizer.js';
import { chainRun } from '../../../js/barter-chains.js';

/** The app's run as a plan: its start, then every stop in order. */
export function planOfRun(run, instance) {
	const counts = list => {
		const m = {};
		for (const x of list || []) if (x.n > 0) m[x.item] = (m[x.item] || 0) + x.n;
		return m;
	};
	const plan = { buy: counts(run.landLoaded), load: counts(run.loaded), visits: [] };
	for (const s of run.stops) {
		if (s.npcId) {
			if (s.times > 0) plan.visits.push({ at: String(s.npcId), a: s.times });
			continue;
		}
		const v = { at: s.wharf.at };
		const sell = counts(s.sale && s.sale.items);
		const drop = counts(s.dropped);
		const load = counts(s.loads);
		if (Object.keys(sell).length) v.sell = sell;
		// What the app left is what the islands ahead would not take; said
		// so, rather than as its count, so that the plan leaves the same
		// thing whatever the yields turned out to be.
		if (Object.keys(drop).length) v.drop = 'spare';
		if (Object.keys(load).length) v.load = load;
		plan.visits.push(v);
	}
	const last = plan.visits[plan.visits.length - 1];
	if (!last || !instance.depots.some(d => d.id === last.at)) plan.visits.push({ at: instance.rules.end });
	return plan;
}

export function solve(instance, { setup, timeMs = Infinity } = {}) {
	if (!setup) throw new Error('level0 needs the case setup (setupOf)');
	const { chainsAll, opts, ship } = setup.app;
	const r = propose({ chains: chainsAll, opts, ship, budgetMs: timeMs, width: 5, depth: 8 });
	const pick = r.proposals.find(p => p.kind === 'hour') || r.best;
	if (!pick) return { plan: { visits: [{ at: instance.rules.end }] }, info: { ids: [], partial: r.partial } };
	const byId = new Map(chainsAll.map(c => [c.id, c]));
	const run = chainRun({ ...opts, chosen: pick.ids.map(id => byId.get(id)), effort: 2 });
	return {
		plan: planOfRun(run, instance),
		info: { ids: pick.ids, partial: r.partial, hoursApp: run.hours, netApp: run.net, tradesApp: run.trades }
	};
}
