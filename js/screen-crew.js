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
import * as store from './state.js';
import { img, iconSrc, codexName } from './ui-bits.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { shipStats } from './ship_stats.js';
import { describeStats, statsAt } from './part_stats.js';
import { families, tables } from './enhancement.js';
import { currentShip, fittedFor, partsForSlot, shipName, setFitted, crystalFor, setCrystal, listSetups, saveSetup, loadSetup, deleteSetup, activeSetupId, setupSummary, skinWorn, setSkinSlot, setSkinAll, skinTotals, OVERLOAD } from './ship.js';
import { GOODS } from './barter.js';
import { GRADES, gradeById, crystalById, crystalsOf, crystalVariant, crystalLine } from './crystals.js';
import { skinFor, SKIN_SLOTS } from './ship_skins.js';
import { openFleet } from './setups.js';
import { openPicker } from './picker.js';
import { encodeShare, shareLink } from './share.js';
import { enhancedName } from './planner.js';
import {
	pool, mateTypes, anyType, care, rations, expSplit, firstMates, slotSources, statBand, rollRank,
	contract, SAILOR_CAP, seatsFor, fitSeats, statOf, crewTotals, autoAssign } from './sailors.js';

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
	if (pos === 'sail') return `doubles their Endurance and Wits: speed +${f('speed')}% becomes +${dbl(f('speed'))}%, accel +${f('accel')}% becomes +${dbl(f('accel'))}%`;
	if (pos === 'wheel') return `doubles their Awareness and Strength: turn +${f('turn')}% becomes +${dbl(f('turn'))}%, brake +${f('brake')}% becomes +${dbl(f('brake'))}%`;
	if (pos === 'cannon') {
		return t.force !== undefined
			? `doubles their gunnery: force +${dbl(f('force'))}%, focus +${dbl(f('focus'))}%, vision +${dbl(f('vision'))}%`
			: 'doubles Force, Focus and Vision — this type grows none of them';
	}
	if (pos === 'deck') return `+${F((t.cabin || 0) * 10000)} durability — their ${t.cabin || 0} cabins at 10,000 each`;
	if (pos === 'mess') return `+${F((t.cabin || 0) * 5000)} rations — their ${t.cabin || 0} cabins at 5,000 each`;
	if (pos === 'fish') return 'auto-fishing, once an Oceanbound Otter Fishing Rod is aboard';
	if (pos === 'firstmate') return t.mate ? `switches on their skill: ${t.skill}` : 'the seat switches on a named mate\'s skill — this sailor has none';
	if (pos === 'cabin') return 'no role — they still eat, weigh and level along';
	return '';
}

function seatBox(ship, seat, armed) {
	const id = seatsOf(ship)[seat.key];
	const s = id ? byId(id) : null;
	const t = s && anyType[s.type];
	const held = armed ? byId(selId) : null;
	const cls = ['seat', s ? 'taken' : 'empty', armed && !s ? 'armed' : '', s && s.id === selId ? 'picked' : ''].join(' ');
	const title = s
		? `${s.name} · ${s.type} · Lv ${s.lv} — ${seatPitch(seat.pos, s) || seat.effect}`
		: held
			? `${seat.label}, for ${held.name}: ${seatPitch(seat.pos, held) || seat.effect}`
			: `${seat.label}: empty seat — ${seat.effect}`;
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
		return `<div class="seat-bar" style="left:${cq(sp.cx)};top:${cq(sp.y - 28)};width:${cq(sp.w)}" title="${esc(g.effect)}">${esc(g.label)}</div>
			<div class="seat-wrap" style="left:${cq(sp.cx)};top:${cq(sp.y)}">${g.seats.map(seat => seatBox(ship, seat, armed)).join('')}</div>`;
	}).join('');
	const cabins = groups.get('cabin');
	const cabinRow = cabins ? `<div class="cabin-row">
			<div class="seat-bar static" title="${esc(cabins.effect)}">Cabin</div>
			<div class="cabin-seats">${cabins.seats.map(seat => seatBox(ship, seat, armed)).join('')}</div>
			<div class="cabin-note">cabin seats have no role — they still eat, weigh, and level along</div>
		</div>` : '';
	const sel = selId && byId(selId);
	const hint = sel ? `placing ${sel.name} — tap a seat` : 'tap a sailor below, then a seat';
	// The same seats as a list, for a screen too narrow for the drawing.
	const seatList = [...groups].map(([pos, g]) => `<div class="seat-list-group">
		<div class="seat-bar static" title="${esc(g.effect)}">${esc(g.label)}</div>
		<div class="seat-list-seats">${g.seats.map(seat => {
			const id = seatsOf(ship)[seat.key];
			const s = id ? byId(id) : null;
			const held = armed ? byId(selId) : null;
			const lineTitle = s ? seatPitch(seat.pos, s) : held ? `for ${held.name}: ${seatPitch(seat.pos, held)}` : seat.effect;
			return `<button class="seat-line${s ? ' taken' : ''}${armed && !s ? ' armed' : ''}${s && s.id === selId ? ' picked' : ''}" data-act="crew-seat" data-seat="${esc(seat.key)}" data-tip="${esc(lineTitle || seat.effect)}">
				${seatBox(ship, seat, armed).replace(/<button[^>]*>|<\/button>$/g, '')}
				<span class="seat-line-text">${s ? `${esc(s.name)} <small>${esc(s.type)} · Lv ${s.lv}</small>` : `<small>empty — ${esc(seat.effect)}</small>`}</span>
			</button>`;
		}).join('')}</div>
	</div>`).join('');
	return `<div class="panel crew-panel">
		<div class="panel-head crew-head">
			<h2 class="panel-title teal">Manage sailors</h2>
			<span class="panel-sub">${esc(hint)}</span>
			<span class="panel-spacer"></span>
			<button class="act quiet small" data-act="crew-auto" ${roster().length ? '' : 'disabled'}>Auto assign</button>
			<button class="act quiet small" data-act="crew-disembark-all" ${totals.seated ? '' : 'disabled'}>Disembark all</button>
		</div>
		<div class="crew-board">
			<div class="crew-counter">${F(totals.cabins)}/${F(totals.space)} cabin space · ${totals.seated}/${totals.seats} seated</div>
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
		? card('Cannon', `${totals.force.toFixed(1)} / ${totals.focus.toFixed(1)} / ${totals.vision.toFixed(1)}`, 'force / focus / vision, doubled at the cannon', 'teal') : '';
	return `<div class="stats crew-stats">
		${card('Seated', `${totals.seated} / ${totals.seats}`, `${F(totals.cabins)} of ${F(totals.space)} cabin space${totals.overSpace ? ` — ${F(totals.overSpace)} over` : ''}`, totals.overSpace ? 'amber' : '')}
		${card('Speed from crew', pct(totals.speed), 'sail seats count double', totals.speed ? 'teal' : '')}
		${card('Accel from crew', pct(totals.accel), `hull ${stats.accel}% before crew`, totals.accel ? 'teal' : '')}
		${card('Turn / brake from crew', `${pct(totals.turn)} / ${pct(totals.brake)}`, 'the wheel counts double', totals.turn || totals.brake ? 'teal' : '')}
		${card('Durability from crew', `+${F(totals.durability)}`, 'the Deck: 10,000 per cabin the sailor costs', totals.durability ? 'amber' : '')}
		${card('Rations from crew', `+${F(totals.rations)}`, `the Mess: 5,000 per cabin · crew eats ${F(totals.appetite)}/day`, totals.rations ? 'amber' : '')}
		${card('Weight of crew', `+${F(totals.weight)} LT`, `${roster().length} hired · ${SAILOR_CAP} at most${totals.sick ? ` · ${totals.sick} sick` : ''}`)}
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
			<button class="roster-check${ticked ? ' on' : ''}" data-act="crew-check" data-id="${esc(s.id)}" aria-pressed="${ticked}" title="Tick to act on several at once">${ticked ? '✓' : ''}</button>
			<button class="roster-hit" data-act="crew-select" data-id="${esc(s.id)}" aria-label="Select ${esc(s.name)}"></button>
			<span class="roster-tile" style="background:${RACE[t.race] || '#8fb4d6'}">${face(t, s)}<i class="roster-cond" style="width:${s.cond}%;background:${condColor(s.cond)}"></i></span>
			<span class="roster-main">
				<span class="roster-name">${esc(s.name)} <span class="crew-race" style="color:${RACE[t.race] || 'inherit'}">${esc(t.race || '')}</span></span>
				<span class="roster-sub">${esc(s.type)} · Lv ${s.lv}${t.mate ? ' · first mate' : ''}</span>
				<span class="roster-pos ${where ? 'on' : ''}">${where ? `⚓ ${esc(seatName ? seatName.label : where)}` : '(idle)'}</span>
			</span>
		</div>`;
	}).join('');
	const nTicked = [...checked].filter(id => byId(id)).length;
	const bulk = nTicked ? `<div class="crew-bulk">
		<span><b>${nTicked}</b> ticked</span>
		<button class="act quiet small" data-act="crew-bulk" data-op="recover">Recover</button>
		<button class="act quiet small" data-act="crew-bulk" data-op="disembark">Disembark</button>
		<button class="act quiet small danger" data-act="crew-bulk" data-op="dismiss">Dismiss</button>
		<span class="panel-spacer"></span>
		<button class="act quiet small" data-act="crew-bulk" data-op="all">Tick all</button>
		<button class="act quiet small" data-act="crew-bulk" data-op="clear">Untick</button>
	</div>` : '';
	const tabs = [['stats', 'By stats'], ['type', 'By type'], ['cond', 'By condition']].map(([id, label]) =>
		`<button class="chip ${sort === id ? 'active' : ''}" data-act="crew-sort" data-id="${id}">${label}</button>`).join('');
	const n = roster().length;
	return `<div class="panel crew-panel">
		<div class="panel-head crew-head">
			<h2 class="panel-title">Sailor list</h2>
			<span class="panel-sub">${n} hired · the account holds ${SAILOR_CAP} at most</span>
			<span class="panel-spacer"></span>
			<div class="chips">${tabs}</div>
			<button class="act quiet small" data-act="crew-recover-all" ${n ? '' : 'disabled'} title="Marks every sailor's condition back at 100">Recover all</button>
			<button class="act small" data-act="crew-hire" ${n >= SAILOR_CAP ? 'disabled' : ''}>+ Hire</button>
		</div>
		${bulk}${n ? `<div class="roster-grid">${cards}</div>` : `<p class="empty">Nobody hired yet. A sailor costs a ${esc(contract.item)} (${F(contract.silver)} silver) at ${esc(contract.hireAt)}.</p>`}
		${n ? `<div class="crew-actions"><button class="act quiet small" data-act="crew-queue" title="Queues one certificate per sailor, so the silver shows in To Get">Put ${n} ${esc(contract.item)}${n === 1 ? '' : 's'} on the list</button></div>` : ''}
	</div>`;
}

function selectedPanel(ship) {
	const s = selId && byId(selId);
	if (!s) {
		return `<div class="panel crew-panel crew-sel"><div class="panel-head"><h2 class="panel-title">Selected sailor</h2></div>
			<p class="empty crew-nosel">No sailor selected.<br>Pick one from the list, then tap a seat on the ship.</p></div>`;
	}
	const t = anyType[s.type] || {};
	const where = whereIs(ship, s.id);
	const seat = where ? seatsFor(ship, shipStats[ship]).find(x => x.key === where) : null;
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
			? (v >= band.max ? 'top roll' : v <= band.min ? 'floor roll' : v > band.max ? 'past the top' : `beats ${Math.round(rank.below * 100)}%`)
			: typed && band
				? (v >= band.max - 0.05 ? 'top roll' : v <= band.min + 0.05 ? 'floor roll' : v >= band.avg ? 'above average' : 'below average')
				: '';
		const title = typed
			? `As you typed it${rank
				? ` — better than ${Math.round(rank.below * 100)}% of ${esc(s.type)} rolls at Lv ${s.lv} (${band.min}–${band.max}; most land on ${rank.mode}; ${F(rank.paths)} roll paths)`
				: word ? ` — ${word} for Lv ${s.lv}` : ''}. Clear to go back to the estimate`
			: band ? `Estimate at Lv ${s.lv}: ${band.min}–${band.max}, usually ${band.avg}. Type what the sailor window shows`
				: 'Type what the sailor window shows';
		return `<div class="sel-stat${typed ? ' typed' : ''}"><span><span>${k}</span>${word ? `<em class="roll-note ${v >= band.avg ? 'good' : 'low'}">${word}</em>` : ''}<b>+<input class="purse-inline narrow stat-in" type="text" inputmode="decimal" value="${v}"
			data-act="crew-stat" data-id="${esc(s.id)}" data-key="${key}" aria-label="${k}, as the game shows it" title="${title}">%</b></span><i><b style="width:${Math.min(100, v / max * 100)}%"></b></i></div>`;
	};
	const stats = [bar('Speed', 'speed', 5), bar('Accel', 'accel', 8), bar('Turn', 'turn', 10), bar('Brake', 'brake', 10)];
	if (t.force !== undefined) stats.push(bar('Force', 'force', 6), bar('Focus', 'focus', 14), bar('Vision', 'vision', 50));
	return `<div class="panel crew-panel crew-sel">
		<div class="panel-head"><h2 class="panel-title">Selected sailor</h2><span class="panel-spacer"></span>
			<button class="sq-btn" data-act="crew-clear-sel" title="Put down">×</button></div>
		<div class="sel-top">
			<span class="roster-tile big" style="background:${RACE[t.race] || '#8fb4d6'}">${face(t, s)}</span>
			<div>
				<input class="field sel-name" value="${esc(s.name)}" data-act="crew-name" data-id="${esc(s.id)}" aria-label="Name" maxlength="30">
				<div class="roster-sub">${esc(s.type)} · <span style="color:${RACE[t.race] || 'inherit'}">${esc(t.race || '')}</span> · Lv
					<input class="purse-inline narrow" type="text" inputmode="numeric" value="${s.lv}" data-act="crew-lv" data-id="${esc(s.id)}" aria-label="Level"></div>
				<div class="roster-pos ${where ? 'on' : ''}">${where ? `⚓ seated at the ${esc(seat ? seat.label : where)}` : '(idle) — tap a seat on the ship to place'}</div>
			</div>
		</div>
		<div class="sel-cond"><span><span>Condition</span><b style="color:${condColor(s.cond)}"><input class="purse-inline narrow" type="text" inputmode="numeric" value="${s.cond}" data-act="crew-cond" data-id="${esc(s.id)}" aria-label="Condition">%</b></span>
			<i><b style="width:${s.cond}%;background:${condColor(s.cond)}"></b></i></div>
		<div class="sel-stats">${stats.join('')}</div>
		<div class="sel-note">Each level-up rolls inside a hidden range, so these are estimates — type what the sailor window shows and they outrank it, judged against the level's band.</div>
		<div class="sel-facts">cabins <b>${t.cabin ?? '—'}</b> · eats <b>${t.appetite ?? '—'}</b>/day · weight <b>+${t.weight ?? 0} LT</b></div>
		${t.mate
		? '<div class="sel-facts sel-seats" data-tip="Seats double a sailor\'s matching growths; the First Mate seat is where a named mate\'s skill switches on.">at the <b>First Mate</b> seat ★ their skill switches on</div>'
		: `<div class="sel-facts sel-seats" data-tip="What each seat does with this sailor's own numbers — hover a seat on the ship for the same. Deck and Mess pay by cabin cost.">at a seat: Sail <b>+${dbl(statOf(s, 'speed'))}%</b> spd · Wheel <b>+${dbl(statOf(s, 'turn'))}%</b> turn${t.force !== undefined ? ` · Cannon <b>+${dbl(statOf(s, 'focus'))}%</b> focus` : ''} · Deck <b>+${F((t.cabin || 0) * 10000)}</b> dura · Mess <b>+${F((t.cabin || 0) * 5000)}</b> rations</div>`}
		${t.skill ? `<div class="sel-skill">★ ${esc(t.skill)}</div>` : t.note ? `<div class="sel-skill quiet">${esc(t.note)}</div>` : ''}
		<div class="crew-actions">
			${where ? `<button class="act quiet small danger" data-act="crew-disembark" data-id="${esc(s.id)}">Disembark</button>` : ''}
			<button class="act quiet small" data-act="crew-recover" data-id="${esc(s.id)}" ${s.cond >= 100 ? 'disabled' : ''}>Recover</button>
			<button class="act quiet small" data-act="crew-dismiss" data-id="${esc(s.id)}" title="Strike this sailor off the roster">Dismiss</button>
		</div>
	</div>`;
}

function presetsPanel(ship) {
	const p = presetsOf(ship);
	const slot = (k, label) => {
		const has = Boolean(p[k]);
		return `<button class="preset ${has ? 'has' : ''}" data-act="crew-preset-apply" data-p="${k}" ${has ? '' : 'disabled'}>${label}
			<span class="preset-sub">${has ? `${Object.keys(p[k]).length} seated · tap to apply` : 'empty — save the current crew'}</span></button>`;
	};
	return `<div class="panel crew-panel">
		<div class="panel-head"><h2 class="panel-title">Presets</h2><span class="panel-spacer"></span>
			<button class="act quiet small" data-act="crew-preset-save" data-p="p1">Save 1</button>
			<button class="act quiet small" data-act="crew-preset-save" data-p="p2">Save 2</button></div>
		<div class="preset-row">${slot('p1', 'Preset 1')}${slot('p2', 'Preset 2')}</div>
	</div>`;
}

function guidePanels() {
	// Reference, but drawn like the rest of the yard: each remedy under
	// its own icon, the grades wearing their colours, the shares as
	// meters, and the three named mates with their faces on.
	const careRows = care.map(c => `<div class="guide-row">
		${img(c.item, 'guide-icon')}
		<div class="guide-main">
			<div class="guide-name">${codexName(c.item)} <span class="guide-effect">${esc(c.effect)}</span></div>
			<div class="guide-sub">${esc(c.from)}</div>
		</div>
	</div>`).join('');
	const rationChips = rations.map(r => `<span class="ration-chip g-${r.grade.toLowerCase()}"><i></i>${esc(r.grade)} · <b>${F(r.restores)}</b></span>`).join('');
	const expRows = expSplit.map(e => `<div class="exp-row">
		<span class="exp-aboard">${e.aboard}${e.note ? '+' : ''}<small>aboard</small></span>
		<span class="exp-bar"><i style="width:${e.total / 4}%"></i></span>
		<span class="exp-fig">${e.each === null ? '' : `${e.each}% each · `}<b>${e.total}%</b> in all</span>
	</div>`).join('');
	const slotRows = slotSources.map(s => `<div class="guide-row">
		<span class="slot-badge">+${s.oaths}</span>
		<div class="guide-main">
			<div class="guide-name">${s.oaths} more slot${s.oaths > 1 ? 's' : ''}</div>
			<div class="guide-sub">${esc(s.from)}</div>
		</div>
	</div>`).join('');
	const mateCards = firstMates.map(m => {
		const t = anyType[m.name];
		return `<div class="mate-card">
			<span class="roster-tile big" style="background:${RACE[(t && t.race) || 'Human']}">${face(t, { name: m.name })}</span>
			<div class="guide-main">
				<div class="guide-name">${esc(m.name)}</div>
				<div class="mate-trait">${esc(m.trait)}</div>
				<div class="guide-sub">${esc(m.from)}</div>
			</div>
		</div>`;
	}).join('');
	return `<div class="crew-two">
		<div class="panel crew-panel"><div class="panel-head"><h2 class="panel-title">Keeping them well</h2>
			<span class="panel-sub">Condition falls as they work; at zero a sailor is sick and does nothing until cured</span></div>
			<div class="guide-list">${careRows}
				<div class="ration-row"><span class="guide-sub">Any food thrown to the crew is rations, by its grade</span>
					<span class="ration-chips">${rationChips}</span></div>
			</div></div>
		<div class="panel crew-panel"><div class="panel-head"><h2 class="panel-title">Levelling &amp; slots</h2>
			<span class="panel-sub">Experience is shared out: each gets less, the crew gets more</span></div>
			<div class="guide-list">${expRows}<div class="guide-row">
				<span class="slot-badge">1</span>
				<div class="guide-main">
					<div class="guide-name">to start with</div>
					<div class="guide-sub">every account begins with one slot — the three below make it ten, free</div>
				</div>
			</div>${slotRows}</div></div>
	</div>
	<div class="panel crew-panel"><div class="panel-head"><h2 class="panel-title">First mates</h2>
		<span class="panel-sub">Three sailors with names; the First Mate seat switches their trait on</span></div>
		<div class="mate-cards">${mateCards}</div></div>
	<div class="panel crew-panel"><div class="panel-head"><h2 class="panel-title">Crew templates</h2>
		<span class="panel-sub">The sailing community's builds — who to hire, and where they sit</span></div>
		<div class="mate-cards tmpl-cards">${TEMPLATES.map(t => `<div class="mate-card tmpl">
			<div class="guide-main">
				<div class="guide-name">${t.name} <span class="tmpl-tag">${t.tag}</span></div>
				${t.lines.map(l => `<div class="guide-sub">· ${l}</div>`).join('')}
			</div>
		</div>`).join('')}</div>
		<div class="guide-list tmpl-foot"><div class="guide-sub">Any sailor in the Fish seat fishes — Crio trades an Oceanbound Otter Fishing Rod for 200 Crow Coin Coupons, as often as you like.</div></div></div>`;
}

/** The community's crew builds, as passed around the sailors' Discord. */
const TEMPLATES = [
	{ name: 'Bartering', tag: 'free · 10 sailors', lines: [
		'Cleia at the First Mate seat, if she is yours — no other mate registered.',
		'9–10 Innocents; the highest Endurance take the Sail seats.'
	] },
	{ name: 'PvX', tag: 'free · 10 sailors', lines: [
		'No first mate registered at all.',
		'1–2 Innocents at the Sail; 1–3 Realistics at the Cannon, up to 9 in all.',
		'The highest-Awareness Realistic takes the Wheel; the rest fill Deck, Mess and cabins.',
		'Swap Realistics for Innocents for speed, at the cost of turn.'
	] },
	{ name: 'Bartering', tag: '12–16 sailors', lines: [
		'Cleia — or Proix — at the First Mate seat.',
		'11 Innocents on a Carrack, 15 on a Panokseon; the fastest at the Sail.'
	] },
	{ name: 'PvX', tag: '14–31 sailors', lines: [
		'Tranan for grinding, Proix for the Breezy Sail, at the First Mate seat.',
		'0–2 Innocents at the Sail; up to 3 Realistics at the Cannon — the angle caps at 45°, five to seven are enough.',
		'Up to 22 Confidents on a Carrack, 30 on a Panokseon; the best Awareness at the Wheel.'
	] }
];

/**
 * The hull as fitted: the best part you hold in each slot, and what the
 * four of them add to the hull's own numbers.
 */
const SLOT_GLYPH = { cannon: '⁂', sail: '⛵', figurehead: '❖', plating: '▣' };
const SLOT_LABEL = { cannon: 'Cannon', sail: 'Sail', figurehead: 'Figurehead', plating: 'Black plating' };

/** One slot: what is on it, where that came from, and the ways to change it. */
function slotCard(ship, x, chosenByHand) {
	const tag = x.source === 'owned' ? 'from your inventory'
		: x.source === 'chosen' ? 'chosen · in your inventory'
		: x.source === 'chosen-unowned' ? 'chosen · not in your inventory'
		: chosenByHand ? 'left empty' : 'no part held yet';
	const item = x.part ? enhancedName(x.part, x.level) : null;
	return `<div class="slot-card${x.part ? '' : ' empty'}${x.source === 'chosen-unowned' ? ' unowned' : ''}">
		<div class="slot-head"><span class="slot-glyph" aria-hidden="true">${SLOT_GLYPH[x.slot]}</span><span class="slot-name">${SLOT_LABEL[x.slot]}</span>
			<span class="fit-tag${x.source === 'chosen-unowned' ? ' warn' : ''}">${tag}</span></div>
		<div class="slot-body">
			${x.part ? img(item, 'slot-icon') : '<span class="slot-icon blank">+</span>'}
			<div class="slot-text">
				<div class="slot-part">${x.part ? `${codexName(x.part)} <b>+${x.level}</b>` : 'Nothing fitted'}</div>
				<div class="slot-stats">${x.part ? esc(describeStats(x.stats, { signed: false })) : 'choose one to weigh it, or record one in the Inventory'}</div>
			</div>
		</div>
		<div class="slot-btns">
			<button class="act quiet small" data-act="crew-fit-pick" data-slot="${x.slot}">${x.part ? 'Change…' : 'Choose…'}</button>
			${x.source === 'chosen-unowned' ? `<button class="act small" data-act="crew-fit-add" data-item="${esc(item)}" title="Record one in your inventory">+ Add to inventory</button>` : ''}
			${chosenByHand ? `<button class="act quiet small" data-act="crew-fit-auto" data-slot="${x.slot}" title="Back to the best part you hold">Best I own</button>` : ''}
			${x.part ? `<button class="act quiet small" data-act="crew-fit-none" data-slot="${x.slot}" title="Sail with this slot empty">Empty</button>` : ''}
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
	if (t.speed) bits.push(`speed +${t.speed}%`);
	if (t.turn) bits.push(`turn +${t.turn}%`);
	if (t.weight) bits.push(`+${F(t.weight)} LT`);
	if (t.durability) bits.push(`+${F(t.durability)} durability`);
	const slotLine = k => {
		const part = skin.parts[k];
		const val = Object.entries(part.stats)
			.map(([sk, v]) => sk === 'weight' ? `+${F(v)} LT` : sk === 'durability' ? `+${F(v)} durability` : `${sk} +${v}%`).join(', ');
		// A crafted slot says what it takes, since that is a shopping
		// list like any other; a pearl one has nothing to say here.
		const made = part.recipe
			? ` — ${Object.entries(part.recipe).map(([m, n]) => `${F(n)}× ${m}`).join(', ')}`
			: '';
		return `<label class="skin-slot${worn[k] ? ' on' : ''}" title="${esc(part.name)}${esc(made)}">
			<input type="checkbox" data-act="crew-skin-slot" data-slot="${k}"${worn[k] ? ' checked' : ''}>
			<span class="skin-slot-name">${esc(k)}</span>
			<span class="skin-slot-val">${esc(val)}</span></label>`;
	};
	return `<div class="slot-card skin${on.length ? '' : ' empty'}">
		<div class="slot-head"><span class="slot-glyph" aria-hidden="true">✦</span><span class="slot-name">Appearance set</span>
			<span class="fit-tag">${esc(skin.name)} · ${esc(skin.source)}${skin.pearls ? ` · ${F(skin.pearls)} pearls` : ''}${skin.where ? ` · ${esc(skin.where)}` : ''}</span></div>
		<div class="slot-body">
			<div class="slot-text">
				<div class="slot-part">${on.length ? `${on.length} of 4 slots — ${esc(bits.join(' · '))}` : 'Not worn'}</div>
				<div class="slot-stats">${esc(skin.note || '')}</div>
			</div>
		</div>
		<div class="skin-slots">${SKIN_SLOTS.map(slotLine).join('')}</div>
		<div class="slot-btns">
			<button class="act quiet small" data-act="crew-skin-all" data-on="1">I have the set</button>
			${on.length ? '<button class="act quiet small" data-act="crew-skin-all" data-on="">Take it off</button>' : ''}
		</div>
	</div>`;
}

function crystalCard(ship) {
	const c = crystalFor(ship);
	const grade = c && gradeById[c.grade];
	return `<div class="slot-card crystal${c ? '' : ' empty'}">
		<div class="slot-head"><span class="slot-glyph" aria-hidden="true">◆</span><span class="slot-name">Sea crystal</span>
			<span class="fit-tag">${c ? esc(grade.label) + (grade.local ? ' · its own sea only' : ' · every sea') : 'one slot, any grade'}</span></div>
		<div class="slot-body">
			${c ? img(c.name, 'slot-icon') : '<span class="slot-icon blank">◆</span>'}
			<div class="slot-text">
				<div class="slot-part">${c ? `${codexName(c.name)} <b style="color:${grade.colour}">${esc(crystalVariant(c))}</b>` : 'No crystal'}</div>
				<div class="slot-stats" title="${c ? esc(crystalLine(c)) : ''}">${c ? esc(crystalLine(c)) : 'Eltro to Rusalka, or the Nol — each one lifts one thing'}</div>
			</div>
		</div>
		<div class="slot-btns">
			<button class="act quiet small" data-act="crew-crystal-pick">${c ? 'Change…' : 'Choose…'}</button>
			${c ? `<button class="act quiet small" data-act="crew-crystal-none" title="Sail without a crystal">Take out</button>` : ''}
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
	const perLevel = [5, 6].map(lv => `${Math.floor(h.free / GOODS[lv].weight)} of Lv${lv === 5 ? '4–5' : '6–7'}`).join(', ');
	return `<div class="hold-lines" title="The hold, line by line. A ship sails past its limit up to ${Math.round((OVERLOAD - 1) * 100)}% over, slower the further it is, and not at all beyond that.">
		<span class="hold-lines-k">Hold</span>
		${h.lines.map(line).join('')}
		<span class="hold-line total"><span>free to load</span><b>${F(h.free)} LT</b></span>
		<span class="hold-line sub"><span>overweight, sailing slower, up to</span><b>${F(h.max)} LT</b></span>
		<span class="hold-line sub"><span>fits</span><b>${perLevel}</b></span>
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
		<div class="panel-head"><h2 class="panel-title">Fitted out</h2>
			<span class="panel-sub">Hull: ${F(s.weight)} LT · ${s.slots} slots · ${s.cannons ? `${s.cannons} cannons a side, ${s.reload} s` : 'no cannons'} · ${F(s.durability)} durability · ${F(s.rations)} rations</span></div>
		<p class="fit-hint">What the Map sails and the hold it carries follow this. The best part you hold goes in each slot by itself; choose another for one you have not recorded, or to weigh a plan.</p>
		${rows}
		<div class="sel-facts">with parts${same && me.crew.seated ? ' and crew' : ''}: speed <b>${same ? me.speed.total : s.speed + (Number(fit.total.speed) || 0)}%</b> · accel <b>${same ? me.accel : s.accel + (Number(fit.total.accel) || 0)}%</b> · turn <b>${same ? me.turn : s.turn + (Number(fit.total.turn) || 0)}%</b> · brake <b>${same ? me.brake : s.brake + (Number(fit.total.brake) || 0)}%</b>
			· hold <b>${F(hold.free)} LT</b>${hold.crew ? ` <span class="fit-tag">(${F(hold.limit)} less ${F(hold.crew)} of crew)</span>` : ''} · <b>${F(same ? me.durability : s.durability + (Number(fit.total.durability) || 0))}</b> durability${fit.total.dp ? ` · DP <b>${fit.total.dp}</b>` : ''}${fit.total.damage ? ` · cannon <b>${F(fit.total.damage)}</b> × ${fit.total.hits}` : ''}</div>
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
	const list = listSetups();
	if (!list.length) return '';
	const active = activeSetupId();
	const now = list.find(s => s.id === active);
	const sum = now ? setupSummary(now) : null;
	const hulls = new Set(list.map(s => s.ship)).size;

	const sailing = now && sum
		? `<span class="fleet-now"><span class="setup-flag">⚓</span>${esc(now.name)}
			<span class="setup-fig">speed <b>${sum.speed}%</b></span>
			<span class="setup-fig">hold <b>${F(sum.hold)} LT</b></span>
			<span class="setup-fig">fitted <b>${sum.fittedCount}/${sum.slots}</b></span>
			${sum.skinned ? `<span class="setup-fig">skin <b>${sum.skinned}/4</b></span>` : ''}</span>`
		: '<span class="fleet-now none">This hull is not one of your saved setups yet</span>';

	return `<div class="panel setups-panel">
		<div class="panel-head"><h2 class="panel-title">Fleet</h2>
			<span class="panel-sub">${list.length === 1 ? 'One ship kept' : `${list.length} kept across ${hulls === 1 ? 'one hull' : `${hulls} hulls`}`}</span></div>
		<div class="fleet-bar">
			${sailing}
			<button class="act quiet small" data-act="crew-fleet">Your fleet${list.length > 1 ? ` (${list.length})` : ''}…</button>
		</div>
	</div>`;
}

/** The picker of setups, for the Map: sail one without leaving the chart. */
export function openSetupPicker(after) {
	const list = listSetups();
	const active = activeSetupId();
	openPicker({
		title: 'Sail which setup?',
		hint: list.length ? 'The Map times routes at the speed of the setup sailed; the roster is shared.' : 'No setups kept yet — on the Ship tab, "Save as setup…" keeps the current hull with its parts, crystal and seating.',
		items: list.map(s => ({ id: s.id, label: s.name, icon: img(s.ship, ''), sub: s.ship, meta: s.id === active ? 'sailing now' : '' })),
		onPick: id => { if (loadSetup(id)) { toast(`Sailing ${(list.find(s => s.id === id) || {}).name}`); if (after) after(); } }
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
				<div class="summary-k">Your ship</div>
				<div class="crew-ship-name">${codexName(ship)}</div>
				<div class="row-sub">${esc(stats.note || '')}</div>
			</div>
		</div>
		<div class="ship-card-facts">
			<div><div class="summary-k">Speed</div><div class="summary-v">${me.speed.total}%</div><div class="summary-sub">hull ${stats.speed}${me.speed.parts ? ` + parts ${me.speed.parts}` : ''}${me.speed.crystal ? ` + crystal ${me.speed.crystal}` : ''}${me.speed.crew ? ` + crew ${me.speed.crew}` : ''}${me.mastery ? ` + mastery ${me.mastery}` : ''}${me.speed.skin ? ` + skin ${me.speed.skin}` : ''}</div></div>
			<div><div class="summary-k">Hold</div><div class="summary-v">${F(me.hold.free)} LT</div><div class="summary-sub">${F(me.hold.limit)} as fitted${me.hold.crew ? ` less ${F(me.hold.crew)} of crew` : ''}</div></div>
			<div><div class="summary-k">Fitted</div><div class="summary-v">${fittedN + (me.crystal ? 1 : 0)} of 5</div><div class="summary-sub">${stats.crew ? `${me.crew.seated} of ${stats.crew} seats taken` : 'carries no sailors'}</div></div>
		</div>
		<div class="ship-card-btns">
			<button class="act quiet small" data-act="crew-ship-pick" title="Which hull you sail — the Map and the Plan follow it">⚓ Change ship</button>
			<button class="act quiet small" data-act="crew-setup-save" title="Keep this hull with its parts, crystal and seating under a name, to come back to">Save as setup…</button>
			<button class="act quiet small" data-act="crew-link" title="A link that carries this hull, its parts and its crew">Copy link</button>
		</div>
		<label class="crew-mastery" title="Sailing Mastery, as the game shows it: half a point of speed, acceleration, turn and brake per fifty up to 2,000, a quarter-point per fifty to 3,000">
			<span class="summary-k">Sailing mastery</span>
			<input class="field purse-inline narrow" type="number" min="0" max="3000" step="50" inputmode="numeric" value="${store.getProfile('sailingMastery', 0) || ''}" placeholder="0" data-act="crew-mastery" aria-label="Sailing mastery">
			<span class="summary-sub">${me.mastery ? `+${me.mastery}% speed, acceleration, turn and brake` : 'adds to speed, acceleration, turn and brake'}</span>
		</label>
	</div>`;
	if (!stats.crew) {
		return head + setupsRow() + `<div class="panel"><p class="empty">${esc(ship)} carries no sailors. Pick a crewed hull to plan one.</p></div>` + loadoutPanel(ship);
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
		label: t.type,
		icon: face(t, { name: t.type }),
		sub: t.mate ? `first mate · ${t.skill || ''}` : `${t.race} · ${t.cabin} cabins · eats ${t.appetite} · +${t.weight} LT · hired at ${(t.at || []).join(', ')}`,
		meta: t.mate ? '★ mate' : `spd ${l10avg(t, 'speed')} · acc ${l10avg(t, 'accel')} · turn ${l10avg(t, 'turn')} · brk ${l10avg(t, 'brake')}`,
		// A sorted list interleaves the races, and the picker names a
		// group on every change of it -- so a sorted list goes flat.
		group: flat ? null : t.mate ? 'First mates' : t.race
	};
}

function hireDialog() {
	// The pool is authored best-growth-first, which scatters the races;
	// the picker groups adjacent runs, so it printed fifteen headings.
	// Sorted by each race's first appearance, the order inside a race
	// still reads best-first, and every race is named once.
	const races = [...new Set(pool.map(t => t.race))];
	const byRace = [...pool].sort((a, b) => races.indexOf(a.race) - races.indexOf(b.race));
	const STATS = [['speed', 'Speed'], ['accel', 'Accel'], ['turn', 'Turn'], ['brake', 'Brake']];
	let race = null;      // one race, or all of them
	let sortBy = null;    // a growth to rank by, or the authored order
	const chips = () => [
		...races.map(r => ({ id: `race:${r}`, label: r, on: race === r })),
		...STATS.map(([k, label]) => ({ id: `sort:${k}`, label: `▾ ${label}`, on: sortBy === k }))
	];
	const items = () => {
		let list = byRace.filter(t => !race || t.race === race);
		if (sortBy) list = [...list].sort((a, b) => l10avg(b, sortBy) - l10avg(a, sortBy));
		return [...list, ...(race ? [] : mateTypes)].map(t => typeRow(t, Boolean(sortBy)));
	};
	openPicker({
		title: 'Hire a sailor',
		hint: `Which type — the portrait is the one the wharf shows. A ${esc(contract.item)} each, ${F(contract.silver)} silver. `
			+ 'The figures are the level-10 average — each level-up rolls in a hidden range. A race narrows the list, a stat ranks it.',
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
		<h2>Hire a sailor</h2>
		<div class="hire-type"><span class="roster-tile big" style="background:${RACE[(t && t.race) || 'Human']}">${face(t, { name: type })}</span>
			<div><b>${esc(type)}</b><div class="row-sub">${t && t.mate ? 'first mate' : `${t.race} · ${t.cabin} cabins`}</div></div>
			<button class="link-btn" data-retype>change type</button></div>
		<label class="dialog-field">Name <input class="field" data-name placeholder="as the game named them" maxlength="30"></label>
		<label class="dialog-field">Level <input class="field" data-lv value="1" inputmode="numeric" style="max-width:80px"></label>
		<div class="dialog-actions">
			<button class="act quiet" data-close>Cancel</button>
			<button class="act" data-hire>Hire</button>
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
		toast(`${name} joins the roster — tap a seat to place them`, true);
	});
	host.querySelector('[data-name]').focus();
}

/** Every crew-* click. Returns false for one this screen does not own. */
export function crewAction(act, el) {
	const ship = crewShip();
	const id = el.dataset.id;
	switch (act) {
		case 'crew-select': selId = selId === id ? null : id; return true;
		case 'crew-fleet': openFleet(); return true;
		case 'crew-skin-all': {
			const on = el.dataset.on === '1';
			setSkinAll(crewShip(), on);
			toast(on ? 'Set on — its stats now count' : 'Set taken off');
			return true;
		}
		case 'crew-setup-load': if (loadSetup(id)) toast('Sailing it'); return true;
		case 'crew-setup-del': deleteSetup(id); return true;
		case 'crew-setup-save': {
			const host = openDialog(`
				<h2>Keep this setup</h2>
				<p class="dialog-copy">${esc(ship)} with what is fitted, its crystal and who sits where. The Map can switch between setups; the crew roster itself is shared by all of them.</p>
				<input class="field" type="text" maxlength="40" placeholder="A name — “Barter Carrack”" data-setup-name value="${esc(ship)}">
				<div class="dialog-actions">
					<button class="ghost-btn" data-close>Cancel</button>
					<button class="act" data-setup-save>Keep it</button>
				</div>`);
			const input = host.querySelector('[data-setup-name]');
			input.focus(); input.select();
			const save = () => { saveSetup(input.value); closeDialog(); toast(`Kept “${input.value.trim() || ship}”`); document.dispatchEvent(new CustomEvent('quests-refilter')); };
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
					el.textContent = `Dismiss ${ids.size} — sure?`;
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
				toast(`${ids.size} struck off the roster`, true);
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
			store.addStock(el.dataset.item, 1, `+1 ${el.dataset.item}`);
			toast(`${el.dataset.item} recorded in your inventory`, true);
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
			if (s) toast(`${s.name} struck off the roster`, true);
			return true;
		}
		case 'crew-preset-save': {
			const all = { ...(store.getProfile('presets', {}) || {}) };
			all[ship] = { ...(all[ship] || {}), [el.dataset.p]: { ...seatsOf(ship) } };
			store.setProfile('presets', all);
			toast(`Crew saved as ${el.dataset.p === 'p1' ? 'Preset 1' : 'Preset 2'}`);
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
			toast(`${n} × ${contract.item} on the list`, true);
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
		return {
			id: name, label: name, icon: img(name, ''),
			sub: s.crew ? `${s.crew} sailors · ${s.cabins} cabin space · ${F(s.weight)} LT · ${s.slots} slots · speed ${s.speed}%` : `no crew · ${F(s.weight)} LT · speed ${s.speed}%`,
			meta: stock[name] ? 'you hold one' : queued.has(name) ? 'in your queue' : '',
			group: s.crew ? 'Ships' : 'Small craft'
		};
	});
	openPicker({
		title: 'Which ship do you sail?',
		hint: 'The Map times routes and sizes the hold from this hull, as fitted and crewed here.',
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
	const tierOf = part => (tables[families[part]] || {}).label || 'Other';
	const items = partsForSlot(ship, slot).map(part => ({
		id: part, label: part, icon: img(part, ''),
		sub: `at +10: ${describeStats(statsAt(part, 10), { signed: false })}`,
		meta: held(part).length ? `you hold ${held(part).join(', ')}` : '',
		group: tierOf(part)
	}));
	openPicker({
		title: `${SLOT_LABEL[slot]} — which part?`,
		hint: 'Then its level. A part you do not hold can still be chosen — to weigh a plan, or to record it afterwards.',
		items,
		onPick: part => levelPicker(ship, slot, part)
	});
}

function levelPicker(ship, slot, part) {
	const stock = store.getAllStock();
	const items = [];
	for (let lv = 0; lv <= 10; lv++) {
		const item = enhancedName(part, lv);
		items.push({ id: item, label: `+${lv}`, icon: img(item, ''), sub: describeStats(statsAt(part, lv), { signed: false }), meta: stock[item] ? `you hold ${F(stock[item])}` : '' });
	}
	openPicker({ title: `${part} — which level?`, items, onPick: item => setFitted(ship, slot, item) });
}

/** Which crystal: every one the codex knows, by grade, the effect beside it. */
function crystalPicker(ship) {
	const now = crystalFor(ship);
	const items = [];
	for (const g of GRADES) {
		for (const c of crystalsOf(g.id)) {
			items.push({
				id: String(c.id), label: `${c.name} — ${crystalVariant(c)}`, icon: img(c.name, ''),
				sub: crystalLine(c), meta: g.local ? 'its sea only' : 'every sea',
				group: `${g.label} · ${g.note}`
			});
		}
	}
	openPicker({
		title: 'Which sea crystal?',
		hint: 'One slot. Every grade lifts one stat; Rusalka lifts it most and works in every sea, and the Oceanteared Nol is a Rusalka crystal with the Nol\'s BreezySail on top.',
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
		toast('Ship setup link copied');
	} catch {
		toast('Could not build or copy the link');
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
	store.setProfileMany(patch, `Took a ship from a link: ${setup.ship}`);
	return true;
}

/** A name, level or condition typed into the selected sailor's panel. */
export function crewChange(el) {
	const act = el.dataset.act;
	const id = el.dataset.id;
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
		if (act === 'crew-lv') return { ...s, lv: Math.min(10, Math.max(1, Math.floor(Number(el.value) || s.lv))) };
		const cond = Number(el.value);
		return { ...s, cond: Number.isFinite(cond) ? Math.min(100, Math.max(0, Math.floor(cond))) : s.cond };
	}));
	return true;
}
