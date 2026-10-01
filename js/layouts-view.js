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
import { T, said, gameName } from './i18n.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { img } from './ui-bits.js';
import { npcById, isleOf } from './barter_npcs.js';
import { levelOf } from './barter.js';
import { exchangeGate, knownAt } from './barter-board.js';
import { bookOf, searchBook } from './layout-book.js';
import { shared, fleetHistory, sawItToo, unsay } from './sea-boards.js';
import { me } from './sync.js';
import { loadingNote } from './loading.js';

const isle = id => { const n = npcById.get(Number(id)); return n ? isleOf(n) : `island ${id}`; };
const dayOf = key => {
	const d = new Date(`${String(key).slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(d.getTime()) ? String(key) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
// A count and the thing counted are one sentence rather than a number
// with a word after it, so each noun this file counts keeps its two
// forms here and the call sites go on asking for the noun by name.
const COUNTED = {
	board: n => (n === 1 ? T('{n} board', { n: F(n) }) : T('{n} boards', { n: F(n) })),
	confirm: n => (n === 1 ? T('{n} confirm', { n: F(n) }) : T('{n} confirms', { n: F(n) })),
	exchange: n => (n === 1 ? T('{n} exchange', { n: F(n) }) : T('{n} exchanges', { n: F(n) })),
	island: n => (n === 1 ? T('{n} island', { n: F(n) }) : T('{n} islands', { n: F(n) })),
	reading: n => (n === 1 ? T('{n} reading', { n: F(n) }) : T('{n} readings', { n: F(n) })),
	slot: n => (n === 1 ? T('{n} slot', { n: F(n) }) : T('{n} slots', { n: F(n) })),
	time: n => (n === 1 ? T('{n} time', { n: F(n) }) : T('{n} times', { n: F(n) }))
};
const plural = (n, one, many = `${one}s`) => (COUNTED[one] ? COUNTED[one](n) : `${F(n)} ${n === 1 ? one : many}`);
const by = readers => {
	const names = [...new Set(readers.filter(r => r.name).map(r => r.name))];
	const quiet = readers.filter(r => !r.name).length;
	const said = names.slice(0, 3).map(n => `<b>${esc(n)}</b>`);
	if (names.length > 3) said.push(T('{n} more', { n: names.length - 3 }));
	if (quiet) said.push(names.length ? (quiet === 1 ? T('{n} sailor not shown by name', { n: F(quiet) }) : T('{n} sailors not shown by name', { n: F(quiet) })) : (quiet === 1 ? T('a sailor not shown by name') : T('{n} sailors not shown by name', { n: F(quiet) })));
	return said.join(', ');
};

/** The levels a board pays, as a row of small counts. */
function levelPills(levels) {
	const out = [];
	for (let lv = 1; lv <= 7; lv++) if (levels[lv]) out.push(`<span class="lb-lv" style="--lv: var(--tier-${lv})" title="${T('{n} exchanges pay a [Level {lv}] good', { n: levels[lv], lv })}">L${lv}<b>${levels[lv]}</b></span>`);
	if (levels.coin) out.push(`<span class="lb-lv coin" title="${T('{n} exchanges pay Crow Coins', { n: levels.coin })}">◎<b>${levels.coin}</b></span>`);
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
		? `<span class="lb-face-row" title="${esc(title)}"><span class="lb-face-label">${label}</span>${names.slice(0, n).map(name => `<span title="${esc(gameName(name))}">${img(name, 'lb-face')}</span>`).join('')}${names.length > n ? `<span class="lb-more">+${names.length - n}</span>` : ''}</span>`
		: '');
	const starts = [...new Set(combo.offers.filter(o => levelOf(o[3]) === 1).map(o => o[1]))].sort();
	const coins = [...new Set(combo.offers.filter(o => o[3] === 'Crow Coin').map(o => o[1]))].sort();
	return row(T('from'), T('What the [Level 1] islands are asking for: where a day on this board starts'), starts)
		+ row(T('◎ for'), T('What the coin islands will take on this board'), coins);
}

/**
 * Open the book.
 *
 * `combos` is the record as ui-state loads it; `answers` what has been
 * seen today; `count` the sailor's barter count, for the gates. `onTake`
 * is handed a sighting's offers to answer today's board with, `onTell`
 * sends today's answers to the fleet; both belong to the Barter tab.
 */
export function openLayoutBook({ combos, answers = [], day = '', count = null, log = [], onTake = null, onTell = null } = {}) {
	let filter = 'all';      // all | standing | fleet | mine
	let query = '';
	let open = null;         // { kind: 'layout' | 'stray', key }
	let sightings = [];
	let asked = !shared();
	let book = bookOf(combos.combos, sightings, { today: day, answers, log });

	const host = openDialog('<div data-lb></div>');
	const box = host.querySelector('.dialog-box');
	box.classList.add('wide', 'xwide', 'tall', 'lb-box');
	const root = host.querySelector('[data-lb]');

	const refresh = ({ force = false } = {}) => {
		if (!shared()) return;
		fleetHistory({ force }).then(list => {
			sightings = list;
			asked = true;
			book = bookOf(combos.combos, sightings, { today: day, answers, log });
			draw();
		}).catch(() => { asked = true; draw(); });
	};

	/* --- the shelf ---------------------------------------------------- */
	const statusLine = () => {
		const pinned = book.layouts.find(p => p.today);
		const todayStray = book.strays.find(g => g.today);
		if (pinned) return T('Today the sea is on {layout}.', { layout: `<button class="linky" data-lb-open="layout:${esc(pinned.id)}"><b>${T('layout {id}', { id: esc(pinned.id) })}</b></button>` });
		if (answers.length && !book.standing) {
			return todayStray ? T('What you saw today fits <b>no layout on file</b> — and you are not the only one, see below.') : T('What you saw today fits <b>no layout on file</b>.');
		}
		if (answers.length) return T('{islands} answered today: <b>{standing}</b> of {of} layouts still stand.', { islands: plural(answers.length, 'island'), standing: book.standing, of: book.layouts.length });
		return T('Nothing answered today yet, so all {n} layouts stand.', { n: book.layouts.length });
	};

	const strayCard = g => {
		const near = g.near;
		const drift = near && near.differ.length <= 4 && near.agree >= near.differ.length;
		return `<button class="lb-card stray${g.today ? ' today' : ''}" data-lb-open="stray:${esc(g.key)}">
			<span class="lb-card-top"><span class="lb-num">?</span><span class="lb-badge ${g.today ? 'today' : 'old'}">${g.today ? T('seen today') : esc(dayOf(g.day))}</span></span>
			<span class="lb-card-line">${T('{islands} read by {who}', { islands: plural(g.said.length, 'island'), who: by(g.readers) || T('a sailor') })}</span>
			<span class="lb-card-line quiet">${g.seen ? `${g.seen === 1 ? T('{n} other saw the same', { n: F(g.seen) }) : T('{n} others saw the same', { n: F(g.seen) })} · ` : ''}${near ? (drift
		? T('<b>layout {id}</b> with {slots} moved', { id: esc(near.combo.id), slots: plural(near.differ.length, 'slot') })
		: T('nearest is layout {id}, and it parts at {n}', { id: esc(near.combo.id), n: near.differ.length })) : ''}</span>
			${g.unknown ? `<span class="lb-card-line hit">${T('{exchanges} the game is not known to deal there', { exchanges: plural(g.unknown, 'exchange') })}</span>` : ''}
			${near && drift ? `<span class="lb-diffs">${near.differ.slice(0, 3).map(d => `<span class="lb-diff">${img(d.filed.recv, 'lb-face')}<span class="lb-arrow">→</span>${img(d.saw.recv, 'lb-face')}</span>`).join('')}</span>` : ''}
		</button>`;
	};

	const layoutCard = ({ page, hits }) => {
		const fleet = page.sailors
			? `${T('fleet: {readings}', { readings: plural(page.sailors, 'reading') })}${page.confirms ? ` · ${plural(page.confirms, 'confirm')}` : ''} · ${T('last {day}', { day: esc(dayOf(page.days[0])) })}`
			: (shared() ? T('not read by the fleet yet') : '');
		const state = page.today ? `<span class="lb-badge today">${T('today’s board')}</span>`
			: !answers.length ? ''
				: page.standing ? `<span class="lb-badge standing">${T('still standing')}</span>` : `<span class="lb-badge out">${T('ruled out today')}</span>`;
		return `<button class="lb-card${page.today ? ' today' : ''}${answers.length && !page.standing ? ' out' : ''}" data-lb-open="layout:${esc(page.id)}">
			<span class="lb-card-top"><span class="lb-num">${esc(page.id)}</span>${state}</span>
			<span class="lb-faces">${faceOf(page.combo)}</span>
			<span class="lb-levels">${levelPills(page.levels)}</span>
			<span class="lb-card-line quiet">${T('record: {times} in {of} refreshes', { times: plural(page.filed, 'time'), of: F(combos.sample.refreshes) })}</span>
			${fleet ? `<span class="lb-card-line quiet">${fleet}</span>` : ''}
			${page.mine ? `<span class="lb-card-line mine">${T('you: <b>{times}</b>', { times: plural(page.mine, 'time') })}${book.dealt ? ` · ${Math.round((page.mine / book.dealt) * 100)}%` : ''} · ${T('last {day}', { day: esc(dayOf(page.mineLast)) })}</span>` : ''}
			${hits ? `<span class="lb-card-line hit">${T('{islands} match “{q}”', { islands: plural(hits.size, 'island'), q: esc(query) })}</span>` : ''}
		</button>`;
	};

	const gridHTML = () => {
		let pages = searchBook(book.layouts, query, id => isle(id));
		if (filter === 'standing') pages = pages.filter(x => x.page.standing);
		if (filter === 'fleet') pages = pages.filter(x => x.page.sailors).sort((a, b) => b.page.sailors - a.page.sailors);
		if (filter === 'mine') pages = pages.filter(x => x.page.mine).sort((a, b) => b.page.mine - a.page.mine);
		else if (filter !== 'fleet') pages.sort((a, b) => (b.page.today - a.page.today) || (b.page.standing - a.page.standing) || 0);
		const strays = filter === 'standing' || filter === 'mine' || query ? [] : book.strays;
		return `${strays.length ? `<h3 class="lb-h">${T('Boards nobody has on file')} <span class="quiet">· ${strays.length}</span></h3>
			<p class="lb-sub">${T('Read by sailors, and fitting none of the {n} layouts. One that others have seen too is the record out of date; one nobody else has seen may be a slip.', { n: book.layouts.length })}</p>
			<div class="lb-grid">${strays.map(strayCard).join('')}</div>` : ''}
			<h3 class="lb-h">${filter === 'standing' ? T('Layouts still standing today') : filter === 'fleet' ? T('Layouts the fleet has read, the most read first') : filter === 'mine' ? T('The boards you have been dealt, the commonest first') : T('The layouts on file')} <span class="quiet">· ${pages.length}</span></h3>
			${pages.length ? `<div class="lb-grid">${pages.map(layoutCard).join('')}</div>` : `<p class="lb-sub">${query ? T('Nothing on file deals “{q}”.', { q: esc(query) }) : T('None.')}</p>`}`;
	};

	/** Which board this sailor is dealt most, from the log the app keeps. */
	const mineLine = () => {
		const most = book.layouts.filter(p => p.mine).sort((a, b) => b.mine - a.mine)[0];
		return most ? `<p class="lb-sub">${T('You have settled <b>{boards}</b>; the one you are dealt most is {layout}, {times}. The app writes a board down by itself the moment it is settled.', { boards: plural(book.dealt, 'board'), layout: `<button class="linky" data-lb-open="layout:${esc(most.id)}"><b>${T('layout {id}', { id: esc(most.id) })}</b></button>`, times: plural(most.mine, 'time') })}</p>` : '';
	};

	const shelfHTML = () => {
		const chip = (id, label, n) => `<button class="chip${filter === id ? ' on' : ''}" data-lb-filter="${id}">${label}${n === null ? '' : ` <span class="quiet">${n}</span>`}</button>`;
		const since = new Date(`${combos.sample.since}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
		return `<h2>${T('The layout book')}</h2>
		<p class="dialog-note">${T('Every refresh deals one of <b>{n}</b> boards.', { n: book.layouts.length })} ${shared() ? T('These are the ones on file — the community’s record of {refreshes} refreshes since {since} — and beside them what the fleet has read in the last two months.', { refreshes: F(combos.sample.refreshes), since: esc(since) }) : T('These are the ones on file — the community’s record of {refreshes} refreshes since {since} — and beside them what the fleet has read.', { refreshes: F(combos.sample.refreshes), since: esc(since) })} ${statusLine()}</p>
		<div class="lb-bar">
			${chip('all', T('All'), book.layouts.length)}${answers.length ? chip('standing', T('Standing today'), book.standing) : ''}${shared() ? chip('fleet', T('Read by the fleet'), book.layouts.filter(p => p.sailors).length) : ''}${book.dealt ? chip('mine', T('Yours'), book.layouts.filter(p => p.mine).length) : ''}
			<input class="lb-search" type="search" data-lb-q placeholder="${T('an island, a good, or a layout’s number…')}" value="${esc(query)}" aria-label="${T('Search the layouts')}">
			${onTell && shared() && answers.length ? `<button class="ghost-btn sm" data-lb-tell title="${me() ? T('Send the islands you answered today, with your name on the reading') : T('Sign in from the Menu first — a reading goes up with a name on it')}">📣 ${T('Tell the fleet what you saw')}</button>` : ''}
		</div>
		${!shared() ? `<p class="lb-sub">${T('This deployment keeps no fleet readings, so the book is the record alone.')}</p>` : !asked ? `<p class="lb-sub">${loadingNote(T('Asking what the fleet has read…'))}</p>` : book.open ? `<p class="lb-sub">${book.open === 1 ? T('{n} reading named too few islands to tell the layouts apart, and is counted for none.', { n: F(book.open) }) : T('{n} readings named too few islands to tell the layouts apart, and are counted for none.', { n: F(book.open) })}</p>` : ''}
		${mineLine()}
		<div data-lb-grid>${gridHTML()}</div>
		<div class="dialog-actions"><button class="act quiet" data-close>${T('Close')}</button></div>`;
	};

	/* --- one board ---------------------------------------------------- */
	/** A good's name without the level in front of it: the heading over
	 *  the tiles has already said the level, eighty-six times over. */
	const plain = name => String(name).replace(/^\[[^\]]*\]\s*/, '');
	const good = (name, qty = 1) => `<span class="lb-good">${img(name, 'row-icon')}<span>${Number(qty) > 1 ? `<b>${F(Number(qty))}×</b> ` : ''}${esc(plain(gameName(name)))}</span></span>`;

	/** One island on a board, as a tile: its name whole, then what it
	 *  takes and what it pays. `notes` is what there is to say about it. */
	const tile = (o, { cls = '', tags = [], under = '' } = {}) => `<div class="lb-tile${cls}">
		<div class="lb-tile-top"><span class="lb-isle">${esc(gameName(isle(o[0])))}</span>${tags.length ? `<span class="lb-tags">${tags.join('')}</span>` : ''}</div>
		<div class="lb-tile-swap">${good(o[1], o[2])}<span class="lb-arrow">→</span>${good(o[3])}</div>${under}
	</div>`;

	const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'coin', 'other'];
	const levelKey = recv => { const lv = levelOf(recv); return lv ? `L${lv}` : recv === 'Crow Coin' ? 'coin' : 'other'; };
	const levelTitle = k => (k === 'coin' ? T('Sold for Crow Coins') : k === 'other' ? T('Pays something else') : k === 'L1' ? T('Land goods → Level 1') : T('Level {from} → Level {to}', { from: Number(k.slice(1)) - 1, to: k.slice(1) }));
	let level = 'all';       // which level of the open board is shown

	const tilesByLevel = (offers, dress) => {
		const groups = new Map();
		for (const o of offers) {
			const key = levelKey(o[3]);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(o);
		}
		const keys = LEVELS.filter(k => groups.has(k));
		const tabs = `<div class="lb-bar lb-tabs"><button class="chip${level === 'all' ? ' on' : ''}" data-lb-level="all">${T('All')} <span class="quiet">${offers.length}</span></button>${keys.map(k =>
			`<button class="chip${level === k ? ' on' : ''}" data-lb-level="${k}" style="--lv: var(--tier-${k.startsWith('L') ? k.slice(1) : 6})"><i class="lb-dot"></i>${k === 'coin' ? `◎ ${T('coins')}` : k === 'other' ? T('other') : k} <span class="quiet">${groups.get(k).length}</span></button>`).join('')}</div>`;
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
			if (a && a.give === o[1] && a.recv === o[3]) { cls += ' same'; tags.push(`<span class="lb-tag ok" title="${T('What you saw here today')}">✓ ${T('seen')}</span>`); }
			else if (a) { cls += ' off'; under = `<div class="lb-tile-saw"><span class="lb-saw-label">${T('you saw')}</span>${good(a.give)}<span class="lb-arrow">→</span>${good(a.recv)}</div>`; }
			const gate = exchangeGate(page.combo, o[0]);
			if (gate !== null && count !== null && gate > count) { cls += ' locked'; tags.push(`<span class="lb-tag lock" title="${T('The game opens this exchange at {gate} total barters; you have {count}, so the island shows you nothing here', { gate: F(gate), count: F(count) })}">🔒 ${F(gate)}</span>`); }
			if (filled.has(Number(o[0]))) tags.push(`<span class="lb-tag file" title="${T('The community’s record has no row for this island on this layout: this one is read out of the game’s own files, and nobody has yet reported seeing it')}">${T('game files')}</span>`);
			return { cls, tags, under };
		};
		const locked = count === null ? 0 : page.combo.offers.filter(o => { const g = exchangeGate(page.combo, o[0]); return g !== null && g > count; }).length;
		const readers = page.readers.slice(0, 12).map(r => `<li>${r.name ? `<b>${esc(r.name)}</b>` : T('a sailor not shown by name')}${r.mine ? ` (${T('you')})` : ''} · ${esc(dayOf(r.day))} · ${plural(r.islands, 'island')}${r.seen ? ` · ${r.seen === 1 ? T('{n} other saw the same', { n: F(r.seen) }) : T('{n} others saw the same', { n: F(r.seen) })}` : ''}</li>`).join('');
		return `<div class="lb-head"><button class="ghost-btn sm" data-lb-back>← ${T('the book')}</button>
			<h2>${T('Layout {id}', { id: esc(page.id) })} ${page.today ? `<span class="lb-badge today">${T('today’s board')}</span>` : answers.length ? (page.standing ? `<span class="lb-badge standing">${T('still standing')}</span>` : `<span class="lb-badge out">${T('ruled out today')}</span>`) : ''}</h2></div>
		<div class="lb-facts">
			<span>${T('<b>{n}</b> islands', { n: F(page.combo.offers.length) })}</span>
			<span>${T('on the record <b>{times}</b> of {of}', { times: plural(page.filed, 'time'), of: F(combos.sample.refreshes) })}</span>
			${page.sailors ? `<span>${T('read by the fleet <b>{times}</b>', { times: plural(page.sailors, 'time') })} · ${T('last {day}', { day: esc(dayOf(page.days[0])) })}</span>` : ''}
			${filled.size ? `<span title="${T('Rows the community’s record lacks, read out of the game’s own files')}">${T('<b>{n}</b> from the game files', { n: filled.size })}</span>` : ''}
			${locked ? `<span title="${T('Exchanges your barter count has not opened: those islands show you nothing on this board')}">${T('<b>{n}</b> 🔒 above your {count} barters', { n: locked, count: F(count) })}</span>` : ''}
			${answers.length ? `<span class="${parted.length ? 'no' : 'ok'}">${T('{n} as you saw', { n: agreed })}${parted.length ? ` · ${T('<b>{n}</b> not', { n: parted.length })}` : ''}</span>` : ''}
		</div>
		${readers ? `<details class="lb-readers"><summary>${T('Who read it')}</summary><ul>${readers}</ul></details>` : ''}
		${parted.length ? `<h4 class="lb-lvh no">${T('Where it parts from what you saw today')} <span class="quiet">· ${plural(parted.length, 'island')}</span></h4>
			<div class="lb-tiles">${parted.sort((x, y) => isle(x[0]).localeCompare(isle(y[0]))).map(o => tile(o, dress(o))).join('')}</div>` : ''}
		${tilesByLevel(page.combo.offers, dress)}
		${poolsHTML(page.combo)}
		<div class="dialog-actions"><button class="act quiet" data-lb-back>${T('Back to the book')}</button></div>`;
	};

	// The islands the layout leaves to a draw of their own: named, with
	// what each may show -- materials mostly -- since which one it shows
	// today is only on the window.
	const poolsHTML = combo => {
		const pools = Object.entries(combo.pools || {});
		if (!pools.length) return '';
		const mine = new Map(answers.map(a => [a.npcId, a]));
		return `<h4 class="lb-lvh" style="--lv: var(--tier-6)">${T('Drawn each refresh')} <span class="quiet">· ${plural(pools.length, 'island')} · ${T('each shows one of its offers, read off the window')}</span></h4>
			<div class="lb-tiles">${pools.sort((x, y) => isle(Number(x[0])).localeCompare(isle(Number(y[0])))).map(([id, pool]) => {
				const a = mine.get(Number(id));
				const pays = [...new Set(pool.options.map(o => o.recv))];
				return `<div class="lb-tile pool${a ? ' same' : ''}">
					<div class="lb-tile-top"><span class="lb-isle">${esc(gameName(isle(Number(id))))}</span><span class="lb-tags"><span class="lb-tag" title="${T('The game draws one of {n} offers here each refresh', { n: F(pool.options.length) })}">🎲 ${T('one of {n}', { n: F(pool.options.length) })}</span></span></div>
					${a ? `<div class="lb-tile-swap">${good(a.give)}<span class="lb-arrow">→</span>${good(a.recv)}</div>` : `<div class="lb-pool-pays">${pays.slice(0, 8).map(r => `<span title="${esc(gameName(r))}">${img(r, 'row-icon xs')}</span>`).join('')}${pays.length > 8 ? `<span class="quiet">+${F(pays.length - 8)}</span>` : ''}</div>`}
				</div>`;
			}).join('')}</div>`;
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
					? `<span class="lb-tag file" title="${T('The game is known to deal this exchange at this island — on another layout. That is what a slot moved at a maintenance looks like')}">${T('known here')}</span>`
					: `<span class="lb-tag lock" title="${T('Neither the game’s files nor the record have this exchange at this island at all: a new exchange, or a misreading')}">${T('never seen here')}</span>`],
				under: `<div class="lb-tile-saw"><span class="lb-saw-label">${T('layout {id} has', { id: esc(near.combo.id) })}</span>${good(d.filed.give)}<span class="lb-arrow">→</span>${good(d.filed.recv)}</div>`
			};
		};
		const offers = g.said.map(a => [a.npcId, a.give, '1', a.recv]);
		const readers = g.readers.map(r => `<li>${r.name ? `<b>${esc(r.name)}</b>` : T('a sailor not shown by name')}${r.mine ? ` (${T('you')})` : ''} · ${plural(r.islands, 'island')}${r.seen ? ` · ${r.seen === 1 ? T('{n} other saw the same', { n: F(r.seen) }) : T('{n} others saw the same', { n: F(r.seen) })}` : ''}
			${r.mine ? `<button class="linky" data-lb-unsay="${esc(String(r.id))}">${T('take it back')}</button>` : (g.today && me() && !r.confirmed ? `<button class="linky" data-lb-seen="${esc(String(r.id))}">${T('I saw the same')}</button>` : (r.confirmed ? `<span class="lb-ok">✓ ${T('you saw the same')}</span>` : ''))}</li>`).join('');
		return `<div class="lb-head"><button class="ghost-btn sm" data-lb-back>← ${T('the book')}</button>
			<h2>${T('A board not on file')} <span class="lb-badge ${g.today ? 'today' : 'old'}">${g.today ? T('seen today') : esc(dayOf(g.day))}</span></h2></div>
		<p class="dialog-note">${T('{islands}, fitting none of the layouts on file.', { islands: plural(g.said.length, 'island') })} ${near ? (near.differ.length <= 4
		? T('It is {layout} at {islands} and parts from it at {n} — which is what a slot moved at a maintenance looks like.', { layout: `<button class="linky" data-lb-open="layout:${esc(near.combo.id)}"><b>${T('layout {id}', { id: esc(near.combo.id) })}</b></button>`, islands: plural(near.agree, 'island'), n: near.differ.length })
		: T('The nearest on file is {layout}, and it parts from that at {n} of the islands read — a new board, or a reading gone wrong.', { layout: `<button class="linky" data-lb-open="layout:${esc(near.combo.id)}">${T('layout {id}', { id: esc(near.combo.id) })}</button>`, n: near.differ.length })) : ''}</p>
		<ul class="lb-readers flat">${readers}</ul>
		${g.today && onTake ? `<div class="lb-bar"><button class="chip primary" data-lb-take="${esc(g.key)}" title="${T('Answer every island they named on today’s board')}">${T('Take this reading as today’s board')}</button></div>` : ''}
		${near && near.differ.length ? `<h4 class="lb-lvh no">${T('Where it parts from layout {id}', { id: esc(near.combo.id) })} <span class="quiet">· ${plural(near.differ.length, 'island')}</span></h4>
			<div class="lb-tiles">${offers.filter(o => parted.has(Number(o[0]))).map(o => tile(o, dress(o))).join('')}</div>` : ''}
		${tilesByLevel(offers, dress)}
		<div class="dialog-actions"><button class="act quiet" data-lb-back>${T('Back to the book')}</button></div>`;
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
				toast(out.ok ? T('Counted: you saw the same board') : (out.why ? T('It did not go: {why}', { why: said(out.why) }) : T('It did not go')));
				refresh({ force: true });
			});
		} else if (el.dataset.lbUnsay) {
			unsay(el.dataset.lbUnsay).then(out => {
				toast(out.ok ? T('Your reading is taken back') : (out.why ? T('It did not go: {why}', { why: said(out.why) }) : T('It did not go')));
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
