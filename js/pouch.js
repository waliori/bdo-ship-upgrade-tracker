// The pouch, on every tab. Spent from wherever you happen to be, so it
// sits in the shell above the tabs instead of belonging to one screen.

import { esc, F, FC } from './fmt.js';
import * as store from './state.js';
import { img } from './ui-bits.js';
import { rows, totalsToGo, CROW_COIN, SILVER, SANGPYEONG, STONES } from './ui-state.js';
import { profileHTML, profilePeekHTML } from './profile-bar.js';
import { tickClocks } from './clock.js';
import { isPhone } from './viewport.js';
import { openDialog } from './dialogs.js';

/**
 * What is in the bags, in the order the bar says it.
 *
 * Coins and stones are earned or dropped, not priced, so they join the
 * bar only once a build wants them or you are holding some -- that way
 * a Carrack plan never carries a Panokseon currency it has no use for.
 */
function purses() {
	const totals = totalsToGo();

	const entries = [
		{ item: CROW_COIN, label: 'Crow Coins', need: totals.coins, where: "Crow Coin Shop, Oquilla's Eye" },
		{ item: SILVER, label: 'Silver', need: totals.silver, where: 'Falasi, port of Epheria', glyph: '◉' }
	];

	const carried = (item, label, where) => {
		const need = rows[item] ? rows[item].need : 0;
		return { item, label, need, where };
	};

	const optional = [carried(SANGPYEONG, 'Sangpyeong Coins', 'Moodle Village dailies')];
	STONES.forEach(item => optional.push(carried(item, item, 'spent on enhancement attempts')));

	optional
		.filter(e => e.need > 0 || store.getStock(e.item) > 0)
		.sort((a, b) => b.need - a.need || a.label.localeCompare(b.label))
		.forEach(e => entries.push(e));

	return entries;
}

/** What a purse holds against what the build wants of it. */
function purseFacts(e) {
	const held = store.getStock(e.item);
	const short = Math.max(0, e.need - held);
	return {
		held,
		short,
		state: !e.need ? 'idle' : short ? 'short' : 'ok',
		sub: !e.need
			? 'none needed yet'
			: short
				? `${FC(short)} short of ${FC(e.need)}`
				: `enough for all ${FC(e.need)}`
	};
}

/** One purse, as a chip with the number in it typed straight over. */
function purseChip(e) {
	const { held, state, sub } = purseFacts(e);
	return `<label class="pouch-item ${state}" title="${esc(e.item)} — ${esc(e.where)}">
		${e.glyph ? `<span class="pouch-glyph" aria-hidden="true">${e.glyph}</span>` : img(e.item, 'pouch-icon')}
		<span class="pouch-body">
			<span class="pouch-k">${esc(e.label)}</span>
			<input class="pouch-input" type="text" inputmode="numeric" value="${FC(held)}"
				data-act="purse" data-item="${esc(e.item)}" data-exact="${held}" title="${F(held)}"
				aria-label="${esc(e.label)} you hold">
			<span class="pouch-need">${esc(sub)}</span>
		</span>
	</label>`;
}

/**
 * The purses and the sailor, side by side.
 *
 * One strip, two groups: what is in the bags, and what is true of the
 * sailor carrying them. They are in the same row rather than stacked
 * because both are the same kind of thing: a number you keep correct
 * once and every screen then reads.
 */
function barHTML() {
	return `<span class="pouch-title">Carrying</span><div class="pouch-list">${purses().map(purseChip).join('')}${profileHTML()}</div>`;
}

/**
 * The phone's pouch: one line that reads, and a sheet that edits.
 *
 * The chips are a good bar and a poor phone. Nine of them will not fit
 * across 390 pixels, so the row scrolled sideways -- a strip on top of
 * every screen whose second half was a swipe away, on a bar nobody
 * visits to read: the silver is glanced at, and typed over once a week.
 * So a phone gets the glance only -- what is held, and in red what is
 * missing -- on a single line the height of a chip, and the typing
 * happens in a sheet where every field has the width of the screen.
 */
function peekHTML() {
	const list = purses();
	const said = [];
	const bit = e => {
		const { held, short, state, sub } = purseFacts(e);
		said.push(`${e.label} ${F(held)}, ${sub}`);
		return `<span class="peek-bit ${state}" title="${esc(e.label)} — ${esc(sub)}">${e.glyph
			? `<span class="peek-glyph" aria-hidden="true">${e.glyph}</span>`
			: img(e.item, 'peek-icon')}<b>${FC(held)}</b>${short ? `<i>−${FC(short)}</i>` : ''}</span>`;
	};
	const head = list.slice(0, 2).map(bit).join('');
	// Past the two headline currencies the phone says how many more
	// there are rather than what they are: a stone count is read while
	// enhancing, which is to say inside the sheet, not in passing.
	const rest = list.slice(2);
	return `<button class="pouch-peek" data-act="pouch"
		title="What you are carrying, and the numbers about you — press to set them"
		aria-label="Carrying: ${esc(said.join('; '))}. Press to set these and the numbers about you.">
		${head}
		${rest.length ? `<span class="peek-bit more" title="${esc(rest.map(e => `${e.label} ${F(store.getStock(e.item))}`).join(' · '))}">+${rest.length}</span>` : ''}
		${profilePeekHTML()}
		<span class="pouch-fold" aria-hidden="true">✎</span>
	</button>`;
}

/** Everything the bar has, stacked for a phone's sheet. */
function sheetHTML() {
	return `<div class="pouch-list">${purses().map(purseChip).join('')}${profileHTML({ sheet: true })}</div>`;
}

/**
 * The pouch: coins, silver, Sangpyeong Coins and enhancement stones, on
 * every tab.
 *
 * These are spent from wherever you happen to be -- buying on To Get,
 * enhancing in the Workshop -- so they sit in the shell above the tabs
 * instead of belonging to one screen. Everything past the two headline
 * currencies only appears once a build needs it or you hold some, so the
 * bar stays short.
 */
export function pouchHTML() {
	return isPhone() ? peekHTML() : barHTML();
}

/**
 * The sheet behind the phone's line: the same chips, one to a row, with
 * the sailor's fields open -- there is nothing to fold away in a sheet
 * that is already a press from being gone.
 */
export function openPouch() {
	const host = openDialog(`<h2>Carrying</h2>
		<p class="dialog-copy">What is in the bags, and what is true of you as a sailor. Every screen plans from these; they are typed here once and read everywhere.</p>
		<div class="pouch-sheet">${sheetHTML()}</div>
		<div class="dialog-actions"><button class="act" data-close>Done</button></div>`);
	// The dialog gives the keyboard to its first field, which here would
	// throw up a phone's keyboard over the sheet before it has been
	// read. Done is the safe landing, and the fields are a tap away.
	const done = host.querySelector('.dialog-actions .act');
	if (done) done.focus({ preventScroll: true });
	tickClocks();
	return host;
}

/**
 * The sheet is a place to stand, not a step.
 *
 * A dialog opened from inside it -- the nest, the table of thresholds --
 * replaces it rather than stacking on it, and answering that one used
 * to leave the screen bare: the sheet a phone had been typing in was
 * gone, and the way back was to find the line again and press it. So
 * the sheet puts itself back when whatever stood in front of it is
 * answered, at the row it was scrolled to.
 *
 * Called by the shell before it opens one of those, and quiet unless
 * the sheet is what it would be opening over.
 */
export function returnToPouch() {
	const box = document.querySelector('.pouch-sheet');
	if (!box) return;
	const scroller = box.closest('.dialog-box');
	const at = scroller ? scroller.scrollTop : 0;
	document.addEventListener('dialog-toggle', function back(evt) {
		if (evt.detail && evt.detail.open) return;
		document.removeEventListener('dialog-toggle', back);
		// After the close has run its course: closeDialog puts the
		// focus back on whatever opened the dialog once this listener
		// returns, and that must not land on top of the sheet coming
		// back.
		setTimeout(() => {
			const host = openPouch();
			const again = host.querySelector('.dialog-box') || host.firstElementChild;
			if (again) again.scrollTop = at;
		}, 0);
	});
}

/**
 * Repaint the pouch -- but never while someone is typing in it. A state
 * change re-renders everything, and swapping the inputs out mid-edit would
 * steal the caret; the blur handler in wire() paints the pending update.
 *
 * The phone's sheet is the same bar in another host, so it is caught up
 * by the same call: a purse typed in the sheet moves the need lines of
 * the chips under it.
 */
export function paintPouch({ force = false } = {}) {
	// Replacing the markup takes the focused field out of the document,
	// and the blur that follows asks for a repaint of its own -- which
	// would land in the middle of this one, on a subtree the browser is
	// still taking apart, and throw. One repaint at a time; the outer
	// one is the later state anyway.
	if (painting) return;
	const bar = document.getElementById('pouch');
	const sheet = document.querySelector('.pouch-sheet');
	if (!bar && !sheet) return;
	painting = true;
	try {
		// `force` is for a change that comes from inside the bar and
		// means to redraw it -- the fold, the Value Pack, the barter
		// level. Those leave the focus on the control that did it,
		// which would otherwise look exactly like someone typing in a
		// purse, and the chips around them would keep yesterday's
		// figures until the focus left the bar: a Value Pack ticked on
		// but still reading "off" beside three draws a day. The focus
		// is put back on the same control afterwards.
		paintHost(bar, pouchHTML, force);
		paintHost(sheet, sheetHTML, force);
		// The bar carries a countdown to the barter refill, and a paint
		// of its own -- a fold, a blur -- lands between two beats of the
		// minute hand. Without this the figure is blank until the next.
		tickClocks();
		measurePouch();
	} finally {
		painting = false;
	}
}

/** True while the markup under the bar is being replaced. */
let painting = false;

/** One host, redrawn, with whoever was typing in it left alone. */
function paintHost(host, html, force) {
	if (!host) return;
	if (!force && host.contains(document.activeElement)) return;
	const keep = force ? holdFocus(host) : null;
	host.innerHTML = html();
	if (keep) keep();
}

/**
 * What has the focus in the bar, as a way to put it back after the
 * markup under it is replaced. Keyed by the data-act, which is what the
 * chips are told apart by; a caret in a field is kept where it was.
 */
function holdFocus(host) {
	const el = document.activeElement;
	if (!el || !host.contains(el) || !el.dataset.act) return null;
	const sel = `[data-act="${el.dataset.act}"]${el.dataset.item ? `[data-item="${el.dataset.item}"]` : ''}`;
	const start = el.selectionStart, end = el.selectionEnd;
	return () => {
		const next = host.querySelector(sel);
		if (!next) return;
		next.focus({ preventScroll: true });
		try { next.setSelectionRange(start, end); } catch { /* not a field with a caret */ }
	};
}

/**
 * Publish the pouch's height so anything else that sticks (the inventory
 * detail panel) can clear it instead of sliding underneath.
 */
export function measurePouch() {
	const host = document.getElementById('pouch');
	if (!host) return;
	const h = getComputedStyle(host).position === 'sticky' ? host.offsetHeight : 0;
	document.documentElement.style.setProperty('--pouch-h', `${h}px`);
}
