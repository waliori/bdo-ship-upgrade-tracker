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
import { img } from '../ui-bits.js';
import { ports } from '../barter_npcs.js';
import { wharves } from '../wharves.js';
import { questCourse, km } from '../quest-course.js';
import { todaysQuests, doneNow } from '../quest-today.js';
import { setMadeCourse } from '../courses.js';
import { questById } from '../quests.js';
import { periodKey } from '../clock.js';
import { openDialog, closeDialog, toast } from '../dialogs.js';
import { seaBent } from './marks.js';
import { mv, persist } from './state.js';

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

/**
 * The quests dropped from today's loop by hand.
 *
 * Not the same thing as done: a sailor who cannot face sailing to
 * Ancado today has not finished At World's End, they have decided it
 * is not worth the detour, and the loop should be worked out again
 * without it. Kept for the day it was said on, since tomorrow's
 * dailies are a new question.
 */
const skipNow = () => (mv.errandSkip && mv.errandSkip.day === periodKey('daily') ? mv.errandSkip.ids : []);

function setSkip(ids) {
	mv.errandSkip = { day: periodKey('daily'), ids };
	persist();
}

/** Drop a quest from the loop, or put it back. */
export function skipErrand(id, off = true) {
	const now = skipNow();
	if (off && now.includes(id)) return false;
	if (!off && !now.includes(id)) return false;
	setSkip(off ? [...now, id] : now.filter(x => x !== id));
	dropErrands();
	return true;
}

/** Everything put aside today, as quests. */
export const skippedQuests = () => skipNow().map(id => questById[id]).filter(Boolean);

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
	return `${mv.errandFrom}|${mv.errandKinds}|${skipNow().join(',')}|${list.map(q => q.id).sort().join(',')}`;
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
	const put = new Set(skipNow());
	const list = todaysQuests({ kinds }).filter(q => !put.has(q.id));
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

/**
 * What is done at a call, gathered: the kills by species and the
 * hand-ins by person.
 *
 * Three quests wanting one, two and four Black Rust are seven Black
 * Rust, and four errands at Ravikel are one walk up to Ravikel. Every
 * way the loop is written out -- the panel, the game's map, a drawing
 * -- says it that way, so they all say it from here.
 */
function jobsAt(c) {
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
	return { kills, hands };
}

/** What a call amounts to, in as few words as will carry it. */
function jobsWords(c, times = '×') {
	const { kills, hands } = jobsAt(c);
	if (kills.size) return [...kills].map(([of, r]) => `${r.n}${times} ${of}`).join(', ');
	if (hands.size) return [...hands.keys()].join(', ');
	return '';
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
	const { kills, hands } = jobsAt(c);
	const jobs = [
		...[...kills].map(([of, r]) => `<span class="errand-job kill"><b>${F(r.n)}×</b> ${esc(of)}${pips(r.quests)}</span>`),
		...[...hands].map(([who, r]) => `<span class="errand-job"><i>${esc(who)}</i>${pips(r.quests)}</span>`)
	].join('');
	// The row is the way to everything about the call: pressing it flies
	// the chart there and opens what is done. The cross beside it is the
	// one thing worth doing without opening anything.
	return `<div class="errand-stop ${kind}">
		<button class="errand-row" data-act="map-errand-open" data-i="${i}"
			title="Fly to ${esc(c.name)} and see what is done there">
			<span class="errand-n">${i + 1}</span>
			<span class="errand-main"><span class="errand-name">${esc(c.name)}</span>
				${jobs ? `<span class="errand-jobs">${jobs}</span>` : '<span class="errand-jobs faint">set out</span>'}</span>
		</button>
		${c.todo.length ? `<button class="map-x errand-skip" data-act="map-errand-skip-call" data-i="${i}"
			aria-label="Leave ${esc(c.name)} out of today's loop" title="Leave this call out and work the loop out again">×</button>` : ''}
	</div>`;
}

/** What a quest asks for at this call, in a few words. */
const jobWords = t => (t.what === 'kill' ? `kill ${F(t.n)}× ${t.of}` : `hand in to ${t.who}`);

/**
 * One call, opened: what is done there, quest by quest, with the way
 * to each one's row on the Quests tab and the way to drop it.
 *
 * A quest dropped here is not a quest done -- it is one this sailor
 * has decided is not worth the detour today -- so the loop is worked
 * out again without it rather than ticked off.
 */
export function openErrandStop(i) {
	const p = plan;
	const c = p && p.stops[i];
	if (!c) return;
	const rows = c.todo.map(t => `<div class="errand-detail">
		${questIcon(t.q) ? `<img class="errand-detail-pic" src="${esc(questIcon(t.q))}" alt="" loading="lazy">` : ''}
		<div class="errand-detail-main">
			<div class="errand-detail-name">${esc(t.q.name)}</div>
			<div class="errand-detail-sub">${esc(jobWords(t))} · ${esc(t.q.where)}</div>
			<div class="errand-detail-pays">${Object.entries(t.q.rewards || {}).map(([item, n]) =>
				`<span class="reward">${img(item, 'reward-icon')}<b>${F(n)}×</b> ${esc(item)}</span>`).join('')
				|| '<span class="errand-detail-sub">no reward the tracker holds</span>'}</div>
		</div>
		<div class="errand-detail-acts">
			<button class="ghost-btn sm" data-act="view" data-id="quests" data-quest="${esc(t.q.id)}">On the Quests tab ↗</button>
			<button class="ghost-btn sm" data-act="map-errand-skip" data-quest="${esc(t.q.id)}" title="Not today: work the loop out without it">Skip it</button>
		</div>
	</div>`).join('');
	openDialog(`<h2>${esc(c.name)}</h2>
		<p class="dialog-copy">Call ${i + 1} of ${p.stops.length} on today's loop${c.species
			? ` — ${esc(c.species.map(x => x.name).join(', '))}, at ${c.species.length > 1 ? 'a ground they share' : 'its habitat marker'}.`
			: '.'}</p>
		<div class="errand-details">${rows || '<p class="dialog-copy">Nothing to do here but set out.</p>'}</div>
		<div class="dialog-actions">
			${c.todo.length ? `<button class="ghost-btn" data-act="map-errand-skip-call" data-i="${i}">Leave this call out</button>` : ''}
			<button class="act" data-close>Done</button>
		</div>`);
}

/**
 * The loop as points for the game's world map: numbered in sailing
 * order and named by what is done, so the in-game list reads as the
 * panel does. A name is cut to what a bookmark will hold.
 */
export function errandPoints(p = plan) {
	if (!p) return [];
	return p.stops.map((c, i) => {
		// Thirty characters is all a bookmark's name will hold, so what
		// is cut is cut at a comma rather than in the middle of a word.
		const what = jobsWords(c, 'x') || c.name;
		const room = 30 - `${i + 1}: `.length;
		const cut = what.slice(0, room);
		const fit = what.length <= room
			? what
			: (cut.replace(/,[^,]*$/, '') !== cut ? cut.replace(/,[^,]*$/, '')
				: cut.replace(/\s+\S*$/, '') || cut).trim();
		return { name: `${i + 1}: ${fit}`, x: c.x, y: c.y };
	});
}

/**
 * The loop as a drawing: a stop for every call, noted with what is
 * done there, and the sailed line through them all.
 *
 * Handed to the Draw tab as a trace rather than kept here, because
 * everything a sailor would then want -- naming it, keeping it,
 * sharing it as a link, writing it to a file -- the Draw tab already
 * does, and a second way of doing those would be a second way to get
 * them wrong.
 */
export function errandTrace(p = plan, from = mv.errandFrom) {
	if (!p) return null;
	const points = p.stops.map((c, i) => ({
		x: c.x, y: c.y, colour: '#ffd77a',
		note: `${i + 1}. ${c.name} — ${jobsWords(c) || 'set out'}`.slice(0, 120)
	}));
	// The line is the sailed one, bent round the headlands, not the
	// straight hops between calls.
	const bent = seaBent(p.stops.map(c => ({ x: c.x, y: c.y })));
	const flat = [];
	for (const q of bent) flat.push(q.x, q.y);
	return {
		app: 'bdo-ship-upgrade-tracker', kind: 'trace', version: 2,
		name: `Errands — ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
		notes: `${p.stops.length} calls, ${km(p.length).toFixed(1)} km, ${p.quests || p.stops.length} quests, from ${from}.`,
		points,
		strokes: flat.length >= 4 ? [{ pts: flat, colour: '#ffd77a', width: 2.5 }] : [],
		texts: [], areas: []
	};
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
	// What was put aside by hand is said, and offered back: a loop that
	// is quietly short of a quest is the same trap as a board that is
	// quietly short of an island.
	const put = skippedQuests();
	const aside = put.length
		? `<p class="map-course-note">Put aside today: ${put.map(q => `<button class="linky" data-act="map-errand-unskip" data-quest="${esc(q.id)}" title="Put it back and work the loop out again">${esc(q.name.replace(/^\[[^\]]+\]\s*/, ''))}</button>`).join(', ')}.</p>`
		: '';
	return `<div class="map-courses">${head}
		<button class="map-course on" data-act="map-errands" aria-pressed="true">
			<span class="map-course-dot"></span>
			<span class="map-row-main"><span class="map-row-name">${esc(p.name)}</span>
				<span class="map-row-sub">${p.stops.length} calls · ${km(p.length).toFixed(1)} km · ${p.quests} quests</span></span>
		</button>
		<div class="errand-stops">${p.stops.map(stopRow).join('')}</div>
		${left}${aside}
		<div class="map-side-btns errand-btns">
			<button class="ghost-btn" data-act="map-errand-draw" title="Put the loop on the Draw tab as a trace: name it, keep it, share it as a link">✎ Draw it</button>
			<button class="ghost-btn" data-act="map-errand-game" title="Write the loop into the game's own world map">⚑ On the game’s map</button>
		</div>
	</div>`;
}
