// What is still to do today, as the loop-planner wants it.
//
// The Quests tab knows which quests are finished for the period they
// are in; the chart wants the rest, with one thing settled first. The
// Old Moon Guild will pay for one of its four hunts a day and no more,
// so a plan that sailed to all four would be a plan for a day that
// cannot happen. Which one to take is not a coin toss either: if the
// week's Black Rust weekly is still outstanding, the Black Rust daily
// is free -- the same kill pays twice -- so the group follows the
// weeklies rather than the alphabet.
//
// Pure but for the store: the tick marks come in, the day's list goes
// out. The ordering is quest-course.js's problem, not this one's.

import * as store from './state.js';
import { quests, cadenceOf } from './quests.js';
import { periodKey } from './clock.js';
import { monsterByKey } from './sea_monsters.js';

/** Whether a quest is done for the period it is in right now. */
export function doneNow(q, done = store.getProfile('questsDone', {}) || {}) {
	return done[q.id] === periodKey(cadenceOf(q));
}

/**
 * The repeatable quests still to do, with each one-a-day group down to
 * the single member worth doing.
 *
 * `kinds` says which cadences to take -- dailies, weeklies or both.
 * A group whose day is already spent drops out whole.
 */
export function todaysQuests({ kinds = ['daily', 'weekly'], done = store.getProfile('questsDone', {}) || {} } = {}) {
	const want = new Set(kinds);
	const live = quests.filter(q => want.has(q.repeat) && !doneNow(q, done));
	// A group with one of its number already ticked is spent for the day.
	const spent = new Set(quests.filter(q => q.group && doneNow(q, done)).map(q => q.group));
	const open = live.filter(q => !q.group || !spent.has(q.group));

	const loose = open.filter(q => !q.group);
	const byGroup = new Map();
	for (const q of open) {
		if (!q.group) continue;
		if (!byGroup.has(q.group)) byGroup.set(q.group, []);
		byGroup.get(q.group).push(q);
	}

	// The kill the rest of the day is already making. A daily that wants
	// the same species as an outstanding weekly is one detour, not two.
	const alreadyHunting = new Set(loose.map(q => q.monster).filter(Boolean));
	const picks = [];
	for (const [, members] of byGroup) {
		const free = members.find(q => q.monster && alreadyHunting.has(q.monster));
		// Failing that, the one whose ground the chart actually knows --
		// a hunt with nowhere to go is no use to a plan.
		const charted = members.find(q => {
			const m = q.monster && monsterByKey[q.monster];
			return m && ((m.zones && m.zones.length) || (m.points && m.points.length));
		});
		picks.push(free || charted || members[0]);
	}
	return [...loose, ...picks];
}
