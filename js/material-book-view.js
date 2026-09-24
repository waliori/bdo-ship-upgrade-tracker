// The material book, on the screen.
//
// The Barter tab's material bar says which board today's list looks
// like; this is where the boards are kept. Every whole material list
// on file -- the recorded ones and what the fleet has read since -- is
// a card with what it pays on its face and how often it has been read.
// A card opens into the whole list, material by material, and can be
// ticked onto today's list from there.
//
// The sums are material-book.js's. This file draws them and carries
// four presses back to the Barter tab: take a board, say "I saw the
// same", take your reading back, and tell the fleet.

import { esc, F } from './fmt.js';
import { T, said, gameName } from './i18n.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { img } from './ui-bits.js';
import { npcById, isleOf } from './barter_npcs.js';
import { boardsOf, bookOf, fitOf } from './material-book.js';
import { shared, fleetHistory, sawItToo, unsay } from './sea-boards.js';
import { me } from './sync.js';

const isle = id => { const n = npcById.get(Number(id)); return n ? isleOf(n) : `island ${id}`; };
const dayOf = key => {
	const d = new Date(`${String(key).slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(d.getTime()) ? String(key) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const islands = n => (n === 1 ? T('{n} island', { n: F(n) }) : T('{n} islands', { n: F(n) }));
const times = n => (n === 1 ? T('{n} time', { n: F(n) }) : T('{n} times', { n: F(n) }));
const plain = name => String(name).replace(/^\[[^\]]*\]\s*/, '');

/** A board's name: a recorded one keeps its letter, one the fleet found
 *  is named for the day it was first read. */
export function pageName(page) {
	return page.filed ? T('board {id}', { id: esc(page.id) }) : T('the board of {day}', { day: esc(dayOf(page.id)) });
}

const by = readers => {
	const names = [...new Set(readers.filter(r => r.name).map(r => r.name))];
	const quiet = readers.filter(r => !r.name).length;
	const out = names.slice(0, 3).map(n => `<b>${esc(n)}</b>`);
	if (names.length > 3) out.push(T('{n} more', { n: names.length - 3 }));
	if (quiet) out.push(quiet === 1 ? T('a sailor not shown by name') : T('{n} sailors not shown by name', { n: F(quiet) }));
	return out.join(', ');
};

/** What a board pays, as a row of icons with the island count on each. */
function tallyRow(tally, n = 9) {
	const rows = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	return `<span class="lb-face-row mb-tally">${rows.slice(0, n).map(([name, k]) => `<span class="mb-tally-one" title="${esc(gameName(name))}: ${esc(islands(k))}">${img(name, 'lb-face')}${k > 1 ? `<b>${k}</b>` : ''}</span>`).join('')}${rows.length > n ? `<span class="lb-more">+${rows.length - n}</span>` : ''}</span>`;
}

/**
 * Open the book.
 *
 * `record` is material_boards.json as ui-state loads it; `answers` the
 * islands answered on today's material list (only the ones read, not
 * taken from a board); `onTake(offers, page)` ticks a board's islands
 * onto today's list; `onTell(done)` sends today's answers.
 */
export function openMaterialBook({ record = null, answers = [], ticked = [], day = '', onTake = null, onTell = null } = {}) {
	const onList = new Set(ticked.map(Number));
	let query = '';
	let open = null;     // a page's id
	let sightings = [];
	let asked = !shared();
	let pages = bookOf(boardsOf(record, sightings));
	let fit = fitOf(answers, pages);

	const host = openDialog('<div data-mb></div>');
	const box = host.querySelector('.dialog-box');
	box.classList.add('wide', 'xwide', 'tall', 'lb-box');
	const root = host.querySelector('[data-mb]');

	const refresh = ({ force = false } = {}) => {
		if (!shared()) return;
		fleetHistory({ days: 400, force, list: 'material' }).then(list => {
			sightings = list;
			asked = true;
			pages = bookOf(boardsOf(record, sightings));
			fit = fitOf(answers, pages);
			draw();
		}).catch(() => { asked = true; draw(); });
	};

	const stateOf = page => {
		const w = fit.standing.find(s => s.page === page);
		if (fit.best && fit.best.page === page) return 'today';
		if (!answers.length) return '';
		return w && w.agree ? 'standing' : 'out';
	};
	const badge = st => (st === 'today' ? `<span class="lb-badge today">${T('today’s, it seems')}</span>`
		: st === 'standing' ? `<span class="lb-badge standing">${T('still fits')}</span>`
			: st === 'out' ? `<span class="lb-badge out">${T('not today’s')}</span>` : '');

	const statusLine = () => {
		if (!answers.length) return T('Nothing answered on today’s material list yet: read a page of the window and the boards here are checked against it.');
		if (fit.sure) {
			const board = `<button class="linky" data-mb-open="${esc(fit.best.page.id)}"><b>${pageName(fit.best.page)}</b></button>`;
			return fit.best.differ.length
				? T('What you answered today is {board} at {n}, and parts from it at one — a slip, or a slot moved.', { board, n: islands(fit.best.agree) })
				: T('What you answered today is {board} at every one of {n}.', { board, n: islands(fit.best.agree) });
		}
		const fits = fit.standing.filter(w => w.agree >= 3).length;
		if (fits > 1) return T('What you answered today fits <b>{n}</b> boards so far; an island or two more tells them apart.', { n: F(fits) });
		return fit.answered >= 3 ? T('What you answered today fits <b>no board on file</b>: a new one, worth telling the fleet.') : T('{islands} answered today: too few to tell the boards apart yet.', { islands: islands(fit.answered) });
	};

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
			<span class="lb-card-top"><span class="lb-num mb-num">${page.filed ? esc(page.id) : esc(dayOf(page.id))}</span>${badge(st)}</span>
			<span class="lb-faces">${tallyRow(page.tally)}</span>
			<span class="lb-card-line">${islands(page.offers.size)} · ${page.times > 1 ? T('read <b>{times}</b>', { times: times(page.times) }) : T('read once')}${page.last ? ` · ${T('last {day}', { day: esc(dayOf(page.last)) })}` : ''}</span>
			<span class="lb-card-line quiet">${page.readers.length ? T('by {who}', { who: by(page.readers) }) : T('on the app’s own record')}</span>
		</button>`;
	};

	const shelfHTML = () => {
		const shown = pages.filter(matches);
		const read = pages.reduce((a, p) => a + p.times, 0);
		return `<h2>${T('The material book')}</h2>
		<p class="dialog-note">${T('The material list belongs to none of the forty layouts: its islands roll on their own, and nobody numbers its boards. These are the whole lists sailors have read — <b>{read}</b> readings, <b>{n}</b> boards — and two readings that agree island for island are one board seen twice.', { read: F(read), n: F(pages.length) })} ${statusLine()}</p>
		<div class="lb-bar">
			<input class="lb-search" type="search" data-mb-q placeholder="${T('an island or a material…')}" value="${esc(query)}" aria-label="${T('Search the material boards')}">
			${onTell && shared() && answers.length ? `<button class="ghost-btn sm" data-mb-tell title="${me() ? T('Send the islands you read today, with your name on the reading') : T('Sign in from the Menu first — a reading goes up with a name on it')}">📣 ${T('Tell the fleet what you saw')}</button>` : ''}
		</div>
		${!shared() ? `<p class="lb-sub">${T('This deployment keeps no fleet readings, so the book is the app’s own record alone.')}</p>` : !asked ? `<p class="lb-sub">${T('Asking what the fleet has read…')}</p>` : ''}
		<div data-mb-grid>${shown.length ? `<div class="lb-grid">${shown.map(card).join('')}</div>` : `<p class="lb-sub">${query ? T('No board on file deals “{q}”.', { q: esc(query) }) : T('None.')}</p>`}</div>
		<div class="dialog-actions"><button class="act quiet" data-close>${T('Close')}</button></div>`;
	};

	const good = (name, qty = 1) => `<span class="lb-good">${img(name, 'row-icon')}<span>${Number(qty) > 1 ? `<b>${F(Number(qty))}×</b> ` : ''}${esc(plain(gameName(name)))}</span></span>`;
	const tile = (npcId, o, mine) => {
		const a = mine.get(npcId);
		const same = a && a.give === o.give && a.recv === o.recv;
		return `<div class="lb-tile${same ? ' same' : a ? ' off' : ''}">
			<div class="lb-tile-top"><span class="lb-isle">${esc(gameName(isle(npcId)))}</span>${same ? `<span class="lb-tags"><span class="lb-tag ok" title="${T('What you read here today')}">✓ ${T('seen')}</span></span>` : ''}</div>
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
		const readers = page.boards.flatMap(b => b.readers.map(r => ({ ...r, today: b.day === String(day).slice(0, 10) })));
		const who = readers.map(r => `<li>${r.name ? `<b>${esc(r.name)}</b>` : T('a sailor not shown by name')}${r.mine ? ` (${T('you')})` : ''} · ${esc(dayOf(r.day))} · ${islands(r.islands)}${r.seen ? ` · ${r.seen === 1 ? T('{n} other saw the same', { n: F(r.seen) }) : T('{n} others saw the same', { n: F(r.seen) })}` : ''}
			${r.mine ? `<button class="linky" data-mb-unsay="${esc(String(r.id))}">${T('take it back')}</button>` : (r.today && me() && !r.confirmed ? `<button class="linky" data-mb-seen="${esc(String(r.id))}">${T('I saw the same')}</button>` : (r.confirmed ? `<span class="lb-ok">✓ ${T('you saw the same')}</span>` : ''))}</li>`).join('');
		return `<div class="lb-head"><button class="ghost-btn sm" data-mb-back>← ${T('the book')}</button>
			<h2>${page.filed ? T('Material board {id}', { id: esc(page.id) }) : T('The material board of {day}', { day: esc(dayOf(page.id)) })} ${badge(st)}</h2></div>
		<div class="lb-facts">
			<span>${T('<b>{n}</b> islands', { n: F(page.offers.size) })}</span>
			<span>${page.times > 1 ? T('read <b>{times}</b>', { times: times(page.times) }) : T('read once')}${page.days.length ? ` · ${page.days.map(d => esc(dayOf(d))).join(', ')}` : ''}</span>
			${page.filed ? `<span>${T('on the app’s own record')}</span>` : ''}
			${answers.length ? `<span class="${parted.length ? 'no' : 'ok'}">${T('{n} as you saw', { n: agreed })}${parted.length ? ` · ${T('<b>{n}</b> not', { n: parted.length })}` : ''}</span>` : ''}
		</div>
		${who ? `<details class="lb-readers"${readers.some(r => r.today) ? ' open' : ''}><summary>${T('Who read it')}</summary><ul>${who}</ul></details>` : ''}
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
		const el = e.target.closest('[data-mb-open],[data-mb-back],[data-mb-tell],[data-mb-take],[data-mb-seen],[data-mb-unsay]');
		if (!el) return;
		if (el.dataset.mbOpen) {
			if (!open) shelfTop = box.scrollTop;
			open = { id: el.dataset.mbOpen, fresh: true };
			draw();
		} else if ('mbBack' in el.dataset) {
			open = null;
			draw();
			box.scrollTop = shelfTop;
		} else if ('mbTell' in el.dataset) {
			if (onTell) onTell(() => refresh({ force: true }));
		} else if (el.dataset.mbTake) {
			const page = pages.find(p => String(p.id) === el.dataset.mbTake);
			if (page && onTake) { closeDialog(); onTake(page); }
		} else if (el.dataset.mbSeen) {
			sawItToo(el.dataset.mbSeen).then(out => {
				toast(out.ok ? T('Counted: you saw the same board') : (out.why ? T('It did not go: {why}', { why: said(out.why) }) : T('It did not go')));
				refresh({ force: true });
			});
		} else if (el.dataset.mbUnsay) {
			unsay(el.dataset.mbUnsay).then(out => {
				toast(out.ok ? T('Your reading is taken back') : (out.why ? T('It did not go: {why}', { why: said(out.why) }) : T('It did not go')));
				open = null;
				refresh({ force: true });
			});
		}
	});
	root.addEventListener('input', e => {
		if (!e.target.matches('[data-mb-q]')) return;
		query = e.target.value;
		const grid = root.querySelector('[data-mb-grid]');
		if (grid) {
			const shown = pages.filter(matches);
			grid.innerHTML = shown.length ? `<div class="lb-grid">${shown.map(card).join('')}</div>` : `<p class="lb-sub">${T('No board on file deals “{q}”.', { q: esc(query) })}</p>`;
		}
	});

	draw();
	refresh();
}
