// Today, at sea: the clocks a sailor plays by, on the Plan screen.
//
// The plan says what is left; this says what today can do about it --
// the dailies still open that pay in something on the list, how long
// until the resets, when Vell is next up on this player's servers, and
// how many more days a build is at the pace it has been going.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { snapshot } from './ui-state.js';
import { quests } from './quests.js';
import { questDone, wantedQuests } from './screen-quests.js';
import { VELL, VELL_CHECKED, nextSpawn, timeLabel, localLabel, resetPlan, setResetPlan, RESETS_CHECKED } from './clock.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { paceText } from './pace.js';
import { currentShip } from './ship.js';
import { REGIONS, DEFAULT_REGION } from './market.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const zoneShort = zone => `${zone.split('/').pop().replace(/_/g, ' ')} time`;

/**
 * The reset clock for the region standing, with the player's correction
 * if they have made one, handed to clock.js so every countdown and every
 * quest tick on the page counts to the same instant.
 *
 * Called on each render, which is cheap and means changing the region
 * moves the clocks with it -- there is nothing to reload and no server
 * to ask, only the browser's own Intl.
 */
export function currentResets() {
	const region = String(store.getSetting('marketRegion', DEFAULT_REGION) || DEFAULT_REGION);
	const plan = resetPlan(region.replace('console_', '') === region ? region : region, store.getSetting('resetTimes', null));
	setResetPlan(plan);
	return { region, plan };
}

/** The timetable in force: the player's own if they set one (kept on
 *  their own clock), else the server's for the Market region they
 *  chose, else nothing -- an unknown region gets no guess. */
export function vellPlan() {
	const custom = store.getSetting('vellTimes', null);
	if (Array.isArray(custom) && custom.length) {
		return { label: 'your own', zone: Intl.DateTimeFormat().resolvedOptions().timeZone, times: custom, custom: true };
	}
	const region = String(store.getSetting('marketRegion', DEFAULT_REGION) || DEFAULT_REGION).replace('console_', '');
	return VELL[region] ? { ...VELL[region], custom: false } : null;
}

/**
 * What the reset countdowns are actually counting to, said out loud.
 *
 * NA and EU are known; every other region is the same guess wearing a
 * label, because no public source has tested them. Saying which it is
 * costs one line and stops the app presenting an assumption as a fact --
 * and the line is a way to correct it, for a player who knows.
 */
function resetNote() {
	const { region, plan } = currentResets();
	const label = (REGIONS.find(r => r[0] === region) || ['', region.toUpperCase()])[1];
	const zone = plan.zone === 'UTC' ? 'UTC' : zoneShort(plan.zone);
	const when = `${String(plan.daily).padStart(2, '0')}:00 ${zone} · ${DAY_NAMES[plan.weekly.day]} · ${String(plan.barter).padStart(2, '0')}:00`;
	const edit = '<button class="linky" data-act="resets-edit">change</button>';
	if (plan.custom) return `${esc(when)} — your own times · ${edit}`;
	if (plan.sure) return `${esc(label)}: ${esc(when)}, as of ${RESETS_CHECKED} · ${edit}`;
	return `${esc(label)}: assumed the same as NA/EU — ${esc(when)}. Nobody has published ${esc(label)}'s. ${edit}`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The same fact as resetNote(), short enough for a tooltip. */
function resetTitle() {
	const { plan } = currentResets();
	const zone = plan.zone === 'UTC' ? 'UTC' : plan.zone;
	const hh = h => `${String(h).padStart(2, '0')}:00`;
	return `Dailies reset at ${hh(plan.daily)} ${zone}, the barter refill at ${hh(plan.barter)}`
		+ (plan.sure ? '' : ' — assumed; nobody has published this region\'s');
}

function vellTile() {
	const plan = vellPlan();
	const regionId = store.getSetting('marketRegion', DEFAULT_REGION);
	const regionLabel = (REGIONS.find(r => r[0] === regionId) || ['', 'your region'])[1];
	const edit = `<button class="linky" data-act="vell-edit">${plan ? 'change' : 'set the times'}</button>`;
	if (!plan) {
		return `<div class="today-v faint">no timetable</div>
			<div class="today-sub">none kept for ${esc(regionLabel)} servers · ${edit}</div>`;
	}
	const next = nextSpawn(plan.zone, plan.times);
	if (!next) return `<div class="today-v faint">no times set</div><div class="today-sub">${edit}</div>`;
	const source = plan.custom
		? 'your own timetable'
		: `${esc(plan.label)}: ${esc(plan.times.map(timeLabel).join(' · '))} ${esc(zoneShort(plan.zone))}, as of ${VELL_CHECKED}`;
	const canNotify = typeof Notification !== 'undefined';
	const on = canNotify && store.getSetting('vellNotify', false) === true && Notification.permission === 'granted';
	const byPush = on && store.getSetting('vellPush', false) === true;
	const bell = canNotify
		? ` · <button class="linky" data-act="vell-notify" title="${on
			? (byPush ? 'A notification a quarter of an hour before, tab open or not — follows the server timetable' : 'A notification a quarter of an hour before, while this tab is open')
			: 'Ask for a notification a quarter of an hour before'}">${on ? `🔔 reminding${byPush ? ' by push' : ' while open'}` : 'remind me'}</button>`
		: '';
	return `<div class="today-v">${esc(localLabel(next.at))} <span class="today-in">in <b data-until="at" data-at="${next.at}"></b></span></div>
		<div class="today-sub">${source} · ${edit}${bell}</div>`;
}

/** The strip itself. */
export function todayStrip() {
	const wanted = wantedQuests();
	const leftAll = quests.filter(q => !questDone(q)).length;
	const left = wanted.filter(q => !questDone(q));
	const questTile = `<div class="today-v">${leftAll} of ${quests.length} left</div>
			<div class="today-sub">${wanted.length ? `${left.length} of them pay in what your plan still wants` : 'none of them pays in what you are short of'} · <button class="linky" data-act="view" data-id="quests">open</button></div>`;

	const targets = (snapshot.targets || []).filter(t => t.missingUnits > 0);
	const paced = targets.map(t => ({ t, text: paceText(t) })).filter(x => x.text);
	const paceTile = paced.length
		? `<div class="today-v">${esc(paced[0].t.item)}</div><div class="today-sub">${esc(paced[0].text)}${paced.length > 1 ? ' · the rest on Builds' : ''}</div>`
		: targets.length
			? `<div class="today-v faint">—</div><div class="today-sub">a pace appears after a day of records</div>`
			: '';

	const me = currentShip();
	const fitted = me.fit.slots.filter(s => s.part).length + (me.crystal ? 1 : 0);
	const shipTile = `<div class="today-v">${esc(me.name)}</div>
		<div class="today-sub">${me.speed.total}% · limit ${esc(F(me.hold.limit))} LT · ${fitted} of 5 fitted${me.crew.seated ? ` · ${me.crew.seated} aboard` : ''} · <button class="linky" data-act="view" data-id="crew">fit out</button></div>`;
	return `<div class="today">
		<div class="today-k">Today</div>
		<div class="today-tiles">
			<div class="today-tile"><div class="summary-k">Your ship</div>${shipTile}</div>
			<div class="today-tile"><div class="summary-k">Quests</div>${questTile}</div>
			<div class="today-tile"><div class="summary-k">Resets</div>
				<div class="today-v">dailies <b data-until="daily"></b></div>
				<div class="today-sub">weeklies <b data-until="weekly"></b> · barter refresh <b data-until="barter"></b></div>
				<div class="today-sub">${resetNote()}</div></div>
			<div class="today-tile"><div class="summary-k">Vell</div>${vellTile()}</div>
			${paceTile ? `<div class="today-tile"><div class="summary-k">Pace</div>${paceTile}</div>` : ''}
		</div>
	</div>`;
}

const REMIND_BEFORE = 15 * 60e3;
let remindedFor = 0;

const b64ToBytes = s => {
	const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
	return Uint8Array.from(b, c => c.charCodeAt(0));
};

/** The server region the push timetable would follow, if it has one. */
function pushRegion() {
	const r = String(store.getSetting('marketRegion', DEFAULT_REGION) || DEFAULT_REGION).replace('console_', '');
	return VELL[r] ? r : null;
}

/** Try for a push subscription: the server must offer it, the browser
 *  must have a worker, and the region must have a timetable. True when
 *  the reminder is now the server's job. */
async function subscribePush() {
	const region = pushRegion();
	if (!region || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
	try {
		const cfg = await (await fetch('/api/config')).json();
		if (!cfg || !cfg.push) return false;
		const { key } = await (await fetch('/api/push/key')).json();
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
		const res = await fetch('/api/push/subscribe', {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subscription: sub.toJSON(), region })
		});
		return res.ok;
	} catch {
		return false;
	}
}

async function unsubscribePush() {
	if (store.getSetting('vellPush', false) !== true) return;
	try {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		if (sub) {
			await fetch('/api/push/subscribe', {
				method: 'DELETE', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: sub.endpoint })
			}).catch(() => {});
			await sub.unsubscribe();
		}
	} catch { /* then the server's copy dies of a 410 on its next send */ }
}

/** Turn the reminder on (asking the browser first) or off. By push
 *  where the deployment offers it; in the page otherwise. */
export async function toggleVellReminder() {
	if (typeof Notification === 'undefined') return toast('This browser has no notifications');
	if (store.getSetting('vellNotify', false) === true && Notification.permission === 'granted') {
		await unsubscribePush();
		store.setSetting('vellPush', false);
		store.setSetting('vellNotify', false);
		return toast('No more Vell reminders');
	}
	let perm = Notification.permission;
	if (perm === 'default') {
		try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; }
	}
	if (perm !== 'granted') return toast('The browser would not allow notifications — check the site settings');
	const pushed = await subscribePush();
	store.setSetting('vellPush', pushed);
	store.setSetting('vellNotify', true);
	toast(pushed
		? 'You will be told a quarter of an hour before Vell, tab open or not'
		: 'You will be told a quarter of an hour before Vell, while this tab is open');
}

/** Called by the clock: a notification once, a quarter of an hour
 *  before the next spawn, while the page is open and allowed to. */
export function checkVellReminder(now = Date.now()) {
	if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
	if (store.getSetting('vellNotify', false) !== true || store.getSetting('vellPush', false) === true) return;
	const plan = vellPlan();
	const next = plan && nextSpawn(plan.zone, plan.times, now);
	if (!next || next.at === remindedFor) return;
	const left = next.at - now;
	if (left > REMIND_BEFORE || left < 0) return;
	remindedFor = next.at;
	try {
		new Notification('Vell is coming up', { body: `Spawns ${localLabel(next.at)} — in ${Math.max(1, Math.round(left / 60e3))} minutes.`, tag: 'vell' });
	} catch { /* a browser that will not */ }
	toast(`Vell in ${Math.max(1, Math.round(left / 60e3))} minutes`);
}

/** The day in one line, for the tabs that do not carry the strip. */
export function statusLine() {
	const me = currentShip();
	const wanted = wantedQuests();
	const left = wanted.filter(q => !questDone(q)).length;
	const leftAll = quests.filter(q => !questDone(q)).length;
	const plan = vellPlan();
	const next = plan && nextSpawn(plan.zone, plan.times);
	const targets = (snapshot.targets || []).filter(t => t.missingUnits > 0);
	const paced = targets.map(t => ({ t, text: paceText(t) })).find(x => x.text);
	const bits = [
		`<button class="status-bit" data-act="view" data-id="crew" title="Your ship — hull, parts, crew and setups, on the Ship tab">⚓ <b>${esc(me.name)}</b> ${me.speed.total}% · ${F(me.hold.limit)} LT</button>`,
		`<button class="status-bit" data-act="view" data-id="quests" title="Quests still to do this period${wanted.length ? `; ${left} of them pay in what your plan still wants — short of, or still to craft or buy` : ''}">✦ <b>${leftAll}</b> quest${leftAll === 1 ? '' : 's'} left${wanted.length ? ` · <b>${left}</b> for your list` : ''}</button>`,
		`<span class="status-bit" title="${esc(resetTitle())}">dailies <b data-until="daily"></b> · barter <b data-until="barter"></b></span>`,
		next ? `<span class="status-bit" title="Vell's next spawn on your servers">Vell <b>${esc(localLabel(next.at))}</b> in <b data-until="at" data-at="${next.at}"></b></span>` : '',
		paced ? `<button class="status-bit" data-act="view" data-id="builds" title="${esc(paced.text)}">${esc(paced.t.item)}: <b>${esc(paced.text.replace(/ at the last.*$/, ''))}</b></button>` : ''
	].filter(Boolean);
	return bits.join('<span class="status-sep">·</span>');
}

/** Set Vell's times by hand, on the player's own clock. */
export function openVellDialog() {
	const plan = vellPlan();
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	// The server's times, shown on the player's clock as a starting point.
	const rows = [];
	if (plan) {
		for (const t of plan.times) {
			const next = nextSpawn(plan.zone, [t]);
			if (!next) continue;
			const d = new Date(next.at);
			rows.push({ day: d.getDay(), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` });
		}
	}
	while (rows.length < 3) rows.push({ day: -1, time: '' });
	const row = (r, i) => `<div class="vell-row">
		<select class="field select vell-day" aria-label="Day of spawn ${i + 1}">
			<option value="-1"${r.day < 0 ? ' selected' : ''}>—</option>
			${DAYS.map((d, k) => `<option value="${k}"${r.day === k ? ' selected' : ''}>${d}</option>`).join('')}
		</select>
		<input class="field vell-time" type="time" value="${esc(r.time)}" aria-label="Time of spawn ${i + 1}">
	</div>`;
	const host = openDialog(`
		<h2>When Vell comes up</h2>
		<p class="dialog-copy">Times on your own clock (${esc(zone)}). The app keeps EU and NA server timetables as of ${VELL_CHECKED}; they move with events, so set yours here when they do.</p>
		${rows.map(row).join('')}
		<div class="dialog-actions">
			<button class="ghost-btn" data-vell-server>Use the server timetable</button>
			<button class="ghost-btn" data-close>Cancel</button>
			<button class="act" data-vell-save>Save</button>
		</div>`);
	host.querySelector('[data-vell-server]').addEventListener('click', () => {
		store.setSetting('vellTimes', null);
		closeDialog();
		toast('Back on the server timetable');
	});
	host.querySelector('[data-vell-save]').addEventListener('click', () => {
		const times = [];
		for (const r of host.querySelectorAll('.vell-row')) {
			const day = Number(r.querySelector('.vell-day').value);
			const m = /^(\d{1,2}):(\d{2})$/.exec(r.querySelector('.vell-time').value || '');
			if (day < 0 || !m) continue;
			times.push({ day, hour: Number(m[1]), minute: Number(m[2]) });
		}
		if (!times.length) return toast('Give at least one day and time');
		store.setSetting('vellTimes', times);
		closeDialog();
		toast('Vell timetable saved');
	});
}

/**
 * Correct the reset times for the server you actually play on.
 *
 * NA and EU are known; the other eleven regions are the same assumption
 * with a label, because nobody has published theirs. Rather than guess
 * on a player's behalf, this lets the one person who can see the truth
 * -- the player, looking at their own game -- write it down. The zone is
 * theirs too, so a server that keeps local time survives its own
 * daylight saving without anything here being touched again.
 */
export function openResetsDialog() {
	const { region, plan } = currentResets();
	const label = (REGIONS.find(r => r[0] === region) || ['', region.toUpperCase()])[1];
	const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const hh = h => `${String(h).padStart(2, '0')}:00`;
	const host = openDialog(`
		<h2>When your server's day turns over</h2>
		<p class="dialog-copy">${plan.sure && !plan.custom
			? `NA and EU share one clock and it is UTC — checked ${esc(RESETS_CHECKED)}.`
			: `These are what <b>${esc(label)}</b> is assumed to use: the NA/EU clock. No public source has tested ${esc(label)}, so if your game says otherwise, this is where to say so.`}
			Times are read on the clock you pick, so daylight saving looks after itself.</p>
		<div class="dialog-field"><span>Dailies</span>
			<input class="field" type="time" data-reset-daily value="${esc(hh(plan.daily))}"></div>
		<div class="dialog-field"><span>Barter refill</span>
			<input class="field" type="time" data-reset-barter value="${esc(hh(plan.barter))}"></div>
		<div class="dialog-field"><span>Weeklies</span>
			<select class="field select" data-reset-weekday>
				${DAY_NAMES.map((d, k) => `<option value="${k}"${plan.weekly.day === k ? ' selected' : ''}>${d}</option>`).join('')}
			</select></div>
		<div class="dialog-field"><span>On which clock</span>
			<select class="field select" data-reset-zone>
				<option value="UTC"${plan.zone === 'UTC' ? ' selected' : ''}>UTC — what NA and EU use</option>
				<option value="${esc(mine)}"${plan.zone === mine ? ' selected' : ''}>${esc(mine)} — my own</option>
			</select></div>
		<div class="dialog-actions">
			<button class="ghost-btn" data-reset-default>Use the default</button>
			<button class="ghost-btn" data-close>Cancel</button>
			<button class="act" data-reset-save>Save</button>
		</div>`);
	host.querySelector('[data-reset-default]').addEventListener('click', () => {
		store.setSetting('resetTimes', null);
		closeDialog();
		toast('Back on the default reset times');
	});
	host.querySelector('[data-reset-save]').addEventListener('click', () => {
		const hour = sel => {
			const m = /^(\d{1,2}):/.exec(host.querySelector(sel).value || '');
			return m ? Number(m[1]) : null;
		};
		const daily = hour('[data-reset-daily]');
		const barter = hour('[data-reset-barter]');
		if (daily === null || barter === null) return toast('Both times are needed');
		store.setSetting('resetTimes', {
			zone: host.querySelector('[data-reset-zone]').value,
			daily,
			barter,
			weekly: { day: Number(host.querySelector('[data-reset-weekday]').value), hour: daily }
		});
		closeDialog();
		toast('Reset times saved');
	});
}
