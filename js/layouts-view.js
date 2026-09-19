// The layout book, on the screen.
//
// The Barter tab asks one question -- which board is the sea on today --
// and its bar is the place for the answer, not for the evidence. The
// evidence lives here: every layout on file as a card with its face on
// it, how often the record and the fleet have each seen it, and the
// boards sailors have read that are in no record at all, with a name on
// each and what it differs from. A card opens into the whole board,
// island by island, the goods drawn rather than spelt.
//
// The sums are layout-book.js's. This file draws them and carries three
// presses back to the Barter tab: take a reading, say "I saw the same",
// and tell the fleet.

import { esc, F } from './fmt.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { img } from './ui-bits.js';
import { npcById, isleOf } from './barter_npcs.js';
import { levelOf } from './barter.js';
import { exchangeGate, knownAt } from './barter-board.js';
import { bookOf, searchBook } from './layout-book.js';
import { shared, fleetHistory, sawItToo, unsay } from './sea-boards.js';
import { me } from './sync.js';

const isle = id => { const n = npcById.get(Number(id)); return n ? isleOf(n) : `island ${id}`; };
const dayOf = key => {
	const d = new Date(`${String(key).slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(d.getTime()) ? String(key) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const plural = (n, one, many = `${one}s`) => `${F(n)} ${n === 1 ? one : many}`;
const by = readers => {
	const names = [...new Set(readers.filter(r => r.name).map(r => r.name))];
	const quiet = readers.filter(r => !r.name).length;
	const said = names.slice(0, 3).map(n => `<b>${esc(n)}</b>`);
	if (names.length > 3) said.push(`${names.length - 3} more`);
	if (quiet) said.push(names.length ? `${plural(quiet, 'sailor')} not shown by name` : (quiet === 1 ? 'a sailor not shown by name' : `${F(quiet)} sailors not shown by name`));
	return said.join(', ');
};

/** The levels a board pays, as a row of small counts. */
function levelPills(levels) {
	const out = [];
	for (let lv = 1; lv <= 7; lv++) if (levels[lv]) out.push(`<span class="lb-lv" style="--lv: var(--tier-${lv})" title="${levels[lv]} exchanges pay a [Level ${lv}] good">L${lv}<b>${levels[lv]}</b></span>`);
	if (levels.coin) out.push(`<span class="lb-lv coin" title="${levels.coin} exchanges pay Crow Coins">◎<b>${levels.coin}</b></span>`);
	return out.join('');
}

/**
 * A layout's face. Not the goods it pays -- every board pays much the
 * same fifteen [Level 5]s, so a row of those is the same row forty
 * times. What differs from board to board, and what a sailor plans a
 * day on, is the two ends of it: the land goods the [Level 1] islands
 * are asking for, and the goods the coin islands will take.
 */
function faceOf(combo, n = 8) {
	const row = (label, title, names) => (names.length
		? `<span class="lb-face-row" title="${esc(title)}"><span class="lb-face-label">${label}</span>${names.slice(0, n).map(name => `<span title="${esc(name)}">${img(name, 'lb-face')}</span>`).join('')}${names.length > n ? `<span class="lb-more">+${names.length - n}</span>` : ''}</span>`
		: '');
	const starts = [...new Set(combo.offers.filter(o => levelOf(o[3]) === 1).map(o => o[1]))].sort();
	const coins = [...new Set(combo.offers.filter(o => o[3] === 'Crow Coin').map(o => o[1]))].sort();
	return row('from', 'What the [Level 1] islands are asking for: where a day on this board starts', starts)
		+ row('◎ for', 'What the coin islands will take on this board', coins);
}

/**
 * Open the book.
 *
 * `combos` is the record as ui-state loads it; `answers` what has been
 * seen today; `count` the sailor's barter count, for the gates. `onTake`
 * is handed a sighting's offers to answer today's board with, `onTell`
 * sends today's answers to the fleet; both belong to the Barter tab.
 */
export function openLayoutBook({ combos, answers = [], day = '', count = null, onTake = null, onTell = null } = {}) {
	let filter = 'all';      // all | standing | fleet
	let query = '';
	let open = null;         // { kind: 'layout' | 'stray', key }
	let sightings = [];
	let asked = !shared();
	let book = bookOf(combos.combos, sightings, { today: day, answers });

	const host = openDialog('<div data-lb></div>');
	const box = host.querySelector('.dialog-box');
	box.classList.add('wide', 'xwide', 'tall', 'lb-box');
	const root = host.querySelector('[data-lb]');

	const refresh = ({ force = false } = {}) => {
		if (!shared()) return;
		fleetHistory({ force }).then(list => {
			sightings = list;
			asked = true;
			book = bookOf(combos.combos, sightings, { today: day, answers });
			draw();
		}).catch(() => { asked = true; draw(); });
	};

	/* --- the shelf ---------------------------------------------------- */
	const statusLine = () => {
		const pinned = book.layouts.find(p => p.today);
		const todayStray = book.strays.find(g => g.today);
		if (pinned) return `Today the sea is on <button class="linky" data-lb-open="layout:${esc(pinned.id)}"><b>layout ${esc(pinned.id)}</b></button>.`;
		if (answers.length && !book.standing) {
			return `What you saw today fits <b>no layout on file</b>${todayStray ? ' — and you are not the only one, see below' : ''}.`;
		}
		if (answers.length) return `${plural(answers.length, 'island')} answered today: <b>${book.standing}</b> of ${book.layouts.length} layouts still stand.`;
		return `Nothing answered today yet, so all ${book.layouts.length} layouts stand.`;
	};

	const strayCard = g => {
		const near = g.near;
		const drift = near && near.differ.length <= 4 && near.agree >= near.differ.length;
		return `<button class="lb-card stray${g.today ? ' today' : ''}" data-lb-open="stray:${esc(g.key)}">
			<span class="lb-card-top"><span class="lb-num">?</span><span class="lb-badge ${g.today ? 'today' : 'old'}">${g.today ? 'seen today' : esc(dayOf(g.day))}</span></span>
			<span class="lb-card-line">${plural(g.said.length, 'island')} read by ${by(g.readers) || 'a sailor'}</span>
			<span class="lb-card-line quiet">${g.seen ? `${plural(g.seen, 'other')} saw the same · ` : ''}${near ? (drift
		? `<b>layout ${esc(near.combo.id)}</b> with ${plural(near.differ.length, 'slot')} moved`
		: `nearest is layout ${esc(near.combo.id)}, and it parts at ${near.differ.length}`) : ''}</span>
			${g.unknown ? `<span class="lb-card-line hit">${plural(g.unknown, 'exchange')} the game is not known to deal there</span>` : ''}
			${near && drift ? `<span class="lb-diffs">${near.differ.slice(0, 3).map(d => `<span class="lb-diff">${img(d.filed.recv, 'lb-face')}<span class="lb-arrow">→</span>${img(d.saw.recv, 'lb-face')}</span>`).join('')}</span>` : ''}
		</button>`;
	};

	const layoutCard = ({ page, hits }) => {
		const fleet = page.sailors
			? `fleet: ${plural(page.sailors, 'reading')}${page.confirms ? ` · ${plural(page.confirms, 'confirm')}` : ''} · last ${esc(dayOf(page.days[0]))}`
			: (shared() ? 'not read by the fleet yet' : '');
		const state = page.today ? '<span class="lb-badge today">today’s board</span>'
			: !answers.length ? ''
				: page.standing ? '<span class="lb-badge standing">still standing</span>' : '<span class="lb-badge out">ruled out today</span>';
		return `<button class="lb-card${page.today ? ' today' : ''}${answers.length && !page.standing ? ' out' : ''}" data-lb-open="layout:${esc(page.id)}">
			<span class="lb-card-top"><span class="lb-num">${esc(page.id)}</span>${state}</span>
			<span class="lb-faces">${faceOf(page.combo)}</span>
			<span class="lb-levels">${levelPills(page.levels)}</span>
			<span class="lb-card-line quiet">record: ${plural(page.filed, 'time')} in ${F(combos.sample.refreshes)} refreshes</span>
			${fleet ? `<span class="lb-card-line quiet">${fleet}</span>` : ''}
			${hits ? `<span class="lb-card-line hit">${plural(hits.size, 'island')} match “${esc(query)}”</span>` : ''}
		</button>`;
	};

	const gridHTML = () => {
		let pages = searchBook(book.layouts, query, id => isle(id));
		if (filter === 'standing') pages = pages.filter(x => x.page.standing);
		if (filter === 'fleet') pages = pages.filter(x => x.page.sailors);
		pages.sort((a, b) => (b.page.today - a.page.today) || (b.page.standing - a.page.standing) || 0);
		const strays = filter === 'standing' || query ? [] : book.strays;
		return `${strays.length ? `<h3 class="lb-h">Boards nobody has on file <span class="quiet">· ${strays.length}</span></h3>
			<p class="lb-sub">Read by sailors, and fitting none of the ${book.layouts.length} layouts. One that others have seen too is the record out of date; one nobody else has seen may be a slip.</p>
			<div class="lb-grid">${strays.map(strayCard).join('')}</div>` : ''}
			<h3 class="lb-h">${filter === 'standing' ? 'Layouts still standing today' : filter === 'fleet' ? 'Layouts the fleet has read' : 'The layouts on file'} <span class="quiet">· ${pages.length}</span></h3>
			${pages.length ? `<div class="lb-grid">${pages.map(layoutCard).join('')}</div>` : `<p class="lb-sub">${query ? `Nothing on file deals “${esc(query)}”.` : 'None.'}</p>`}`;
	};

	const shelfHTML = () => {
		const chip = (id, label, n) => `<button class="chip${filter === id ? ' on' : ''}" data-lb-filter="${id}">${label}${n === null ? '' : ` <span class="quiet">${n}</span>`}</button>`;
		const since = new Date(`${combos.sample.since}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
		return `<h2>The layout book</h2>
		<p class="dialog-note">Every refresh deals one of <b>${book.layouts.length}</b> boards. These are the ones on file — the community’s record of ${F(combos.sample.refreshes)} refreshes since ${esc(since)} — and beside them what the fleet has read${shared() ? ' in the last two months' : ''}. ${statusLine()}</p>
		<div class="lb-bar">
			${chip('all', 'All', book.layouts.length)}${answers.length ? chip('standing', 'Standing today', book.standing) : ''}${shared() ? chip('fleet', 'Read by the fleet', book.layouts.filter(p => p.sailors).length) : ''}
			<input class="lb-search" type="search" data-lb-q placeholder="an island, a good, or a layout’s number…" value="${esc(query)}" aria-label="Search the layouts">
			${onTell && shared() && answers.length ? `<button class="ghost-btn sm" data-lb-tell title="${me() ? 'Send the islands you answered today, with your name on the reading' : 'Sign in from the Menu first — a reading goes up with a name on it'}">📣 Tell the fleet what you saw</button>` : ''}
		</div>
		${!shared() ? '<p class="lb-sub">This deployment keeps no fleet readings, so the book is the record alone.</p>' : !asked ? '<p class="lb-sub">Asking what the fleet has read…</p>' : book.open ? `<p class="lb-sub">${plural(book.open, 'reading')} named too few islands to tell the layouts apart, and ${book.open === 1 ? 'is' : 'are'} counted for none.</p>` : ''}
		<div data-lb-grid>${gridHTML()}</div>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>`;
	};

	/* --- one board ---------------------------------------------------- */
	/** A good's name without the level in front of it: the heading over
	 *  the tiles has already said the level, eighty-six times over. */
	const plain = name => String(name).replace(/^\[Level \d\]\s*/, '');
	const good = (name, qty = 1) => `<span class="lb-good">${img(name, 'row-icon')}<span>${Number(qty) > 1 ? `<b>${F(Number(qty))}×</b> ` : ''}${esc(plain(name))}</span></span>`;

	/** One island on a board, as a tile: its name whole, then what it
	 *  takes and what it pays. `notes` is what there is to say about it. */
	const tile = (o, { cls = '', tags = [], under = '' } = {}) => `<div class="lb-tile${cls}">
		<div class="lb-tile-top"><span class="lb-isle">${esc(isle(o[0]))}</span>${tags.length ? `<span class="lb-tags">${tags.join('')}</span>` : ''}</div>
		<div class="lb-tile-swap">${good(o[1], o[2])}<span class="lb-arrow">→</span>${good(o[3])}</div>${under}
	</div>`;

	const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'coin', 'other'];
	const levelKey = recv => { const lv = levelOf(recv); return lv ? `L${lv}` : recv === 'Crow Coin' ? 'coin' : 'other'; };
	const levelTitle = k => (k === 'coin' ? 'Sold for Crow Coins' : k === 'other' ? 'Pays something else' : k === 'L1' ? 'Land goods → Level 1' : `Level ${Number(k.slice(1)) - 1} → Level ${k.slice(1)}`);
	let level = 'all';       // which level of the open board is shown

	const tilesByLevel = (offers, dress) => {
		const groups = new Map();
		for (const o of offers) {
			const key = levelKey(o[3]);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(o);
		}
		const keys = LEVELS.filter(k => groups.has(k));
		const tabs = `<div class="lb-bar lb-tabs"><button class="chip${level === 'all' ? ' on' : ''}" data-lb-level="all">All <span class="quiet">${offers.length}</span></button>${keys.map(k =>
			`<button class="chip${level === k ? ' on' : ''}" data-lb-level="${k}" style="--lv: var(--tier-${k.startsWith('L') ? k.slice(1) : 6})"><i class="lb-dot"></i>${k === 'coin' ? '◎ coins' : k === 'other' ? 'other' : k} <span class="quiet">${groups.get(k).length}</span></button>`).join('')}</div>`;
		const shown = keys.filter(k => level === 'all' || level === k);
		return tabs + (shown.length ? shown : keys).map(k => `<h4 class="lb-lvh" style="--lv: var(--tier-${k.startsWith('L') ? k.slice(1) : 6})">${levelTitle(k)} <span class="quiet">· ${plural(groups.get(k).length, 'island')}</span></h4>
			<div class="lb-tiles">${groups.get(k).sort((x, y) => isle(x[0]).localeCompare(isle(y[0]))).map(o => tile(o, dress(o))).join('')}</div>`).join('');
	};

	const layoutHTML = page => {
		const mine = new Map(answers.map(a => [a.npcId, a]));
		const filled = new Set(page.combo.filled || []);
		const hits = query ? (searchBook([page], query, id => isle(id))[0] || {}).hits : null;
		const parted = page.combo.offers.filter(o => { const a = mine.get(Number(o[0])); return a && (a.give !== o[1] || a.recv !== o[3]); });
		const agreed = page.combo.offers.filter(o => { const a = mine.get(Number(o[0])); return a && a.give === o[1] && a.recv === o[3]; }).length;
		const dress = o => {
			const tags = [];
			let cls = hits && hits.has(o[0]) ? ' hit' : '';
			let under = '';
			const a = mine.get(Number(o[0]));
			if (a && a.give === o[1] && a.recv === o[3]) { cls += ' same'; tags.push('<span class="lb-tag ok" title="What you saw here today">✓ seen</span>'); }
			else if (a) { cls += ' off'; under = `<div class="lb-tile-saw"><span class="lb-saw-label">you saw</span>${good(a.give)}<span class="lb-arrow">→</span>${good(a.recv)}</div>`; }
			const gate = exchangeGate(page.combo, o[0]);
			if (gate !== null && count !== null && gate > count) { cls += ' locked'; tags.push(`<span class="lb-tag lock" title="The game opens this exchange at ${F(gate)} total barters; you have ${F(count)}, so the island shows you nothing here">🔒 ${F(gate)}</span>`); }
			if (filled.has(Number(o[0]))) tags.push('<span class="lb-tag file" title="The community’s record has no row for this island on this layout: this one is read out of the game’s own files, and nobody has yet reported seeing it">game files</span>');
			return { cls, tags, under };
		};
		const locked = count === null ? 0 : page.combo.offers.filter(o => { const g = exchangeGate(page.combo, o[0]); return g !== null && g > count; }).length;
		const readers = page.readers.slice(0, 12).map(r => `<li>${r.name ? `<b>${esc(r.name)}</b>` : 'a sailor not shown by name'}${r.mine ? ' (you)' : ''} · ${esc(dayOf(r.day))} · ${plural(r.islands, 'island')}${r.seen ? ` · ${plural(r.seen, 'other')} saw the same` : ''}</li>`).join('');
		return `<div class="lb-head"><button class="ghost-btn sm" data-lb-back>← the book</button>
			<h2>Layout ${esc(page.id)} ${page.today ? '<span class="lb-badge today">today’s board</span>' : answers.length ? (page.standing ? '<span class="lb-badge standing">still standing</span>' : '<span class="lb-badge out">ruled out today</span>') : ''}</h2></div>
		<div class="lb-facts">
			<span><b>${F(page.combo.offers.length)}</b> islands</span>
			<span>on the record <b>${plural(page.filed, 'time')}</b> of ${F(combos.sample.refreshes)}</span>
			${page.sailors ? `<span>read by the fleet <b>${plural(page.sailors, 'time')}</b> · last ${esc(dayOf(page.days[0]))}</span>` : ''}
			${filled.size ? `<span title="Rows the community’s record lacks, read out of the game’s own files"><b>${filled.size}</b> from the game files</span>` : ''}
			${locked ? `<span title="Exchanges your barter count has not opened: those islands show you nothing on this board"><b>${locked}</b> 🔒 above your ${F(count)} barters</span>` : ''}
			${answers.length ? `<span class="${parted.length ? 'no' : 'ok'}">${agreed} as you saw${parted.length ? ` · <b>${parted.length}</b> not` : ''}</span>` : ''}
		</div>
		${readers ? `<details class="lb-readers"><summary>Who read it</summary><ul>${readers}</ul></details>` : ''}
		${parted.length ? `<h4 class="lb-lvh no">Where it parts from what you saw today <span class="quiet">· ${plural(parted.length, 'island')}</span></h4>
			<div class="lb-tiles">${parted.sort((x, y) => isle(x[0]).localeCompare(isle(y[0]))).map(o => tile(o, dress(o))).join('')}</div>` : ''}
		${tilesByLevel(page.combo.offers, dress)}
		<div class="dialog-actions"><button class="act quiet" data-lb-back>Back to the book</button></div>`;
	};

	const strayHTML = g => {
		const near = g.near;
		const parted = new Map((near ? near.differ : []).map(d => [d.npcId, d]));
		const dress = o => {
			const d = parted.get(Number(o[0]));
			if (!d) return {};
			const how = knownAt(combos.combos, Number(o[0]), o[1], o[3]);
			return {
				cls: ' off',
				tags: [how
					? `<span class="lb-tag file" title="The game is known to deal this exchange at this island — on another layout. That is what a slot moved at a maintenance looks like">known here</span>`
					: `<span class="lb-tag lock" title="Neither the game’s files nor the record have this exchange at this island at all: a new exchange, or a misreading">never seen here</span>`],
				under: `<div class="lb-tile-saw"><span class="lb-saw-label">layout ${esc(near.combo.id)} has</span>${good(d.filed.give)}<span class="lb-arrow">→</span>${good(d.filed.recv)}</div>`
			};
		};
		const offers = g.said.map(a => [a.npcId, a.give, '1', a.recv]);
		const readers = g.readers.map(r => `<li>${r.name ? `<b>${esc(r.name)}</b>` : 'a sailor not shown by name'}${r.mine ? ' (you)' : ''} · ${plural(r.islands, 'island')}${r.seen ? ` · ${plural(r.seen, 'other')} saw the same` : ''}
			${r.mine ? `<button class="linky" data-lb-unsay="${esc(String(r.id))}">take it back</button>` : (g.today && me() && !r.confirmed ? `<button class="linky" data-lb-seen="${esc(String(r.id))}">I saw the same</button>` : (r.confirmed ? '<span class="lb-ok">✓ you saw the same</span>' : ''))}</li>`).join('');
		return `<div class="lb-head"><button class="ghost-btn sm" data-lb-back>← the book</button>
			<h2>A board not on file <span class="lb-badge ${g.today ? 'today' : 'old'}">${g.today ? 'seen today' : esc(dayOf(g.day))}</span></h2></div>
		<p class="dialog-note">${plural(g.said.length, 'island')}, fitting none of the layouts on file. ${near ? (near.differ.length <= 4
		? `It is <button class="linky" data-lb-open="layout:${esc(near.combo.id)}"><b>layout ${esc(near.combo.id)}</b></button> at ${plural(near.agree, 'island')} and parts from it at ${near.differ.length} — which is what a slot moved at a maintenance looks like.`
		: `The nearest on file is <button class="linky" data-lb-open="layout:${esc(near.combo.id)}">layout ${esc(near.combo.id)}</button>, and it parts from that at ${near.differ.length} of the islands read — a new board, or a reading gone wrong.`) : ''}</p>
		<ul class="lb-readers flat">${readers}</ul>
		${g.today && onTake ? `<div class="lb-bar"><button class="chip primary" data-lb-take="${esc(g.key)}" title="Answer every island they named on today’s board">Take this reading as today’s board</button></div>` : ''}
		${near && near.differ.length ? `<h4 class="lb-lvh no">Where it parts from layout ${esc(near.combo.id)} <span class="quiet">· ${plural(near.differ.length, 'island')}</span></h4>
			<div class="lb-tiles">${offers.filter(o => parted.has(Number(o[0]))).map(o => tile(o, dress(o))).join('')}</div>` : ''}
		${tilesByLevel(offers, dress)}
		<div class="dialog-actions"><button class="act quiet" data-lb-back>Back to the book</button></div>`;
	};

	function draw() {
		const top = box.scrollTop;
		if (open && open.kind === 'layout') {
			const page = book.layouts.find(p => String(p.id) === open.key);
			root.innerHTML = page ? layoutHTML(page) : shelfHTML();
		} else if (open && open.kind === 'stray') {
			const g = book.strays.find(x => x.key === open.key);
			root.innerHTML = g ? strayHTML(g) : shelfHTML();
		} else root.innerHTML = shelfHTML();
		box.scrollTop = open && open.fresh ? 0 : top;
		if (open) open.fresh = false;
	}

	let shelfTop = 0;
	root.addEventListener('click', e => {
		const el = e.target.closest('[data-lb-open],[data-lb-level],[data-lb-back],[data-lb-filter],[data-lb-tell],[data-lb-take],[data-lb-seen],[data-lb-unsay]');
		if (!el) return;
		if (el.dataset.lbLevel) {
			level = el.dataset.lbLevel;
			draw();
		} else if (el.dataset.lbOpen) {
			if (!open) shelfTop = box.scrollTop;
			level = 'all';
			const [kind, ...rest] = el.dataset.lbOpen.split(':');
			open = { kind, key: rest.join(':'), fresh: true };
			draw();
		} else if ('lbBack' in el.dataset) {
			open = null;
			draw();
			box.scrollTop = shelfTop;
		} else if (el.dataset.lbFilter) {
			filter = el.dataset.lbFilter;
			draw();
		} else if ('lbTell' in el.dataset) {
			if (onTell) onTell(() => refresh({ force: true }));
		} else if (el.dataset.lbTake) {
			const g = book.strays.find(x => x.key === el.dataset.lbTake);
			if (g && onTake) { closeDialog(); onTake(g.said, g.readers); }
		} else if (el.dataset.lbSeen) {
			sawItToo(el.dataset.lbSeen).then(out => {
				toast(out.ok ? 'Counted: you saw the same board' : `It did not go${out.why ? `: ${out.why}` : ''}`);
				refresh({ force: true });
			});
		} else if (el.dataset.lbUnsay) {
			unsay(el.dataset.lbUnsay).then(out => {
				toast(out.ok ? 'Your reading is taken back' : `It did not go${out.why ? `: ${out.why}` : ''}`);
				open = null;
				refresh({ force: true });
			});
		}
	});
	root.addEventListener('input', e => {
		if (!e.target.matches('[data-lb-q]')) return;
		query = e.target.value;
		// only the cards: the box being typed in keeps its caret
		const grid = root.querySelector('[data-lb-grid]');
		if (grid) grid.innerHTML = gridHTML();
	});

	draw();
	refresh();
}
