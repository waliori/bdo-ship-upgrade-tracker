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
		you = `<p class="comm-copy">You are on the boards ${who.share === 'named' ? `as <b>${esc(who.username)}</b>` : 'as <b>an unnamed sailor</b>'}${best.length ? ` — ${best.join(', ')}` : ''}. <button class="chip tiny" data-act="community-join">Change</button> <button class="chip tiny" data-act="community-leave">Leave the boards</button></p>`;
	}
	return `<section class="panel comm-head">
		<div class="panel-head">
			<h2 class="panel-title">The harbour</h2>
			<span class="panel-sub">${data ? `${n} sailor${n === 1 ? '' : 's'} on the boards · ${named} by name${built ? ` · drawn up at ${built.toISOString().slice(11, 16)} UTC` : ''}` : loading ? 'fetching the boards…' : failed || ''}</span>
			<span class="panel-spacer"></span>
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
		${board.top.length ? `<ol class="comm-rank">${board.top.map(e => `
			<li class="comm-row${e.you ? ' you' : ''}${e.rank <= 3 ? ` p${e.rank}` : ''}">
				<span class="comm-pos">${e.rank}</span>
				${e.avatar ? `<img class="comm-avatar" src="${esc(e.avatar)}" alt="" width="24" height="24" loading="lazy">` : `<span class="comm-avatar anon" aria-hidden="true">${e.named ? esc((e.name || '?').slice(0, 1)) : '☸'}</span>`}
				<span class="comm-who"><span class="comm-name">${e.named ? esc(e.name) : 'A sailor'}${e.you ? ' <em>you</em>' : ''}</span>${e.detail ? `<span class="comm-detail">${esc(e.detail)}</span>` : ''}</span>
				<b class="comm-val">${value(board, e.value)}<small>${esc(board.unit)}</small></b>
			</li>`).join('')}</ol>` : `<p class="comm-empty">${who && who.share ? 'Nobody has earned a place here yet.' : 'Nobody has earned a place here yet — the first to take part will.'}</p>`}
		${place && !inTop ? `<div class="comm-yours">You: ${ordinal(place.rank)} of ${place.of} · ${value(board, place.value)} ${esc(board.unit)}</div>` : ''}
	</section>`;
}

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

/** The tab's own verbs. True when handled; the caller redraws. */
export function communityAction(act, el) {
	switch (act) {
		case 'community-half': half = el.dataset.id === 'numbers' ? 'numbers' : 'fame'; return true;
		case 'community-join': openShareDialog(); return false;
		case 'community-leave': confirmLeave(); return false;
		case 'community-refresh': load(true); return false;
		default: return false;
	}
}
