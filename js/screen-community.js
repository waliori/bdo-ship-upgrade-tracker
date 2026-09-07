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

import { esc, F, FC } from './fmt.js';
import * as store from './state.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { feature, me, call, setShare, onAccount, signIn } from './sync.js';
import { digest, BOARDS, monsterName } from './digest.js';
import { quests } from './quests.js';
import { npcById } from './barter_npcs.js';
import { crystalById } from './sea_crystals.js';
import { STAT_NAMES } from './sailors.js';

let data = null;          // the last answer from /api/community
let fetchedAt = 0;
let loading = null;
let failed = '';
let half = 'fame';        // fame | numbers
let rerender = () => {};

const FRESH_MS = 60_000;

/** Ask for the boards again if the copy held is old, then redraw. */
async function load(force = false) {
	if (loading) return loading;
	if (!force && data && Date.now() - fetchedAt < FRESH_MS) return data;
	loading = (async () => {
		let res;
		try {
			res = await call('GET', '/api/community');
		} catch {
			res = null;
		}
		if (res && res.ok && res.body) {
			data = res.body;
			fetchedAt = Date.now();
			failed = '';
		} else {
			failed = res && res.body && res.body.error ? res.body.error : 'The boards did not answer.';
		}
	})().finally(() => { loading = null; rerender(); });
	return loading;
}

export function wireCommunity(fn) {
	rerender = fn;
	// The account's standing changed -- joined, left, signed out -- so
	// the boards it is on did too.
	onAccount(() => { if (feature('community')) load(true); });
}

/* ------------------------------------------------------------------ *
 * Names for what the digest keeps as keys
 * ------------------------------------------------------------------ */

const questName = id => {
	const q = quests.find(x => x.id === id);
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
const crystalName = id => (crystalById[Number(id)] ? crystalById[Number(id)].name : `#${id}`);

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
		you = `<p class="comm-copy">The boards show only what sailors chose to share. <button class="act small" data-act="signin">Sign in with Discord</button> to take part — by name, or as an unnamed sailor.</p>`;
	} else if (!who.share) {
		you = `<p class="comm-copy">You are not on the boards; nothing about your save is shown to anyone. <button class="act small" data-act="community-join">Take part</button> — you will see exactly what would be shared before you agree.</p>`;
	} else {
		const places = data && data.you ? data.you.places : {};
		const best = Object.entries(places).sort((a, b) => a[1].rank - b[1].rank || b[1].of - a[1].of).slice(0, 3)
			.map(([id, p]) => { const b = BOARDS.find(x => x.id === id); return b ? `${ordinal(p.rank)} of ${p.of} in ${b.title}` : ''; }).filter(Boolean);
		you = `<p class="comm-copy">You are on the boards ${who.share === 'named' ? `as <b>${esc(who.username)}</b>` : 'as <b>an unnamed sailor</b>'}${best.length ? ` — ${best.join(', ')}` : ''}. ${data && data.you && data.you.ref ? `<button class="chip tiny primary" data-act="community-sailor" data-ref="${esc(data.you.ref)}">My card</button> ` : ''}<button class="chip tiny" data-act="community-places">All my places</button> <button class="chip tiny" data-act="community-join">Change</button> <button class="chip tiny" data-act="community-leave">Leave the boards</button></p>`;
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

const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][Math.min(n % 10, 4)] || 'th'}`;

/* ------------------------------------------------------------------ *
 * The hall of fame
 * ------------------------------------------------------------------ */

const value = (board, v) => (board.id === 'silver' || board.id === 'bestday' ? FC(v) : F(v));

function boardHTML(board) {
	const who = me();
	const place = data.you && data.you.places[board.id];
	const inTop = board.top.some(e => e.you);
	return `<section class="panel comm-board" data-board="${esc(board.id)}">
		<div class="comm-board-head">
			<span class="comm-board-icon" aria-hidden="true">${board.icon}</span>
			<h3 class="comm-board-title">${esc(board.title)}</h3>
			<span class="comm-board-n">${board.n ? `${board.n} sailor${board.n === 1 ? '' : 's'}` : 'nobody yet'}</span>
		</div>
		${board.top.length ? `<ol class="comm-rank">${board.top.map(e => rowHTML(board, e)).join('')}</ol>` : `<p class="comm-empty">${who && who.share ? 'Nobody has earned a place here yet.' : 'Nobody has earned a place here yet — the first to take part will.'}</p>`}
		${place && !inTop ? `<div class="comm-yours">You: ${ordinal(place.rank)} of ${place.of} · ${value(board, place.value)} ${esc(board.unit)}</div>` : ''}
		${board.n > board.top.length ? `<button class="comm-more" data-act="community-board" data-id="${esc(board.id)}">Show all ${board.n} →</button>` : ''}
	</section>`;
}

/** One place on a board. A press opens the sailor's card. */
function rowHTML(board, e) {
	return `<li class="comm-row${e.you ? ' you' : ''}${e.rank <= 3 ? ` p${e.rank}` : ''}" data-act="community-sailor" data-ref="${esc(e.ref)}" role="button" tabindex="0" title="${e.named ? esc(e.name) : 'A sailor'} — open the card">
		<span class="comm-pos">${e.rank}</span>
		${avatarHTML(e)}
		<span class="comm-who"><span class="comm-name">${e.named ? esc(e.name) : 'A sailor'}${e.you ? ' <em>you</em>' : ''}</span>${e.detail ? `<span class="comm-detail">${esc(e.detail)}</span>` : ''}</span>
		<b class="comm-val">${value(board, e.value)}<small>${esc(board.unit)}</small></b>
	</li>`;
}

const avatarHTML = e => (e.avatar ? `<img class="comm-avatar" src="${esc(e.avatar)}" alt="" width="24" height="24" loading="lazy">` : `<span class="comm-avatar anon" aria-hidden="true">${e.named ? esc((e.name || '?').slice(0, 1)) : '☸'}</span>`);

function fameHTML() {
	return `<div class="comm-boards">${data.fame.map(boardHTML).join('')}</div>`;
}

/* ------------------------------------------------------------------ *
 * The fleet in numbers
 * ------------------------------------------------------------------ */

/** A list of bars: the largest is the full width, the rest in proportion. */
function bars(title, note, table, name = k => k, unit = '') {
	const rows = Object.entries(table || {});
	const max = rows.reduce((m, [, c]) => Math.max(m, c), 0);
	return `<section class="panel comm-bars">
		<div class="comm-board-head"><h3 class="comm-board-title">${esc(title)}</h3><span class="comm-board-n">${esc(note)}</span></div>
		${rows.length ? `<div class="comm-bar-list">${rows.map(([k, c]) => `
			<div class="comm-bar-row">
				<span class="comm-bar-name">${esc(name(k))}</span>
				<span class="comm-bar"><i style="width:${max ? Math.max(2, Math.round((c / max) * 100)) : 0}%"></i></span>
				<b class="comm-bar-n">${F(c)}${unit ? `<small>${esc(unit)}</small>` : ''}</b>
			</div>`).join('')}</div>` : '<p class="comm-empty">Nothing counted yet.</p>'}
	</section>`;
}

/** A histogram in a row of columns. */
function columns(title, note, counts, labels) {
	const max = Math.max(...counts, 0);
	return `<section class="panel comm-bars">
		<div class="comm-board-head"><h3 class="comm-board-title">${esc(title)}</h3><span class="comm-board-n">${esc(note)}</span></div>
		${max ? `<div class="comm-cols">${counts.map((c, i) => `
			<div class="comm-col" title="${esc(labels[i])}: ${F(c)}">
				<b>${c ? F(c) : ''}</b><i style="height:${Math.max(2, Math.round((c / max) * 60))}px"></i><span>${esc(labels[i])}</span>
			</div>`).join('')}</div>` : '<p class="comm-empty">Nothing counted yet.</p>'}
	</section>`;
}

function numbersHTML() {
	const s = data.stats;
	const t = s.totals;
	const tile = (k, v, sub = '') => `<div class="stat"><div class="stat-k">${esc(k)}</div><div class="stat-v">${v}</div>${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}</div>`;
	return `<div class="comm-numbers">
		<div class="stats comm-totals">
			${tile('Sailors on the boards', F(data.sailors), `${data.named} by name`)}
			${tile('Silver from runs', FC(t.silver), `${F(t.runs)} runs · ${F(t.trades)} trades · ${F(t.barters)} barters`)}
			${tile('Quests done', F(t.quests), `${F(t.hunts)} sea monster hunts`)}
			${tile('Things made', F(t.crafts), `${F(t.ships)} ships built`)}
			${tile('At the anvil', t.tries ? `${Math.round((t.wins / t.tries) * 100)}%` : '—', t.tries ? `${F(t.wins)} of ${F(t.tries)} attempts` : 'no attempts recorded')}
			${tile('Sailors hired', F(t.sailors), `${F(t.hulls)} hulls in all`)}
			${tile('Sailing mastery', t.mastery ? F(t.mastery) : '—', 'the average, where it is filled in')}
			${tile('Traces drawn', F(t.traces), `${F(t.points)} points`)}
		</div>
		<div class="comm-grid">
			${bars('Hulls most sailed', 'the ship each sailor is sailing now', s.sailing, k => k, 'sailors')}
			${bars('Hulls owned', 'across every setup', s.hulls, k => k, 'sailors')}
			${bars('Parts most fitted', 'by name, whatever the level', s.parts, k => k.replace(/^Epheria /, ''), 'sailors')}
			${bars('Sailors most hired', 'across every roster', s.sailorTypes, k => k, 'hired')}
			${bars('Islands most plotted', 'stops in the routes kept on the chart', s.islands, isleName, 'plots')}
			${bars('Quests most done', 'claims, over careers', s.quests, questName, 'done')}
			${bars('Sea monsters most hunted', 'from the hunting quests done', s.hunts, monsterName, 'hunts')}
			${bars('Builds most queued', 'what is on the Builds tab right now', s.builds, k => k, 'sailors')}
			${bars('Ships most built', 'made in the Workshop', s.shipsMade, k => k, 'built')}
			${bars('Sea crystals most carried', 'in a hull’s slot', s.crystals, crystalName, 'hulls')}
			${bars('Barter level', 'as set on the Barter tab', s.levels, k => k, 'sailors')}
			${columns('Sailing mastery', 'sailors at each step', s.masteryBuckets, ['<500', '<1000', '<1500', '<2000', '<2500', '2500+'])}
			${columns('Sailor levels', 'every sailor hired, by level', s.crewLevels, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])}
			${columns('Fleet sizes', 'hulls per sailor', s.fleetSizes, ['none', '1', '2', '3+'])}
			${columns('Runs by weekday', 'the last sixty runs of each sailor', s.runDays, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])}
		</div>
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
		return `<div class="comm-prev-row${v >= b.min ? '' : ' none'}"><span>${b.icon} ${esc(b.title)}</span><b>${v >= b.min ? `${value(b, v)} ${esc(b.unit)}` : '—'}</b>${b.detail(d) ? `<small>${esc(b.detail(d))}</small>` : ''}</div>`;
	});
	const tables = [
		['hulls', d.fleet.hulls.length], ['parts fitted', Object.keys(d.fleet.parts).length], ['sailor types', Object.keys(d.crew.byType).length],
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
		<p class="dialog-copy">Anyone who opens this page sees the boards. What goes on them is the digest below, worked out from your save here and again from the copy the server holds — the numbers, not the save. It is refreshed as you sync, and leaving takes it down.</p>
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
		<p class="dialog-copy">Your places go, and the digest the server holds is deleted. Your save is untouched, and you can take part again whenever you like.</p>
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

/** A sailor's card: places, the ship, the fleet, the crew, the career. */
export async function openSailorCard(ref) {
	const host = openDialog('<h2>A sailor</h2><p class="dialog-copy">Fetching the card…</p>');
	const res = await call('GET', `/api/community/sailor/${encodeURIComponent(ref)}`).catch(() => null);
	const box = host.querySelector('.dialog-box');
	if (!res || !res.ok) {
		box.innerHTML = `<h2>A sailor</h2><p class="dialog-copy">${esc(res && res.body && res.body.error ? res.body.error : 'The card did not answer.')}</p><div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`;
		return;
	}
	const c = res.body;
	const d = c.digest;
	const places = Object.entries(c.places).map(([id, p]) => ({ b: BOARDS.find(x => x.id === id), p })).filter(x => x.b).sort((a, b) => a.p.rank - b.p.rank || b.p.of - a.p.of);
	const best = d.fleet.best;
	const slots = ['cannon', 'sail', 'figurehead', 'plating'];
	const hull = h => `<div class="card-hull${best && h.ship === best.ship ? ' best' : ''}">
		<b>${esc(h.ship)}</b>${h.ship === d.fleet.sailing ? ' <em>sailing now</em>' : ''}
		<span class="card-parts">${slots.map(sl => `<i class="${h.parts[sl] ? 'on' : ''}" title="${sl}">${sl.slice(0, 1).toUpperCase()}${h.parts[sl] ? ` +${h.parts[sl]}` : ''}</i>`).join('')}${h.crystal ? `<small>${esc(crystalName(h.crystal))}</small>` : ''}${h.skins ? `<small>${h.skins} of 4 appearance slots</small>` : ''}</span>
	</div>`;
	const sailor = m => `<div class="card-sailor">
		<b>${esc(m.name)}</b><span class="comm-detail">${esc(m.type)} · Lv ${m.lv}</span>
		${Object.keys(m.stats).length ? `<span class="card-stats">${Object.entries(m.stats).map(([k, v]) => `<i title="${esc((STAT_NAMES[k] || { tip: k }).tip)}">${esc((STAT_NAMES[k] || { game: k }).game)} <small>${esc((STAT_NAMES[k] || { means: '' }).means)}</small> +${v}%</i>`).join('')}</span>` : ''}
	</div>`;
	const fig = (k, v, sub = '') => `<div class="card-fig"><span>${esc(k)}</span><b>${v}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
	box.innerHTML = `
		<div class="card-head">
			${c.avatar ? `<img class="comm-avatar big" src="${esc(c.avatar)}" alt="" width="44" height="44">` : `<span class="comm-avatar anon big" aria-hidden="true">${c.named ? esc((c.name || '?').slice(0, 1)) : '☸'}</span>`}
			<div><h2>${c.named ? esc(c.name) : 'A sailor'}${c.you ? ' <em class="card-you">you</em>' : ''}</h2>
			<p class="dialog-copy">${d.level ? `${esc(d.level)} · ` : ''}${d.mastery ? `mastery ${F(d.mastery)} · ` : ''}on the boards since ${new Date(c.joinedAt).toISOString().slice(0, 10)}${c.named ? '' : ' · unnamed by choice'}</p></div>
		</div>
		<h3 class="card-h">Places</h3>
		${places.length ? `<div class="card-places">${places.map(({ b, p }) => `<span class="card-place${p.rank <= 3 ? ` p${p.rank}` : ''}"><i>${b.icon}</i><b>${ordinal(p.rank)}</b><small>of ${p.of}</small><span>${esc(b.title)}</span></span>`).join('')}</div>` : '<p class="comm-empty">No place on any board yet.</p>'}
		<h3 class="card-h">The ship${d.fleet.n > 1 ? ` and the fleet · ${d.fleet.n} hulls` : ''}</h3>
		${d.fleet.list.length ? `<div class="card-hulls">${d.fleet.list.map(hull).join('')}</div>` : '<p class="comm-empty">No hull recorded.</p>'}
		<h3 class="card-h">The crew · ${d.crew.n} sailor${d.crew.n === 1 ? '' : 's'}${d.crew.avgLv ? ` · average Lv ${d.crew.avgLv}` : ''}</h3>
		${d.crew.top.length ? `<div class="card-crew">${d.crew.top.map(sailor).join('')}${d.crew.n > d.crew.top.length ? `<p class="comm-empty">and ${d.crew.n - d.crew.top.length} more</p>` : ''}</div>` : '<p class="comm-empty">Nobody hired yet.</p>'}
		<h3 class="card-h">The career</h3>
		<div class="card-figs">
			${fig('Runs', F(d.runs.n), `${FC(d.runs.silver)} silver · ${F(d.runs.trades)} trades`)}
			${fig('Barters', F(d.barters))}
			${fig('Best run', d.runs.best ? FC(d.runs.best.net) : '—', d.runs.best ? d.runs.best.day : '')}
			${fig('Quests', F(d.quests.n), `${F(d.quests.huntsN)} hunts`)}
			${fig('Made', F(d.yard.crafts), `${F(d.yard.ships)} ships · ${F(d.yard.parts)} parts`)}
			${fig('Anvil', d.yard.tries ? `${Math.round((d.yard.wins / d.yard.tries) * 100)}%` : '—', d.yard.tries ? `${F(d.yard.wins)} of ${F(d.yard.tries)}` : 'no attempts')}
			${fig('Charts', F(d.charts.traces), `${F(d.charts.points)} points · ${F(d.charts.routes)} routes`)}
			${fig('Hold', F(d.stock.units), `${F(d.stock.items)} kinds`)}
		</div>
		${Object.keys(d.quests.hunts).length ? `<p class="card-line">Hunted: ${Object.entries(d.quests.hunts).map(([m, n]) => `${esc(monsterName(m))} ×${F(n)}`).join(', ')}</p>` : ''}
		${Object.keys(d.yard.shipsMade).length ? `<p class="card-line">Built: ${Object.entries(d.yard.shipsMade).map(([m, n]) => `${esc(m)} ×${F(n)}`).join(', ')}</p>` : ''}
		<div class="dialog-actions">${c.you ? '<button class="ghost-btn" data-act="community-join">How I am shown</button><span class="fb-space"></span>' : ''}<button class="ghost-btn" data-close>Close</button></div>`;
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
	box.innerHTML = `<h2>${b.icon} ${esc(b.title)}</h2>
		<p class="dialog-copy">${b.n} sailor${b.n === 1 ? '' : 's'}${b.n > b.all.length ? ` · the first ${b.all.length}` : ''}</p>
		<ol class="comm-rank comm-rank-all">${b.all.map(e => rowHTML(b, e)).join('')}</ol>
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
		<div class="comm-places">${rows.map(({ b, p }) => `<div class="comm-place-row${p ? '' : ' none'}${p && p.rank <= 3 ? ` p${p.rank}` : ''}">
			<span class="comm-place-b"><i>${b.icon}</i> ${esc(b.title)}</span>
			<b>${p ? ordinal(p.rank) : '—'}</b><small>${p ? `of ${p.of}` : 'no place yet'}</small>
			<span class="comm-place-v">${p ? `${value(b, p.value)} ${esc(b.unit)}` : ''}</span>
		</div>`).join('')}</div>
		<div class="dialog-actions">${data && data.you && data.you.ref ? `<button class="ghost-btn" data-act="community-sailor" data-ref="${esc(data.you.ref)}">My card</button><span class="fb-space"></span>` : ''}<button class="ghost-btn" data-close>Close</button></div>`);
}

/** The tab's own verbs. True when handled; the caller redraws. */
export function communityAction(act, el) {
	switch (act) {
		case 'community-half': half = el.dataset.id === 'numbers' ? 'numbers' : 'fame'; return true;
		case 'community-join': openShareDialog(); return false;
		case 'community-leave': confirmLeave(); return false;
		case 'community-refresh': load(true); return false;
		case 'community-sailor': openSailorCard(el.dataset.ref); return false;
		case 'community-board': openBoard(el.dataset.id); return false;
		case 'community-find': openFind(); return false;
		case 'community-places': openPlaces(); return false;
		default: return false;
	}
}
