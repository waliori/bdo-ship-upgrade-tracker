// What the fleet has seen each island pay of its four [Level 7]s.
//
// The layout record names one [Level 7] an island pays, and the game
// hands over any of four; which one is only known by sailing there. Each
// signed-in sailor counts the ones they were paid, on the boards or not, and the
// boards add those up (server/community.js). Asked for once a session
// and kept, so the chips on a stop can say the fleet's share beside the
// sailor's own.

import { call, feature } from '../sync.js';
import { T } from '../i18n.js';
import { redrawSoon } from './search.js';
import { paidBand } from '../digest.js';

const AGAIN_MS = 15 * 60 * 1000;
let held = null;
let heldRolls = null;
let heldPaid = null;
let askedAt = 0;

async function ask() {
	askedAt = Date.now();
	try {
		const res = await call('GET', '/api/community', null, T('Asking what the fleet was paid…'));
		if (res && res.ok && res.body && res.body.stats) {
			held = res.body.stats.sevens || {};
			heldRolls = res.body.stats.rolls || {};
			heldPaid = res.body.stats.paid || {};
			redrawSoon();
		}
	} catch { /* asked again later */ }
}

/** The fleet's count for an island: { seen: { item: n }, total }, or
 *  null when nobody has said or the deployment has no boards. */
export function fleetSevens(npcId) {
	if (feature('community') && Date.now() - askedAt > AGAIN_MS) ask();
	const seen = held && held[npcId];
	if (!seen) return null;
	const total = Object.values(seen).reduce((a, b) => a + b, 0);
	return total ? { seen, total } : null;
}

/** What the fleet was shown at a slot a layout leaves to chance:
 *  { seen: { 'give|recv': n }, total }, or null. */
export function fleetRolls(layout, npcId) {
	if (feature('community') && Date.now() - askedAt > AGAIN_MS) ask();
	const seen = heldRolls && heldRolls[`${layout}|${npcId}`];
	if (!seen) return null;
	const total = Object.values(seen).reduce((a, b) => a + b, 0);
	return total ? { seen, total } : null;
}

/**
 * What the fleet was most often paid at an exchange that pays a range:
 * { value, pct, total, scope }, asked of the sailors most like this one
 * first -- the same barter level and Total Barters band ('like') -- then
 * the same level ('level'), then everyone ('all'), whichever first has
 * three readings. Null when nobody has said.
 */
export function fleetPaid(key, level, barters) {
	if (feature('community') && Date.now() - askedAt > AGAIN_MS) ask();
	const bands = heldPaid && heldPaid[key];
	if (!bands) return null;
	const mine = paidBand(level, barters), tier = mine.split('|')[0];
	const sum = keep => {
		const counts = {};
		for (const [band, seen] of Object.entries(bands)) if (keep(band)) for (const [v, n] of Object.entries(seen)) counts[v] = (counts[v] || 0) + n;
		return counts;
	};
	for (const [scope, keep] of [['like', b => b === mine], ['level', b => b.split('|')[0] === tier], ['all', () => true]]) {
		const counts = sum(keep);
		const total = Object.values(counts).reduce((a, b) => a + b, 0);
		if (total < 3 && scope !== 'all') continue;
		if (!total) return null;
		const [value, n] = Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0];
		return { value: Number(value), pct: Math.round((n / total) * 100), total, scope };
	}
	return null;
}
