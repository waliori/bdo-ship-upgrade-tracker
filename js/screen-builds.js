// The Builds screen: the priority queue, the route choices behind an
// upgrade with two ways in, and the picker that queues something new.

import { routes, routeInfo } from './recipes.js';
import { shipGroups } from './ships.js';
import { esc, F } from './fmt.js';
import * as store from './state.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { img, codexName, amountInput, costCtx, costText, buildableItems } from './ui-bits.js';
import { snapshot } from './ui-state.js';
import { planOne, bottlenecks, routeOf, remainingCost } from './planner.js';


export function renderBuilds() {
	const targets = store.getTargets();
	const byId = new Map(snapshot.targets.map(t => [t.id, t]));

	const head = `<div class="queue-head">
		<span class="queue-title">Build queue</span>
		<span class="queue-note">Scarce stock goes to the build nearest the top</span>
		<span class="panel-spacer"></span>
		<button class="act add-build" data-act="add-build">+ Add a build</button>
	</div>`;

	const list = targets.length ? targets.map((t, i) => {
		const r = byId.get(t.id);
		const pct = r ? r.progress : 0;
		const state = !t.active ? 'paused' : pct >= 100 ? 'done' : '';
		const stateLabel = !t.active ? 'Paused' : pct >= 100 ? 'Ready' : 'In progress';
		const units = r
			? (r.missingUnits > 0 ? `${F(r.missingUnits)} of ${F(r.totalUnits)} units still needed` : 'everything on hand')
			: '';
		return `<div class="build ${t.active ? '' : 'paused'}" data-target="${esc(t.id)}">
			${img(t.item, 'row-icon lg')}
			<div class="build-main">
				<div class="build-titles">
					<span class="build-name">${codexName(t.item)}</span>
					<span class="build-state ${state}">${stateLabel}</span>
				</div>
				<div class="bar tall"><i class="fill" style="width:${pct.toFixed(1)}%"></i></div>
				<div class="build-meta">Priority ${i + 1} · <span class="n">${pct.toFixed(1)}%</span> · ${esc(units)}${routeNote(t.item)}</div>
				${(() => {
					// The bill for finishing this one: every leaf its tree
					// could neither cover from stock nor make, priced the
					// way the plan will actually get it.
					if (!r || r.missingUnits <= 0) return '';
					const left = remainingCost(r.tree, costCtx());
					return `<div class="build-cost">Still to get: ${esc(costText(left))}</div>`;
				})()}
			</div>
			<div class="build-actions">
				<button class="sq-btn" data-act="move" data-dir="-1" title="Raise priority" ${i === 0 ? 'disabled' : ''}>▲</button>
				<button class="sq-btn" data-act="move" data-dir="1" title="Lower priority" ${i === targets.length - 1 ? 'disabled' : ''}>▼</button>
				<span class="stepper">
					<button data-act="qty" data-delta="-1" aria-label="Fewer">−</button>
					${amountInput('val', t.qty, `data-act="target-qty" data-target="${esc(t.id)}" aria-label="How many to build"`)}
					<button data-act="qty" data-delta="1" aria-label="More">+</button>
				</span>
				<button class="sq-btn" data-act="pause" title="Pause or resume">${t.active ? '⏸' : '▶'}</button>
				<button class="sq-btn danger" data-act="remove" title="Remove">×</button>
			</div>
		</div>`;
	}).join('') : '<div class="panel"><p class="empty">Nothing queued yet. Add a ship or a part above and the rest follows from it.</p></div>';

	const blockers = bottlenecks(snapshot, 5);
	const blockHTML = blockers.length ? `<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title amber">Biggest blockers</h2>
			<span class="panel-sub">Missing items holding up the queue</span>
		</div>
		${blockers.map(b => `<div class="row">
			${img(b.item, 'row-icon md')}
			<div class="row-main">
				<div class="row-name">${codexName(b.item)}</div>
				<div class="row-sub">blocks ${esc(b.targets.join(', '))}</div>
			</div>
			<span class="qty-out">${F(b.qty)} short</span>
		</div>`).join('')}
	</div>` : '';

	return head + list + blockHTML;
}

/**
 * Which way round to build something that can be reached two ways.
 *
 * The Caravel takes either an Epheria Sailboat or an Improved one, and
 * the Galleass either Frigate. bdocodex lists both with the same
 * materials, so the step is the same either way -- what differs is
 * whether you build the Improved first, which is a whole upgrade of its
 * own and wants four more Epheria: Old parts.
 *
 * Neither is presented as the right answer. What each costs is shown,
 * and the choice is the user's.
 */
export function routeOptions(item) {
	const variants = routes[item];
	if (!variants) return '';
	const chosen = routeOf(item, store.getAllStrategy());
	const info = routeInfo[item] || {};
	const stock = store.getAllStock();

	return Object.keys(variants).map(name => {
		const meta = info[name] || {};
		const on = name === chosen;
		// What this route asks for beyond the step they share, priced from
		// nothing so the two are comparable.
		const cost = planOne(item, 1, {}, { ...store.getAllStrategy(), [item]: name });
		const units = Object.values(cost.missing).reduce((a, b) => a + b, 0);
		const held = (stock[meta.via] || 0) > 0;
		return `<button class="route ${on ? 'on' : ''}" data-act="route" data-item="${esc(item)}" data-route="${esc(name)}">
			<span class="route-head">
				<span class="route-name">${esc(meta.label || name)}</span>
				${held ? '<span class="route-have">you have one</span>' : ''}
			</span>
			<span class="route-cost">${F(units)} units of material in total</span>
			${meta.gains ? `<span class="route-gain">${esc(meta.gains)}</span>` : ''}
		</button>`;
	}).join('');
}

/** " · via the Improved Epheria Sailboat — change", on a build that has
 *  more than one way in. */
export function routeNote(item) {
	if (!routes[item]) return '';
	const chosen = routeOf(item, store.getAllStrategy());
	const meta = (routeInfo[item] || {})[chosen] || {};
	return ` · via <b>${esc(meta.via || chosen)}</b>` +
		` <button class="linky" data-act="ask-route" data-item="${esc(item)}">change</button>`;
}

/** The choice, as its own dialog -- asked when a build is queued, and
 *  reachable again from the build afterwards. */
export function askRoute(item, { onPick } = {}) {
	const host = openDialog(`
		<h2>${esc(item)}</h2>
		<p>There are two ways to build this one. Pick either — you can change your mind later from the build.</p>
		<div class="route-list">${routeOptions(item)}</div>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>
	`);
	host.querySelectorAll('[data-act="route"]').forEach(btn => {
		btn.addEventListener('click', () => {
			store.setStrategy(item, btn.dataset.route);
			closeDialog();
			if (onPick) onPick(btn.dataset.route);
		});
	});
	return host;
}

/** Searchable, icon-led list of everything that can be queued. */
export function openBuildPicker() {
	const queued = new Set(store.getTargets().map(t => t.item));
	// shipGroups[0] is the ships themselves; anything else grouped there is
	// a trackable part, and everything else is a material.
	const kindOf = name => {
		for (const [i, group] of shipGroups.entries()) {
			if (group.items.includes(name)) return i === 0 ? 'ship' : 'part';
		}
		return 'material';
	};

	const host = openDialog(`
		<h2>Add a build</h2>
		<p>Anything with a recipe can be queued — a ship, a part, or a stack of materials.</p>
		<input class="field picker-search" type="search" placeholder="Search ships, parts and materials…" data-picker-search>
		<div class="picker" data-picker></div>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>
	`);

	const listEl = host.querySelector('[data-picker]');
	const searchEl = host.querySelector('[data-picker-search]');

	const paint = term => {
		const t = (term || '').trim().toLowerCase();
		const matches = buildableItems().filter(n => !t || n.toLowerCase().includes(t));
		listEl.innerHTML = matches.length
			? matches.slice(0, 200).map(n => {
				const already = queued.has(n);
				return `<button type="button" class="picker-row" data-pick="${esc(n)}" data-peek="${esc(n)}" ${already ? 'disabled' : ''}>
					${img(n, 'row-icon sm')}
					<span class="picker-name">${esc(n)}</span>
					<span class="picker-tag">${already ? 'queued' : kindOf(n)}</span>
				</button>`;
			}).join('')
			: '<p class="empty">Nothing matches that search.</p>';
	};

	paint('');
	searchEl.addEventListener('input', () => paint(searchEl.value));
	listEl.addEventListener('click', evt => {
		const btn = evt.target.closest('[data-pick]');
		if (!btn || btn.disabled) return;
		const item = btn.getAttribute('data-pick');
		store.addTarget(item, 1);
		closeDialog();
		// Something with two ways in asks straight away, while the choice
		// is still the thing you are thinking about -- not later, buried
		// in a panel about inventory.
		if (routes[item]) {
			askRoute(item, { onPick: () => toast(`${item} added to the queue`) });
			return;
		}
		toast(`${item} added to the queue`);
	});
	searchEl.focus();
}
