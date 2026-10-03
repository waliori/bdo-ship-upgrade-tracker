// What the guide chapters share: the saves they are shot against, the
// running order of the film, and a helper or two. A chapter in
// guides.mjs and a chapter in chapters/ read the same ones.

import { say, spot, onScreen } from './drive.mjs';
import { fittedShip, onePartToGo } from './states.mjs';

/**
 * The running order of the film, and of a shoot with no chapter named.
 * join.mjs and guide.sh read it from here; a chapter's number is its
 * place in it.
 */
export const ORDER = ['the-yard', 'the-workshop', 'to-get', 'quests', 'your-ship', 'the-map', 'routes-and-drawings', 'a-run', 'the-harbour'];

/* ------------------------------------------------------------------ *
 * the inventories the chapters are shot against
 * ------------------------------------------------------------------ */

/* Part-way through a Carrack part: something covered, something short, a
 * part mid-enhancement, and coins in the purse. The same starting point
 * the walkthrough uses, so the two films agree about what you own. */
export const START = {
	v: 2,
	stock: {
		'Violent Wave Plywood': 87,
		"Violent Sea Monster's Scale": 400,
		"Saltwater Crocodile's Scale": 400,
		"Violent Sea Monster's Ooze": 260,
		'Starlight Emulsifier': 260,
		"Blueprint: Chiro's Sail": 10,
		'Epheria Carrack Parts Upgrade Permit: Advance': 1,
		'+7 Epheria Carrack: Toro Sail': 1,
		'Tidal Black Stone': 900,
		'Crow Coin': 42000
	},
	targets: [],
	strategy: {},
	history: [],
	settings: {},
	profile: { crewShip: 'Carrack (Advance)' }
};

/** A part levelled in game and not yet recorded, for the Yard's last beat. */
export const withPlating = {
	...START,
	stock: { ...START.stock, 'Epheria Carrack: Toro Plating': 1 }
};

/**
 * The same yard, a few minutes later: two Carrack parts queued, and a
 * Carrack to sail.
 *
 * The Yard queues its builds on camera, so it can open on an empty
 * queue. Every chapter after it opens somewhere that only means
 * anything against a shopping list -- the Map draws a pin per barterer
 * holding something you are short of, and the route it plots is that
 * list joined up. Shot against an empty queue, the pins read "0 of 91"
 * and there is no loop to plot at all, which is how this was found.
 */
export const QUEUED = {
	...fittedShip,
	// The sailor's own numbers, which the Yard sets on camera and every
	// chapter after it needs already set: the barter count gates which
	// islands deal at all, the level prices every Parley figure, and the
	// mastery is in the ship's speed. Shot without them, half the
	// figures in the later chapters read as dashes.
	profile: { ...fittedShip.profile, barterCount: 4205, level: 'Master 5', sailingMastery: 750 }
};

/** One part to go, for the chapter about planning the way to it. */
export const TO_GET = { ...onePartToGo, profile: QUEUED.profile };

/**
 * Light a thing up if the screen has one, and otherwise just say the
 * line over whatever is there.
 *
 * Several beats in these chapters name one bar, one tile or one state
 * among a hundred rows, and whether the seeded board happens to produce
 * it is not something a script can promise. Pointing where there is
 * something to point at and speaking plainly where there is not keeps a
 * chapter from dying on a board that dealt differently.
 */
export async function point(page, sel, line, opts = {}) {
	if (await onScreen(page, sel)) await spot(page, sel, line, opts);
	else await say(page, line);
}

