// The day's errands on the chart: the panel, and the plan behind it.
//
// The courses beside it are lines someone drew once. This one is
// worked out each time it is asked for, from whatever quests are still
// open on the Quests tab, so it is kept here rather than in the table
// of courses -- and kept at all, because the first plan of a session
// has to search the water between twenty calls and that is not free.
// Ticking a quest off, changing the harbour or the cadence throws it
// away and it is worked out again.

import { esc, F } from '../fmt.js';
import { questIcon } from '../quest_icons.js';
import { ports } from '../barter_npcs.js';
import { wharves } from '../wharves.js';
import { questCourse, km } from '../quest-course.js';
import { todaysQuests } from '../quest-today.js';
import { setMadeCourse } from '../courses.js';
import { mv } from './state.js';

/** Where a day can start: the harbours, and the two wharves every
 *  sailor of this sea passes through anyway. */
export function harbours() {
	const list = ports.map(p => ({ name: p.name, x: p.x, y: p.y }));
	for (const name of ["Ravikel", "Dario"]) {
		const w = wharves.find(x => x.name === name);
		if (w && !list.some(p => p.name === w.at)) list.push({ name: w.at, x: w.x, y: w.y });
	}
	return list;
}

const KINDS = [['both', 'Both'], ['daily', 'Daily'], ['weekly', 'Weekly']];

let plan = null;
let planKey = '';
let working = false;

/** Forget the worked-out loop: something it was built on has changed. */
export function dropErrands() {
	plan = null;
	planKey = '';
	working = false;
	setMadeCourse(null);
}

/** Say the loop is being worked out, so the panel can paint before the
 *  search starts rather than after it finishes. */
export function startErrands() {
	plan = null;
	planKey = '';
	working = true;
}

/** What the plan was built from, so a stale one is spotted. */
function keyNow(list) {
	return `${mv.errandFrom}|${mv.errandKinds}|${list.map(q => q.id).sort().join(',')}`;
}

/**
 * The day's loop, worked out if it has to be.
 *
 * Returns null when there is nothing left to do, or nowhere to start
 * from. The course it makes is handed to courses.js so the chart can
 * draw it by id like any other.
 */
export function errandPlan() {
	working = false;
	const kinds = mv.errandKinds === 'both' ? ['daily', 'weekly'] : [mv.errandKinds];
	const list = todaysQuests({ kinds });
	if (!list.length) return null;
	const key = keyNow(list);
	if (plan && planKey === key) return plan;
	const from = harbours().find(h => h.name === mv.errandFrom) || harbours()[0];
	if (!from) return null;
	const made = questCourse(list, from);
	if (!made) return null;
	plan = {
		...made,
		name: 'Today’s errands',
		sub: `from ${from.name}`,
		note: `${made.stops.length} calls, ${km(made.length).toFixed(1)} km, worked out from the ${list.length} quests still open on the Quests tab. A ground is never called at after the man who pays for it.`,
		quests: list.length
	};
	planKey = key;
	setMadeCourse(plan);
	return plan;
}

/** The quests behind a job, as their codex pictures. */
const pips = list => list.map(q => questIcon(q)
	? `<img class="quest-pip" src="${esc(questIcon(q))}" alt="" title="${esc(q.name)}" loading="lazy">` : '').join('');

/**
 * One call on the loop, as a row: what it is, and what is done there.
 *
 * A kill is said once by its total -- three quests wanting one Black
 * Rust, two and four is seven Black Rust, not three lines -- and a
 * hand-in once per person, since walking up to Ravikel four times is
 * one errand. The quests behind each are their own pictures.
 */
function stopRow(c, i) {
	const kind = c.kind === 'hunt' ? 'hunt' : c.kind === 'port' ? 'port' : 'call';
	const kills = new Map();
	const hands = new Map();
	for (const t of c.todo) {
		const into = t.what === 'kill' ? kills : hands;
		const key = t.what === 'kill' ? t.of : t.who;
		const row = into.get(key) || { n: 0, quests: [] };
		row.n += t.n || 1;
		row.quests.push(t.q);
		into.set(key, row);
	}
	const jobs = [
		...[...kills].map(([of, r]) => `<span class="errand-job kill"><b>${F(r.n)}×</b> ${esc(of)}${pips(r.quests)}</span>`),
		...[...hands].map(([who, r]) => `<span class="errand-job"><i>${esc(who)}</i>${pips(r.quests)}</span>`)
	].join('');
	return `<div class="errand-stop ${kind}">
		<span class="errand-n">${i + 1}</span>
		<span class="errand-main"><span class="errand-name">${esc(c.name)}</span>
			${jobs ? `<span class="errand-jobs">${jobs}</span>` : '<span class="errand-jobs faint">set out</span>'}</span>
	</div>`;
}

/**
 * The Errands block on the Hunt tab.
 *
 * Nothing is worked out until it is switched on: the first plan of a
 * session searches the water between a score of calls, which is a
 * second or two nobody asked for while they were reading the courses.
 */
export function errandsHTML() {
	const on = mv.coursesOn.includes('dailies');
	const kinds = KINDS.map(([id, label]) =>
		`<button class="seg${mv.errandKinds === id ? ' on' : ''}" data-act="map-errand-kinds" data-id="${id}">${label}</button>`).join('');
	const from = `<select class="field sm" data-act="map-errand-from" aria-label="Where the day starts and ends">${harbours()
		.map(h => `<option value="${esc(h.name)}"${h.name === mv.errandFrom ? ' selected' : ''}>${esc(h.name)}</option>`).join('')}</select>`;
	const head = `<div class="map-courses-head">Errands <span class="map-courses-credit">worked out from your Quests tab</span></div>
		<div class="errand-set">${from}<span class="segs" role="group" aria-label="Which repeatables to plan for">${kinds}</span></div>`;
	if (!on) {
		return `<div class="map-courses">${head}
			<button class="ghost-btn wide" data-act="map-errands" title="Pick a ground for every hunt and put the day's calls in order">⚓ Work out today’s loop</button>
		</div>`;
	}
	if (working) {
		return `<div class="map-courses">${head}
			<p class="map-course-note">Working out the loop — a ground for every hunt, and the way round them all…</p>
		</div>`;
	}
	const p = plan;
	if (!p) {
		return `<div class="map-courses">${head}
			<p class="map-course-note">Nothing left to do — every ${mv.errandKinds === 'both' ? 'daily and weekly' : mv.errandKinds} is ticked off.</p>
			<button class="ghost-btn wide" data-act="map-errands">Put it away</button>
		</div>`;
	}
	const left = p.left.length
		? `<p class="map-course-note">Left out: ${esc(p.left.map(x => x.q.name.replace(/^\[[^\]]+\]\s*/, '')).join(', '))} — ${esc(p.left[0].why)}.</p>`
		: '';
	return `<div class="map-courses">${head}
		<button class="map-course on" data-act="map-errands" aria-pressed="true">
			<span class="map-course-dot"></span>
			<span class="map-row-main"><span class="map-row-name">${esc(p.name)}</span>
				<span class="map-row-sub">${p.stops.length} calls · ${km(p.length).toFixed(1)} km · ${p.quests} quests</span></span>
		</button>
		<div class="errand-stops">${p.stops.map(stopRow).join('')}</div>
		${left}
	</div>`;
}
