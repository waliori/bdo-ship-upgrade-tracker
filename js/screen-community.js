// The Community tab: the hall of fame, and the fleet in numbers.
//
// Everything on it comes from /api/community, which is built from the
// digests of the sailors who chose to be on the boards -- nobody else
// is counted, in either half. Signed out, the boards can be read but
// not joined; signed in, the account can take part by name or as an
// unnamed sailor, and be told where it stands on every board.
//
// The screen is drawn from a held copy of the answer and asks for a
// fresh one when it is opened, when the account changes, and no more
// than once a minute otherwise. Joining shows first what would be
// published: the same digest the server would take, worked out here
// from the local save by the same module.
//
// A row is never only a number: the hull is its icon with the parts
// on it and the crystal in its slot, a sailor is their portrait, a
// monster its picture -- the boards say which Rusalka, not just
// "Rusalka".

import { esc, F, FC } from './fmt.js';
import * as store from './state.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { feature, me, call, setShare, onAccount, onPushed, signIn } from './sync.js';
import { digest, BOARDS, SECTIONS, monsterName, fittedOn } from './digest.js';
import { quests } from './quests.js';
import { npcById } from './barter_npcs.js';
import { crystalById, crystalVariant, crystalLine, gradeById } from './crystals.js';
import { STAT_NAMES, anyType } from './sailors.js';
import { monsterArt } from './monster_art.js';
import { iconSrc } from './ui-bits.js';
import { openItemCard } from './item-card.js';
import { openSailorSheet } from './screen-crew.js';
import { T, said, gameName } from './i18n.js';

let data = null;          // the last answer from /api/community
let fetchedAt = 0;
let loading = null;
let failed = '';
let mine = false;         // our own save moved since the boards were fetched
let triedAt = 0;          // when the boards were last asked, answer or not
let pushTimer = null;     // the wait between a push landing and asking again
let half = 'fame';        // fame | numbers
let fameSec = 'all';      // the hall of fame: which section is up
let numCat = 'all';       // the fleet in numbers: which category is up
let numQ = '';            // and the word typed to find a row
let numSort = 'count';    // count | name
const numOpen = new Set();   // the panels unfolded past their first rows
let rerender = () => {};

// Whether this browser has been told that signing in puts you on the
// boards. Per browser rather than per save: it is a thing to be told
// once where you are, not a preference to carry about.
const TOLD_KEY = 'community.told';

const FRESH_MS = 60_000;

// After a push, how long to give the server to notice. The boards hold
// themselves for a few seconds past a change they know about, so asking
// the instant the push returns would fetch the copy built a moment
// before it -- and then sit on that for a minute.
const AFTER_PUSH_MS = 3_500;

// How long to leave a board that did not answer alone.
//
// The failure repaints the screen to show it, the repaint asks again,
// and nothing held it back: a server that is down was met with a
// request every few milliseconds for as long as the tab was open. It
// is a held answer that stops the asking, and a failure leaves none --
// so the refusal has to be remembered on its own.
const AFTER_FAIL_MS = 10_000;

/**
 * Ask for the boards again if the copy held is old, then redraw.
 *
 * "Old" is not only a matter of time. A save of our own since the last
 * answer makes that answer wrong about the one row the player is most
 * likely to be looking at -- their own -- so it counts as old however
 * recently it arrived.
 */
async function load(force = false) {
	if (loading) return loading;
	if (!force && !mine) {
		if (data && Date.now() - fetchedAt < FRESH_MS) return data;
		// Nothing held, and the last ask failed: wait before asking
		// again. "Try again" is a force and does not wait.
		if (!data && failed && Date.now() - triedAt < AFTER_FAIL_MS) return null;
	}
	mine = false;
	triedAt = Date.now();
	loading = (async () => {
		let res;
		try {
			res = await call('GET', '/api/community');
		} catch {
			res = null;
		}
		if (res && res.ok && res.body) {
			// The boards were rebuilt since, so every digest behind them
			// may have moved -- including our own, which is the card held
			// here that goes most obviously stale.
			if (!data || res.body.updatedAt !== data.updatedAt) {
				cards.clear();
				wholeBoards.clear();
			}
			data = res.body;
			fetchedAt = Date.now();
			failed = '';
		} else {
			failed = res && res.body && res.body.error ? res.body.error : T('The boards did not answer.');
		}
	})().finally(() => { loading = null; rerender(); });
	return loading;
}

let hooks = {};   // look(save, { name, sailorId }): the Ship tab stood up on another sailor's boat

export function wireCommunity(fn, given = {}) {
	rerender = fn;
	hooks = given;
	// The find box on the fleet in numbers: a word narrows every panel.
	let timer = null;
	document.addEventListener('input', evt => {
		if (!evt.target.matches || !evt.target.matches('.comm-numq')) return;
		numQ = evt.target.value;
		clearTimeout(timer);
		timer = setTimeout(rerender, 180);
	});
	// The account's standing changed -- joined, left, signed out -- so
	// the boards it is on did too.
	onAccount(() => { if (feature('community')) load(true); });
	// A save of ours reached the server. What the boards say about us is
	// worked out from that copy, so it has just gone out of date: the
	// held answer and every card drawn from it are marked stale, and if
	// the tab is the one on screen it is refreshed then and there rather
	// than waiting for the player to leave and come back.
	onPushed(() => {
		if (!feature('community')) return;
		const who = me();
		if (!who || !who.share) return;
		mine = true;
		clearTimeout(pushTimer);
		pushTimer = setTimeout(() => {
			if (document.querySelector('.community')) load();
		}, AFTER_PUSH_MS);
	});
}

/* ------------------------------------------------------------------ *
 * Names and pictures for what the digest keeps as keys
 * ------------------------------------------------------------------ */

const questById = Object.fromEntries(quests.map(q => [q.id, q]));
const questName = id => {
	const q = questById[id];
	if (!q) return id;
	// Short enough for a bar's label: the cadence tags and the guild's
	// name go, and a Ravinia log keeps its letter.
	const m = / — (.+)$/.exec(q.name);
	const name = m ? m[1] : q.name.replace(/\[[^\]]+\]\s*/g, '').replace(/^Old Moon Guild's (Request: )?/, '');
	return /\[Weekly\]/.test(q.name) ? T('{name} (weekly)', { name }) : name;
};
const isleName = id => {
	const n = npcById.get(Number(id));
	return n ? `${n.at}` : `#${id}`;
};
const crystalOf = id => crystalById[Number(id)] || null;
const crystalName = id => (crystalOf(id) ? crystalOf(id).name : `#${id}`);
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? T('ordinal|th') : [T('ordinal|th'), T('ordinal|st'), T('ordinal|nd'), T('ordinal|rd')][Math.min(n % 10, 4)] || T('ordinal|th')}`;
const value = (board, v) => (board.id === 'silver' || board.id === 'bestday' ? FC(v) : F(v));
const boardById = Object.fromEntries(BOARDS.map(b => [b.id, b]));
const SLOTS = ['cannon', 'sail', 'figurehead', 'plating'];
const SLOT_LETTER = { cannon: 'C', sail: 'S', figurehead: 'F', plating: 'P' };
const day = ms => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

/** An item's icon, or nothing when the mapping has none. */
const pic = (name, cls = '', title = '') => {
	const src = iconSrc(name);
	if (src === 'icon.png') return `<span class="comm-pic glyph ${cls}" title="${esc(title || gameName(name))}">${esc(String(gameName(name)).slice(0, 1))}</span>`;
	return `<img class="comm-pic ${cls}" src="${esc(src)}" alt="" title="${esc(title || gameName(name))}" decoding="sync">`;
};
/** A sailor's portrait, by type. */
const face = (type, cls = '', title = '') => pic(type, `${cls} face`, title || gameName(type));
/** A monster's picture, or its glyph. */
const monsterPic = (key, cls = '') => (monsterArt[key]
	? `<img class="comm-pic ${cls} beast" src="icons/${esc(monsterArt[key])}" alt="" title="${esc(gameName(monsterName(key)))}" decoding="sync">`
	: `<span class="comm-pic glyph ${cls}" title="${esc(gameName(monsterName(key)))}">🦈</span>`);

/** A crystal by id: its icon, its name and the one number it is chosen for, in its grade's colour. */
function crystalHTML(id, { icon = true, name = true } = {}) {
	const c = crystalOf(id);
	if (!c) return '';
	const grade = gradeById[c.grade] || { colour: 'var(--ink-mid)', label: c.grade };
	const variant = crystalVariant(c);
	return `<span class="comm-crystal" style="--grade:${esc(grade.colour)}" title="${esc(`${gameName(c.name)} — ${crystalLine(c)}`)}">${icon ? pic(c.name, 'xs') : ''}${name ? `<span class="comm-crystal-name">${esc(gameName(c.name).replace(/ Sea Crystal$/, ''))}</span>` : ''}${variant ? `<b>${esc(variant)}</b>` : ''}</span>`;
}

/** The parts on a hull as four slots: the icon and level of what is fitted, or the slot's letter, empty. */
function slotsHTML(levels = {}, fitted = null) {
	return `<span class="comm-slots">${SLOTS.map(sl => {
		const item = fitted && typeof fitted[sl] === 'string' ? fitted[sl] : '';
		const lv = levels[sl] || 0;
		if (!item && !lv) return `<i class="comm-slot off" title="${T('{slot}: nothing fitted', { slot: esc(sl) })}">${SLOT_LETTER[sl]}</i>`;
		return `<i class="comm-slot" title="${esc(gameName(item) || `${sl} +${lv}`)}">${item ? pic(item, 'xs') : `<span class="comm-slot-l">${SLOT_LETTER[sl]}</span>`}${lv ? `<b>+${lv}</b>` : ''}</i>`;
	}).join('')}</span>`;
}

/** What a board's row shows beside the name, from the face the server sent. */
function faceHTML(f) {
	if (!f) return '';
	switch (f.kind) {
		case 'ship': return `<span class="comm-face">${pic(f.item, 'sm')}${slotsHTML(f.parts, f.fitted)}${f.crystal ? crystalHTML(f.crystal) : ''}</span>`;
		case 'items': return `<span class="comm-face">${f.items.map(i => pic(i, 'sm')).join('')}</span>`;
		case 'sailor': return `<span class="comm-face">${face(f.type, 'sm', `${f.name} · ${gameName(f.type)}`)}</span>`;
		case 'sailors': return `<span class="comm-face">${f.types.map(t => face(t, 'sm')).join('')}</span>`;
		case 'monsters': return `<span class="comm-face">${f.keys.map(k => monsterPic(k, 'sm')).join('')}</span>`;
		default: return '';
	}
}

/** A sailor's growths as small chips. */
const statsHTML = stats => {
	const rows = Object.entries(stats || {});
	if (!rows.length) return '';
	return `<span class="comm-stats">${rows.map(([k, v]) => { const n = STAT_NAMES[k] || { game: k, means: '', tip: k }; return `<i title="${esc(said(n.tip))}">${esc(said(n.game))}${n.means ? ` <small>${esc(said(n.means))}</small>` : ''} <b>+${v}%</b></i>`; }).join('')}</span>`;
};

const avatarURL = who => (who && who.avatar ? `https://cdn.discordapp.com/avatars/${who.id}/${who.avatar}.png?size=64` : null);
const avatarHTML = (e, cls = '') => (e.avatar
	? `<img class="comm-avatar ${cls}" src="${esc(e.avatar)}" alt="" loading="lazy">`
	: `<span class="comm-avatar anon ${cls}" aria-hidden="true">${e.named ? esc((e.name || '?').slice(0, 1)) : '☸'}</span>`);
const medal = rank => `<span class="comm-pos${rank <= 3 ? ` p${rank}` : ''}">${rank <= 3 ? rank : ordinal(rank)}</span>`;

/* ------------------------------------------------------------------ *
 * The head: who is on the boards, and where you stand
 * ------------------------------------------------------------------ */

function headHTML() {
	const who = me();
	const n = data ? data.sailors : 0;
	const named = data ? data.named : 0;
	const built = data ? new Date(data.updatedAt) : null;
	let you;
	if (!who) {
		you = `<div class="comm-you"><p class="comm-copy">${T('The boards show only what sailors chose to share. <button class="act small" data-act="signin">Sign in with Discord</button> to take part — by name, or as an unnamed sailor.')}</p></div>`;
	} else if (!who.share) {
		you = `<div class="comm-you"><p class="comm-copy">${T('You are not on the boards; nothing about your save is shown to anyone. <button class="act small" data-act="community-join">Take part</button> — you will see exactly what would be shared before you agree.')}</p></div>`;
	} else {
		const y = data && data.you ? data.you : { places: {} };
		// Signing in puts an account on the boards, so the first time
		// someone opens the tab it has to say so plainly, and say how to
		// stop -- being on a public board is not a thing to discover.
		const notice = store.getSetting(TOLD_KEY, false) ? '' : `<p class="comm-notice">${who.share === 'named' ? T('Signing in put you on the boards by name.') : T('Signing in put you on the boards.')} ${T('Only the numbers below are shared — never your stock, your notes or your traces.')} <button class="chip tiny" data-act="community-join">${T('Change how you are shown')}</button> <button class="chip tiny" data-act="community-leave">${T('Leave the boards')}</button> <button class="chip tiny" data-act="community-told">${T('Got it')}</button></p>`;
		const places = Object.entries(y.places).map(([id, p]) => ({ b: boardById[id], p })).filter(x => x.b).sort((a, b) => a.p.rank - b.p.rank || b.p.of - a.p.of);
		const shown = places.slice(0, 4);
		const src = avatarURL(who);
		you = `${notice}<div class="comm-you on">
			${src ? `<img class="comm-avatar big" src="${esc(src)}" alt="">` : `<span class="comm-avatar anon big" aria-hidden="true">${who.share === 'named' ? esc(who.username.slice(0, 1)) : '☸'}</span>`}
			<div class="comm-you-body">
				<p class="comm-you-line">${T('You are on the boards as <b>{who}</b>', { who: who.share === 'named' ? esc(who.username) : T('an unnamed sailor') })}${y.level ? ` <span>· ${esc(y.level)}</span>` : ''}${y.joinedAt ? ` <span>· ${T('since {day}', { day: day(y.joinedAt) })}</span>` : ''}</p>
				<div class="comm-you-places">
					${shown.length ? shown.map(({ b, p }) => `<button class="comm-place${p.rank <= 3 ? ` p${p.rank}` : ''}" data-act="community-places" title="${esc(T('{rank} of {n} · {desc}', { rank: ordinal(p.rank), n: p.of, desc: said(b.desc) }))}">${medal(p.rank)}<span><i aria-hidden="true">${b.icon}</i> ${esc(said(b.title))}</span></button>`).join('') : `<span class="comm-you-none">${data ? T('No place on any board yet — the boards below say what earns one.') : T('Fetching your places…')}</span>`}
					${places.length > shown.length ? `<button class="comm-more-places" data-act="community-places">${T('and {n} more', { n: places.length - shown.length })}</button>` : ''}
				</div>
			</div>
			<div class="comm-you-acts">
				${y.ref ? `<button class="act small" data-act="community-sailor" data-ref="${esc(y.ref)}">${T('My card')}</button>` : ''}
				<button class="chip" data-act="community-join">${who.share === 'named' ? T('Shown by name · change') : T('Shown unnamed · change')}</button>
				<button class="chip comm-leave" data-act="community-leave">${T('Leave the boards')}</button>
			</div>
		</div>`;
	}
	return `<section class="panel comm-head">
		<div class="panel-head">
			<h2 class="panel-title">${T('The harbour')}</h2>
			<span class="panel-sub">${data ? `${n === 1 ? T('{n} sailor on the boards', { n }) : T('{n} sailors on the boards', { n })} · ${T('{n} by name', { n: named })}${built ? ` · ${T('drawn up at {time} UTC', { time: built.toISOString().slice(11, 16) })}` : ''}` : loading ? T('fetching the boards…') : failed || ''}</span>
			<span class="panel-spacer"></span>
			<button class="chip tiny" data-act="community-find" title="${T('Find a sailor on the boards by name')}">⌕ ${T('Find a sailor')}</button>
			<div class="comm-halves" role="tablist">
				<button class="seg${half === 'fame' ? ' on' : ''}" role="tab" aria-selected="${half === 'fame'}" data-act="community-half" data-id="fame">${T('Hall of fame')}</button>
				<button class="seg${half === 'numbers' ? ' on' : ''}" role="tab" aria-selected="${half === 'numbers'}" data-act="community-half" data-id="numbers">${T('The fleet in numbers')}</button>
			</div>
		</div>
		${you}
	</section>`;
}

/* ------------------------------------------------------------------ *
 * The hall of fame
 * ------------------------------------------------------------------ */

const TOP = 3;   // places shown on a board before "show all"

/** The caller's own row on a board they are not in the top of: the
 *  rank and value from the server, the face from the local save. */
function yourRow(board) {
	const who = me();
	const place = data.you && data.you.places[board.id];
	if (!who || !place || board.top.some(e => e.you)) return null;
	const b = boardById[board.id];
	const d = digest(store.saveShape());
	return { rank: place.rank, value: place.value, you: true, named: who.share === 'named', name: who.username, avatar: who.share === 'named' ? avatarURL(who) : null, ref: data.you.ref, detail: b ? b.detail(d) : '', face: b ? b.face(d) : null };
}

function boardHTML(board) {
	const b = boardById[board.id] || board;
	const who = me();
	const rows = board.top.slice(0, TOP);
	const mine = yourRow(board);
	const top = board.top.length ? board.top[0].value : 0;
	const first = board.top[0] && board.top[0].you;
	return `<section class="panel comm-board${first ? ' gold' : ''}" data-board="${esc(board.id)}">
		<div class="comm-board-head">
			<span class="comm-board-icon" aria-hidden="true">${board.icon}</span>
			<div class="comm-board-t"><h3 class="comm-board-title">${esc(said(board.title))}</h3>${b.desc ? `<span class="comm-board-desc">${esc(said(b.desc))}</span>` : ''}</div>
			<span class="comm-board-n">${board.n ? (board.n === 1 ? T('{n} sailor', { n: board.n }) : T('{n} sailors', { n: board.n })) : T('nobody yet')}</span>
			${b.note ? `<button class="comm-how" data-act="community-how" data-id="${esc(board.id)}" title="${T('How this is counted')}" aria-label="${T('How {board} is counted', { board: esc(said(board.title)) })}">?</button>` : ''}
		</div>
		${rows.length ? `<ol class="comm-rank">${rows.map(e => rowHTML(board, e, top)).join('')}${mine ? rowHTML(board, mine, top, true) : ''}</ol>` : `<div class="comm-empty"><p>${T('Nobody has earned a place here yet.')}</p>${b.how ? `<small>${esc(said(b.how))}${who && who.share ? '' : ' ' + T('Then take part.')}</small>` : ''}</div>`}
		${board.n > rows.length ? `<button class="comm-more" data-act="community-board" data-id="${esc(board.id)}">${T('Show all {n} →', { n: board.n })}</button>` : ''}
	</section>`;
}

/** One place on a board. A press opens the sailor's card at what the board is about. */
function rowHTML(board, e, top = 0, dashed = false) {
	const pct = top ? Math.max(3, Math.round((e.value / top) * 100)) : 0;
	return `<li class="comm-row${e.you ? ' you' : ''}${e.rank <= 3 ? ` p${e.rank}` : ''}${dashed ? ' yours' : ''}" data-act="community-entry" data-board="${esc(board.id)}" data-ref="${esc(e.ref)}" role="button" tabindex="0" title="${T('{who} — open the card', { who: e.named ? esc(e.name) : T('A sailor') })}">
		${medal(e.rank)}
		${avatarHTML(e)}
		<span class="comm-who">
			<span class="comm-name">${e.named ? esc(e.name) : T('A sailor')}${e.you ? ` <em>${T('you')}</em>` : ''}</span>
			${e.detail ? `<span class="comm-detail">${esc(e.detail)}</span>` : ''}
			${faceHTML(e.face)}
		</span>
		<span class="comm-val-col"><b class="comm-val"${sumOf(e) ? ` title="${esc(sumOf(e))}"` : ''}>${value(board, e.value)}<small>${esc(said(board.unit))}</small></b>${top ? `<span class="comm-val-bar"><i style="width:${pct}%"></i></span>` : ''}</span>
	</li>`;
}

/**
 * A row's score as the sum it actually is: "hull 4,000 + parts 194 +
 * crystal 20". Only the ship board sends the parts of its score, since
 * it is the only one whose number is not simply the thing it counts.
 */
function sumOf(e) {
	const w = e.face && e.face.worth;
	if (!w) return '';
	return [
		T('hull {n}', { n: F(w.hull) }),
		w.gear ? T('parts {n}', { n: F(w.gear) }) : null,
		w.crystal ? T('crystal {n}', { n: F(w.crystal) }) : null
	].filter(Boolean).join(' + ');
}

/**
 * How a board is counted, said in full.
 *
 * A leaderboard that will not say how it ranks people is a leaderboard
 * nobody believes, and "440 pts" explains nothing at all -- least of all
 * to the three sailors who were tied on it. So every board carries its
 * rule, and the ship board, whose number is a sum of three things,
 * shows the sum for the row at the top and for your own.
 */
function openHow(id) {
	const b = boardById[id];
	if (!b) return;
	const board = data && data.fame.find(f => f.id === id);
	const rows = [];
	if (board) {
		const first = board.top[0];
		if (first && sumOf(first)) rows.push([first.named ? first.name : T('the top of the board'), sumOf(first), first.value]);
		const mine = yourRow(board);
		if (mine && sumOf(mine) && (!first || !first.you)) rows.push([T('yours'), sumOf(mine), mine.value]);
	}
	openDialog(`<h2>${b.icon} ${esc(said(b.title))}</h2>
		<p class="dialog-copy">${esc(said(b.desc))}.</p>
		<p class="comm-how-note">${esc(said(b.note))}</p>
		${rows.length ? `<div class="comm-how-sums">${rows.map(([who, sum, v]) => `<div class="detail-line"><span>${esc(who)}</span><span class="n">${esc(sum)} = ${value(b, v)}</span></div>`).join('')}</div>` : ''}
		<p class="dialog-copy comm-how-min">${esc(said(b.how))} ${b.min > 1 ? T('A place needs at least {n} {unit}.', { n: F(b.min), unit: esc(said(b.unit || '')) }) : ''}</p>
		<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div>`);
}

function fameHTML() {
	const chips = [{ id: 'all', icon: '▦', title: T('Everything') }, ...SECTIONS];
	const sections = SECTIONS.filter(s => fameSec === 'all' || s.id === fameSec).map(s => {
		const boards = data.fame.filter(f => (boardById[f.id] || {}).section === s.id);
		if (!boards.length) return '';
		return `<div class="comm-section">
			<div class="comm-section-head"><h3><span aria-hidden="true">${s.icon}</span> ${esc(said(s.title))}</h3><span>${boards.length === 1 ? T('{n} board', { n: boards.length }) : T('{n} boards', { n: boards.length })}</span><i></i></div>
			<div class="comm-boards">${boards.map(boardHTML).join('')}</div>
		</div>`;
	}).join('');
	return `<div class="comm-fame">
		<div class="comm-numbar">
			<div class="chips comm-cats" role="tablist" aria-label="${T('Sections')}">${chips.map(c => `<button class="chip${fameSec === c.id ? ' active' : ''}" role="tab" aria-selected="${fameSec === c.id}" data-act="community-sec" data-id="${c.id}"><span aria-hidden="true">${c.icon}</span> ${esc(said(c.title))}</button>`).join('')}</div>
			<span class="comm-numbar-note">${T('Top {n} on each board · your own place always shown · press a sailor for the card', { n: TOP })}</span>
		</div>
		${sections}
	</div>`;
}

/* ------------------------------------------------------------------ *
 * The fleet in numbers
 * ------------------------------------------------------------------ */

const LIM = 7;   // rows a panel shows before "and N more"

/**
 * A list of bars: the largest is the full width, the rest in
 * proportion, each with its picture. A row that names something the
 * app knows -- a hull, a part, a crystal, a quest, a monster, an
 * island -- is a door to it: the item's card, the Quests tab, the
 * grounds on the chart, the island on the chart. `link(key)` says
 * which, as { act, ...data }.
 */
function bars({ id, cat, icon, title, note, table, name = k => k, sub = null, picture = null, unit = '', link = null }) {
	let rows = Object.entries(table || {});
	const max = rows.reduce((m, [, c]) => Math.max(m, c), 0);
	const q = numQ.trim().toLowerCase();
	if (q) rows = rows.filter(([k]) => `${name(k)} ${sub ? sub(k) : ''}`.toLowerCase().includes(q));
	rows.sort(numSort === 'name' ? (x, y) => name(x[0]).localeCompare(name(y[0])) : (x, y) => y[1] - x[1] || name(x[0]).localeCompare(name(y[0])));
	if ((numCat !== 'all' && numCat !== cat) || (q && !rows.length)) return '';
	const door = k => {
		const l = link ? link(k) : null;
		if (!l) return '';
		return Object.entries(l).map(([a, v]) => ` data-${a}="${esc(v)}"`).join('');
	};
	const total = rows.reduce((a, [, c]) => a + c, 0);
	const open = numOpen.has(id);
	const shown = open || rows.length <= LIM ? rows : rows.slice(0, LIM);
	return `<section class="panel comm-bars" data-cat="${esc(cat)}" data-id="${esc(id)}">
		<div class="comm-board-head"><span class="comm-board-icon" aria-hidden="true">${icon}</span><div class="comm-board-t"><h3 class="comm-board-title">${esc(title)}</h3><span class="comm-board-desc">${esc(note)}</span></div><span class="comm-board-n">${rows.length ? F(total) : ''}</span></div>
		${rows.length ? `<div class="comm-bar-list">${shown.map(([k, c], i) => `
			<div class="comm-bar-row${link && link(k) ? ' comm-go' : ''}"${door(k)}${link && link(k) ? ' role="button" tabindex="0"' : ''} title="${esc(gameName(name(k)))}${sub && sub(k) ? ` — ${esc(sub(k))}` : ''}">
				<span class="comm-bar-name">${picture ? picture(k) : `<span class="comm-bar-i">${i + 1}</span>`}<span class="comm-bar-text"><span>${esc(gameName(name(k)))}</span>${sub && sub(k) ? `<small>${sub(k)}</small>` : ''}</span>${link && link(k) ? ' <i class="comm-door" aria-hidden="true">›</i>' : ''}</span>
				<b class="comm-bar-n">${F(c)}${unit ? `<small>${esc(unit)}</small>` : ''}</b>
				<span class="comm-bar"><i style="width:${max ? Math.max(2, Math.round((c / max) * 100)) : 0}%"></i></span>
			</div>`).join('')}
			${rows.length > LIM ? `<button class="comm-fold" data-act="community-fold" data-id="${esc(id)}">${open ? T('Show fewer') : T('and {n} more…', { n: rows.length - LIM })}</button>` : ''}</div>` : `<p class="comm-empty">${T('Nothing counted yet.')}</p>`}
	</section>`;
}

/** A histogram in a row of columns. */
function columns({ cat, icon, title, note, counts, labels, tip = (n, label) => `${n} ${label}` }) {
	if (numCat !== 'all' && numCat !== cat) return '';
	if (numQ.trim() && !title.toLowerCase().includes(numQ.trim().toLowerCase())) return '';
	const max = Math.max(...counts, 0);
	const total = counts.reduce((a, b) => a + b, 0);
	return `<section class="panel comm-bars" data-cat="${esc(cat)}">
		<div class="comm-board-head"><span class="comm-board-icon" aria-hidden="true">${icon}</span><div class="comm-board-t"><h3 class="comm-board-title">${esc(title)}</h3><span class="comm-board-desc">${esc(note)}</span></div><span class="comm-board-n">${total ? F(total) : ''}</span></div>
		${max ? `<div class="comm-cols">${counts.map((c, i) => `
			<div class="comm-col" title="${tip(F(c), esc(labels[i]))}">
				<b>${c ? F(c) : ''}</b><i style="height:${Math.max(2, Math.round((c / max) * 60))}px"></i><span>${esc(labels[i])}</span>
			</div>`).join('')}</div>` : `<p class="comm-empty">${T('Nothing counted yet.')}</p>`}
	</section>`;
}

const CATS = () => [
	['all', '▦', T('Everything')], ['ships', '⛵', T('Ships')], ['crew', '👥', T('Crew')], ['sea', '🌊', T('The sea')], ['quests', '✦', T('Quests')], ['yard', '⚒', T('The yard')], ['charts', '✎', T('Charts')]
];

const item = k => ({ act: 'community-item', item: k });
const crystalSub = id => {
	const c = crystalOf(id);
	if (!c) return '';
	const g = gradeById[c.grade];
	return `<span class="comm-grade" style="--grade:${esc(g ? g.colour : 'currentColor')}"></span>${esc(crystalVariant(c))}`;
};
const questPic = id => {
	const q = questById[id];
	if (q && q.monster) return monsterPic(q.monster, 'sm');
	return `<span class="comm-pic glyph sm" aria-hidden="true">${q && /\[Weekly\]/.test(q.name) ? '✧' : '✦'}</span>`;
};

function numbersHTML() {
	const s = data.stats;
	const t = s.totals;
	const tile = (icon, k, v, sub = '', cls = '') => `<div class="stat comm-stat"><span class="comm-stat-i" aria-hidden="true">${icon}</span><div><div class="stat-k">${esc(k)}</div><div class="stat-v${cls ? ` ${cls}` : ''}">${v}</div>${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}</div></div>`;
	const panels = [
		bars({ id: 'sailing', cat: 'ships', icon: '⛵', title: T('Hulls most sailed'), note: T('the ship each sailor is sailing now'), table: s.sailing, unit: T('sailors'), picture: k => pic(k, 'sm'), link: item }),
		bars({ id: 'hulls', cat: 'ships', icon: '🚢', title: T('Hulls owned'), note: T('across every setup'), table: s.hulls, unit: T('sailors'), picture: k => pic(k, 'sm'), link: item }),
		bars({ id: 'parts', cat: 'ships', icon: '⚙', title: T('Parts most fitted'), note: T('by name, whatever the level'), table: s.parts, name: k => k.replace(/^Epheria /, ''), unit: T('sailors'), picture: k => pic(k, 'sm'), link: item }),
		bars({ id: 'crystals', cat: 'ships', icon: '💎', title: T('Sea crystals most carried'), note: T('in a hull’s slot, effect by effect'), table: s.crystals, name: crystalName, sub: crystalSub, unit: T('hulls'), picture: k => pic(crystalName(k), 'sm'), link: k => (crystalOf(k) ? item(crystalOf(k).name) : null) }),
		columns({ cat: 'ships', icon: '🚢', title: T('Fleet sizes'), note: T('hulls per sailor'), counts: s.fleetSizes, labels: [T('none'), '1', '2', '3+'], tip: (n, label) => T('{n} sailors with {label}', { n, label }) }),
		bars({ id: 'sailors', cat: 'crew', icon: '👥', title: T('Sailors most hired'), note: T('across every roster'), table: s.sailorTypes, unit: T('hired'), picture: k => face(k, 'sm', anyType[k] ? `${gameName(k)} · ${anyType[k].race || ''}` : gameName(k)) }),
		columns({ cat: 'crew', icon: '📈', title: T('Sailor levels'), note: T('every sailor hired, by level'), counts: s.crewLevels, labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], tip: (n, label) => T('{n} sailors at Lv {label}', { n, label }) }),
		bars({ id: 'islands', cat: 'charts', icon: '⌖', title: T('Islands most plotted'), note: T('stops in the routes kept on the chart'), table: s.islands, name: isleName, unit: T('plots'), link: k => ({ act: 'community-isle', npc: k }) }),
		bars({ id: 'quests', cat: 'quests', icon: '✦', title: T('Quests most done'), note: T('claims, over careers'), table: s.quests, name: questName, unit: T('done'), picture: questPic, link: k => ({ act: 'view', id: 'quests', quest: k }) }),
		bars({ id: 'hunts', cat: 'quests', icon: '🦈', title: T('Sea monsters most hunted'), note: T('from the hunting quests done'), table: s.hunts, name: monsterName, unit: T('hunts'), picture: k => monsterPic(k, 'sm'), link: k => ({ act: 'quest-map', monster: k }) }),
		bars({ id: 'levels', cat: 'sea', icon: '⇄', title: T('Barter level'), note: T('as set on the Barter tab'), table: s.levels, unit: T('sailors') }),
		columns({ cat: 'sea', icon: '📅', title: T('Runs by weekday'), note: T('the last sixty runs of each sailor'), counts: s.runDays, labels: [T('Mon'), T('Tue'), T('Wed'), T('Thu'), T('Fri'), T('Sat'), T('Sun')], tip: (n, label) => T('{n} runs on a {label}', { n, label }) }),
		columns({ cat: 'sea', icon: '⚓', title: T('Sailing mastery'), note: T('sailors at each step'), counts: s.masteryBuckets, labels: ['<500', '<1000', '<1500', '<2000', '<2500', '2500+'], tip: (n, label) => T('{n} sailors at {label}', { n, label }) }),
		bars({ id: 'builds', cat: 'yard', icon: '⚒', title: T('Builds most queued'), note: T('what is on the Builds tab right now'), table: s.builds, unit: T('sailors'), picture: k => pic(k, 'sm'), link: item }),
		bars({ id: 'made', cat: 'yard', icon: '🔨', title: T('Ships most built'), note: T('made in the Workshop'), table: s.shipsMade, unit: T('built'), picture: k => pic(k, 'sm'), link: item })
	].filter(Boolean);
	return `<div class="comm-numbers">
		<div class="stats comm-totals">
			${tile('👥', T('Sailors on the boards'), F(data.sailors), T('{n} by name', { n: data.named }))}
			${tile('💰', T('Silver from runs'), FC(t.silver), `${T('{n} runs', { n: F(t.runs) })} · ${T('{n} trades', { n: F(t.trades) })} · ${T('{n} barters', { n: F(t.barters) })}`, 'blue')}
			${tile('✦', T('Quests done'), F(t.quests), T('{n} sea monster hunts', { n: F(t.hunts) }))}
			${tile('⚒', T('Things made'), F(t.crafts), T('{n} ships built', { n: F(t.ships) }))}
			${tile('🎲', T('At the anvil'), t.tries ? `${Math.round((t.wins / t.tries) * 100)}%` : '—', t.tries ? T('{wins} of {tries} attempts', { wins: F(t.wins), tries: F(t.tries) }) : T('no attempts recorded'), 'amber')}
			${tile('⚓', T('Sailors hired'), F(t.sailors), T('{n} hulls in all', { n: F(t.hulls) }))}
			${tile('🧭', T('Sailing mastery'), t.mastery ? F(t.mastery) : '—', T('the average, where it is filled in'), 'teal')}
			${tile('✎', T('Traces drawn'), F(t.traces), T('{n} points', { n: F(t.points) }))}
		</div>
		<div class="comm-numbar">
			<div class="chips comm-cats" role="tablist" aria-label="${T('Categories')}">${CATS().map(([id, icon, label]) => `<button class="chip${numCat === id ? ' active' : ''}" role="tab" aria-selected="${numCat === id}" data-act="community-cat" data-id="${id}"><span aria-hidden="true">${icon}</span> ${label}</button>`).join('')}</div>
			<input class="field comm-numq" type="search" value="${esc(numQ)}" placeholder="${T('Find a hull, a part, a crystal, a quest, an island…')}" aria-label="${T('Find a row')}" data-act="community-numq">
			<div class="chips comm-sort"><span class="comm-sort-k">${T('sort')}</span><button class="chip tiny${numSort === 'count' ? ' active' : ''}" data-act="community-sort" data-id="count">${T('most first')}</button><button class="chip tiny${numSort === 'name' ? ' active' : ''}" data-act="community-sort" data-id="name">${T('A–Z')}</button></div>
		</div>
		${panels.length ? `<div class="comm-grid">${panels.join('')}</div>` : `<section class="panel"><p class="comm-empty">${T('Nothing here matches “{q}”.', { q: esc(numQ) })}</p></section>`}
	</div>`;
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderCommunity() {
	if (!feature('community')) {
		return `<section class="panel"><div class="panel-head"><h2 class="panel-title">${T('The harbour')}</h2></div>
			<p class="comm-copy">${T('This copy of the app has no community boards: they need accounts to stand on them, and this deployment has no sign-in.')}</p></section>`;
	}
	load();
	let body;
	if (!data) {
		body = `<section class="panel"><p class="comm-copy">${failed ? `${esc(failed)} <button class="chip tiny" data-act="community-refresh">${T('Try again')}</button>` : T('Fetching the boards…')}</p></section>`;
	} else body = half === 'fame' ? fameHTML() : numbersHTML();
	return `<div class="community">${headHTML()}${body}</div>`;
}

/* ------------------------------------------------------------------ *
 * Taking part
 * ------------------------------------------------------------------ */

/** What would be shared, drawn from the local save by the same digest. */
function previewHTML() {
	const d = digest(store.saveShape());
	const lines = BOARDS.map(b => {
		const v = b.value(d);
		return `<div class="comm-prev-row${v >= b.min ? '' : ' none'}"><span>${b.icon} ${esc(said(b.title))}</span><b>${v >= b.min ? `${value(b, v)} ${esc(said(b.unit))}` : '—'}</b>${b.detail(d) ? `<small>${esc(b.detail(d))}</small>` : ''}${faceHTML(b.face(d))}</div>`;
	});
	const tables = [
		[d.fleet.hulls.length, n => T('{n} hulls', { n })], [Object.keys(d.fleet.parts).length, n => T('{n} parts fitted', { n })], [Object.keys(d.fleet.crystals).length, n => T('{n} crystals', { n })], [Object.keys(d.crew.byType).length, n => T('{n} sailor types', { n })],
		[Object.keys(d.quests.byId).length, n => T('{n} quests by name', { n })], [Object.keys(d.charts.stops).length, n => T('{n} islands plotted', { n })], [Object.keys(d.yard.byItem).length, n => T('{n} builds queued', { n })]
	].filter(([n]) => n).map(([n, say]) => say(n));
	return `<div class="comm-prev">${lines.join('')}</div>
		<p class="dialog-copy">${T('Also counted into the fleet-wide numbers, never shown against your name: {list}. Never shared: your stock, your notes, your traces, where things are stored, or anything typed into a field.', { list: tables.length ? tables.join(', ') : T('nothing yet') })}</p>`;
}

export function openShareDialog() {
	const who = me();
	if (!who) return signIn();
	let pick = who.share || 'named';
	const host = openDialog(`
		<h2>${who.share ? T('How you are shown') : T('Take part in the boards')}</h2>
		<p class="dialog-copy">${T('Anyone who opens this page sees the boards. What goes on them is the digest below, worked out from your save here and again from the copy the server holds — the numbers, not the save. It is refreshed every time you sync, and leaving takes it down.')}</p>
		<div class="fb-kinds" role="radiogroup" aria-label="${T('How to be shown')}">
			<button type="button" class="fb-kind${pick === 'named' ? ' on' : ''}" role="radio" aria-checked="${pick === 'named'}" data-share="named"><b>${T('By name')}</b><small>${T('your Discord name and avatar beside your places')}</small></button>
			<button type="button" class="fb-kind${pick === 'anon' ? ' on' : ''}" role="radio" aria-checked="${pick === 'anon'}" data-share="anon"><b>${T('As an unnamed sailor')}</b><small>${T('counted and ranked, shown as “a sailor”; only you see which one is you')}</small></button>
		</div>
		<details class="comm-prev-fold" open><summary>${T('What would be shared right now')}</summary>${previewHTML()}</details>
		<div class="dialog-actions">
			${who.share ? `<button class="act quiet" data-leave>${T('Leave the boards')}</button><span class="fb-space"></span>` : ''}
			<button class="act quiet" data-close>${T('Cancel')}</button>
			<button class="act" data-go>${who.share ? T('Save') : T('Take part')}</button>
		</div>`);
	host.querySelectorAll('[data-share]').forEach(btn => btn.addEventListener('click', () => {
		pick = btn.dataset.share;
		host.querySelectorAll('[data-share]').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-checked', String(b === btn)); });
	}));
	host.querySelector('[data-go]').addEventListener('click', async () => {
		const btn = host.querySelector('[data-go]');
		btn.disabled = true;
		try {
			await setShare(pick);
			closeDialog();
			toast(pick === 'named' ? T('On the boards as {name}', { name: who.username }) : T('On the boards as an unnamed sailor'));
		} catch (err) {
			btn.disabled = false;
			toast(said(err.message));
		}
	});
	const leave = host.querySelector('[data-leave]');
	if (leave) leave.addEventListener('click', () => { closeDialog(); confirmLeave(); });
}

function confirmLeave() {
	const host = openDialog(`
		<h2>${T('Leave the boards?')}</h2>
		<p class="dialog-copy">${T('Your places go, and the digest the server holds is deleted. Your save is untouched, and signing in again will not quietly put you back — you can take part again whenever you choose to.')}</p>
		<div class="dialog-actions">
			<button class="act quiet" data-close>${T('Stay')}</button>
			<button class="act bad" data-yes>${T('Leave')}</button>
		</div>`);
	host.querySelector('[data-yes]').addEventListener('click', async () => {
		try {
			await setShare('off');
			closeDialog();
			toast(T('Off the boards'));
		} catch (err) {
			toast(said(err.message));
		}
	});
}

/* ------------------------------------------------------------------ *
 * A sailor's card
 * ------------------------------------------------------------------ */

/** The save the Ship tab stands up for a look at this sailor's boat. */
const shipSave = (c, hull = null) => ({
	stock: {}, targets: [], strategy: {},
	profile: { ...(c.digest.ship || {}), ...(hull ? { crewShip: hull } : {}) }
});

/** The Ship tab on this sailor's boat, or on one of their crew. */
function lookAt(c, { hull = null, sailorId = null } = {}) {
	if (!hooks.look) return toast(T('Not on this page'));
	if (!c.digest.ship || !c.digest.ship.crewShip) return toast(T('This sailor has no ship recorded'));
	hooks.look(shipSave(c, hull), { name: c.named ? c.name : T('a sailor'), sailorId });
}

const cards = new Map();      // ref -> the card, for a look opened from the card
const wholeBoards = new Map();   // board id -> every place, once "show all" fetched it
let nav = null;               // { boardId, refs, n }: the board a card was opened from, for ‹ ›
let openRef = null;           // the card on screen, for ‹ › to count from

/** The card, fetched once and held for the session. */
async function fetchCard(ref) {
	if (cards.has(ref)) return cards.get(ref);
	const res = await call('GET', `/api/community/sailor/${encodeURIComponent(ref)}`).catch(() => null);
	if (!res || !res.ok) throw new Error(res && res.body && res.body.error ? res.body.error : 'The card did not answer.');
	cards.set(ref, res.body);
	return res.body;
}

const SECTION_OF = { ship: 'ship', fleet: 'ship', sailor: 'crew', crew: 'crew', quests: 'quests', hunts: 'quests', ships: 'yard', crafts: 'yard', luck: 'yard', silver: 'runs', runs: 'runs', bestday: 'runs', barters: 'runs', charts: 'charts', hold: 'hold' };

/** A place on a board, pressed: the card, at the section the board is
 *  about, with ‹ › along that board. */
function openEntry(boardId, ref) {
	const whole = wholeBoards.get(boardId);
	const board = data && data.fame.find(f => f.id === boardId);
	const list = whole || (board ? board.top : []);
	const refs = list.map(e => e.ref);
	nav = refs.includes(ref) ? { boardId, refs, n: whole ? whole.length : board ? board.n : refs.length } : null;
	openSailorCard(ref, SECTION_OF[boardId] || null);
}

/** A sailor's card: places, the ship, the fleet, the crew, the career. */
export async function openSailorCard(ref, section = null) {
	const host = openDialog(`<h2>${T('A sailor')}</h2><p class="dialog-copy">${T('Fetching the card…')}</p>`);
	host.querySelector('.dialog-box').classList.add('wide', 'comm-card-box');
	try {
		paintCard(host, await fetchCard(ref), section);
	} catch (err) {
		host.querySelector('.dialog-box').innerHTML = `<h2>${T('A sailor')}</h2><p class="dialog-copy">${esc(said(err.message))}</p><div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div>`;
	}
}

function paintCard(host, c, section) {
	const box = host.querySelector('.dialog-box');
	const d = c.digest;
	openRef = c.ref;
	const canLook = Boolean(d.ship && d.ship.crewShip);
	const places = Object.entries(c.places).map(([id, p]) => ({ b: boardById[id], p })).filter(x => x.b).sort((a, b) => a.p.rank - b.p.rank || b.p.of - a.p.of);
	const best = d.fleet.best;
	const look = (label, extra, title) => (canLook ? `<button class="chip tiny primary" data-act="community-look" data-ref="${esc(c.ref)}"${extra} title="${esc(title)}">${label}</button>` : '');
	const hull = h => {
		const fitted = h.fitted || fittedOn(d, h.ship);
		const on = SLOTS.filter(sl => h.parts[sl] || (fitted && fitted[sl])).length;
		const isBest = best && h.ship === best.ship;
		const now = h.ship === d.fleet.sailing;
		return `<div class="comm-hull${isBest ? ' best' : ''}${now ? ' now' : ''}">
			${pic(h.ship, 'md')}
			<div class="comm-hull-body">
				<div class="comm-hull-name"><b>${esc(gameName(h.ship))}</b>${now ? `<em class="teal">${T('sailing now')}</em>` : ''}${isBest && !now ? `<em>${T('best')}</em>` : ''}</div>
				<div class="comm-hull-sub">${on ? T('{n} of 4 parts fitted', { n: on }) : T('bare hull')}${h.skins ? ` · ${T('{n} of 4 appearance slots', { n: h.skins })}` : ''}</div>
				<div class="comm-hull-fit">${slotsHTML(h.parts, fitted)}${h.crystal ? crystalHTML(h.crystal) : `<span class="comm-crystal off" title="${T('No sea crystal in the slot')}">${T('no crystal')}</span>`}</div>
			</div>
			${look(T('Look ›'), ` data-hull="${esc(h.ship)}"`, T('The Ship tab on this hull, to look at and not to keep'))}
		</div>`;
	};
	const sailor = m => `<div class="comm-sailor">
		${face(m.type, 'md', `${m.name} · ${gameName(m.type)}`)}
		<div class="comm-sailor-body">
			<div class="comm-sailor-name"><b>${esc(m.name)}</b>${m.name !== m.type ? `<span>${esc(gameName(m.type))}</span>` : ''}${anyType[m.type] && anyType[m.type].race ? `<small>${esc(anyType[m.type].race)}</small>` : ''}</div>
			${statsHTML(m.stats)}
			<span class="comm-lv-bar"><i style="width:${m.lv * 10}%"></i></span>
		</div>
		<b class="comm-lv${m.lv >= 10 ? ' max' : ''}">${T('Lv {n}', { n: m.lv })}</b>
		${m.id ? `<button class="chip tiny primary" data-act="community-sailor-sheet" data-ref="${esc(c.ref)}" data-sailor="${esc(m.id)}" title="${T("The sailor's sheet: growths, condition, the seat and what it does with them")}">${T('Look ›')}</button>` : ''}
	</div>`;
	const fig = (k, v, sub = '', cls = '') => `<div class="comm-fig"><span>${esc(k)}</span><b${cls ? ` class="${cls}"` : ''}>${v}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
	const h3 = (id, icon, text, sub = '') => `<h3 class="comm-card-h" id="card-${id}"><span aria-hidden="true">${icon}</span> ${text}${sub ? ` <small>· ${esc(sub)}</small>` : ''}</h3>`;
	const questRows = Object.entries(d.quests.byId).filter(([id]) => !(questById[id] && questById[id].monster)).map(([id, n]) => `<button class="comm-tag" data-act="view" data-id="quests" data-quest="${esc(id)}" title="${T('Open the quest on the Quests tab')}">${questPic(id)}${esc(questName(id))}<b>×${F(n)}</b></button>`).join('');
	const huntRows = Object.entries(d.quests.hunts).map(([m, n]) => `<button class="comm-tag hunt" data-act="quest-map" data-monster="${esc(m)}" title="${T('Show the grounds on the chart')}">${monsterPic(m, 'sm')}${esc(gameName(monsterName(m)))}<b>×${F(n)}</b></button>`).join('');
	const madeRows = Object.entries(d.yard.shipsMade).map(([m, n]) => `<button class="comm-tag" data-act="community-item" data-item="${esc(m)}" title="${T("The item's card")}">${pic(m, 'sm')}${esc(gameName(m))}<b>×${F(n)}</b></button>`).join('');
	const queuedRows = Object.entries(d.yard.byItem).slice(0, 6).map(([m, n]) => `<button class="comm-tag" data-act="community-item" data-item="${esc(m)}" title="${T("The item's card")}">${pic(m, 'sm')}${esc(gameName(m))}${n > 1 ? `<b>×${F(n)}</b>` : ''}</button>`).join('');
	const at = nav ? nav.refs.indexOf(c.ref) : -1;
	const navBoard = nav && boardById[nav.boardId];
	const foot = at >= 0 && navBoard
		? T('{rank} of {n} on {board} · ‹ › moves along the board', { rank: ordinal(at + 1), n: nav.n, board: esc(said(navBoard.title)) })
		: places.length === 1 ? T('{n} place on {of} boards', { n: places.length, of: BOARDS.length }) : T('{n} places on {of} boards', { n: places.length, of: BOARDS.length });
	box.innerHTML = `
		<div class="comm-card-head">
			${avatarHTML(c, 'big')}
			<div class="comm-card-who">
				<h2>${c.named ? esc(c.name) : T('A sailor')}${c.you ? ` <em class="comm-badge">${T('you')}</em>` : ''}${d.fleet.sailing ? ` <em class="comm-badge teal">${T('at sea')}</em>` : ''}</h2>
				<p class="dialog-copy">${d.level ? `${esc(d.level)} · ` : ''}${d.mastery ? `${T('mastery {n}', { n: F(d.mastery) })} · ` : ''}${T('on the boards since {day}', { day: day(c.joinedAt) })}${c.named ? '' : ` · ${T('unnamed by choice')}`}</p>
			</div>
			<div class="comm-card-nav">
				${at > 0 ? `<button class="ghost-btn tiny" data-act="community-nav" data-dir="-1" title="${T('The sailor before on this board')}">‹</button>` : ''}
				${at >= 0 && at < nav.refs.length - 1 ? `<button class="ghost-btn tiny" data-act="community-nav" data-dir="1" title="${T('The sailor after on this board')}">›</button>` : ''}
				<button class="ghost-btn tiny" data-close title="${T('Close')}">×</button>
			</div>
		</div>
		<div class="comm-card-body">
			${h3('places', '☆', T('Places'), T('{n} of {of} boards', { n: places.length, of: BOARDS.length }))}
			${places.length ? `<div class="comm-places">${places.map(({ b, p }) => `<span class="comm-place${p.rank <= 3 ? ` p${p.rank}` : ''}" title="${esc(T('{rank} of {n} · {desc}', { rank: ordinal(p.rank), n: p.of, desc: said(b.desc) }))}">${medal(p.rank)}<span><i aria-hidden="true">${b.icon}</i> ${esc(said(b.title))}</span><b>${value(b, p.value)}${b.unit ? ` ${esc(said(b.unit))}` : ''}</b></span>`).join('')}</div>` : `<p class="comm-empty">${T('No place on any board yet.')}</p>`}
			<div class="comm-card-cols">
				<div>
					${h3('ship', '⚓', d.fleet.n > 1 ? T('The ship and the fleet') : T('The ship'), d.fleet.n ? (d.fleet.n === 1 ? T('{n} hull', { n: d.fleet.n }) : T('{n} hulls', { n: d.fleet.n })) : '')}
					${canLook ? `<button class="act small comm-look" data-act="community-look" data-ref="${esc(c.ref)}" title="${T("The Ship tab on this sailor's boat: hull, parts, crystal, seats and roster, to look at and not to keep")}">⚓ ${T('Look at the ship')}</button>` : ''}
					${d.fleet.list.length ? `<div class="comm-hulls">${d.fleet.list.map(hull).join('')}</div>` : `<p class="comm-empty">${T('No hull recorded.')}</p>`}
					${h3('crew', '👥', T('The crew'), d.crew.n ? `${d.crew.n === 1 ? T('{n} sailor', { n: d.crew.n }) : T('{n} sailors', { n: d.crew.n })}${d.crew.avgLv ? ` · ${T('average Lv {n}', { n: d.crew.avgLv })}` : ''}` : '')}
					${d.crew.top.length ? `<div class="comm-sailors">${d.crew.top.map(sailor).join('')}${d.crew.n > d.crew.top.length ? `<p class="comm-empty">${T('and {n} more — {where}', { n: d.crew.n - d.crew.top.length, where: canLook ? T('all on the Ship tab') : T('not shared') })}</p>` : ''}</div>` : `<p class="comm-empty">${T('Nobody hired yet.')}</p>`}
				</div>
				<div>
					${h3('runs', '⇄', T('The runs'))}
					<div class="comm-figs">
						${fig(T('Runs'), F(d.runs.n), `${T('{n} silver', { n: FC(d.runs.silver) })} · ${T('{n} trades', { n: F(d.runs.trades) })}`)}
						${fig(T('Barters'), F(d.barters), d.level || '')}
						${fig(T('Best run'), d.runs.best ? FC(d.runs.best.net) : '—', d.runs.best ? d.runs.best.day : T('none logged'), d.runs.best ? 'amber' : '')}
						${fig(T('Stops'), F(d.runs.stops), T('{n} Parley', { n: F(d.runs.parley) }))}
					</div>
					${h3('quests', '✦', T('Quests'), `${T('{n} done', { n: F(d.quests.n) })} · ${T('{n} hunts', { n: F(d.quests.huntsN) })}`)}
					${questRows || huntRows ? `<div class="comm-tags">${huntRows}${questRows}</div>` : `<p class="comm-empty">${T('No quest claimed yet.')}</p>`}
					${h3('yard', '⚒', T('The yard'))}
					<div class="comm-figs">
						${fig(T('Made'), F(d.yard.crafts), `${T('{n} ships', { n: F(d.yard.ships) })} · ${T('{n} parts', { n: F(d.yard.parts) })}`)}
						${fig(T('Anvil'), d.yard.tries ? `${Math.round((d.yard.wins / d.yard.tries) * 100)}%` : '—', d.yard.tries ? `${T('{wins} of {tries}', { wins: F(d.yard.wins), tries: F(d.yard.tries) })}${d.yard.drops ? ` · ${T('{n} fell', { n: F(d.yard.drops) })}` : ''}` : T('no attempts'), d.yard.tries ? 'amber' : '')}
						${fig(T('Queued'), F(d.yard.queued), d.yard.queued ? (Object.keys(d.yard.byItem).length === 1 ? T('{n} kind', { n: Object.keys(d.yard.byItem).length }) : T('{n} kinds', { n: Object.keys(d.yard.byItem).length })) : T('nothing queued'))}
					</div>
					${madeRows ? `<div class="comm-tags"><small>${T('made')}</small>${madeRows}</div>` : ''}
					${queuedRows ? `<div class="comm-tags"><small>${T('queued')}</small>${queuedRows}</div>` : ''}
					${h3('charts', '✎', T('The charts'))}
					<div class="comm-figs">
						${fig(T('Traces'), F(d.charts.traces), T('{n} points', { n: F(d.charts.points) }))}
						${fig(T('Routes kept'), F(d.charts.routes), T('{n} islands', { n: Object.keys(d.charts.stops).length }))}
					</div>
					${h3('hold', '📦', T('The hold'))}
					<div class="comm-figs">
						${fig(T('Units'), F(d.stock.units), T('{n} kinds of thing', { n: F(d.stock.items) }))}
						${fig(T('Silver'), FC(d.stock.silver), '', 'blue')}
						${fig(gameName('Crow Coins'), F(d.stock.crow), '', 'amber')}
					</div>
				</div>
			</div>
		</div>
		<div class="dialog-actions comm-card-foot"><span class="comm-card-footnote">${foot}</span><span class="fb-space"></span>${c.you ? `<button class="ghost-btn" data-act="community-join">${T('How I am shown')}</button>` : ''}<button class="ghost-btn" data-close>${T('Close')}</button></div>`;
	if (section) {
		const to = box.querySelector(`#card-${section}`);
		if (to) to.scrollIntoView({ block: 'start' });
	}
}

/** One board whole. */
async function openBoard(id) {
	const host = openDialog(`<h2>${T('The board')}</h2><p class="dialog-copy">${T('Fetching…')}</p>`);
	const res = await call('GET', `/api/community/board/${encodeURIComponent(id)}`).catch(() => null);
	const box = host.querySelector('.dialog-box');
	if (!res || !res.ok) {
		box.innerHTML = `<h2>${T('The board')}</h2><p class="dialog-copy">${esc(res && res.body && res.body.error ? res.body.error : T('The board did not answer.'))}</p><div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div>`;
		return;
	}
	const b = res.body;
	const meta = boardById[b.id] || {};
	wholeBoards.set(b.id, b.all);
	const top = b.all.length ? b.all[0].value : 0;
	// No modifier class on the head: it used to carry `dialog`, which is
	// the app's own full-screen overlay class -- `position: fixed;
	// inset: 0` -- so the header stopped being a row in the box and
	// became a sheet the size of the window, with the title against one
	// edge and the count against the other. The dialog's own copy is
	// selected by where it sits instead.
	box.innerHTML = `<div class="comm-board-head"><span class="comm-board-icon" aria-hidden="true">${b.icon}</span><div class="comm-board-t"><h2 class="comm-board-title">${esc(said(b.title))}</h2>${meta.desc ? `<span class="comm-board-desc">${esc(said(meta.desc))}</span>` : ''}</div><span class="comm-board-n">${b.n === 1 ? T('{n} sailor', { n: b.n }) : T('{n} sailors', { n: b.n })}${b.n > b.all.length ? ` · ${T('the first {n}', { n: b.all.length })}` : ''}</span></div>
		<ol class="comm-rank comm-rank-all">${b.all.map(e => rowHTML(b, e, top)).join('')}</ol>
		<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div>`;
}

/** Find a named sailor. */
function openFind() {
	const host = openDialog(`<h2>${T('Find a sailor')}</h2>
		<input class="field comm-find" type="search" placeholder="${T('A Discord name, or part of one…')}" aria-label="${T('Find a sailor')}" autocomplete="off">
		<p class="dialog-copy comm-find-note">${T('Sailors on the boards by name. Unnamed sailors cannot be found this way — that is what unnamed means.')}</p>
		<div class="comm-find-list"></div>
		<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div>`);
	const input = host.querySelector('.comm-find');
	const list = host.querySelector('.comm-find-list');
	let timer = null, last = '';
	input.focus();
	input.addEventListener('input', () => {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			const q = input.value.trim();
			if (q === last) return;
			last = q;
			if (q.length < 2) { list.innerHTML = ''; return; }
			const res = await call('GET', `/api/community/find?q=${encodeURIComponent(q)}`).catch(() => null);
			if (input.value.trim() !== q) return;
			const hits = res && res.ok ? res.body.sailors : [];
			list.innerHTML = hits.length
				? `<ol class="comm-rank">${hits.map(h => `<li class="comm-row" data-act="community-sailor" data-ref="${esc(h.ref)}" role="button" tabindex="0"><span class="comm-pos">·</span>${avatarHTML({ ...h, named: true })}<span class="comm-who"><span class="comm-name">${esc(h.name)}</span></span><b class="comm-val">${T('card →')}</b></li>`).join('')}</ol>`
				: `<p class="comm-empty">${T('Nobody by that name on the boards.')}</p>`;
		}, 250);
	});
}

/** Every board, with the caller's own place on each. */
function openPlaces() {
	const who = me();
	const places = data && data.you ? data.you.places : {};
	const rows = BOARDS.map(b => ({ b, p: places[b.id] || null }));
	openDialog(`<h2>${T('Your places')}</h2>
		<p class="dialog-copy">${who ? T('Where {name} stands on every board, out of the sailors who have earned a place there.', { name: esc(who.username) }) : T('Where you stand on every board, out of the sailors who have earned a place there.')}</p>
		<div class="comm-places-list">${rows.map(({ b, p }) => `<div class="comm-place-row${p ? '' : ' none'}${p && p.rank <= 3 ? ` p${p.rank}` : ''}">
			${p ? medal(p.rank) : '<span class="comm-pos">—</span>'}
			<span class="comm-place-b"><i aria-hidden="true">${b.icon}</i><span>${esc(said(b.title))}</span><small>${p ? T('of {n}', { n: p.of }) : esc(said(b.how) || T('no place yet'))}</small></span>
			<span class="comm-place-v">${p ? `${value(b, p.value)} ${esc(said(b.unit))}` : ''}</span>
		</div>`).join('')}</div>
		<div class="dialog-actions">${data && data.you && data.you.ref ? `<button class="ghost-btn" data-act="community-sailor" data-ref="${esc(data.you.ref)}">${T('My card')}</button><span class="fb-space"></span>` : ''}<button class="ghost-btn" data-close>${T('Close')}</button></div>`);
}

/** The tab's own verbs. True when handled; the caller redraws. */
export function communityAction(act, el) {
	switch (act) {
		case 'community-half': half = el.dataset.id === 'numbers' ? 'numbers' : 'fame'; return true;
		case 'community-sec': fameSec = el.dataset.id || 'all'; return true;
		case 'community-join': openShareDialog(); return false;
		case 'community-leave': confirmLeave(); return false;
		case 'community-refresh': load(true); return false;
		case 'community-sailor': nav = null; openSailorCard(el.dataset.ref); return false;
		case 'community-entry': openEntry(el.dataset.board, el.dataset.ref); return false;
		case 'community-nav': {
			if (!nav || !openRef) return false;
			const next = nav.refs[nav.refs.indexOf(openRef) + Number(el.dataset.dir)];
			if (next) openSailorCard(next, SECTION_OF[nav.boardId] || null);
			return false;
		}
		case 'community-sailor-sheet': {
			const c = cards.get(el.dataset.ref);
			if (!c) return false;
			const ship = c.digest.ship || {};
			const roster = Array.isArray(ship.roster) ? ship.roster : [];
			const m = roster.find(r => r && r.id === el.dataset.sailor) || c.digest.crew.top.find(r => r.id === el.dataset.sailor);
			if (!m) return false;
			const hull = c.digest.fleet.sailing;
			openSailorSheet({ cond: 100, ...m }, { ship: hull, seats: hull && ship.seats && typeof ship.seats === 'object' ? ship.seats[hull] : {}, owner: c.named ? c.name : T('a sailor') });
			return false;
		}
		case 'community-look': {
			const c = cards.get(el.dataset.ref);
			if (c) lookAt(c, { hull: el.dataset.hull || null, sailorId: el.dataset.sailor || null });
			return false;
		}
		case 'community-item': openItemCard(el.dataset.item); return false;
		case 'community-cat': numCat = el.dataset.id; return true;
		case 'community-sort': numSort = el.dataset.id === 'name' ? 'name' : 'count'; return true;
		case 'community-fold': if (numOpen.has(el.dataset.id)) numOpen.delete(el.dataset.id); else numOpen.add(el.dataset.id); return true;
		case 'community-board': openBoard(el.dataset.id); return false;
		case 'community-find': openFind(); return false;
		case 'community-places': openPlaces(); return false;
		case 'community-told': store.setSetting(TOLD_KEY, true); return true;
		case 'community-how': openHow(el.dataset.id); return false;
		default: return false;
	}
}
