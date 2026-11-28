// Putting away: what is carried -- the bags, the character bag, the
// ship's hold -- taken to one storage in a click, as a sailor does in the
// game after the dailies or a run. The same bar on every tab that fills
// the bags; the Inventory adds a card a place, so where everything is
// reads at a glance.

import { esc, F } from './fmt.js';
import { T, gameName } from './i18n.js';
import * as store from './state.js';
import { img } from './ui-bits.js';
import { TOWNS } from './screen-inventory.js';

/** A carried place in words. */
function placeName(p) {
	return p === '' ? T('Inventory (bags)') : p === store.ABOARD ? T("Ship's hold") : gameName(p);
}

/** How many are carried, place by place. */
function carriedBy() {
	const by = new Map(store.CARRIED.map(p => [p, 0]));
	for (const at of Object.values(store.whereAll())) for (const [p, n] of Object.entries(at)) if (by.has(p)) by.set(p, by.get(p) + n);
	return by;
}

/** The storage picker, the one remembered selected. */
function toSelect() {
	const to = store.getProfile('putAwayTo', '') || '';
	return `<select class="field select" data-act="put-away-to" aria-label="${T('The storage to put things away at')}"><option value="">${T('choose a storage…')}</option>${TOWNS.filter(t => !store.CARRIED.includes(t)).map(t => `<option value="${esc(t)}"${t === to ? ' selected' : ''}>${esc(gameName(t))}</option>`).join('')}</select>`;
}

/**
 * The bar: what is carried, the storage, and the button. `quiet` hides
 * it while nothing is carried -- on the tabs that are not about where
 * things are.
 */
export function putAwayHTML({ quiet = false } = {}) {
	const by = carriedBy();
	const total = [...by.values()].reduce((a, b) => a + b, 0);
	if (!total && quiet) return '';
	const to = store.getProfile('putAwayTo', '') || '';
	const said = [...by].filter(([, n]) => n > 0).map(([p, n]) => T('{n} in {place}', { n: F(n), place: placeName(p) })).join(' · ');
	return `<div class="put-away">
		<span class="put-away-k">${total ? T('Carried: {list}', { list: said }) : T('Nothing carried: everything is in a storage.')}</span>
		<span class="panel-spacer"></span>
		<label class="put-away-to"><span>${T('put it all away at')}</span>${toSelect()}</label>
		<button class="chip primary" data-act="put-away"${total && to ? '' : ' disabled'} title="${T('Note everything carried at that storage, as in the game after the dailies or a run; the totals do not change')}">${T('Put away')}</button>
	</div>`;
}

/**
 * The Inventory's view of where everything is: a card a place, the
 * carried ones first, each with what it holds and, for a carried one,
 * its own button.
 */
export function placesHTML() {
	const all = store.whereAll();
	const by = new Map();
	for (const [item, at] of Object.entries(all)) for (const [p, n] of Object.entries(at)) {
		if (!by.has(p)) by.set(p, []);
		by.get(p).push([item, n]);
	}
	if (!by.size) return '';
	const to = store.getProfile('putAwayTo', '') || '';
	const carried = p => store.CARRIED.includes(p);
	const order = [...by].sort((a, b) => Number(carried(b[0])) - Number(carried(a[0]))
		|| store.CARRIED.indexOf(a[0]) - store.CARRIED.indexOf(b[0])
		|| b[1].length - a[1].length || a[0].localeCompare(b[0]));
	const card = ([p, list]) => {
		list.sort((a, b) => b[1] - a[1]);
		const n = list.reduce((a, [, k]) => a + k, 0);
		const icons = list.slice(0, 12).map(([item, k]) => `<span class="place-ico" title="${esc(T('{n}× {item}', { n: F(k), item: gameName(item) }))}">${img(item, 'row-icon sm')}<i>${F(k)}</i></span>`).join('');
		const more = list.length > 12 ? `<span class="place-more">${T('+{n} more', { n: F(list.length - 12) })}</span>` : '';
		return `<div class="place-card${carried(p) ? ' carried' : ''}">
			<div class="place-head"><b>${esc(placeName(p))}</b><span>${list.length === 1 ? T('1 kind') : T('{n} kinds', { n: F(list.length) })} · ${F(n)}</span></div>
			<div class="place-icos">${icons}${more}</div>
			${carried(p) && to ? `<button class="chip tiny" data-act="put-away" data-from="${esc(p)}" title="${T('Only what is here, to {town}', { town: esc(gameName(to)) })}">${T('→ {town}', { town: esc(gameName(to)) })}</button>` : ''}
		</div>`;
	};
	return `<details class="inv-places" open><summary><span class="inv-homes-k">${T('Where everything is')}</span><span class="inv-homes-v">${by.size === 1 ? T('1 place') : T('{n} places', { n: F(by.size) })}</span></summary>
		${putAwayHTML()}
		<div class="place-cards">${order.map(card).join('')}</div>
	</details>`;
}
