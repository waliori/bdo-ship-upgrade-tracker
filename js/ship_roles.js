// What each hull is for, and what the fleet fits to it.
//
// The app has always said what a ship *is* -- the weights, the speeds,
// the slots -- and never what it is *for*. Those are different
// questions, and the second one is the one someone picking their first
// Carrack is actually asking. Four hulls that cost a season of work
// apiece are not interchangeable, and the game does not say so
// anywhere: it lists the numbers and leaves the reader to work out that
// the one with the biggest hold is the one that pays.
//
// So this is the settled community reading, and nothing else. Every
// line is what the guides below agree on; where they disagree, or where
// it is a matter of taste, it says so rather than picking a winner.
// None of it is a rule the app enforces -- it is a note beside a
// choice, and the choice stays the player's.
//
// Read 2026-09-08 from:
//   * The Carrack + bartering guide at catdelice.com (Aug 2026): the
//     Advance for bartering, "+10 green gear is enough to start", blue
//     crafted rather than bought with Crow Coins, the Rusalka weight
//     crystal called the strongest, a sailor 200 LT apiece.
//   * grumpygreen.cricket/ship-crystals: the grade ladder and the eight
//     stats a crystal can carry.
//   * grumpygreen.cricket/bdo-sailors-guide: the goblins at 200 LT for
//     barter, Born-in-the-Sea for speed, and what each seat doubles.
//   * blackdesertfoundry.com/ships-guide and the Pearl Abyss forum's
//     "Guide On Choosing your Carrack": the four Carracks' roles.

import { TT } from './i18n.js';

/**
 * A hull's job, in one line each.
 *
 * `role` is the short word for it, `why` the reason in the game's own
 * terms, and `crystal` the stat worth putting in the fifth slot for
 * that job. `note` is for the caveat a guide actually stresses.
 */
export const SHIP_ROLES = {
	'Carrack (Advance)': {
		role: 'bartering',
		why: TT('the biggest hold of the four, and a barter run pays by what it carries'),
		crystal: 'weight',
		note: TT('the usual first Carrack: bartering out-earns monster hunting, and this is the hull that barters')
	},
	'Carrack (Volante)': {
		role: 'speed',
		why: TT('the fastest hull, for runs where the sailing time is the cost'),
		crystal: 'speed',
		note: TT('quicker between islands, but it carries less than the Advance, so a barter run trades cargo for minutes')
	},
	'Carrack (Valor)': {
		role: 'sea monsters',
		why: TT('the heaviest guns of the four'),
		crystal: 'damage',
		note: TT('no advantage at bartering — it gives up hold for firepower')
	},
	'Carrack (Balance)': {
		role: 'both, neither best',
		why: TT('even across cargo and guns'),
		crystal: 'weight',
		note: TT('the choice for not choosing; the Advance out-barters it and the Valor out-shoots it')
	},
	Panokseon: {
		role: 'sea monsters',
		why: TT('built around its cannons and its crew'),
		crystal: 'damage',
		note: TT('its own upgrade line, the Cheongun parts, rather than the Carrack’s')
	},
	'Epheria Caravel': {
		role: 'bartering, before a Carrack',
		why: TT('the hold to run [Level 5]s while the Carrack is being built'),
		crystal: 'weight',
		note: TT('the Carrack is the upgrade, not a different ship')
	},
	'Epheria Galleass': {
		role: 'sea monsters, before a Carrack',
		why: TT('the guns to hunt while the Carrack is being built'),
		crystal: 'damage',
		note: ''
	},
	'Improved Epheria Sailboat': {
		role: 'bartering, early',
		why: TT('the first hull that carries enough to make a run worth sailing'),
		crystal: 'weight',
		note: ''
	},
	'Improved Epheria Frigate': {
		role: 'sea monsters, early',
		why: TT('the first hull that fights back'),
		crystal: 'damage',
		note: ''
	}
};

/**
 * What the fifth slot is worth taking, by what the ship is for.
 *
 * A crystal carries exactly one of eight stats, so the grade says how
 * much and the variant says of what -- and the variant is the choice
 * that matters. The guides are firm on the barter case (weight, and the
 * Rusalka weight crystal by name) and looser on the rest, which is
 * said here rather than dressed up.
 */
export const CRYSTAL_FOR = {
	weight: {
		label: TT('more cargo'),
		who: TT('bartering'),
		why: TT('a run pays by what it carries, and a weight crystal is worth several sailors of hold — the Rusalka one is the strongest in the game at +1,350 LT')
	},
	speed: {
		label: TT('faster between islands'),
		who: TT('long runs, and travelling'),
		why: TT('the second choice for bartering when the route is long enough that the sailing, not the hold, is the cost')
	},
	damage: {
		label: TT('harder hits'),
		who: TT('sea monsters'),
		why: TT('the hunting choice; it does nothing for a barter run')
	},
	durability: {
		label: TT('takes more punishment'),
		who: TT('sea monsters'),
		why: TT('for hunts long enough that repairs, not damage, end them')
	},
	accel: { label: TT('quicker to top speed'), who: TT('stop-and-go routes'), why: TT('a great many short legs, where a hull spends its time getting up to speed') },
	turn: { label: TT('turns tighter'), who: TT('monster fights'), why: TT('taste, mostly — worth little on a barter loop') },
	brake: { label: TT('stops shorter'), who: TT('monster fights'), why: TT('taste, mostly — worth little on a barter loop') }
};

/**
 * What to fit, in the order the guides say to buy it.
 *
 * The step everyone names is green at +10: it is what carries an
 * Advance past 20,000 LT, and it costs a fraction of what blue does.
 * Blue is the next stop and is crafted rather than bought with Crow
 * Coins, which the guides are unanimous is poor value. Yellow is the
 * end of the line and nobody calls it a starting point.
 */
export const PART_PATH = [
	{ family: 'toro', line: TT('green at +10 first — much the cheapest step, and enough to start on: it alone takes an Advance past 20,000 LT') },
	{ family: 'chiro', line: TT('blue next, and crafted rather than bought with Crow Coins') },
	{ family: 'yellow', line: TT('yellow last, once the rest is done') }
];

/** The role note for a hull, or null where the app has nothing to add. */
export const roleOf = ship => SHIP_ROLES[ship] || null;

/** Sailors, in the one sentence that decides a barter roster. */
export const SAILOR_NOTE = {
	barter: TT('every sailor aboard is cargo you cannot carry — the goblins (Innocent, Ambitious) are the lightest at 200 LT and still quick, which is why barter rosters are goblin rosters'),
	hunt: TT('weight matters less than growth here — Born-in-the-Sea has the best speed and acceleration of any sailor, at 500 LT')
};
