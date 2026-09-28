// The material book, on the screen.
//
// The Barter tab's material bar says which layout today's list is; this
// is where the layouts are kept. Every layout of the material list the
// game's own files hold is a card with what it pays on its face. A card
// opens into the whole list, material by material, and can be ticked
// onto today's list from there.
//
// The sums are material-book.js's. This file draws them and carries one
// press back to the Barter tab: take a layout.

import { esc, F } from './fmt.js';
import { T, gameName } from './i18n.js';
import { openDialog, closeDialog } from './dialogs.js';
import { img } from './ui-bits.js';
import { npcById, isleOf } from './barter_npcs.js';
import { fitOf } from './material-book.js';

const isle = id => { const n = npcById.get(Number(id)); return n ? isleOf(n) : `island ${id}`; };
const islands = n => (n === 1 ? T('{n} island', { n: F(n) }) : T('{n} islands', { n: F(n) }));
const plain = name => String(name).replace(/^\[[^\]]*\]\s*/, '');

/** A layout's name, as the bar and the book say it. */
export function pageName(page) {
	return T('board {id}', { id: esc(page.id) });
}

/** What a board pays, as a row of icons with the island count on each. */
function tallyRow(tally, n = 9) {
	const rows = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	return `<span class="lb-face-row mb-tally">${rows.slice(0, n).map(([name, k]) => `<span class="mb-tally-one" title="${esc(gameName(name))}: ${esc(islands(k))}">${img(name, 'lb-face')}${k > 1 ? `<b>${k}</b>` : ''}</span>`).join('')}${rows.length > n ? `<span class="lb-more">+${rows.length - n}</span>` : ''}</span>`;
}

/**
 * Open the book.
 *
 * `pages` are the game's layouts (material-book.js's shape); `answers`
 * the islands read off today's window (not the ones taken from a
 * layout); `ticked` every island on today's list; `onTake(page)` ticks a
 * layout's islands onto it.
 */
export function openMaterialBook({ pages = [], answers = [], ticked = [], onTake = null } = {}) {
	const onList = new Set(ticked.map(Number));
	const fit = fitOf(answers, pages);
	let query = '';
	let open = null;     // a page's id

	const host = openDialog('<div data-mb></div>');
	const box = host.querySelector('.dialog-box');
	box.classList.add('wide', 'xwide', 'tall', 'lb-box');
	const root = host.querySelector('[data-mb]');

	const stateOf = page => {
		const w = fit.standing.find(s => s.page === page);
		if (fit.best && fit.best.page === page) return 'today';
		if (!answers.length) return '';
		return w && w.agree ? 'standing' : 'out';
	};
	const badge = st => (st === 'today' ? `<span class="lb-badge today">${T('today’s, it seems')}</span>`
		: st === 'standing' ? `<span class="lb-badge standing">${T('still fits')}</span>`
			: st === 'out' ? `<span class="lb-badge out">${T('not today’s')}</span>` : '');

	const matches = page => {
		const q = query.trim().toLowerCase();
		if (!q) return true;
		if (String(page.id).toLowerCase() === q) return true;
		for (const [npcId, o] of page.offers) {
			if (isle(npcId).toLowerCase().includes(q) || gameName(o.recv).toLowerCase().includes(q) || gameName(o.give).toLowerCase().includes(q)) return true;
		}
		return false;
	};

	const card = page => {
		const st = stateOf(page);
		return `<button class="lb-card mb-card${st === 'today' ? ' today' : ''}${st === 'out' ? ' out' : ''}" data-mb-open="${esc(page.id)}">
			<span class="lb-card-top"><span class="lb-num mb-num">${esc(page.id)}</span>${badge(st)}</span>
			<span class="lb-faces">${tallyRow(page.tally)}</span>
			<span class="lb-card-line">${islands(page.offers.size)}</span>
		</button>`;
	};
	const grid = () => {
		const shown = pages.filter(matches);
		return shown.length ? `<div class="lb-grid">${shown.map(card).join('')}</div>` : `<p class="lb-sub">${query ? T('No board on file deals “{q}”.', { q: esc(query) }) : T('None.')}</p>`;
	};

	const shelfHTML = () => `<h2>${T('The material book')}</h2>
		<p class="dialog-note">${T('The material list has <b>{n}</b> layouts, taken from the game’s own files. Read one page of the window and the one it is shows here.', { n: F(pages.length) })}</p>
		<div class="lb-bar">
			<input class="lb-search" type="search" data-mb-q placeholder="${T('an island or a material…')}" value="${esc(query)}" aria-label="${T('Search the material boards')}">
		</div>
		<div data-mb-grid>${grid()}</div>
		<div class="dialog-actions"><button class="act quiet" data-close>${T('Close')}</button></div>`;

	const good = (name, qty = 1) => `<span class="lb-good">${img(name, 'row-icon')}<span>${Number(qty) > 1 ? `<b>${F(Number(qty))}×</b> ` : ''}${esc(plain(gameName(name)))}</span></span>`;
	const tile = (npcId, o, mine) => {
		const a = mine.get(npcId);
		const same = a && a.give === o.give && a.recv === o.recv;
		// A slot the game fills at random: the offer shown is one of these.
		const rolls = o.options && o.options.length > 1;
		return `<div class="lb-tile${same ? ' same' : a ? ' off' : ''}">
			<div class="lb-tile-top"><span class="lb-isle">${esc(gameName(isle(npcId)))}</span>${same || rolls ? `<span class="lb-tags">${same ? `<span class="lb-tag ok" title="${T('What you read here today')}">✓ ${T('seen')}</span>` : ''}${rolls ? `<span class="lb-tag" title="${esc(o.options.map(x => `${plain(gameName(x.give))} → ${plain(gameName(x.recv))}`).join(' · '))}">${T('one of {n}', { n: o.options.length })}</span>` : ''}</span>` : ''}</div>
			<div class="lb-tile-swap">${good(o.give, o.giveN)}<span class="lb-arrow">→</span>${good(o.recv, o.recvN)}</div>
			${a && !same ? `<div class="lb-tile-saw"><span class="lb-saw-label">${T('you saw')}</span>${good(a.give)}<span class="lb-arrow">→</span>${good(a.recv)}</div>` : ''}
		</div>`;
	};

	const pageHTML = page => {
		const mine = new Map(answers.map(a => [Number(a.npcId), a]));
		const st = stateOf(page);
		const groups = new Map();
		for (const [npcId, o] of page.offers) {
			if (!groups.has(o.recv)) groups.set(o.recv, []);
			groups.get(o.recv).push([npcId, o]);
		}
		const order = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
		const agreed = [...page.offers].filter(([npcId, o]) => { const a = mine.get(npcId); return a && a.give === o.give && a.recv === o.recv; }).length;
		const parted = [...page.offers].filter(([npcId, o]) => { const a = mine.get(npcId); return a && (a.give !== o.give || a.recv !== o.recv); });
		const unanswered = [...page.offers.keys()].filter(npcId => !mine.has(npcId) && !onList.has(npcId)).length;
		return `<div class="lb-head"><button class="ghost-btn sm" data-mb-back>← ${T('the book')}</button>
			<h2>${T('Material board {id}', { id: esc(page.id) })} ${badge(st)}</h2></div>
		<div class="lb-facts">
			<span>${T('<b>{n}</b> islands', { n: F(page.offers.size) })}</span>
			<span>${T('from the game’s own files')}</span>
			${answers.length ? `<span class="${parted.length ? 'no' : 'ok'}">${T('{n} as you saw', { n: agreed })}${parted.length ? ` · ${T('<b>{n}</b> not', { n: parted.length })}` : ''}</span>` : ''}
		</div>
		${onTake && unanswered ? `<div class="lb-bar"><button class="chip${st === 'today' ? ' primary' : ''}" data-mb-take="${esc(page.id)}" title="${T('Tick its islands on today’s material list, as taken from this board rather than read')}">${T('Take its other {islands} onto today’s list', { islands: islands(unanswered) })}</button></div>` : ''}
		${parted.length ? `<h4 class="lb-lvh no">${T('Where it parts from what you saw today')} <span class="quiet">· ${islands(parted.length)}</span></h4>
			<div class="lb-tiles">${parted.map(([npcId, o]) => tile(npcId, o, mine)).join('')}</div>` : ''}
		${order.map(([recv, rows]) => `<h4 class="lb-lvh mb-lvh">${img(recv, 'lb-face')} ${esc(gameName(recv))} <span class="quiet">· ${islands(rows.length)}</span></h4>
			<div class="lb-tiles">${rows.sort((a, b) => isle(a[0]).localeCompare(isle(b[0]))).map(([npcId, o]) => tile(npcId, o, mine)).join('')}</div>`).join('')}
		<div class="dialog-actions"><button class="act quiet" data-mb-back>${T('Back to the book')}</button></div>`;
	};

	let shelfTop = 0;
	function draw() {
		const top = box.scrollTop;
		const page = open ? pages.find(p => String(p.id) === open.id) : null;
		root.innerHTML = page ? pageHTML(page) : shelfHTML();
		box.scrollTop = open && open.fresh ? 0 : top;
		if (open) open.fresh = false;
	}

	root.addEventListener('click', e => {
		const el = e.target.closest('[data-mb-open],[data-mb-back],[data-mb-take]');
		if (!el) return;
		if (el.dataset.mbOpen) {
			if (!open) shelfTop = box.scrollTop;
			open = { id: el.dataset.mbOpen, fresh: true };
			draw();
		} else if ('mbBack' in el.dataset) {
			open = null;
			draw();
			box.scrollTop = shelfTop;
		} else if (el.dataset.mbTake) {
			const page = pages.find(p => String(p.id) === el.dataset.mbTake);
			if (page && onTake) { closeDialog(); onTake(page); }
		}
	});
	root.addEventListener('input', e => {
		if (!e.target.matches('[data-mb-q]')) return;
		query = e.target.value;
		const g = root.querySelector('[data-mb-grid]');
		if (g) g.innerHTML = grid();
	});

	draw();
}
