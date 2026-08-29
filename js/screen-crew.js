// The Crew screen: the hull's own numbers, and the sailors to fill it.
//
// A ship is only half of what sails: the plan for the other half is a
// crew that fits its cabins, and this is where that plan is made. Which
// hull, how many of which sailor, what that costs in contracts and cabin
// space, and what it grows into -- measured against the hull's seats,
// which is the limit the game actually enforces.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { img, codexName } from './ui-bits.js';
import { shipStats, crewedShips } from './ship_stats.js';
import {
	pool, poolByType, positions, care, rations, expSplit, firstMates, slotSources,
	contract, planCrew, SAILOR_CAP
} from './sailors.js';

/**
 * The hull the crew is planned for: the one chosen here, else the
 * largest crewed ship in the queue, else the first ship anyone sails.
 */
export function crewShip() {
	const chosen = store.getProfile('crewShip', null);
	if (chosen && shipStats[chosen]) return chosen;
	const queued = store.getTargets().map(t => t.item).filter(i => shipStats[i] && shipStats[i].crew > 0);
	if (queued.length) return queued.sort((a, b) => shipStats[b].crew - shipStats[a].crew || shipStats[b].cabins - shipStats[a].cabins)[0];
	return 'Epheria Sailboat';
}

const pct = n => `${n}%`;

function statTiles(ship) {
	const s = shipStats[ship];
	const tile = (k, v, sub = '') => `<div class="stat">
		<div class="stat-k">${k}</div>
		<div class="stat-v">${v}</div>
		${sub ? `<div class="stat-sub">${sub}</div>` : ''}
	</div>`;
	return `<div class="stats">
		${tile('Weight limit', `${F(s.weight)} LT`)}
		${tile('Inventory', `${s.slots} slots`)}
		${tile('Sailors', s.crew ? `${s.crew}` : '—', s.crew ? `${F(s.cabins)} cabin space` : 'no crew aboard')}
		${tile('Cannons', s.cannons ? `${s.cannons} a side` : '—', s.cannons ? `reload ${s.reload} s` : '')}
		${tile('Durability', F(s.durability), s.lifespan ? `lifespan ${F(s.lifespan)}, not repairable` : '')}
		${tile('Rations', F(s.rations))}
		${tile('Speed', pct(s.speed), `accel ${pct(s.accel)}`)}
		${tile('Turn', pct(s.turn), `brake ${pct(s.brake)}`)}
	</div>`;
}

function crewTable(ship, crew, totals) {
	const growth = s => ['speed', 'accel', 'turn', 'brake'].map(k => s[k]).join(' / ')
		+ (s.force !== undefined ? ` · cannon ${s.force} / ${s.focus} / ${s.vision}` : '');
	const rows = pool.map(s => {
		const n = crew[s.type] || 0;
		return `<div class="row crew-row ${n ? 'on' : ''}" data-peek="">
			<div class="row-main">
				<div class="row-name">${esc(s.type)} <span class="crew-race">${esc(s.race)}</span></div>
				<div class="row-sub">${s.cabin} cabins · eats ${s.appetite} · +${s.weight} LT · hired at ${esc(s.at.join(', '))}${s.note ? ` · ${esc(s.note)}` : ''}</div>
				<div class="row-sub crew-growth" title="Growth per level: speed / acceleration / turn / brake${s.force !== undefined ? ', then cannon force / focus / vision' : ''}">grows ${growth(s)}</div>
			</div>
			<span class="stepper">
				<button data-act="sailor" data-type="${esc(s.type)}" data-delta="-1" aria-label="One fewer ${esc(s.type)}" ${n ? '' : 'disabled'}>−</button>
				<span class="qty-val">${n}</span>
				<button data-act="sailor" data-type="${esc(s.type)}" data-delta="1" aria-label="One more ${esc(s.type)}">+</button>
			</span>
		</div>`;
	}).join('');

	const over = [];
	if (totals.overSeats) over.push(`${totals.overSeats} more sailor${totals.overSeats > 1 ? 's' : ''} than the hull seats`);
	if (totals.overSpace) over.push(`${F(totals.overSpace)} cabin space over`);
	if (totals.sailors > SAILOR_CAP) over.push(`past the account's ${SAILOR_CAP}-sailor cap`);

	const summary = `<div class="summary">
		<div><div class="summary-k">Seated</div>
			<div class="summary-v ${totals.overSeats ? 'amber' : ''}">${totals.sailors} / ${totals.seats}</div>
			<div class="summary-sub">${F(totals.cabins)} of ${F(totals.space)} cabin space</div></div>
		<div><div class="summary-k">Contracts</div>
			<div class="summary-v">${F(totals.silver / 1e6)}m</div>
			<div class="summary-sub">${totals.sailors} × ${F(contract.silver)} silver</div></div>
		<div><div class="summary-k">Grows per level</div>
			<div class="summary-v">${totals.speed.toFixed(1)} / ${totals.accel.toFixed(1)} / ${totals.turn.toFixed(1)} / ${totals.brake.toFixed(1)}</div>
			<div class="summary-sub">speed / accel / turn / brake${totals.force || totals.focus || totals.vision ? ` · cannon ${totals.force.toFixed(1)} / ${totals.focus.toFixed(1)} / ${totals.vision.toFixed(1)}` : ''}</div></div>
		<div><div class="summary-k">Aboard</div>
			<div class="summary-v">+${F(totals.weight)} LT</div>
			<div class="summary-sub">eats ${F(totals.appetite)} rations a day</div></div>
	</div>
	${over.length ? `<p class="crew-over">${esc(over.join(' · '))} — the game will not let this crew board.</p>` : ''}`;

	return `${summary}
	<div class="crew-actions">
		<button class="act" data-act="crew-queue" ${totals.sailors ? '' : 'disabled'}
			title="Queues the certificates as a build, so the silver shows in To Get">Put ${totals.sailors || 'the'} ${esc(contract.item)}${totals.sailors === 1 ? '' : 's'} on the list</button>
		<button class="act quiet" data-act="crew-clear" ${totals.sailors ? '' : 'disabled'}>Clear the crew</button>
	</div>
	${rows}`;
}

function guidePanels() {
	const posRows = positions.map(p => `<div class="kv-row"><span>${esc(p.name)}</span><span>${esc(p.effect)} — ${esc(p.for)}</span></div>`).join('');
	const careRows = care.map(c => `<div class="row">
		${img(c.item, 'row-icon sm')}
		<div class="row-main"><div class="row-name">${codexName(c.item)}</div><div class="row-sub">${esc(c.effect)} · ${esc(c.from)}</div></div>
	</div>`).join('');
	const rationRows = rations.map(r => `<div class="kv-row"><span>${esc(r.grade)} food</span><span>${F(r.restores)} rations</span></div>`).join('');
	const expRows = expSplit.map(e => `<div class="kv-row"><span>${e.aboard}${e.note ? '+' : ''} aboard</span><span>${e.each === null ? '' : `${e.each}% each, `}${e.total}% in all${e.note ? ` — ${esc(e.note)}` : ''}</span></div>`).join('');
	const mateRows = firstMates.map(m => `<div class="kv-row"><span>${esc(m.name)}</span><span>${esc(m.trait)} — ${esc(m.from)}</span></div>`).join('');
	const slotRows = slotSources.map(s => `<div class="kv-row"><span>+${s.oaths}</span><span>${esc(s.from)}</span></div>`).join('');

	return `<div class="panel">
		<div class="panel-head"><h2 class="panel-title">Where each one stands</h2>
			<span class="panel-sub">A position doubles some of a sailor's stats and ignores the rest, so the Sail wants the fast ones and the Deck the expensive ones</span></div>
		<div class="kv">${posRows}</div>
	</div>
	<div class="panel">
		<div class="panel-head"><h2 class="panel-title">Keeping them well</h2>
			<span class="panel-sub">Condition falls as they work; a sailor at zero falls sick and does nothing until cured</span></div>
		${careRows}
		<div class="kv" style="margin-top:12px">${rationRows}</div>
	</div>
	<div class="panel">
		<div class="panel-head"><h2 class="panel-title">Levelling</h2>
			<span class="panel-sub">Sailing experience is shared out: each sailor gets less, the crew gets more</span></div>
		<div class="kv">${expRows}</div>
	</div>
	<div class="panel">
		<div class="panel-head"><h2 class="panel-title">First mates</h2>
			<span class="panel-sub">Three sailors with names, each with a trait the First Mate position switches on</span></div>
		<div class="kv">${mateRows}</div>
	</div>
	<div class="panel">
		<div class="panel-head"><h2 class="panel-title">Sailor slots</h2>
			<span class="panel-sub">The account holds ${SAILOR_CAP} at most; every Sailor's Oath is one more slot</span></div>
		<div class="kv">${slotRows}</div>
	</div>`;
}

export function renderCrew() {
	const ship = crewShip();
	const s = shipStats[ship];
	const crew = store.getProfile('sailors', {}) || {};
	const totals = planCrew(crew, s);
	const options = Object.keys(shipStats).map(name =>
		`<option value="${esc(name)}"${name === ship ? ' selected' : ''}>${esc(name)}</option>`).join('');

	return `<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title teal">The hull</h2>
			<span class="panel-sub">${esc(s.note || '')}</span>
			<span class="panel-spacer"></span>
			<select class="select" data-act="crew-ship" aria-label="Which ship to plan the crew for">${options}</select>
		</div>
		<div class="crew-ship">${img(ship, 'row-icon lg')}<span class="crew-ship-name">${codexName(ship)}</span></div>
		${statTiles(ship)}
	</div>
	${s.crew ? `<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title">The crew</h2>
			<span class="panel-sub">Each sailor costs a ${esc(contract.item)} (${F(contract.silver)} silver from ${esc(contract.sellers)}) and is hired at ${esc(contract.hireAt)}. The numbers after "grows" are how fast each stat climbs per level</span>
		</div>
		${crewTable(ship, crew, totals)}
	</div>` : `<div class="panel"><p class="empty">${esc(ship)} carries no sailors. Pick a crewed hull above to plan one${crewedShips.length ? '' : '.'}.</p></div>`}
	${guidePanels()}`;
}

/** Add or remove one sailor of a type from the plan. */
export function bumpSailor(type, delta) {
	if (!poolByType[type]) return;
	const crew = { ...(store.getProfile('sailors', {}) || {}) };
	const next = Math.max(0, (crew[type] || 0) + delta);
	if (next) crew[type] = next; else delete crew[type];
	store.setProfile('sailors', crew);
}
