// The Crew screen: the game's own Manage Sailors window, planned ahead.
//
// A hull, its seats drawn where the game draws them, and the sailors you
// have hired -- each one a name, a type, a level and a condition. Tap a
// sailor, tap a seat, and the numbers at the top say what the crew adds
// to the hull. Two arrangements per hull can be kept as presets, which
// is what the game offers too.
//
// The roster and the seating travel with the save (profile), so the
// phone at the wharf and the desktop agree on who sits where.

import { esc, F } from './fmt.js';
import { T, TT, said, gameName } from './i18n.js';
import * as store from './state.js';
import { img, iconSrc, codexName } from './ui-bits.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { shipStats } from './ship_stats.js';
import { describeStats, statsAt } from './part_stats.js';
import { families, tables } from './enhancement.js';
import { currentShip, fittedFor, partsForSlot, shipName, setFitted, crystalFor, setCrystal, listFleet, hullOfRow, saveSetup, loadSetup, deleteSetup, activeSetupId, setupSummary, skinWorn, setSkinSlot, setSkinAll, skinTotals, OWNED_PREFIX, OVERLOAD } from './ship.js';
import { GOODS } from './barter.js';
import { GRADES, gradeById, crystalById, crystalsOf, crystalVariant, crystalLine, crystalStats } from './crystals.js';
import { skinFor, SKIN_SLOTS } from './ship_skins.js';
import { openFleet } from './setups.js';
import { openPicker } from './picker.js';
import { roleOf, CRYSTAL_FOR, SAILOR_NOTE, PART_PATH } from './ship_roles.js';
import { encodeShare, shareLink } from './share.js';
import { enhancedName } from './planner.js';
import {
	pool, mateTypes, anyType, care, rations, expSplit, firstMates, slotSources, statBand, rollRank,
	contract, SAILOR_CAP, seatsFor, fitSeats, statOf, crewTotals, autoAssign, logLevel, levelSteps, STAT_KEYS, STAT_NAMES } from './sailors.js';

// Session state: who is picked up, and how the roster is ordered.
let selId = null;
const checked = new Set();      // sailors ticked for a bulk action
let sort = 'stats';

const RACE = { Human: '#8fb4d6', Goblin: '#8fd98a', Giant: '#e0a86a', Dwarf: '#c9a3e0' };

/** A sailor's face on a tile: the game's portrait for their type when
 *  the mapping has it, the initials of their name otherwise. */
const face = (t, s) => t && iconSrc(t.type) !== 'icon.png'
	? `<img class="sailor-face" src="${esc(iconSrc(t.type))}" alt="${esc(initials(s.name))}">`
	: esc(initials(s.name));

/**
 * The hull the crew is planned for: the one chosen here, else the
 * largest crewed ship in the queue, else the first ship anyone sails.
 */
export const crewShip = shipName;

const roster = () => store.getProfile('roster', []) || [];
// Seats kept to the hull: an arrangement saved for a different shape
// leaves nobody at a seat this hull does not have.
const seatsOf = ship => fitSeats(ship, (store.getProfile('seats', {}) || {})[ship] || {}, shipStats[ship]);
const presetsOf = ship => (store.getProfile('presets', {}) || {})[ship] || {};
const byId = id => roster().find(s => s.id === id) || null;
const whereIs = (ship, id) => Object.keys(seatsOf(ship)).find(k => seatsOf(ship)[k] === id) || null;
const condColor = c => c >= 80 ? 'var(--teal)' : c >= 50 ? 'var(--amber)' : 'var(--red)';
const initials = name => name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/* ------------------------------------------------------------------ *
 * pieces
 * ------------------------------------------------------------------ */

// Where each seat sits on the board, in a 900-wide box: `cx` is the
// middle of the label plate, `w` its width. These mirror the in-game
// panel -- the mate at the bow, sails on the mast, the wheel aft, the
// deck and the cannon amidships, the mess at the stern. Seats hang
// centred under their plate, so a hull with two sails or three cannons
// widens the group about the same point instead of drifting off it.
const SPOT = {
	firstmate: { cx: 99, y: 58, w: 158 },
	sail: { cx: 511, y: 44, w: 118 },
	wheel: { cx: 746, y: 120, w: 148 },
	deck: { cx: 454, y: 214, w: 152 },
	mess: { cx: 762, y: 258, w: 112 },
	cannon: { cx: 454, y: 330, w: 152 },
	fish: { cx: 152, y: 330, w: 112 }
};
const cq = px => `${(px / 900 * 100).toFixed(2)}cqw`;

const dbl = v => Math.round(v * 20) / 10;

/** What this seat would do with THIS sailor's own numbers. */
function seatPitch(pos, s) {
	const t = anyType[s.type];
	if (!t) return '';
	const f = k => statOf(s, k);
	if (pos === 'sail') return T('doubles their Endurance and Wits: speed +{speed}% becomes +{speed2}%, accel +{accel}% becomes +{accel2}%', { speed: f('speed'), speed2: dbl(f('speed')), accel: f('accel'), accel2: dbl(f('accel')) });
	if (pos === 'wheel') return T('doubles their Awareness and Strength: turn +{turn}% becomes +{turn2}%, brake +{brake}% becomes +{brake2}%', { turn: f('turn'), turn2: dbl(f('turn')), brake: f('brake'), brake2: dbl(f('brake')) });
	if (pos === 'cannon') {
		return t.force !== undefined
			? T('doubles their gunnery: force +{force}%, focus +{focus}%, vision +{vision}%', { force: dbl(f('force')), focus: dbl(f('focus')), vision: dbl(f('vision')) })
			: T('doubles Force, Focus and Vision — this type grows none of them');
	}
	if (pos === 'deck') return T('+{n} durability — their {cabins} cabins at 10,000 each', { n: F((t.cabin || 0) * 10000), cabins: t.cabin || 0 });
	if (pos === 'mess') return T('+{n} rations — their {cabins} cabins at 5,000 each', { n: F((t.cabin || 0) * 5000), cabins: t.cabin || 0 });
	if (pos === 'fish') return T('auto-fishing, once an Oceanbound Otter Fishing Rod is aboard');
	if (pos === 'firstmate') return t.mate ? T('switches on their skill: {skill}', { skill: t.skill }) : T('the seat switches on a named mate\'s skill — this sailor has none');
	if (pos === 'cabin') return T('no role — they still eat, weigh and level along');
	return '';
}

function seatBox(ship, seat, armed) {
	const id = seatsOf(ship)[seat.key];
	const s = id ? byId(id) : null;
	const t = s && anyType[s.type];
	const held = armed ? byId(selId) : null;
	const cls = ['seat', s ? 'taken' : 'empty', armed && !s ? 'armed' : '', s && s.id === selId ? 'picked' : ''].join(' ');
	const title = s
		? T('{name} · {type} · Lv {lv} — {what}', { name: s.name, type: gameName(s.type), lv: s.lv, what: seatPitch(seat.pos, s) || said(seat.effect) })
		: held
			? T('{seat}, for {name}: {what}', { seat: said(seat.label), name: held.name, what: seatPitch(seat.pos, held) || said(seat.effect) })
			: T('{seat}: empty seat — {effect}', { seat: said(seat.label), effect: said(seat.effect) });
	return `<button class="${cls}" data-act="crew-seat" data-seat="${esc(seat.key)}" data-tip="${esc(title)}" aria-label="${esc(title)}">
		${s ? `<span class="seat-mono" style="background:${RACE[(t && t.race) || 'Human']}">${face(t, s)}</span>
			<span class="seat-lv">${s.lv}</span>
			<span class="seat-cond"><i style="width:${s.cond}%;background:${condColor(s.cond)}"></i></span>` : '<span class="seat-plus">+</span>'}
	</button>`;
}

function board(ship, stats, totals) {
	const seats = seatsFor(ship, stats);
	const armed = Boolean(selId && byId(selId));
	const groups = new Map();
	for (const seat of seats) {
		if (!groups.has(seat.pos)) groups.set(seat.pos, { label: seat.label, effect: seat.effect, seats: [] });
		groups.get(seat.pos).seats.push(seat);
	}
	const placed = [...groups].filter(([pos]) => SPOT[pos]).map(([pos, g]) => {
		const sp = SPOT[pos];
		return `<div class="seat-bar" style="left:${cq(sp.cx)};top:${cq(sp.y - 28)};width:${cq(sp.w)}" title="${esc(said(g.effect))}">${esc(said(g.label))}</div>
			<div class="seat-wrap" style="left:${cq(sp.cx)};top:${cq(sp.y)}">${g.seats.map(seat => seatBox(ship, seat, armed)).join('')}</div>`;
	}).join('');
	const cabins = groups.get('cabin');
	const cabinRow = cabins ? `<div class="cabin-row">
			<div class="seat-bar static" title="${esc(said(cabins.effect))}">${T('Cabin')}</div>
			<div class="cabin-seats">${cabins.seats.map(seat => seatBox(ship, seat, armed)).join('')}</div>
			<div class="cabin-note">${T('cabin seats have no role — they still eat, weigh, and level along')}</div>
		</div>` : '';
	const sel = selId && byId(selId);
	const hint = sel ? T('placing {name} — tap a seat', { name: sel.name }) : T('tap a sailor below, then a seat');
	// The same seats as a list, for a screen too narrow for the drawing.
	const seatList = [...groups].map(([pos, g]) => `<div class="seat-list-group">
		<div class="seat-bar static" title="${esc(said(g.effect))}">${esc(said(g.label))}</div>
		<div class="seat-list-seats">${g.seats.map(seat => {
			const id = seatsOf(ship)[seat.key];
			const s = id ? byId(id) : null;
			const held = armed ? byId(selId) : null;
			const lineTitle = s ? seatPitch(seat.pos, s) : held ? T('for {name}: {what}', { name: held.name, what: seatPitch(seat.pos, held) }) : said(seat.effect);
			return `<button class="seat-line${s ? ' taken' : ''}${armed && !s ? ' armed' : ''}${s && s.id === selId ? ' picked' : ''}" data-act="crew-seat" data-seat="${esc(seat.key)}" data-tip="${esc(lineTitle || said(seat.effect))}">
				${seatBox(ship, seat, armed).replace(/<button[^>]*>|<\/button>$/g, '')}
				<span class="seat-line-text">${s ? `${esc(s.name)} <small>${T('{type} · Lv {lv}', { type: esc(gameName(s.type)), lv: s.lv })}</small>` : `<small>${T('empty — {effect}', { effect: esc(said(seat.effect)) })}</small>`}</span>
			</button>`;
		}).join('')}</div>
	</div>`).join('');
	return `<div class="panel crew-panel">
		<div class="panel-head crew-head">
			<h2 class="panel-title teal">${T('Manage sailors')}</h2>
			<span class="panel-sub">${esc(hint)}</span>
			<span class="panel-spacer"></span>
			<button class="act quiet small" data-act="crew-auto" ${roster().length ? '' : 'disabled'}>${T('Auto assign')}</button>
			<button class="act quiet small" data-act="crew-disembark-all" ${totals.seated ? '' : 'disabled'}>${T('Disembark all')}</button>
		</div>
		<div class="crew-board">
			<div class="crew-counter">${T('{cabins}/{space} cabin space · {seated}/{seats} seated', { cabins: F(totals.cabins), space: F(totals.space), seated: totals.seated, seats: totals.seats })}</div>
			<svg viewBox="0 0 900 470" class="crew-hull" aria-hidden="true">
				<g fill="none" stroke="rgba(120,200,220,.5)" stroke-width="1.6" stroke-linecap="round">
					<path d="M 60 300 Q 100 386 220 398 L 690 398 Q 810 388 848 296 L 866 240 L 812 258 L 800 300"/>
					<path d="M 60 300 L 34 232 L 96 252 L 108 298"/>
					<path d="M 108 320 L 802 320" stroke-dasharray="3 7" opacity=".7"/>
					<path d="M 250 316 L 250 78 M 210 112 L 290 112 M 196 176 L 304 176"/>
					<path d="M 210 112 Q 250 168 290 112" opacity=".8"/><path d="M 196 176 Q 250 244 304 176" opacity=".8"/>
					<path d="M 470 316 L 470 44 M 420 84 L 520 84 M 404 152 L 536 152"/>
					<path d="M 420 84 Q 470 148 520 84" opacity=".8"/><path d="M 404 152 Q 470 232 536 152" opacity=".8"/>
					<path d="M 672 316 L 672 96 M 636 128 L 708 128"/><path d="M 636 128 Q 672 180 708 128" opacity=".8"/>
					<path d="M 250 78 L 470 44 L 672 96" stroke-dasharray="2 6" opacity=".6"/>
					<circle cx="806" cy="286" r="14" opacity=".9"/>
					<path d="M 806 272 L 806 300 M 792 286 L 820 286 M 796 276 L 816 296 M 796 296 L 816 276" opacity=".7"/>
				</g>
			</svg>
			${placed}
		</div>
		${cabinRow}
		<div class="seat-list">${seatList}</div>
	</div>`;
}

function statCards(ship, stats, totals) {
	const card = (k, v, sub, cls = '') => `<div class="stat"><div class="stat-k">${k}</div><div class="stat-v ${cls}">${v}</div><div class="stat-sub">${sub}</div></div>`;
	const pct = n => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
	const cannon = totals.force || totals.focus || totals.vision
		? card(T('Cannon'), `${totals.force.toFixed(1)} / ${totals.focus.toFixed(1)} / ${totals.vision.toFixed(1)}`, T('force / focus / vision, doubled at the cannon'), 'teal') : '';
	return `<div class="stats crew-stats">
		${card(T('Seated'), `${totals.seated} / ${totals.seats}`, totals.overSpace ? T('{cabins} of {space} cabin space — {over} over', { cabins: F(totals.cabins), space: F(totals.space), over: F(totals.overSpace) }) : T('{cabins} of {space} cabin space', { cabins: F(totals.cabins), space: F(totals.space) }), totals.overSpace ? 'amber' : '')}
		${card(T('Speed from crew'), pct(totals.speed), T('sail seats count double'), totals.speed ? 'teal' : '')}
		${card(T('Accel from crew'), pct(totals.accel), T('hull {accel}% before crew', { accel: stats.accel }), totals.accel ? 'teal' : '')}
		${card(T('Turn / brake from crew'), `${pct(totals.turn)} / ${pct(totals.brake)}`, T('the wheel counts double'), totals.turn || totals.brake ? 'teal' : '')}
		${card(T('Durability from crew'), `+${F(totals.durability)}`, T('the Deck: 10,000 per cabin the sailor costs'), totals.durability ? 'amber' : '')}
		${card(T('Rations from crew'), `+${F(totals.rations)}`, T('the Mess: 5,000 per cabin · crew eats {n}/day', { n: F(totals.appetite) }), totals.rations ? 'amber' : '')}
		${card(T('Weight of crew'), `+${F(totals.weight)} LT`, totals.sick ? T('{n} hired · {cap} at most · {sick} sick', { n: roster().length, cap: SAILOR_CAP, sick: totals.sick }) : T('{n} hired · {cap} at most', { n: roster().length, cap: SAILOR_CAP }))}
		${cannon}
	</div>`;
}

function rosterPanel(ship) {
	const list = [...roster()].sort((a, b) => {
		if (sort === 'type') return a.type.localeCompare(b.type) || b.lv - a.lv;
		if (sort === 'cond') return b.cond - a.cond;
		const sum = s => statOf(s, 'speed') + statOf(s, 'accel') + statOf(s, 'turn') + statOf(s, 'brake');
		return sum(b) - sum(a);
	});
	const cards = list.map(s => {
		const t = anyType[s.type] || {};
		const where = whereIs(ship, s.id);
		const seatName = where ? seatsFor(ship, shipStats[ship]).find(x => x.key === where) : null;
		const ticked = checked.has(s.id);
		return `<div class="roster-card ${s.id === selId ? 'picked' : ''} ${where ? 'seated' : ''}${ticked ? ' ticked' : ''}">
			<button class="roster-check${ticked ? ' on' : ''}" data-act="crew-check" data-id="${esc(s.id)}" aria-pressed="${ticked}" title="${T('Tick to act on several at once')}">${ticked ? '✓' : ''}</button>
			<button class="roster-hit" data-act="crew-select" data-id="${esc(s.id)}" aria-label="${T('Select {name}', { name: esc(s.name) })}"></button>
			<span class="roster-tile" style="background:${RACE[t.race] || '#8fb4d6'}">${face(t, s)}<i class="roster-cond" style="width:${s.cond}%;background:${condColor(s.cond)}"></i></span>
			<span class="roster-main">
				<span class="roster-name">${esc(s.name)} <span class="crew-race" style="color:${RACE[t.race] || 'inherit'}">${esc(t.race || '')}</span></span>
				<span class="roster-sub">${t.mate ? T('{type} · Lv {lv} · first mate', { type: esc(gameName(s.type)), lv: s.lv }) : T('{type} · Lv {lv}', { type: esc(gameName(s.type)), lv: s.lv })}</span>
				<span class="roster-pos ${where ? 'on' : ''}">${where ? `⚓ ${esc(seatName ? said(seatName.label) : where)}` : T('(idle)')}</span>
			</span>
		</div>`;
	}).join('');
	const nTicked = [...checked].filter(id => byId(id)).length;
	const bulk = nTicked ? `<div class="crew-bulk">
		<span>${T('<b>{n}</b> ticked', { n: nTicked })}</span>
		<button class="act quiet small" data-act="crew-bulk" data-op="recover">${T('Recover')}</button>
		<button class="act quiet small" data-act="crew-bulk" data-op="disembark">${T('Disembark')}</button>
		<button class="act quiet small danger" data-act="crew-bulk" data-op="dismiss">${T('Dismiss')}</button>
		<span class="panel-spacer"></span>
		<button class="act quiet small" data-act="crew-bulk" data-op="all">${T('Tick all')}</button>
		<button class="act quiet small" data-act="crew-bulk" data-op="clear">${T('Untick')}</button>
	</div>` : '';
	const tabs = [['stats', T('By stats')], ['type', T('By type')], ['cond', T('By condition')]].map(([id, label]) =>
		`<button class="chip ${sort === id ? 'active' : ''}" data-act="crew-sort" data-id="${id}">${label}</button>`).join('');
	const n = roster().length;
	return `<div class="panel crew-panel">
		<div class="panel-head crew-head">
			<h2 class="panel-title">${T('Sailor list')}</h2>
			<span class="panel-sub">${T('{n} hired · the account holds {cap} at most', { n, cap: SAILOR_CAP })}</span>
			<span class="panel-spacer"></span>
			<div class="chips">${tabs}</div>
			<button class="act quiet small" data-act="crew-recover-all" ${n ? '' : 'disabled'} title="${T('Marks every sailor\'s condition back at 100')}">${T('Recover all')}</button>
			<button class="act small" data-act="crew-hire" ${n >= SAILOR_CAP ? 'disabled' : ''}>${T('+ Hire')}</button>
		</div>
		<p class="crew-note">${esc(said(SAILOR_NOTE[roleOf(ship) && roleOf(ship).role === 'bartering' ? 'barter' : 'hunt']))}</p>
		${bulk}${n ? `<div class="roster-grid">${cards}</div>` : `<p class="empty">${T('Nobody hired yet. A sailor costs a {item} ({silver} silver) at {where}.', { item: esc(gameName(contract.item)), silver: F(contract.silver), where: esc(said(contract.hireAt)) })}</p>`}
		${n ? `<div class="crew-actions"><button class="act quiet small" data-act="crew-queue" title="${T('Queues one certificate per sailor, so the silver shows in To Get')}">${n === 1 ? T('Put {n} {item} on the list', { n, item: esc(gameName(contract.item)) }) : T('Put {n} {item}s on the list', { n, item: esc(gameName(contract.item)) })}</button></div>` : ''}
	</div>`;
}

function selectedPanel(ship) {
	const s = selId && byId(selId);
	if (!s) {
		return `<div class="panel crew-panel crew-sel"><div class="panel-head"><h2 class="panel-title">${T('Selected sailor')}</h2></div>
			<p class="empty crew-nosel">${T('No sailor selected.<br>Pick one from the list, then tap a seat on the ship.')}</p></div>`;
	}
	return `<div class="panel crew-panel crew-sel">
		<div class="panel-head"><h2 class="panel-title">${T('Selected sailor')}</h2><span class="panel-spacer"></span>
			<button class="sq-btn" data-act="crew-clear-sel" title="${T('Put down')}">×</button></div>
		${sailorSheet(s, { ship, where: whereIs(ship, s.id), readOnly: looking })}
	</div>`;
}

/**
 * One sailor, in full: the portrait, the level, the condition, the
 * growths judged against the level's band, what a seat does with them.
 * The Selected sailor panel is this with fields to type into; a look
 * at another sailor's crew is the same sheet read-only.
 */
function sailorSheet(s, { ship, where = null, readOnly = false } = {}) {
	const t = anyType[s.type] || {};
	const seat = where && shipStats[ship] ? seatsFor(ship, shipStats[ship]).find(x => x.key === where) : null;
	const own = s.stats || {};
	const bar = (k, key, max) => {
		const v = statOf(s, key);
		const typed = Number.isFinite(own[key]);
		const band = statBand(s.type, key, s.lv);
		// A typed roll is judged against every roll the level could have
		// made: the share of them it beats, where the type's rolls are
		// known level by level; the band's ends and middle where not.
		const rank = typed && band ? rollRank(s.type, key, s.lv, v) : null;
		const word = rank
			? (v >= band.max ? T('top roll') : v <= band.min ? T('floor roll') : v > band.max ? T('past the top') : T('beats {pct}%', { pct: Math.round(rank.below * 100) }))
			: typed && band
				? (v >= band.max - 0.05 ? T('top roll') : v <= band.min + 0.05 ? T('floor roll') : v >= band.avg ? T('above average') : T('below average'))
				: '';
		const title = typed
			? rank
				? T('As you typed it — better than {pct}% of {type} rolls at Lv {lv} ({min}–{max}; most land on {mode}; {paths} roll paths). Clear to go back to the estimate', { pct: Math.round(rank.below * 100), type: esc(gameName(s.type)), lv: s.lv, min: band.min, max: band.max, mode: rank.mode, paths: F(rank.paths) })
				: word ? T('As you typed it — {word} for Lv {lv}. Clear to go back to the estimate', { word, lv: s.lv })
					: T('As you typed it. Clear to go back to the estimate')
			: band ? T('Estimate at Lv {lv}: {min}–{max}, usually {avg}. Type what the sailor window shows', { lv: s.lv, min: band.min, max: band.max, avg: band.avg })
				: T('Type what the sailor window shows');
		// The window's word, with what it moves beside it in small type.
		const name = STAT_NAMES[key] || { game: k, means: '', tip: '' };
		return `<div class="sel-stat${typed ? ' typed' : ''}"><span><span data-tip="${esc(said(name.tip))}">${esc(said(name.game))}${name.means ? ` <small class="stat-means">${esc(said(name.means))}</small>` : ''}</span>${word ? `<em class="roll-note ${v >= band.avg ? 'good' : 'low'}">${word}</em>` : ''}<b>+${readOnly ? `<span class="stat-in still" title="${title}">${v}</span>` : `<input class="purse-inline narrow stat-in" type="text" inputmode="decimal" value="${v}"
			data-act="crew-stat" data-id="${esc(s.id)}" data-key="${key}" aria-label="${T('{stat}, as the sailor window shows it', { stat: esc(said(name.game)) })}" title="${title}">`}%</b></span><i><b style="width:${Math.min(100, v / max * 100)}%"></b></i></div>`;
	};
	const stats = [bar('Speed', 'speed', 5), bar('Accel', 'accel', 8), bar('Turn', 'turn', 10), bar('Brake', 'brake', 10)];
	// The cannon growths, as the window lists them: Patience has no
	// estimate -- no type's rolls for it are known -- so it shows only
	// when typed, or as a blank to type into.
	if (t.force !== undefined) stats.push(bar('Patience', 'patience', 10), bar('Force', 'force', 6), bar('Focus', 'focus', 14), bar('Vision', 'vision', 50));
	return `<div class="sel-top">
			<span class="roster-tile big" style="background:${RACE[t.race] || '#8fb4d6'}">${face(t, s)}</span>
			<div>
				${readOnly ? `<div class="sel-name still">${esc(s.name)}</div>` : `<input class="field sel-name" value="${esc(s.name)}" data-act="crew-name" data-id="${esc(s.id)}" aria-label="${T('Name')}" maxlength="30">`}
				<div class="roster-sub">${esc(gameName(s.type))} · <span style="color:${RACE[t.race] || 'inherit'}">${esc(t.race || '')}</span> · ${T('Lv')}
					${readOnly ? `<b>${s.lv}</b>` : `<input class="purse-inline narrow" type="text" inputmode="numeric" value="${s.lv}" data-act="crew-lv" data-id="${esc(s.id)}" aria-label="${T('Level')}">`}</div>
				<div class="roster-pos ${where ? 'on' : ''}">${where ? T('⚓ seated at the {seat}', { seat: esc(seat ? said(seat.label) : where) }) : readOnly ? T('(idle)') : T('(idle) — tap a seat on the ship to place')}</div>
			</div>
		</div>
		<div class="sel-cond"><span><span>${T('Condition')}</span><b style="color:${condColor(s.cond)}">${readOnly ? s.cond : `<input class="purse-inline narrow" type="text" inputmode="numeric" value="${s.cond}" data-act="crew-cond" data-id="${esc(s.id)}" aria-label="${T('Condition')}">`}%</b></span>
			<i><b style="width:${s.cond}%;background:${condColor(s.cond)}"></b></i></div>
		<div class="sel-stats">${stats.join('')}</div>
		<div class="sel-note">${readOnly ? T('Each level-up rolls inside a hidden range, so a growth not typed in is an estimate; a typed one is judged against the level’s band.') : T('Each level-up rolls inside a hidden range, so these are estimates — type what the sailor window shows and they outrank it, judged against the level\'s band.')}</div>
		<div class="sel-facts">${T('cabins <b>{cabins}</b> · eats <b>{appetite}</b>/day · weight <b>+{weight} LT</b>', { cabins: t.cabin ?? '—', appetite: t.appetite ?? '—', weight: t.weight ?? 0 })}</div>
		${levelLogHTML(s)}
		${t.mate
		? `<div class="sel-facts sel-seats" data-tip="${T('Seats double a sailor\'s matching growths; the First Mate seat is where a named mate\'s skill switches on.')}">${T('at the <b>First Mate</b> seat ★ their skill switches on')}</div>`
		: `<div class="sel-facts sel-seats" data-tip="${T('What each seat does with this sailor\'s own numbers — hover a seat on the ship for the same. Deck and Mess pay by cabin cost.')}">${t.force !== undefined
			? T('at a seat: Sail <b>+{spd}%</b> spd · Wheel <b>+{turn}%</b> turn · Cannon <b>+{focus}%</b> focus · Deck <b>+{dura}</b> dura · Mess <b>+{rations}</b> rations', { spd: dbl(statOf(s, 'speed')), turn: dbl(statOf(s, 'turn')), focus: dbl(statOf(s, 'focus')), dura: F((t.cabin || 0) * 10000), rations: F((t.cabin || 0) * 5000) })
			: T('at a seat: Sail <b>+{spd}%</b> spd · Wheel <b>+{turn}%</b> turn · Deck <b>+{dura}</b> dura · Mess <b>+{rations}</b> rations', { spd: dbl(statOf(s, 'speed')), turn: dbl(statOf(s, 'turn')), dura: F((t.cabin || 0) * 10000), rations: F((t.cabin || 0) * 5000) })}</div>`}
		${t.skill ? `<div class="sel-skill">★ ${esc(t.skill)}</div>` : t.note ? `<div class="sel-skill quiet">${esc(said(t.note))}</div>` : ''}
		${readOnly ? '' : `<div class="crew-actions">
			${where ? `<button class="act quiet small danger" data-act="crew-disembark" data-id="${esc(s.id)}">${T('Disembark')}</button>` : ''}
			<button class="act quiet small" data-act="crew-recover" data-id="${esc(s.id)}" ${s.cond >= 100 ? 'disabled' : ''}>${T('Recover')}</button>
			<button class="act quiet small" data-act="crew-dismiss" data-id="${esc(s.id)}" title="${T('Strike this sailor off the roster')}">${T('Dismiss')}</button>
		</div>`}`;
}

/** The sailor's levels as they were typed in, newest first: "levelled
 *  3 → 4 on 2 Sep". Only the last few are shown; the rest are kept. */
function levelLogHTML(s) {
	const steps = levelSteps(s);
	if (!steps.length) return '';
	const when = t => {
		const d = new Date(t);
		return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
	};
	const rows = steps.slice(0, 5).map(st => `<div class="sel-log-row">${st.from !== null
		? (when(st.t) ? T('levelled {from} → <b>{to}</b> on {when}', { from: st.from, to: st.to, when: esc(when(st.t)) }) : T('levelled {from} → <b>{to}</b>', { from: st.from, to: st.to }))
		: (when(st.t) ? T('levelled <b>{to}</b> on {when}', { to: st.to, when: esc(when(st.t)) }) : T('levelled <b>{to}</b>', { to: st.to }))}${st.stats ? `<span class="sel-log-stats" title="${T('The stats as typed at the time')}">${esc(STAT_KEYS.filter(k => Number.isFinite(st.stats[k])).map(k => `${said((STAT_NAMES[k] || { game: k }).game)} ${st.stats[k]}`).join(' · '))}</span>` : ''}</div>`).join('');
	return `<details class="sel-log"${steps.length <= 2 ? ' open' : ''}><summary class="sel-facts">${steps.length === 1 ? T('levelled {n} time on this roster', { n: steps.length }) : T('levelled {n} times on this roster', { n: steps.length })}</summary>${rows}${steps.length > 5 ? `<div class="sel-log-row quiet">${T('and {n} more, kept', { n: steps.length - 5 })}</div>` : ''}</details>`;
}

function presetsPanel(ship) {
	const p = presetsOf(ship);
	const slot = (k, label) => {
		const has = Boolean(p[k]);
		return `<button class="preset ${has ? 'has' : ''}" data-act="crew-preset-apply" data-p="${k}" ${has ? '' : 'disabled'}>${label}
			<span class="preset-sub">${has ? T('{n} seated · tap to apply', { n: Object.keys(p[k]).length }) : T('empty — save the current crew')}</span></button>`;
	};
	return `<div class="panel crew-panel">
		<div class="panel-head"><h2 class="panel-title">${T('Presets')}</h2><span class="panel-spacer"></span>
			<button class="act quiet small" data-act="crew-preset-save" data-p="p1">${T('Save 1')}</button>
			<button class="act quiet small" data-act="crew-preset-save" data-p="p2">${T('Save 2')}</button></div>
		<div class="preset-row">${slot('p1', T('Preset 1'))}${slot('p2', T('Preset 2'))}</div>
	</div>`;
}

function guidePanels() {
	// Reference, but drawn like the rest of the yard: each remedy under
	// its own icon, the grades wearing their colours, the shares as
	// meters, and the three named mates with their faces on.
	const careRows = care.map(c => `<div class="guide-row">
		${img(c.item, 'guide-icon')}
		<div class="guide-main">
			<div class="guide-name">${codexName(c.item)} <span class="guide-effect">${esc(said(c.effect))}</span></div>
			<div class="guide-sub">${esc(said(c.from))}</div>
		</div>
	</div>`).join('');
	const rationChips = rations.map(r => `<span class="ration-chip g-${r.grade.toLowerCase()}"><i></i>${esc(r.grade)} · <b>${F(r.restores)}</b></span>`).join('');
	const expRows = expSplit.map(e => `<div class="exp-row">
		<span class="exp-aboard">${e.aboard}${e.note ? '+' : ''}<small>${T('aboard')}</small></span>
		<span class="exp-bar"><i style="width:${e.total / 4}%"></i></span>
		<span class="exp-fig">${e.each === null ? T('<b>{total}%</b> in all', { total: e.total }) : T('{each}% each · <b>{total}%</b> in all', { each: e.each, total: e.total })}</span>
	</div>`).join('');
	const slotRows = slotSources.map(s => `<div class="guide-row">
		<span class="slot-badge">+${s.oaths}</span>
		<div class="guide-main">
			<div class="guide-name">${s.oaths > 1 ? T('{n} more slots', { n: s.oaths }) : T('{n} more slot', { n: s.oaths })}</div>
			<div class="guide-sub">${esc(said(s.from))}</div>
		</div>
	</div>`).join('');
	const mateCards = firstMates.map(m => {
		const t = anyType[m.name];
		return `<div class="mate-card">
			<span class="roster-tile big" style="background:${RACE[(t && t.race) || 'Human']}">${face(t, { name: m.name })}</span>
			<div class="guide-main">
				<div class="guide-name">${esc(gameName(m.name))}</div>
				<div class="mate-trait">${esc(said(m.trait))}</div>
				<div class="guide-sub">${esc(said(m.from))}</div>
			</div>
		</div>`;
	}).join('');
	return `<div class="crew-two">
		<div class="panel crew-panel"><div class="panel-head"><h2 class="panel-title">${T('Keeping them well')}</h2>
			<span class="panel-sub">${T('Condition falls as they work; at zero a sailor is sick and does nothing until cured')}</span></div>
			<div class="guide-list">${careRows}
				<div class="ration-row"><span class="guide-sub">${T('Any food thrown to the crew is rations, by its grade')}</span>
					<span class="ration-chips">${rationChips}</span></div>
			</div></div>
		<div class="panel crew-panel"><div class="panel-head"><h2 class="panel-title">${T('Levelling &amp; slots')}</h2>
			<span class="panel-sub">${T('Experience is shared out: each gets less, the crew gets more')}</span></div>
			<div class="guide-list">${expRows}<div class="guide-row">
				<span class="slot-badge">1</span>
				<div class="guide-main">
					<div class="guide-name">${T('to start with')}</div>
					<div class="guide-sub">${T('every account begins with one slot — the three below make it ten, free')}</div>
				</div>
			</div>${slotRows}</div></div>
	</div>
	<div class="panel crew-panel"><div class="panel-head"><h2 class="panel-title">${T('First mates')}</h2>
		<span class="panel-sub">${T('Three sailors with names; the First Mate seat switches their trait on')}</span></div>
		<div class="mate-cards">${mateCards}</div></div>
	<div class="panel crew-panel"><div class="panel-head"><h2 class="panel-title">${T('Crew templates')}</h2>
		<span class="panel-sub">${T('The sailing community\'s builds — who to hire, and where they sit')}</span></div>
		<div class="mate-cards tmpl-cards">${TEMPLATES.map(t => `<div class="mate-card tmpl">
			<div class="guide-main">
				<div class="guide-name">${said(t.name)} <span class="tmpl-tag">${said(t.tag)}</span></div>
				${t.lines.map(l => `<div class="guide-sub">· ${said(l)}</div>`).join('')}
			</div>
		</div>`).join('')}</div>
		<div class="guide-list tmpl-foot"><div class="guide-sub">${T('Any sailor in the Fish seat fishes — Crio trades an Oceanbound Otter Fishing Rod for 200 Crow Coin Coupons, as often as you like.')}</div></div></div>`;
}

/** The community's crew builds, as passed around the sailors' Discord. */
const TEMPLATES = [
	{ name: TT('Bartering'), tag: TT('free · 10 sailors'), lines: [
		TT('Cleia at the First Mate seat, if she is yours — no other mate registered.'),
		TT('9–10 Innocents; the highest Endurance take the Sail seats.')
	] },
	{ name: TT('PvX'), tag: TT('free · 10 sailors'), lines: [
		TT('No first mate registered at all.'),
		TT('1–2 Innocents at the Sail; 1–3 Realistics at the Cannon, up to 9 in all.'),
		TT('The highest-Awareness Realistic takes the Wheel; the rest fill Deck, Mess and cabins.'),
		TT('Swap Realistics for Innocents for speed, at the cost of turn.')
	] },
	{ name: TT('Bartering'), tag: TT('12–16 sailors'), lines: [
		TT('Cleia — or Proix — at the First Mate seat.'),
		TT('11 Innocents on a Carrack, 15 on a Panokseon; the fastest at the Sail.')
	] },
	{ name: TT('PvX'), tag: TT('14–31 sailors'), lines: [
		TT('Tranan for grinding, Proix for the Breezy Sail, at the First Mate seat.'),
		TT('0–2 Innocents at the Sail; up to 3 Realistics at the Cannon — the angle caps at 45°, five to seven are enough.'),
		TT('Up to 22 Confidents on a Carrack, 30 on a Panokseon; the best Awareness at the Wheel.')
	] }
];

/**
 * The hull as fitted: the best part you hold in each slot, and what the
 * four of them add to the hull's own numbers.
 */
const SLOT_GLYPH = { cannon: '⁂', sail: '⛵', figurehead: '❖', plating: '▣' };
const SLOT_LABEL = { cannon: TT('Cannon'), sail: TT('Sail'), figurehead: TT('Figurehead'), plating: TT('Black plating') };

/** One slot: what is on it, where that came from, and the ways to change it. */
function slotCard(ship, x, chosenByHand) {
	const tag = looking ? (x.part ? T('as they sail it') : T('nothing fitted'))
		: x.source === 'owned' ? T('from your inventory')
		: x.source === 'chosen' ? T('chosen · in your inventory')
		: x.source === 'chosen-unowned' ? T('chosen · not in your inventory')
		: chosenByHand ? T('left empty') : T('no part held yet');
	const item = x.part ? enhancedName(x.part, x.level) : null;
	return `<div class="slot-card${x.part ? '' : ' empty'}${x.source === 'chosen-unowned' && !looking ? ' unowned' : ''}">
		<div class="slot-head"><span class="slot-glyph" aria-hidden="true">${SLOT_GLYPH[x.slot]}</span><span class="slot-name">${said(SLOT_LABEL[x.slot])}</span>
			<span class="fit-tag${x.source === 'chosen-unowned' && !looking ? ' warn' : ''}">${tag}</span></div>
		<div class="slot-body">
			${x.part ? img(item, 'slot-icon') : '<span class="slot-icon blank">+</span>'}
			<div class="slot-text">
				<div class="slot-part">${x.part ? `${codexName(x.part)} <b>+${x.level}</b>` : T('Nothing fitted')}</div>
				<div class="slot-stats">${x.part ? esc(describeStats(x.stats, { signed: false })) : T('choose one to weigh it, or record one in the Inventory')}</div>
			</div>
		</div>
		<div class="slot-btns">
			<button class="act quiet small" data-act="crew-fit-pick" data-slot="${x.slot}">${x.part ? T('Change…') : T('Choose…')}</button>
			${x.source === 'chosen-unowned' ? `<button class="act small" data-act="crew-fit-add" data-item="${esc(item)}" title="${T('Record one in your inventory')}">${T('+ Add to inventory')}</button>` : ''}
			${chosenByHand ? `<button class="act quiet small" data-act="crew-fit-auto" data-slot="${x.slot}" title="${T('Back to the best part you hold')}">${T('Best I own')}</button>` : ''}
			${x.part ? `<button class="act quiet small" data-act="crew-fit-none" data-slot="${x.slot}" title="${T('Sail with this slot empty')}">${T('Empty')}</button>` : ''}
		</div>
	</div>`;
}

/** The fifth slot: one sea crystal, or the Nol, or nothing. */

/**
 * The appearance set, which is not only an appearance.
 *
 * Both sets in the game fill the four appearance slots and every slot
 * carries a stat -- so a Carrack wearing its overlay is three per cent
 * faster, holds six hundred more and takes a hundred thousand more
 * damage than the same Carrack without. The app priced hulls as if this
 * did not exist; now it is a row like the crystal, ticked per slot
 * because the slots are separate items even though the set is bought
 * whole.
 *
 * A hull with no set -- the Panokseon has none -- gets no card rather
 * than an empty one.
 */
function skinCard(ship) {
	const skin = skinFor(ship);
	if (!skin) return '';
	const worn = skinWorn(ship);
	const on = SKIN_SLOTS.filter(k => worn[k]);
	const t = skinTotals(ship);
	const bits = [];
	if (t.speed) bits.push(T('speed +{n}%', { n: t.speed }));
	if (t.turn) bits.push(T('turn +{n}%', { n: t.turn }));
	if (t.weight) bits.push(T('+{n} LT', { n: F(t.weight) }));
	if (t.durability) bits.push(T('+{n} durability', { n: F(t.durability) }));
	const slotLine = k => {
		const part = skin.parts[k];
		const val = Object.entries(part.stats)
			.map(([sk, v]) => sk === 'weight' ? T('+{n} LT', { n: F(v) }) : sk === 'durability' ? T('+{n} durability', { n: F(v) }) : T('{stat} +{n}%', { stat: sk, n: v })).join(', ');
		// A crafted slot says what it takes, since that is a shopping
		// list like any other; a pearl one has nothing to say here.
		const made = part.recipe
			? ` — ${Object.entries(part.recipe).map(([m, n]) => `${F(n)}× ${gameName(m)}`).join(', ')}`
			: '';
		return `<label class="skin-slot${worn[k] ? ' on' : ''}" title="${esc(gameName(part.name))}${esc(made)}">
			<input type="checkbox" data-act="crew-skin-slot" data-slot="${k}"${worn[k] ? ' checked' : ''}>
			<span class="skin-slot-name">${esc(k)}</span>
			<span class="skin-slot-val">${esc(val)}</span></label>`;
	};
	return `<div class="slot-card skin${on.length ? '' : ' empty'}">
		<div class="slot-head"><span class="slot-glyph" aria-hidden="true">✦</span><span class="slot-name">${T('Appearance set')}</span>
			<span class="fit-tag">${esc(gameName(skin.name))} · ${esc(said(skin.source))}${skin.pearls ? ` · ${T('{n} pearls', { n: F(skin.pearls) })}` : ''}${skin.where ? ` · ${esc(said(skin.where))}` : ''}</span></div>
		<div class="slot-body">
			<div class="slot-text">
				<div class="slot-part">${on.length ? T('{n} of 4 slots — {bits}', { n: on.length, bits: esc(bits.join(' · ')) }) : T('Not worn')}</div>
				<div class="slot-stats">${esc(said(skin.note || ''))}</div>
			</div>
		</div>
		<div class="skin-slots">${SKIN_SLOTS.map(slotLine).join('')}</div>
		<div class="slot-btns">
			<button class="act quiet small" data-act="crew-skin-all" data-on="1">${T('I have the set')}</button>
			${on.length ? `<button class="act quiet small" data-act="crew-skin-all" data-on="">${T('Take it off')}</button>` : ''}
		</div>
	</div>`;
}

function crystalCard(ship) {
	const c = crystalFor(ship);
	const grade = c && gradeById[c.grade];
	return `<div class="slot-card crystal${c ? '' : ' empty'}">
		<div class="slot-head"><span class="slot-glyph" aria-hidden="true">◆</span><span class="slot-name">${T('Sea crystal')}</span>
			<span class="fit-tag">${c ? esc(grade.label) + (grade.local ? ` · ${T('its own sea only')}` : ` · ${T('every sea')}`) : T('one slot, any grade')}</span></div>
		<div class="slot-body">
			${c ? img(c.name, 'slot-icon') : '<span class="slot-icon blank">◆</span>'}
			<div class="slot-text">
				<div class="slot-part">${c ? `${codexName(c.name)} <b style="color:${grade.colour}">${esc(crystalVariant(c))}</b>` : T('No crystal')}</div>
				<div class="slot-stats" title="${c ? esc(crystalLine(c)) : ''}">${c ? esc(crystalLine(c)) : T('Eltro to Rusalka, or the Nol — each one lifts one thing')}</div>
			</div>
		</div>
		<div class="slot-btns">
			<button class="act quiet small" data-act="crew-crystal-pick">${c ? T('Change…') : T('Choose…')}</button>
			${c ? `<button class="act quiet small" data-act="crew-crystal-none" title="${T('Sail without a crystal')}">${T('Take out')}</button>` : ''}
		</div>
	</div>`;
}

/**
 * The hold as a sum: every line that adds to it or takes from it, the
 * limit they make, and how far past that limit the hull will still
 * sail -- the way the speed line already reads, and the number a
 * route is planned against.
 */
function holdLines(me) {
	const h = me.hold;
	const line = l => `<span class="hold-line${l.lt < 0 ? ' minus' : ''}"><span>${esc(l.label)}</span><b>${l.lt < 0 ? '−' : '+'}${F(Math.abs(l.lt))}</b></span>`;
	const perLevel = [5, 6].map(lv => T('{n} of Lv{range}', { n: Math.floor(h.free / GOODS[lv].weight), range: lv === 5 ? '4–5' : '6–7' })).join(', ');
	return `<div class="hold-lines" title="${T('The hold, line by line. A ship sails past its limit up to {pct}% over, slower the further it is, and not at all beyond that.', { pct: Math.round((OVERLOAD - 1) * 100) })}">
		<span class="hold-lines-k">${T('Hold')}</span>
		${h.lines.map(line).join('')}
		<span class="hold-line total"><span>${T('free to load')}</span><b>${F(h.free)} LT</b></span>
		<span class="hold-line sub"><span>${T('overweight, sailing slower, up to')}</span><b>${F(h.max)} LT</b></span>
		<span class="hold-line sub"><span>${T('fits')}</span><b>${perLevel}</b></span>
	</div>`;
}

function loadoutPanel(ship) {
	const s = shipStats[ship];
	const stock = store.getAllStock();
	const fit = fittedFor(ship, stock);
	const chosen = (store.getProfile('fitted', {}) || {})[ship] || {};
	const rows = `<div class="slot-grid">${fit.slots.map(x => slotCard(ship, x, chosen[x.slot] !== undefined)).join('')}${crystalCard(ship)}${skinCard(ship)}</div>`;
	const me = currentShip();
	const same = me.name === ship;
	const hold = same ? me.hold : { limit: s.weight + (Number(fit.total.weight) || 0), crew: 0, free: s.weight + (Number(fit.total.weight) || 0) };
	return `<div class="panel crew-panel">
		<div class="panel-head"><h2 class="panel-title">${T('Fitted out')}</h2>
			<span class="panel-sub">${T('Hull: {weight} LT · {slots} slots · {cannons} · {durability} durability · {rations} rations', { weight: F(s.weight), slots: s.slots, cannons: s.cannons ? T('{n} cannons a side, {reload} s', { n: s.cannons, reload: s.reload }) : T('no cannons'), durability: F(s.durability), rations: F(s.rations) })}</span></div>
		<p class="fit-hint">${T('What the Map sails and the hold it carries follow this. The best part you hold goes in each slot by itself; choose another for one you have not recorded, or to weigh a plan.')}</p>
		${(() => {
		// The order the fleet says to buy the sets in. Only worth saying
		// on a hull the sets are made for, and only until the top of the
		// line is on it -- advice about what to do next is noise once
		// there is no next.
		const worn = new Set(Object.values(fit.slots).map(x => x.part && families[x.part]).filter(Boolean));
		if (!roleOf(ship) || worn.has('yellow')) return '';
		const next = PART_PATH.find(step => !worn.has(step.family));
		return next ? `<p class="fit-path">${esc(said(next.line))}</p>` : '';
	})()}
		${rows}
		<div class="sel-facts">${same && me.crew.seated ? T('with parts and crew:') : T('with parts:')} ${T('speed <b>{n}%</b>', { n: same ? me.speed.total : s.speed + (Number(fit.total.speed) || 0) })} · ${T('accel <b>{n}%</b>', { n: same ? me.accel : s.accel + (Number(fit.total.accel) || 0) })} · ${T('turn <b>{n}%</b>', { n: same ? me.turn : s.turn + (Number(fit.total.turn) || 0) })} · ${T('brake <b>{n}%</b>', { n: same ? me.brake : s.brake + (Number(fit.total.brake) || 0) })}
			· ${T('hold <b>{n} LT</b>', { n: F(hold.free) })}${hold.crew ? ` <span class="fit-tag">${T('({limit} less {crew} of crew)', { limit: F(hold.limit), crew: F(hold.crew) })}</span>` : ''} · ${T('<b>{n}</b> durability', { n: F(same ? me.durability : s.durability + (Number(fit.total.durability) || 0)) })}${fit.total.dp ? ` · ${T('DP <b>{n}</b>', { n: fit.total.dp })}` : ''}${fit.total.damage ? ` · ${T('cannon <b>{n}</b> × {hits}', { n: F(fit.total.damage), hits: fit.total.hits })}` : ''}</div>
		${same ? holdLines(me) : ''}
	</div>`;
}

/* ------------------------------------------------------------------ *
 * the screen
 * ------------------------------------------------------------------ */

/**
 * The saved setups, as something worth choosing between.
 *
 * They were chips: a name apiece, styled like the quest filters, tucked
 * under the ship card. But a setup is a whole ship -- a different hull,
 * different parts, a different crew -- and switching one changes what
 * every route on the Map is timed at. Naming them was not enough to
 * choose between them, because the thing you choose on is what they
 * *do*, and that was only visible one at a time by loading each.
 *
 * So each one is a card carrying its own numbers, the sailing one is
 * marked, and the differences from it are called out where they are
 * worth seeing -- which is the whole point of keeping more than one.
 */
/**
 * The fleet, on the screen: one line and a way in.
 *
 * Only the ship being sailed changes what anything else does -- the Map
 * times its routes at that hull's speed -- so that is the one worth a
 * permanent place. Every other setup lives behind "Your fleet", which
 * can search, filter and page through however many there are without
 * pushing the rest of this screen off the bottom. A list drawn inline
 * grows without limit; a door does not.
 */
function setupsRow() {
	// The fleet is the setups kept and the hulls the inventory holds: a
	// ship recorded in the hold is a ship you have, whether or not a
	// setup was ever named for it.
	const list = listFleet();
	if (!list.length) return '';
	const setups = list.filter(s => !s.owned).length;
	const active = activeSetupId();
	const now = list.find(s => s.id === active);
	const sum = now ? setupSummary(now) : null;
	const hulls = new Set(list.map(s => s.ship)).size;

	const sailing = now && sum
		? `<span class="fleet-now"><span class="setup-flag">⚓</span>${esc(now.name)}
			<span class="setup-fig">${T('speed <b>{n}%</b>', { n: sum.speed })}</span>
			<span class="setup-fig">${T('hold <b>{n} LT</b>', { n: F(sum.hold) })}</span>
			<span class="setup-fig">${T('fitted <b>{n}/{slots}</b>', { n: sum.fittedCount, slots: sum.slots })}</span>
			${sum.skinned ? `<span class="setup-fig">${T('skin <b>{n}/4</b>', { n: sum.skinned })}</span>` : ''}</span>`
		: `<span class="fleet-now none">${T('This hull is not one of your saved setups yet')}</span>`;

	const owned = list.length - setups;
	const ships = list.length === 1 ? T('One ship') : T('{n} ships', { n: list.length });
	const hullsText = hulls === 1 ? T('one hull') : T('{n} hulls', { n: hulls });
	const sub = owned
		? T('{ships} across {hulls} · {n} in your inventory without a setup', { ships, hulls: hullsText, n: owned })
		: T('{ships} across {hulls}', { ships, hulls: hullsText });

	return `<div class="panel setups-panel">
		<div class="panel-head"><h2 class="panel-title">${T('Fleet')}</h2>
			<span class="panel-sub">${sub}</span></div>
		<div class="fleet-bar">
			${sailing}
			<button class="act quiet small" data-act="crew-fleet">${list.length > 1 ? T('Your fleet ({n})…', { n: list.length }) : T('Your fleet…')}</button>
		</div>
	</div>`;
}

/** The picker of ships, for the Map: sail one without leaving the chart.
 *  The setups kept, and the hulls held with no setup on them. */
export function openSetupPicker(after) {
	const list = listFleet();
	const active = activeSetupId() || `${OWNED_PREFIX}${shipName()}`;
	openPicker({
		title: T('Sail which ship?'),
		hint: list.length ? T('The Map times routes at the speed of the ship sailed; the roster is shared.') : T('No ships yet — on the Ship tab, "Save as setup…" keeps the current hull with its parts, crystal and seating.'),
		items: list.map(s => ({ id: s.id, label: gameName(s.name), icon: img(s.ship, ''), sub: s.owned ? T('in your inventory') : gameName(s.ship), meta: s.id === active ? T('sailing now') : '' })),
		onPick: id => {
			const bare = hullOfRow(id);
			if (bare) {
				store.setProfile('crewShip', bare, T('Sailing the {ship}', { ship: gameName(bare) }));
				toast(T('Sailing the {ship}', { ship: gameName(bare) }));
				if (after) after();
				return;
			}
			if (loadSetup(id)) { toast(T('Sailing {name}', { name: (list.find(s => s.id === id) || {}).name })); if (after) after(); }
		}
	});
}

export function renderCrew() {
	const ship = crewShip();
	const stats = shipStats[ship];
	if (selId && !byId(selId)) selId = null;
	const totals = crewTotals(roster(), seatsOf(ship), stats);
	const me = currentShip();
	const fittedN = me.fit.slots.filter(x => x.part).length;
	const head = `<div class="panel crew-panel ship-card">
		<div class="ship-card-main">
			${img(ship, 'ship-card-icon')}
			<div class="ship-card-text">
				<div class="summary-k">${T('Your ship')}</div>
				<div class="crew-ship-name">${codexName(ship)}</div>
				<div class="row-sub">${esc(said(stats.note || ''))}</div>
				${(() => {
		// What the hull is for, beside what it is. The fleet's reading,
		// not the game's -- so it says so, and it is a note rather than
		// anything the app acts on.
		const r = roleOf(ship);
		if (!r) return '';
		return `<div class="ship-role"><b>${T('for {role}', { role: esc(r.role) })}</b> — ${esc(said(r.why))}${r.note ? `<small>${esc(said(r.note))}</small>` : ''}</div>`;
	})()}
			</div>
		</div>
		<div class="ship-card-facts">
			<div><div class="summary-k">${T('Speed')}</div><div class="summary-v">${me.speed.total}%</div><div class="summary-sub">${T('hull {n}', { n: stats.speed })}${me.speed.parts ? ` + ${T('parts {n}', { n: me.speed.parts })}` : ''}${me.speed.crystal ? ` + ${T('crystal {n}', { n: me.speed.crystal })}` : ''}${me.speed.crew ? ` + ${T('crew {n}', { n: me.speed.crew })}` : ''}${me.mastery ? ` + ${T('mastery {n}', { n: me.mastery })}` : ''}${me.speed.skin ? ` + ${T('skin {n}', { n: me.speed.skin })}` : ''}</div></div>
			<div><div class="summary-k">${T('Hold')}</div><div class="summary-v">${F(me.hold.limit)} LT</div><div class="summary-sub">${T('the limit, as fitted')}${me.hold.crew ? ` · ${T('{n} of it crew', { n: F(me.hold.crew) })}` : ''} · ${T('barters to {n}', { n: F(me.hold.deal + me.hold.crew) })}</div></div>
			<div><div class="summary-k">${T('Fitted')}</div><div class="summary-v">${T('{n} of 5', { n: fittedN + (me.crystal ? 1 : 0) })}</div><div class="summary-sub">${stats.crew ? T('{n} of {seats} seats taken', { n: me.crew.seated, seats: stats.crew }) : T('carries no sailors')}</div></div>
		</div>
		<div class="ship-card-btns">
			<button class="act quiet small" data-act="crew-ship-pick" title="${T('Which hull you sail — the Map and the Plan follow it')}">${T('⚓ Change ship')}</button>
			<button class="act quiet small" data-act="crew-setup-save" title="${T('Keep this hull with its parts, crystal and seating under a name, to come back to')}">${T('Save as setup…')}</button>
			<button class="act quiet small" data-act="crew-link" title="${T('A link that carries this hull, its parts and its crew')}">${T('Copy link')}</button>
		</div>
		<label class="crew-mastery" title="${T('Sailing Mastery, as the game shows it: half a point of speed, acceleration, turn and brake per fifty up to 2,000, a quarter-point per fifty to 3,000')}">
			<span class="summary-k">${T('Sailing mastery')}</span>
			<input class="field purse-inline narrow" type="number" min="0" max="3000" step="50" inputmode="numeric" value="${store.getProfile('sailingMastery', 0) || ''}" placeholder="0" data-act="crew-mastery" aria-label="${T('Sailing mastery')}">
			<span class="summary-sub">${me.mastery ? T('+{n}% speed, acceleration, turn and brake', { n: me.mastery }) : T('adds to speed, acceleration, turn and brake')}</span>
		</label>
	</div>`;
	if (!stats.crew) {
		return head + setupsRow() + `<div class="panel"><p class="empty">${T('{ship} carries no sailors. Pick a crewed hull to plan one.', { ship: esc(gameName(ship)) })}</p></div>` + loadoutPanel(ship);
	}
	return head + setupsRow() + statCards(ship, stats, totals) + `<div class="crew-grid">
		<div class="crew-main">${board(ship, stats, totals)}${rosterPanel(ship)}${guidePanels()}</div>
		<div class="crew-side">${selectedPanel(ship)}${presetsPanel(ship)}${loadoutPanel(ship)}</div>
	</div>`;
}

/* ------------------------------------------------------------------ *
 * actions
 * ------------------------------------------------------------------ */

function setSeats(ship, map) {
	const all = { ...(store.getProfile('seats', {}) || {}) };
	if (Object.keys(map).length) all[ship] = map; else delete all[ship];
	store.setProfile('seats', all);
}

function setRoster(list) {
	store.setProfile('roster', list);
}

/** A sailor type as a picker row: the portrait, the race and what they cost. */
/** A stat's level-10 average — the figure a levelled sailor really holds. */
const l10avg = (t, key) => t.l10 && t.l10[key] ? t.l10[key][1] : t[key] || 0;

function typeRow(t, flat = false) {
	return {
		id: t.type,
		label: gameName(t.type),
		icon: face(t, { name: t.type }),
		sub: t.mate ? T('first mate · {skill}', { skill: t.skill || '' }) : T('{race} · {cabins} cabins · eats {appetite} · +{weight} LT · hired at {where}', { race: t.race, cabins: t.cabin, appetite: t.appetite, weight: t.weight, where: (t.at || []).map(a => gameName(a)).join(', ') }),
		meta: t.mate ? T('★ mate') : T('spd {spd} · acc {acc} · turn {turn} · brk {brk}', { spd: l10avg(t, 'speed'), acc: l10avg(t, 'accel'), turn: l10avg(t, 'turn'), brk: l10avg(t, 'brake') }),
		// A sorted list interleaves the races, and the picker names a
		// group on every change of it -- so a sorted list goes flat.
		group: flat ? null : t.mate ? T('First mates') : t.race
	};
}

function hireDialog() {
	// The pool is authored best-growth-first, which scatters the races;
	// the picker groups adjacent runs, so it printed fifteen headings.
	// Sorted by each race's first appearance, the order inside a race
	// still reads best-first, and every race is named once.
	const races = [...new Set(pool.map(t => t.race))];
	const byRace = [...pool].sort((a, b) => races.indexOf(a.race) - races.indexOf(b.race));
	const STATS = [['speed', STAT_NAMES.speed.game], ['accel', STAT_NAMES.accel.game], ['turn', STAT_NAMES.turn.game], ['brake', STAT_NAMES.brake.game]];
	let race = null;      // one race, or all of them
	let sortBy = null;    // a growth to rank by, or the authored order
	const chips = () => [
		...races.map(r => ({ id: `race:${r}`, label: r, on: race === r })),
		...STATS.map(([k, label]) => ({ id: `sort:${k}`, label: `▾ ${said(label)}`, on: sortBy === k }))
	];
	const items = () => {
		let list = byRace.filter(t => !race || t.race === race);
		if (sortBy) list = [...list].sort((a, b) => l10avg(b, sortBy) - l10avg(a, sortBy));
		return [...list, ...(race ? [] : mateTypes)].map(t => typeRow(t, Boolean(sortBy)));
	};
	openPicker({
		title: T('Hire a sailor'),
		hint: T('Which type — the portrait is the one the wharf shows. A {item} each, {silver} silver. The figures are the level-10 average — each level-up rolls in a hidden range. A race narrows the list, a stat ranks it.', { item: esc(gameName(contract.item)), silver: F(contract.silver) }),
		items: items(),
		chips: chips(),
		onChips: id => {
			const [kind, v] = id.split(':');
			if (kind === 'race') race = race === v ? null : v;
			else sortBy = sortBy === v ? null : v;
			return { items: items(), chips: chips() };
		},
		onPick: type => hireDetails(type)
	});
}

function hireDetails(type) {
	const t = anyType[type];
	const host = openDialog(`
		<h2>${T('Hire a sailor')}</h2>
		<div class="hire-type"><span class="roster-tile big" style="background:${RACE[(t && t.race) || 'Human']}">${face(t, { name: type })}</span>
			<div><b>${esc(gameName(type))}</b><div class="row-sub">${t && t.mate ? T('first mate') : T('{race} · {cabins} cabins', { race: t.race, cabins: t.cabin })}</div></div>
			<button class="link-btn" data-retype>${T('change type')}</button></div>
		<label class="dialog-field">${T('Name')} <input class="field" data-name placeholder="${T('as the game named them')}" maxlength="30"></label>
		<label class="dialog-field">${T('Level')} <input class="field" data-lv value="1" inputmode="numeric" style="max-width:80px"></label>
		<div class="dialog-actions">
			<button class="act quiet" data-close>${T('Cancel')}</button>
			<button class="act" data-hire>${T('Hire')}</button>
		</div>
	`);
	host.querySelector('[data-retype]').addEventListener('click', () => { closeDialog(); hireDialog(); });
	host.querySelector('[data-hire]').addEventListener('click', () => {
		const name = host.querySelector('[data-name]').value.trim() || type;
		const lv = Math.min(10, Math.max(1, Math.floor(Number(host.querySelector('[data-lv]').value) || 1)));
		const id = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
		setRoster([...roster(), { id, name, type, lv, cond: 100 }]);
		selId = id;
		closeDialog();
		toast(T('{name} joins the roster — tap a seat to place them', { name }), true);
	});
	host.querySelector('[data-name]').focus();
}

/** Every crew-* click. Returns false for one this screen does not own. */
/** Put a sailor in the Selected sailor panel, by id -- for a look at
 *  another sailor's crew that opens on one of them. */
export function selectSailor(id) {
	selId = id || null;
}

// A look at another sailor's boat: the tab stands on a copy that is
// never kept, and nothing on it can be changed either -- a look is a
// look, so a press on Disembark says so instead of pretending.
let looking = false;
export function setLooking(on) {
	looking = Boolean(on);
	if (!looking) selId = null;
}
const LOOK_ONLY = new Set(['crew-select', 'crew-clear-sel', 'crew-fleet', 'crew-sort', 'crew-check', 'crew-link']);

/**
 * One sailor's sheet as a popup, read-only: for a look at a sailor on
 * another sailor's boat. `seats` is that boat's seat map, `ship` the
 * hull they sail, so the seat and what it does with them are shown.
 */
export function openSailorSheet(sailor, { ship = null, seats = {}, owner = '' } = {}) {
	const where = Object.keys(seats || {}).find(k => seats[k] === sailor.id) || null;
	openDialog(`<div class="sailor-sheet">
		<h2>${owner ? T('Aboard {owner}’s boat', { owner: esc(owner) }) : T('A sailor')}</h2>
		${sailorSheet(sailor, { ship: ship && shipStats[ship] ? ship : null, where, readOnly: true })}
		<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div>
	</div>`);
}

export function crewAction(act, el) {
	const ship = crewShip();
	const id = el.dataset.id;
	if (looking && !LOOK_ONLY.has(act)) { toast(T('Only a look — nothing on this boat can be changed')); return false; }
	switch (act) {
		case 'crew-select': selId = selId === id ? null : id; return true;
		case 'crew-fleet': openFleet(); return true;
		case 'crew-skin-all': {
			const on = el.dataset.on === '1';
			setSkinAll(crewShip(), on);
			toast(on ? T('Set on — its stats now count') : T('Set taken off'));
			return true;
		}
		case 'crew-setup-load': if (loadSetup(id)) toast(T('Sailing it')); return true;
		case 'crew-setup-del': deleteSetup(id); return true;
		case 'crew-setup-save': {
			const host = openDialog(`
				<h2>${T('Keep this setup')}</h2>
				<p class="dialog-copy">${T('{ship} with what is fitted, its crystal and who sits where. The Map can switch between setups; the crew roster itself is shared by all of them.', { ship: esc(gameName(ship)) })}</p>
				<input class="field" type="text" maxlength="40" placeholder="${T('A name — “Barter Carrack”')}" data-setup-name value="${esc(ship)}">
				<div class="dialog-actions">
					<button class="ghost-btn" data-close>${T('Cancel')}</button>
					<button class="act" data-setup-save>${T('Keep it')}</button>
				</div>`);
			const input = host.querySelector('[data-setup-name]');
			input.focus(); input.select();
			const save = () => { saveSetup(input.value); closeDialog(); toast(T('Kept “{name}”', { name: input.value.trim() || ship })); document.dispatchEvent(new CustomEvent('quests-refilter')); };
			host.querySelector('[data-setup-save]').addEventListener('click', save);
			input.addEventListener('keydown', evt => { if (evt.key === 'Enter') save(); });
			return false;
		}
		case 'crew-check': if (checked.has(id)) checked.delete(id); else checked.add(id); return true;
		case 'crew-bulk': {
			const op = el.dataset.op;
			const ids = new Set([...checked].filter(x => byId(x)));
			if (op === 'all') { for (const s of roster()) checked.add(s.id); return true; }
			if (op === 'clear') { checked.clear(); return true; }
			if (!ids.size) return true;
			if (op === 'recover') setRoster(roster().map(s => (ids.has(s.id) ? { ...s, cond: 100 } : s)));
			if (op === 'disembark') {
				const map = { ...seatsOf(ship) };
				for (const k of Object.keys(map)) if (ids.has(map[k])) delete map[k];
				setSeats(ship, map);
			}
			if (op === 'dismiss') {
				if (el.dataset.sure !== '1') {
					el.dataset.sure = '1';
					el.textContent = T('Dismiss {n} — sure?', { n: ids.size });
					return false;
				}
				setRoster(roster().filter(x => !ids.has(x.id)));
				const all = { ...(store.getProfile('seats', {}) || {}) };
				for (const [hull, map] of Object.entries(all)) {
					const next = Object.fromEntries(Object.entries(map).filter(([, v]) => !ids.has(v)));
					if (Object.keys(next).length) all[hull] = next; else delete all[hull];
				}
				store.setProfile('seats', all);
				if (ids.has(selId)) selId = null;
				checked.clear();
				toast(T('{n} struck off the roster', { n: ids.size }), true);
			}
			return true;
		}
		case 'crew-ship-pick': shipPicker(); return true;
		case 'crew-crystal-pick': crystalPicker(ship); return true;
		case 'crew-crystal-none': setCrystal(ship, null); return true;
		case 'crew-fit-pick': partPicker(ship, el.dataset.slot); return true;
		case 'crew-fit-auto': setFitted(ship, el.dataset.slot, 'auto'); return true;
		case 'crew-fit-none': setFitted(ship, el.dataset.slot, 'none'); return true;
		case 'crew-fit-add': {
			store.addStock(el.dataset.item, 1, T('+1 {item}', { item: gameName(el.dataset.item) }));
			toast(T('{item} recorded in your inventory', { item: gameName(el.dataset.item) }), true);
			return true;
		}
		case 'crew-link': copyShipLink(); return true;
		case 'crew-clear-sel': selId = null; return true;
		case 'crew-sort': sort = el.dataset.id; return true;
		case 'crew-hire': hireDialog(); return true;
		case 'crew-seat': {
			const key = el.dataset.seat;
			const map = { ...seatsOf(ship) };
			const occupant = map[key] || null;
			if (selId && byId(selId)) {
				// Place the picked sailor; whoever was there takes the
				// picked one's old seat, if they had one, else steps off.
				const prev = whereIs(ship, selId);
				if (prev) delete map[prev];
				map[key] = selId;
				if (occupant && occupant !== selId && prev) map[prev] = occupant;
				setSeats(ship, map);
				selId = null;
			} else if (occupant) {
				selId = occupant;
			}
			return true;
		}
		case 'crew-disembark': {
			const map = { ...seatsOf(ship) };
			for (const k of Object.keys(map)) if (map[k] === id) delete map[k];
			setSeats(ship, map);
			return true;
		}
		case 'crew-disembark-all': setSeats(ship, {}); return true;
		case 'crew-auto': setSeats(ship, autoAssign(roster(), ship, shipStats[ship])); return true;
		case 'crew-recover': setRoster(roster().map(s => (s.id === id ? { ...s, cond: 100 } : s))); return true;
		case 'crew-recover-all': setRoster(roster().map(s => ({ ...s, cond: 100 }))); return true;
		case 'crew-dismiss': {
			const s = byId(id);
			setRoster(roster().filter(x => x.id !== id));
			const all = { ...(store.getProfile('seats', {}) || {}) };
			for (const [hull, map] of Object.entries(all)) {
				const next = Object.fromEntries(Object.entries(map).filter(([, v]) => v !== id));
				if (Object.keys(next).length) all[hull] = next; else delete all[hull];
			}
			store.setProfile('seats', all);
			selId = null;
			if (s) toast(T('{name} struck off the roster', { name: s.name }), true);
			return true;
		}
		case 'crew-preset-save': {
			const all = { ...(store.getProfile('presets', {}) || {}) };
			all[ship] = { ...(all[ship] || {}), [el.dataset.p]: { ...seatsOf(ship) } };
			store.setProfile('presets', all);
			toast(T('Crew saved as {preset}', { preset: el.dataset.p === 'p1' ? T('Preset 1') : T('Preset 2') }));
			return true;
		}
		case 'crew-preset-apply': {
			const p = presetsOf(ship)[el.dataset.p];
			if (!p) return true;
			const ids = new Set(roster().map(s => s.id));
			setSeats(ship, Object.fromEntries(Object.entries(p).filter(([, v]) => ids.has(v))));
			return true;
		}
		case 'crew-queue': {
			const n = roster().length;
			if (!n) return true;
			const existing = store.getTargets().find(t => t.item === contract.item);
			if (existing) store.setTargetQty(existing.id, n);
			else store.addTarget(contract.item, n);
			toast(T('{n} × {item} on the list', { n, item: gameName(contract.item) }), true);
			return true;
		}
		default:
			return false;
	}
}

/** Which hull: every one the app knows, with its picture and its numbers. */
function shipPicker() {
	const queued = new Set(store.getTargets().map(t => t.item));
	const stock = store.getAllStock();
	const items = Object.keys(shipStats).map(name => {
		const s = shipStats[name];
		const figures = s.crew ? T('{crew} sailors · {cabins} cabin space · {weight} LT · {slots} slots · speed {speed}%', { crew: s.crew, cabins: s.cabins, weight: F(s.weight), slots: s.slots, speed: s.speed }) : T('no crew · {weight} LT · speed {speed}%', { weight: F(s.weight), speed: s.speed });
		const r = roleOf(name);
		return {
			id: name, label: gameName(name), icon: img(name, ''),
			// What it is, and first what it is for: four Carracks read as
			// near-identical lists of numbers, and the thing that actually
			// separates them -- which one pays at bartering -- is nowhere
			// in those numbers. The picker searches `sub`, so "barter"
			// finds the barter hulls.
			sub: r ? T('for {role} · {figures}', { role: r.role, figures }) : figures,
			meta: stock[name] ? T('you hold one') : queued.has(name) ? T('in your queue') : '',
			group: s.crew ? T('Ships') : T('Small craft')
		};
	});
	openPicker({
		title: T('Which ship do you sail?'),
		hint: T('The Map times routes and sizes the hold from this hull, as fitted and crewed here. What each is for is the fleet’s reading, not a rule.'),
		items, selected: shipName(),
		onPick: name => store.setProfile('crewShip', name)
	});
}

/** A part for a slot: first the part, then its level -- the ones you
 *  hold marked at each step. */
function partPicker(ship, slot) {
	const stock = store.getAllStock();
	const held = part => {
		const out = [];
		for (let lv = 0; lv <= 10; lv++) { const n = stock[enhancedName(part, lv)]; if (n) out.push(`+${lv}${n > 1 ? ` ×${n}` : ''}`); }
		return out;
	};
	const tierOf = part => (tables[families[part]] || {}).label || T('Other');
	const items = partsForSlot(ship, slot).map(part => ({
		id: part, label: gameName(part), icon: img(part, ''),
		sub: T('at +10: {stats}', { stats: describeStats(statsAt(part, 10), { signed: false }) }),
		meta: held(part).length ? T('you hold {what}', { what: held(part).join(', ') }) : '',
		group: tierOf(part)
	}));
	openPicker({
		title: T('{slot} — which part?', { slot: said(SLOT_LABEL[slot]) }),
		hint: T('Then its level. A part you do not hold can still be chosen — to weigh a plan, or to record it afterwards.'),
		items,
		onPick: part => levelPicker(ship, slot, part)
	});
}

function levelPicker(ship, slot, part) {
	const stock = store.getAllStock();
	const items = [];
	for (let lv = 0; lv <= 10; lv++) {
		const item = enhancedName(part, lv);
		items.push({ id: item, label: `+${lv}`, icon: img(item, ''), sub: describeStats(statsAt(part, lv), { signed: false }), meta: stock[item] ? T('you hold {n}', { n: F(stock[item]) }) : '' });
	}
	openPicker({ title: T('{part} — which level?', { part: gameName(part) }), items, onPick: item => setFitted(ship, slot, item) });
}

/** Which crystal: every one the codex knows, by grade, the effect beside it. */
function crystalPicker(ship) {
	const now = crystalFor(ship);
	const role = roleOf(ship);
	const items = [];
	for (const g of GRADES) {
		for (const c of crystalsOf(g.id)) {
			// Which stat this one carries, and who wants it. A crystal
			// carries exactly one of eight things, so the grade says how
			// much and this says of what -- and the second is the choice
			// that actually matters.
			const stat = Object.keys(crystalStats(c)).find(k => CRYSTAL_FOR[k]);
			const use = stat ? CRYSTAL_FOR[stat] : null;
			const wanted = Boolean(role && stat && role.crystal === stat);
			items.push({
				id: String(c.id), label: `${gameName(c.name)} — ${crystalVariant(c)}`, icon: img(c.name, ''),
				sub: use ? T('{label} · for {who}', { label: said(use.label), who: said(use.who) }) : crystalLine(c),
				meta: `${wanted ? `${T('↑ suits this hull')} · ` : ''}${g.local ? T('its sea only') : T('every sea')}`,
				group: `${g.label} · ${g.note}`
			});
		}
	}
	openPicker({
		title: T('Which sea crystal?'),
		hint: `${T('One slot, and it carries one stat. Rusalka lifts it most and works in every sea, and the Oceanteared Nol is a Rusalka crystal with the Nol\'s BreezySail on top.')}${role ? ` ${T('A hull for {role} wants {want}: {why}', { role: role.role, want: CRYSTAL_FOR[role.crystal] ? said(CRYSTAL_FOR[role.crystal].label) : role.crystal, why: CRYSTAL_FOR[role.crystal] ? said(CRYSTAL_FOR[role.crystal].why) : '' })}` : ''}`,
		items, selected: now ? String(now.id) : null,
		onPick: id => setCrystal(ship, Number(id))
	});
}

/** The hull, its fitted parts and its crew, in a link. */
async function copyShipLink() {
	const ship = shipName();
	const setup = { ship, fitted: (store.getProfile('fitted', {}) || {})[ship] || {}, crystal: (store.getProfile('crystal', {}) || {})[ship] || null, roster: roster(), seats: seatsOf(ship) };
	try {
		const link = shareLink(await encodeShare({ stock: {}, setup })).replace('#share/', '#ship/');
		await navigator.clipboard.writeText(link);
		toast(T('Ship setup link copied'));
	} catch {
		toast(T('Could not build or copy the link'));
	}
}

/** Take a ship setup in from a link: the hull, what is on it, who sails it. */
export function applyShipSetup(setup) {
	if (!setup || !shipStats[setup.ship]) return false;
	// The dialog promises one Undo takes it back, so it is one change.
	const patch = { crewShip: setup.ship };
	if (setup.fitted && typeof setup.fitted === 'object') {
		patch.fitted = { ...(store.getProfile('fitted', {}) || {}), [setup.ship]: setup.fitted };
	}
	if (setup.crystal !== undefined) {
		const all = { ...(store.getProfile('crystal', {}) || {}) };
		if (setup.crystal && crystalById[setup.crystal]) all[setup.ship] = Number(setup.crystal); else delete all[setup.ship];
		patch.crystal = Object.keys(all).length ? all : null;
	}
	if (Array.isArray(setup.roster)) patch.roster = setup.roster;
	if (setup.seats && typeof setup.seats === 'object') {
		const all = { ...(store.getProfile('seats', {}) || {}) };
		if (Object.keys(setup.seats).length) all[setup.ship] = setup.seats; else delete all[setup.ship];
		patch.seats = all;
	}
	store.setProfileMany(patch, T('Took a ship from a link: {ship}', { ship: gameName(setup.ship) }));
	return true;
}

/** A name, level or condition typed into the selected sailor's panel. */
export function crewChange(el) {
	const act = el.dataset.act;
	const id = el.dataset.id;
	if (looking) { toast(T('Only a look — nothing on this boat can be changed')); return true; }
	if (act === 'crew-mastery') {
		const v = Math.floor(Number(el.value));
		store.setProfile('sailingMastery', Number.isFinite(v) && v > 0 ? Math.min(3000, v) : null);
		return true;
	}
	// A tick per appearance slot: the set is bought whole but worn a
	// piece at a time, and someone half-way through should not be told
	// they have all four.
	if (act === 'crew-skin-slot') {
		setSkinSlot(crewShip(), el.dataset.slot, el.checked);
		return true;
	}
	if (!['crew-name', 'crew-lv', 'crew-cond', 'crew-stat'].includes(act)) return false;
	setRoster(roster().map(s => {
		if (s.id !== id) return s;
		if (act === 'crew-name') return { ...s, name: el.value.trim().slice(0, 30) || s.name };
		if (act === 'crew-stat') {
			const stats = { ...(s.stats || {}) };
			const v = Number(String(el.value).replace(',', '.'));
			if (el.value.trim() === '' || !Number.isFinite(v) || v < 0) delete stats[el.dataset.key];
			else stats[el.dataset.key] = Math.round(v * 10) / 10;
			const out = { ...s, stats };
			if (!Object.keys(stats).length) delete out.stats;
			return out;
		}
		if (act === 'crew-lv') return logLevel(s, Number(el.value) || s.lv);
		const cond = Number(el.value);
		return { ...s, cond: Number.isFinite(cond) ? Math.min(100, Math.max(0, Math.floor(cond))) : s.cond };
	}));
	return true;
}
