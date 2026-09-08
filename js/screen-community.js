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

let data = null;          // the last answer from /api/community
let fetchedAt = 0;
let loading = null;
let failed = '';
let mine = false;         // our own save moved since the boards were fetched
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
	if (!force && !mine && data && Date.now() - fetchedAt < FRESH_MS) return data;
	mine = false;
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
			failed = res && res.body && res.body.error ? res.body.error : 'The boards did not answer.';
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
	return `${name}${/\[Weekly\]/.test(q.name) ? ' (weekly)' : ''}`;
};
const isleName = id => {
	const n = npcById.get(Number(id));
	return n ? `${n.at}` : `#${id}`;
};
const crystalOf = id => crystalById[Number(id)] || null;
const crystalName = id => (crystalOf(id) ? crystalOf(id).name : `#${id}`);
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][Math.min(n % 10, 4)] || 'th'}`;
const value = (board, v) => (board.id === 'silver' || board.id === 'bestday' ? FC(v) : F(v));
const boardById = Object.fromEntries(BOARDS.map(b => [b.id, b]));
const SLOTS = ['cannon', 'sail', 'figurehead', 'plating'];
const SLOT_LETTER = { cannon: 'C', sail: 'S', figurehead: 'F', plating: 'P' };
const day = ms => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

/** An item's icon, or nothing when the mapping has none. */
const pic = (name, cls = '', title = '') => {
	const src = iconSrc(name);
	if (src === 'icon.png') return `<span class="comm-pic glyph ${cls}" title="${esc(title || name)}">${esc(String(name).slice(0, 1))}</span>`;
	return `<img class="comm-pic ${cls}" src="${esc(src)}" alt="" title="${esc(title || name)}" decoding="sync">`;
};
/** A sailor's portrait, by type. */
const face = (type, cls = '', title = '') => pic(type, `${cls} face`, title || type);
/** A monster's picture, or its glyph. */
const monsterPic = (key, cls = '') => (monsterArt[key]
	? `<img class="comm-pic ${cls} beast" src="icons/${esc(monsterArt[key])}" alt="" title="${esc(monsterName(key))}" decoding="sync">`
	: `<span class="comm-pic glyph ${cls}" title="${esc(monsterName(key))}">🦈</span>`);

/** A crystal by id: its icon, its name and the one number it is chosen for, in its grade's colour. */
function crystalHTML(id, { icon = true, name = true } = {}) {
	const c = crystalOf(id);
	if (!c) return '';
	const grade = gradeById[c.grade] || { colour: 'var(--ink-mid)', label: c.grade };
	const variant = crystalVariant(c);
	return `<span class="comm-crystal" style="--grade:${esc(grade.colour)}" title="${esc(`${c.name} — ${crystalLine(c)}`)}">${icon ? pic(c.name, 'xs') : ''}${name ? `<span class="comm-crystal-name">${esc(c.name.replace(/ Sea Crystal$/, ''))}</span>` : ''}${variant ? `<b>${esc(variant)}</b>` : ''}</span>`;
}

/** The parts on a hull as four slots: the icon and level of what is fitted, or the slot's letter, empty. */
function slotsHTML(levels = {}, fitted = null) {
	return `<span class="comm-slots">${SLOTS.map(sl => {
		const item = fitted && typeof fitted[sl] === 'string' ? fitted[sl] : '';
		const lv = levels[sl] || 0;
		if (!item && !lv) return `<i class="comm-slot off" title="${esc(sl)}: nothing fitted">${SLOT_LETTER[sl]}</i>`;
		return `<i class="comm-slot" title="${esc(item || `${sl} +${lv}`)}">${item ? pic(item, 'xs') : `<span class="comm-slot-l">${SLOT_LETTER[sl]}</span>`}${lv ? `<b>+${lv}</b>` : ''}</i>`;
	}).join('')}</span>`;
}

/** What a board's row shows beside the name, from the face the server sent. */
function faceHTML(f) {
	if (!f) return '';
	switch (f.kind) {
		case 'ship': return `<span class="comm-face">${pic(f.item, 'sm')}${slotsHTML(f.parts, f.fitted)}${f.crystal ? crystalHTML(f.crystal) : ''}</span>`;
		case 'items': return `<span class="comm-face">${f.items.map(i => pic(i, 'sm')).join('')}</span>`;
		case 'sailor': return `<span class="comm-face">${face(f.type, 'sm', `${f.name} · ${f.type}`)}</span>`;
		case 'sailors': return `<span class="comm-face">${f.types.map(t => face(t, 'sm')).join('')}</span>`;
		case 'monsters': return `<span class="comm-face">${f.keys.map(k => monsterPic(k, 'sm')).join('')}</span>`;
		default: return '';
	}
}

/** A sailor's growths as small chips. */
const statsHTML = stats => {
	const rows = Object.entries(stats || {});
	if (!rows.length) return '';
	return `<span class="comm-stats">${rows.map(([k, v]) => { const n = STAT_NAMES[k] || { game: k, means: '', tip: k }; return `<i title="${esc(n.tip)}">${esc(n.game)}${n.means ? ` <small>${esc(n.means)}</small>` : ''} <b>+${v}%</b></i>`; }).join('')}</span>`;
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
		you = `<div class="comm-you"><p class="comm-copy">The boards show only what sailors chose to share. <button class="act small" data-act="signin">Sign in with Discord</button> to take part — by name, or as an unnamed sailor.</p></div>`;
	} else if (!who.share) {
		you = `<div class="comm-you"><p class="comm-copy">You are not on the boards; nothing about your save is shown to anyone. <button class="act small" data-act="community-join">Take part</button> — you will see exactly what would be shared before you agree.</p></div>`;
	} else {
		const y = data && data.you ? data.you : { places: {} };
		// Signing in puts an account on the boards, so the first time
		// someone opens the tab it has to say so plainly, and say how to
		// stop -- being on a public board is not a thing to discover.
		const notice = store.getSetting(TOLD_KEY, false) ? '' : `<p class="comm-notice">Signing in put you on the boards${who.share === 'named' ? ' by name' : ''}. Only the numbers below are shared — never your stock, your notes or your traces. <button class="chip tiny" data-act="community-join">Change how you are shown</button> <button class="chip tiny" data-act="community-leave">Leave the boards</button> <button class="chip tiny" data-act="community-told">Got it</button></p>`;
		const places = Object.entries(y.places).map(([id, p]) => ({ b: boardById[id], p })).filter(x => x.b).sort((a, b) => a.p.rank - b.p.rank || b.p.of - a.p.of);
		const shown = places.slice(0, 4);
		const src = avatarURL(who);
		you = `${notice}<div class="comm-you on">
			${src ? `<img class="comm-avatar big" src="${esc(src)}" alt="">` : `<span class="comm-avatar anon big" aria-hidden="true">${who.share === 'named' ? esc(who.username.slice(0, 1)) : '☸'}</span>`}
			<div class="comm-you-body">
				<p class="comm-you-line">You are on the boards as <b>${who.share === 'named' ? esc(who.username) : 'an unnamed sailor'}</b>${y.level ? ` <span>· ${esc(y.level)}</span>` : ''}${y.joinedAt ? ` <span>· since ${day(y.joinedAt)}</span>` : ''}</p>
				<div class="comm-you-places">
					${shown.length ? shown.map(({ b, p }) => `<button class="comm-place${p.rank <= 3 ? ` p${p.rank}` : ''}" data-act="community-places" title="${esc(`${ordinal(p.rank)} of ${p.of} · ${b.desc}`)}">${medal(p.rank)}<span><i aria-hidden="true">${b.icon}</i> ${esc(b.title)}</span></button>`).join('') : `<span class="comm-you-none">${data ? 'No place on any board yet — the boards below say what earns one.' : 'Fetching your places…'}</span>`}
					${places.length > shown.length ? `<button class="comm-more-places" data-act="community-places">and ${places.length - shown.length} more</button>` : ''}
				</div>
			</div>
			<div class="comm-you-acts">
				${y.ref ? `<button class="act small" data-act="community-sailor" data-ref="${esc(y.ref)}">My card</button>` : ''}
				<button class="chip" data-act="community-join">${who.share === 'named' ? 'Shown by name' : 'Shown unnamed'} · change</button>
				<button class="chip comm-leave" data-act="community-leave">Leave the boards</button>
			</div>
		</div>`;
	}
	return `<section class="panel comm-head">
		<div class="panel-head">
			<h2 class="panel-title">The harbour</h2>
			<span class="panel-sub">${data ? `${n} sailor${n === 1 ? '' : 's'} on the boards · ${named} by name${built ? ` · drawn up at ${built.toISOString().slice(11, 16)} UTC` : ''}` : loading ? 'fetching the boards…' : failed || ''}</span>
			<span class="panel-spacer"></span>
			<button class="chip tiny" data-act="community-find" title="Find a sailor on the boards by name">⌕ Find a sailor</button>
			<div class="comm-halves" role="tablist">
				<button class="seg${half === 'fame' ? ' on' : ''}" role="tab" aria-selected="${half === 'fame'}" data-act="community-half" data-id="fame">Hall of fame</button>
				<button class="seg${half === 'numbers' ? ' on' : ''}" role="tab" aria-selected="${half === 'numbers'}" data-act="community-half" data-id="numbers">The fleet in numbers</button>
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
			<div class="comm-board-t"><h3 class="comm-board-title">${esc(board.title)}</h3>${b.desc ? `<span class="comm-board-desc">${esc(b.desc)}</span>` : ''}</div>
			<span class="comm-board-n">${board.n ? `${board.n} sailor${board.n === 1 ? '' : 's'}` : 'nobody yet'}</span>
		</div>
		${rows.length ? `<ol class="comm-rank">${rows.map(e => rowHTML(board, e, top)).join('')}${mine ? rowHTML(board, mine, top, true) : ''}</ol>` : `<div class="comm-empty"><p>Nobody has earned a place here yet.</p>${b.how ? `<small>${esc(b.how)}${who && who.share ? '' : ' Then take part.'}</small>` : ''}</div>`}
		${board.n > rows.length ? `<button class="comm-more" data-act="community-board" data-id="${esc(board.id)}">Show all ${board.n} →</button>` : ''}
	</section>`;
}

/** One place on a board. A press opens the sailor's card at what the board is about. */
function rowHTML(board, e, top = 0, dashed = false) {
	const pct = top ? Math.max(3, Math.round((e.value / top) * 100)) : 0;
	return `<li class="comm-row${e.you ? ' you' : ''}${e.rank <= 3 ? ` p${e.rank}` : ''}${dashed ? ' yours' : ''}" data-act="community-entry" data-board="${esc(board.id)}" data-ref="${esc(e.ref)}" role="button" tabindex="0" title="${e.named ? esc(e.name) : 'A sailor'} — open the card">
		${medal(e.rank)}
		${avatarHTML(e)}
		<span class="comm-who">
			<span class="comm-name">${e.named ? esc(e.name) : 'A sailor'}${e.you ? ' <em>you</em>' : ''}</span>
			${e.detail ? `<span class="comm-detail">${esc(e.detail)}</span>` : ''}
			${faceHTML(e.face)}
		</span>
		<span class="comm-val-col"><b class="comm-val">${value(board, e.value)}<small>${esc(board.unit)}</small></b>${top ? `<span class="comm-val-bar"><i style="width:${pct}%"></i></span>` : ''}</span>
	</li>`;
}

function fameHTML() {
	const chips = [{ id: 'all', icon: '▦', title: 'Everything' }, ...SECTIONS];
	const sections = SECTIONS.filter(s => fameSec === 'all' || s.id === fameSec).map(s => {
		const boards = data.fame.filter(f => (boardById[f.id] || {}).section === s.id);
		if (!boards.length) return '';
		return `<div class="comm-section">
			<div class="comm-section-head"><h3><span aria-hidden="true">${s.icon}</span> ${esc(s.title)}</h3><span>${boards.length} board${boards.length === 1 ? '' : 's'}</span><i></i></div>
			<div class="comm-boards">${boards.map(boardHTML).join('')}</div>
		</div>`;
	}).join('');
	return `<div class="comm-fame">
		<div class="comm-numbar">
			<div class="chips comm-cats" role="tablist" aria-label="Sections">${chips.map(c => `<button class="chip${fameSec === c.id ? ' active' : ''}" role="tab" aria-selected="${fameSec === c.id}" data-act="community-sec" data-id="${c.id}"><span aria-hidden="true">${c.icon}</span> ${esc(c.title)}</button>`).join('')}</div>
			<span class="comm-numbar-note">Top ${TOP} on each board · your own place always shown · press a sailor for the card</span>
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
			<div class="comm-bar-row${link && link(k) ? ' comm-go' : ''}"${door(k)}${link && link(k) ? ' role="button" tabindex="0"' : ''} title="${esc(name(k))}${sub && sub(k) ? ` — ${esc(sub(k))}` : ''}">
				<span class="comm-bar-name">${picture ? picture(k) : `<span class="comm-bar-i">${i + 1}</span>`}<span class="comm-bar-text"><span>${esc(name(k))}</span>${sub && sub(k) ? `<small>${sub(k)}</small>` : ''}</span>${link && link(k) ? ' <i class="comm-door" aria-hidden="true">›</i>' : ''}</span>
				<b class="comm-bar-n">${F(c)}${unit ? `<small>${esc(unit)}</small>` : ''}</b>
				<span class="comm-bar"><i style="width:${max ? Math.max(2, Math.round((c / max) * 100)) : 0}%"></i></span>
			</div>`).join('')}
			${rows.length > LIM ? `<button class="comm-fold" data-act="community-fold" data-id="${esc(id)}">${open ? 'Show fewer' : `and ${rows.length - LIM} more…`}</button>` : ''}</div>` : '<p class="comm-empty">Nothing counted yet.</p>'}
	</section>`;
}

/** A histogram in a row of columns. */
function columns({ cat, icon, title, note, counts, labels, tip = '' }) {
	if (numCat !== 'all' && numCat !== cat) return '';
	if (numQ.trim() && !title.toLowerCase().includes(numQ.trim().toLowerCase())) return '';
	const max = Math.max(...counts, 0);
	const total = counts.reduce((a, b) => a + b, 0);
	return `<section class="panel comm-bars" data-cat="${esc(cat)}">
		<div class="comm-board-head"><span class="comm-board-icon" aria-hidden="true">${icon}</span><div class="comm-board-t"><h3 class="comm-board-title">${esc(title)}</h3><span class="comm-board-desc">${esc(note)}</span></div><span class="comm-board-n">${total ? F(total) : ''}</span></div>
		${max ? `<div class="comm-cols">${counts.map((c, i) => `
			<div class="comm-col" title="${F(c)} ${esc(tip)}${esc(labels[i])}">
				<b>${c ? F(c) : ''}</b><i style="height:${Math.max(2, Math.round((c / max) * 60))}px"></i><span>${esc(labels[i])}</span>
			</div>`).join('')}</div>` : '<p class="comm-empty">Nothing counted yet.</p>'}
	</section>`;
}

const CATS = [
	['all', '▦', 'Everything'], ['ships', '⛵', 'Ships'], ['crew', '👥', 'Crew'], ['sea', '🌊', 'The sea'], ['quests', '✦', 'Quests'], ['yard', '⚒', 'The yard'], ['charts', '✎', 'Charts']
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
		bars({ id: 'sailing', cat: 'ships', icon: '⛵', title: 'Hulls most sailed', note: 'the ship each sailor is sailing now', table: s.sailing, unit: 'sailors', picture: k => pic(k, 'sm'), link: item }),
		bars({ id: 'hulls', cat: 'ships', icon: '🚢', title: 'Hulls owned', note: 'across every setup', table: s.hulls, unit: 'sailors', picture: k => pic(k, 'sm'), link: item }),
		bars({ id: 'parts', cat: 'ships', icon: '⚙', title: 'Parts most fitted', note: 'by name, whatever the level', table: s.parts, name: k => k.replace(/^Epheria /, ''), unit: 'sailors', picture: k => pic(k, 'sm'), link: item }),
		bars({ id: 'crystals', cat: 'ships', icon: '💎', title: 'Sea crystals most carried', note: 'in a hull’s slot, effect by effect', table: s.crystals, name: crystalName, sub: crystalSub, unit: 'hulls', picture: k => pic(crystalName(k), 'sm'), link: k => (crystalOf(k) ? item(crystalOf(k).name) : null) }),
		columns({ cat: 'ships', icon: '🚢', title: 'Fleet sizes', note: 'hulls per sailor', counts: s.fleetSizes, labels: ['none', '1', '2', '3+'], tip: 'sailors with ' }),
		bars({ id: 'sailors', cat: 'crew', icon: '👥', title: 'Sailors most hired', note: 'across every roster', table: s.sailorTypes, unit: 'hired', picture: k => face(k, 'sm', anyType[k] ? `${k} · ${anyType[k].race || ''}` : k) }),
		columns({ cat: 'crew', icon: '📈', title: 'Sailor levels', note: 'every sailor hired, by level', counts: s.crewLevels, labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], tip: 'sailors at Lv ' }),
		bars({ id: 'islands', cat: 'charts', icon: '⌖', title: 'Islands most plotted', note: 'stops in the routes kept on the chart', table: s.islands, name: isleName, unit: 'plots', link: k => ({ act: 'community-isle', npc: k }) }),
		bars({ id: 'quests', cat: 'quests', icon: '✦', title: 'Quests most done', note: 'claims, over careers', table: s.quests, name: questName, unit: 'done', picture: questPic, link: k => ({ act: 'view', id: 'quests', quest: k }) }),
		bars({ id: 'hunts', cat: 'quests', icon: '🦈', title: 'Sea monsters most hunted', note: 'from the hunting quests done', table: s.hunts, name: monsterName, unit: 'hunts', picture: k => monsterPic(k, 'sm'), link: k => ({ act: 'quest-map', monster: k }) }),
		bars({ id: 'levels', cat: 'sea', icon: '⇄', title: 'Barter level', note: 'as set on the Barter tab', table: s.levels, unit: 'sailors' }),
		columns({ cat: 'sea', icon: '📅', title: 'Runs by weekday', note: 'the last sixty runs of each sailor', counts: s.runDays, labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], tip: 'runs on a ' }),
		columns({ cat: 'sea', icon: '⚓', title: 'Sailing mastery', note: 'sailors at each step', counts: s.masteryBuckets, labels: ['<500', '<1000', '<1500', '<2000', '<2500', '2500+'], tip: 'sailors at ' }),
		bars({ id: 'builds', cat: 'yard', icon: '⚒', title: 'Builds most queued', note: 'what is on the Builds tab right now', table: s.builds, unit: 'sailors', picture: k => pic(k, 'sm'), link: item }),
		bars({ id: 'made', cat: 'yard', icon: '🔨', title: 'Ships most built', note: 'made in the Workshop', table: s.shipsMade, unit: 'built', picture: k => pic(k, 'sm'), link: item })
	].filter(Boolean);
	return `<div class="comm-numbers">
		<div class="stats comm-totals">
			${tile('👥', 'Sailors on the boards', F(data.sailors), `${data.named} by name`)}
			${tile('💰', 'Silver from runs', FC(t.silver), `${F(t.runs)} runs · ${F(t.trades)} trades · ${F(t.barters)} barters`, 'blue')}
			${tile('✦', 'Quests done', F(t.quests), `${F(t.hunts)} sea monster hunts`)}
			${tile('⚒', 'Things made', F(t.crafts), `${F(t.ships)} ships built`)}
			${tile('🎲', 'At the anvil', t.tries ? `${Math.round((t.wins / t.tries) * 100)}%` : '—', t.tries ? `${F(t.wins)} of ${F(t.tries)} attempts` : 'no attempts recorded', 'amber')}
			${tile('⚓', 'Sailors hired', F(t.sailors), `${F(t.hulls)} hulls in all`)}
			${tile('🧭', 'Sailing mastery', t.mastery ? F(t.mastery) : '—', 'the average, where it is filled in', 'teal')}
			${tile('✎', 'Traces drawn', F(t.traces), `${F(t.points)} points`)}
		</div>
		<div class="comm-numbar">
			<div class="chips comm-cats" role="tablist" aria-label="Categories">${CATS.map(([id, icon, label]) => `<button class="chip${numCat === id ? ' active' : ''}" role="tab" aria-selected="${numCat === id}" data-act="community-cat" data-id="${id}"><span aria-hidden="true">${icon}</span> ${label}</button>`).join('')}</div>
			<input class="field comm-numq" type="search" value="${esc(numQ)}" placeholder="Find a hull, a part, a crystal, a quest, an island…" aria-label="Find a row" data-act="community-numq">
			<div class="chips comm-sort"><span class="comm-sort-k">sort</span><button class="chip tiny${numSort === 'count' ? ' active' : ''}" data-act="community-sort" data-id="count">most first</button><button class="chip tiny${numSort === 'name' ? ' active' : ''}" data-act="community-sort" data-id="name">A–Z</button></div>
		</div>
		${panels.length ? `<div class="comm-grid">${panels.join('')}</div>` : `<section class="panel"><p class="comm-empty">Nothing here matches “${esc(numQ)}”.</p></section>`}
	</div>`;
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export function renderCommunity() {
	if (!feature('community')) {
		return `<section class="panel"><div class="panel-head"><h2 class="panel-title">The harbour</h2></div>
			<p class="comm-copy">This copy of the app has no community boards: they need accounts to stand on them, and this deployment has no sign-in.</p></section>`;
	}
	load();
	let body;
	if (!data) {
		body = `<section class="panel"><p class="comm-copy">${failed ? `${esc(failed)} <button class="chip tiny" data-act="community-refresh">Try again</button>` : 'Fetching the boards…'}</p></section>`;
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
		return `<div class="comm-prev-row${v >= b.min ? '' : ' none'}"><span>${b.icon} ${esc(b.title)}</span><b>${v >= b.min ? `${value(b, v)} ${esc(b.unit)}` : '—'}</b>${b.detail(d) ? `<small>${esc(b.detail(d))}</small>` : ''}${faceHTML(b.face(d))}</div>`;
	});
	const tables = [
		['hulls', d.fleet.hulls.length], ['parts fitted', Object.keys(d.fleet.parts).length], ['crystals', Object.keys(d.fleet.crystals).length], ['sailor types', Object.keys(d.crew.byType).length],
		['quests by name', Object.keys(d.quests.byId).length], ['islands plotted', Object.keys(d.charts.stops).length], ['builds queued', Object.keys(d.yard.byItem).length]
	].filter(([, n]) => n).map(([k, n]) => `${n} ${k}`);
	return `<div class="comm-prev">${lines.join('')}</div>
		<p class="dialog-copy">Also counted into the fleet-wide numbers, never shown against your name: ${tables.length ? tables.join(', ') : 'nothing yet'}. Never shared: your stock, your notes, your traces, where things are stored, or anything typed into a field.</p>`;
}

export function openShareDialog() {
	const who = me();
	if (!who) return signIn();
	let pick = who.share || 'named';
	const host = openDialog(`
		<h2>${who.share ? 'How you are shown' : 'Take part in the boards'}</h2>
		<p class="dialog-copy">Anyone who opens this page sees the boards. What goes on them is the digest below, worked out from your save here and again from the copy the server holds — the numbers, not the save. It is refreshed every time you sync, and leaving takes it down.</p>
		<div class="fb-kinds" role="radiogroup" aria-label="How to be shown">
			<button type="button" class="fb-kind${pick === 'named' ? ' on' : ''}" role="radio" aria-checked="${pick === 'named'}" data-share="named"><b>By name</b><small>your Discord name and avatar beside your places</small></button>
			<button type="button" class="fb-kind${pick === 'anon' ? ' on' : ''}" role="radio" aria-checked="${pick === 'anon'}" data-share="anon"><b>As an unnamed sailor</b><small>counted and ranked, shown as “a sailor”; only you see which one is you</small></button>
		</div>
		<details class="comm-prev-fold" open><summary>What would be shared right now</summary>${previewHTML()}</details>
		<div class="dialog-actions">
			${who.share ? '<button class="act quiet" data-leave>Leave the boards</button><span class="fb-space"></span>' : ''}
			<button class="act quiet" data-close>Cancel</button>
			<button class="act" data-go>${who.share ? 'Save' : 'Take part'}</button>
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
			toast(pick === 'named' ? `On the boards as ${who.username}` : 'On the boards as an unnamed sailor');
		} catch (err) {
			btn.disabled = false;
			toast(err.message);
		}
	});
	const leave = host.querySelector('[data-leave]');
	if (leave) leave.addEventListener('click', () => { closeDialog(); confirmLeave(); });
}

function confirmLeave() {
	const host = openDialog(`
		<h2>Leave the boards?</h2>
		<p class="dialog-copy">Your places go, and the digest the server holds is deleted. Your save is untouched, and signing in again will not quietly put you back — you can take part again whenever you choose to.</p>
		<div class="dialog-actions">
			<button class="act quiet" data-close>Stay</button>
			<button class="act bad" data-yes>Leave</button>
		</div>`);
	host.querySelector('[data-yes]').addEventListener('click', async () => {
		try {
			await setShare('off');
			closeDialog();
			toast('Off the boards');
		} catch (err) {
			toast(err.message);
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
	if (!hooks.look) return toast('Not on this page');
	if (!c.digest.ship || !c.digest.ship.crewShip) return toast('This sailor has no ship recorded');
	hooks.look(shipSave(c, hull), { name: c.named ? c.name : 'a sailor', sailorId });
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
	const host = openDialog('<h2>A sailor</h2><p class="dialog-copy">Fetching the card…</p>');
	host.querySelector('.dialog-box').classList.add('wide', 'comm-card-box');
	try {
		paintCard(host, await fetchCard(ref), section);
	} catch (err) {
		host.querySelector('.dialog-box').innerHTML = `<h2>A sailor</h2><p class="dialog-copy">${esc(err.message)}</p><div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`;
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
				<div class="comm-hull-name"><b>${esc(h.ship)}</b>${now ? '<em class="teal">sailing now</em>' : ''}${isBest && !now ? '<em>best</em>' : ''}</div>
				<div class="comm-hull-sub">${on ? `${on} of 4 parts fitted` : 'bare hull'}${h.skins ? ` · ${h.skins} of 4 appearance slots` : ''}</div>
				<div class="comm-hull-fit">${slotsHTML(h.parts, fitted)}${h.crystal ? crystalHTML(h.crystal) : '<span class="comm-crystal off" title="No sea crystal in the slot">no crystal</span>'}</div>
			</div>
			${look('Look ›', ` data-hull="${esc(h.ship)}"`, 'The Ship tab on this hull, to look at and not to keep')}
		</div>`;
	};
	const sailor = m => `<div class="comm-sailor">
		${face(m.type, 'md', `${m.name} · ${m.type}`)}
		<div class="comm-sailor-body">
			<div class="comm-sailor-name"><b>${esc(m.name)}</b>${m.name !== m.type ? `<span>${esc(m.type)}</span>` : ''}${anyType[m.type] && anyType[m.type].race ? `<small>${esc(anyType[m.type].race)}</small>` : ''}</div>
			${statsHTML(m.stats)}
			<span class="comm-lv-bar"><i style="width:${m.lv * 10}%"></i></span>
		</div>
		<b class="comm-lv${m.lv >= 10 ? ' max' : ''}">Lv ${m.lv}</b>
		${m.id ? `<button class="chip tiny primary" data-act="community-sailor-sheet" data-ref="${esc(c.ref)}" data-sailor="${esc(m.id)}" title="The sailor's sheet: growths, condition, the seat and what it does with them">Look ›</button>` : ''}
	</div>`;
	const fig = (k, v, sub = '', cls = '') => `<div class="comm-fig"><span>${esc(k)}</span><b${cls ? ` class="${cls}"` : ''}>${v}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
	const h3 = (id, icon, text, sub = '') => `<h3 class="comm-card-h" id="card-${id}"><span aria-hidden="true">${icon}</span> ${text}${sub ? ` <small>· ${esc(sub)}</small>` : ''}</h3>`;
	const questRows = Object.entries(d.quests.byId).filter(([id]) => !(questById[id] && questById[id].monster)).map(([id, n]) => `<button class="comm-tag" data-act="view" data-id="quests" data-quest="${esc(id)}" title="Open the quest on the Quests tab">${questPic(id)}${esc(questName(id))}<b>×${F(n)}</b></button>`).join('');
	const huntRows = Object.entries(d.quests.hunts).map(([m, n]) => `<button class="comm-tag hunt" data-act="quest-map" data-monster="${esc(m)}" title="Show the grounds on the chart">${monsterPic(m, 'sm')}${esc(monsterName(m))}<b>×${F(n)}</b></button>`).join('');
	const madeRows = Object.entries(d.yard.shipsMade).map(([m, n]) => `<button class="comm-tag" data-act="community-item" data-item="${esc(m)}" title="The item's card">${pic(m, 'sm')}${esc(m)}<b>×${F(n)}</b></button>`).join('');
	const queuedRows = Object.entries(d.yard.byItem).slice(0, 6).map(([m, n]) => `<button class="comm-tag" data-act="community-item" data-item="${esc(m)}" title="The item's card">${pic(m, 'sm')}${esc(m)}${n > 1 ? `<b>×${F(n)}</b>` : ''}</button>`).join('');
	const at = nav ? nav.refs.indexOf(c.ref) : -1;
	const navBoard = nav && boardById[nav.boardId];
	const foot = at >= 0 && navBoard
		? `${ordinal(at + 1)} of ${nav.n} on ${esc(navBoard.title)} · ‹ › moves along the board`
		: `${places.length} place${places.length === 1 ? '' : 's'} on ${BOARDS.length} boards`;
	box.innerHTML = `
		<div class="comm-card-head">
			${avatarHTML(c, 'big')}
			<div class="comm-card-who">
				<h2>${c.named ? esc(c.name) : 'A sailor'}${c.you ? ' <em class="comm-badge">you</em>' : ''}${d.fleet.sailing ? ' <em class="comm-badge teal">at sea</em>' : ''}</h2>
				<p class="dialog-copy">${d.level ? `${esc(d.level)} · ` : ''}${d.mastery ? `mastery ${F(d.mastery)} · ` : ''}on the boards since ${day(c.joinedAt)}${c.named ? '' : ' · unnamed by choice'}</p>
			</div>
			<div class="comm-card-nav">
				${at > 0 ? `<button class="ghost-btn tiny" data-act="community-nav" data-dir="-1" title="The sailor before on this board">‹</button>` : ''}
				${at >= 0 && at < nav.refs.length - 1 ? `<button class="ghost-btn tiny" data-act="community-nav" data-dir="1" title="The sailor after on this board">›</button>` : ''}
				<button class="ghost-btn tiny" data-close title="Close">×</button>
			</div>
		</div>
		<div class="comm-card-body">
			${h3('places', '☆', 'Places', `${places.length} of ${BOARDS.length} boards`)}
			${places.length ? `<div class="comm-places">${places.map(({ b, p }) => `<span class="comm-place${p.rank <= 3 ? ` p${p.rank}` : ''}" title="${esc(`${ordinal(p.rank)} of ${p.of} · ${b.desc}`)}">${medal(p.rank)}<span><i aria-hidden="true">${b.icon}</i> ${esc(b.title)}</span><b>${value(b, p.value)}${b.unit ? ` ${esc(b.unit)}` : ''}</b></span>`).join('')}</div>` : '<p class="comm-empty">No place on any board yet.</p>'}
			<div class="comm-card-cols">
				<div>
					${h3('ship', '⚓', `The ship${d.fleet.n > 1 ? ' and the fleet' : ''}`, d.fleet.n ? `${d.fleet.n} hull${d.fleet.n === 1 ? '' : 's'}` : '')}
					${canLook ? `<button class="act small comm-look" data-act="community-look" data-ref="${esc(c.ref)}" title="The Ship tab on this sailor's boat: hull, parts, crystal, seats and roster, to look at and not to keep">⚓ Look at the ship</button>` : ''}
					${d.fleet.list.length ? `<div class="comm-hulls">${d.fleet.list.map(hull).join('')}</div>` : '<p class="comm-empty">No hull recorded.</p>'}
					${h3('crew', '👥', 'The crew', d.crew.n ? `${d.crew.n} sailor${d.crew.n === 1 ? '' : 's'}${d.crew.avgLv ? ` · average Lv ${d.crew.avgLv}` : ''}` : '')}
					${d.crew.top.length ? `<div class="comm-sailors">${d.crew.top.map(sailor).join('')}${d.crew.n > d.crew.top.length ? `<p class="comm-empty">and ${d.crew.n - d.crew.top.length} more — ${canLook ? 'all on the Ship tab' : 'not shared'}</p>` : ''}</div>` : '<p class="comm-empty">Nobody hired yet.</p>'}
				</div>
				<div>
					${h3('runs', '⇄', 'The runs')}
					<div class="comm-figs">
						${fig('Runs', F(d.runs.n), `${FC(d.runs.silver)} silver · ${F(d.runs.trades)} trades`)}
						${fig('Barters', F(d.barters), d.level || '')}
						${fig('Best run', d.runs.best ? FC(d.runs.best.net) : '—', d.runs.best ? d.runs.best.day : 'none logged', d.runs.best ? 'amber' : '')}
						${fig('Stops', F(d.runs.stops), `${F(d.runs.parley)} Parley`)}
					</div>
					${h3('quests', '✦', 'Quests', `${F(d.quests.n)} done · ${F(d.quests.huntsN)} hunts`)}
					${questRows || huntRows ? `<div class="comm-tags">${huntRows}${questRows}</div>` : '<p class="comm-empty">No quest claimed yet.</p>'}
					${h3('yard', '⚒', 'The yard')}
					<div class="comm-figs">
						${fig('Made', F(d.yard.crafts), `${F(d.yard.ships)} ships · ${F(d.yard.parts)} parts`)}
						${fig('Anvil', d.yard.tries ? `${Math.round((d.yard.wins / d.yard.tries) * 100)}%` : '—', d.yard.tries ? `${F(d.yard.wins)} of ${F(d.yard.tries)}${d.yard.drops ? ` · ${F(d.yard.drops)} fell` : ''}` : 'no attempts', d.yard.tries ? 'amber' : '')}
						${fig('Queued', F(d.yard.queued), d.yard.queued ? `${Object.keys(d.yard.byItem).length} kind${Object.keys(d.yard.byItem).length === 1 ? '' : 's'}` : 'nothing queued')}
					</div>
					${madeRows ? `<div class="comm-tags"><small>made</small>${madeRows}</div>` : ''}
					${queuedRows ? `<div class="comm-tags"><small>queued</small>${queuedRows}</div>` : ''}
					${h3('charts', '✎', 'The charts')}
					<div class="comm-figs">
						${fig('Traces', F(d.charts.traces), `${F(d.charts.points)} points`)}
						${fig('Routes kept', F(d.charts.routes), `${Object.keys(d.charts.stops).length} islands`)}
					</div>
					${h3('hold', '📦', 'The hold')}
					<div class="comm-figs">
						${fig('Units', F(d.stock.units), `${F(d.stock.items)} kinds of thing`)}
						${fig('Silver', FC(d.stock.silver), '', 'blue')}
						${fig('Crow Coins', F(d.stock.crow), '', 'amber')}
					</div>
				</div>
			</div>
		</div>
		<div class="dialog-actions comm-card-foot"><span class="comm-card-footnote">${foot}</span><span class="fb-space"></span>${c.you ? '<button class="ghost-btn" data-act="community-join">How I am shown</button>' : ''}<button class="ghost-btn" data-close>Close</button></div>`;
	if (section) {
		const to = box.querySelector(`#card-${section}`);
		if (to) to.scrollIntoView({ block: 'start' });
	}
}

/** One board whole. */
async function openBoard(id) {
	const host = openDialog('<h2>The board</h2><p class="dialog-copy">Fetching…</p>');
	const res = await call('GET', `/api/community/board/${encodeURIComponent(id)}`).catch(() => null);
	const box = host.querySelector('.dialog-box');
	if (!res || !res.ok) {
		box.innerHTML = `<h2>The board</h2><p class="dialog-copy">${esc(res && res.body && res.body.error ? res.body.error : 'The board did not answer.')}</p><div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`;
		return;
	}
	const b = res.body;
	const meta = boardById[b.id] || {};
	wholeBoards.set(b.id, b.all);
	const top = b.all.length ? b.all[0].value : 0;
	box.innerHTML = `<div class="comm-board-head dialog"><span class="comm-board-icon" aria-hidden="true">${b.icon}</span><div class="comm-board-t"><h2 class="comm-board-title">${esc(b.title)}</h2>${meta.desc ? `<span class="comm-board-desc">${esc(meta.desc)}</span>` : ''}</div><span class="comm-board-n">${b.n} sailor${b.n === 1 ? '' : 's'}${b.n > b.all.length ? ` · the first ${b.all.length}` : ''}</span></div>
		<ol class="comm-rank comm-rank-all">${b.all.map(e => rowHTML(b, e, top)).join('')}</ol>
		<div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`;
}

/** Find a named sailor. */
function openFind() {
	const host = openDialog(`<h2>Find a sailor</h2>
		<input class="field comm-find" type="search" placeholder="A Discord name, or part of one…" aria-label="Find a sailor" autocomplete="off">
		<p class="dialog-copy comm-find-note">Sailors on the boards by name. Unnamed sailors cannot be found this way — that is what unnamed means.</p>
		<div class="comm-find-list"></div>
		<div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`);
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
				? `<ol class="comm-rank">${hits.map(h => `<li class="comm-row" data-act="community-sailor" data-ref="${esc(h.ref)}" role="button" tabindex="0"><span class="comm-pos">·</span>${avatarHTML({ ...h, named: true })}<span class="comm-who"><span class="comm-name">${esc(h.name)}</span></span><b class="comm-val">card →</b></li>`).join('')}</ol>`
				: '<p class="comm-empty">Nobody by that name on the boards.</p>';
		}, 250);
	});
}

/** Every board, with the caller's own place on each. */
function openPlaces() {
	const who = me();
	const places = data && data.you ? data.you.places : {};
	const rows = BOARDS.map(b => ({ b, p: places[b.id] || null }));
	openDialog(`<h2>Your places</h2>
		<p class="dialog-copy">Where ${who ? esc(who.username) : 'you'} stand${who ? 's' : ''} on every board, out of the sailors who have earned a place there.</p>
		<div class="comm-places-list">${rows.map(({ b, p }) => `<div class="comm-place-row${p ? '' : ' none'}${p && p.rank <= 3 ? ` p${p.rank}` : ''}">
			${p ? medal(p.rank) : '<span class="comm-pos">—</span>'}
			<span class="comm-place-b"><i aria-hidden="true">${b.icon}</i><span>${esc(b.title)}</span><small>${p ? `of ${p.of}` : esc(b.how || 'no place yet')}</small></span>
			<span class="comm-place-v">${p ? `${value(b, p.value)} ${esc(b.unit)}` : ''}</span>
		</div>`).join('')}</div>
		<div class="dialog-actions">${data && data.you && data.you.ref ? `<button class="ghost-btn" data-act="community-sailor" data-ref="${esc(data.you.ref)}">My card</button><span class="fb-space"></span>` : ''}<button class="ghost-btn" data-close>Close</button></div>`);
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
			openSailorSheet({ cond: 100, ...m }, { ship: hull, seats: hull && ship.seats && typeof ship.seats === 'object' ? ship.seats[hull] : {}, owner: c.named ? c.name : 'a sailor' });
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
		default: return false;
	}
}
