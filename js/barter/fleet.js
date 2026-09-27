// What the fleet has seen each island pay of its four [Level 7]s.
//
// The layout record names one [Level 7] an island pays, and the game
// hands over any of four; which one is only known by sailing there. Each
// sailor on the community boards counts the ones they were paid, and the
// boards add those up (server/community.js). Asked for once a session
// and kept, so the chips on a stop can say the fleet's share beside the
// sailor's own.

import { call, feature } from '../sync.js';
import { redrawSoon } from './search.js';

const AGAIN_MS = 15 * 60 * 1000;
let held = null;
let heldRolls = null;
let askedAt = 0;

async function ask() {
	askedAt = Date.now();
	try {
		const res = await call('GET', '/api/community');
		if (res && res.ok && res.body && res.body.stats) {
			held = res.body.stats.sevens || {};
			heldRolls = res.body.stats.rolls || {};
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
