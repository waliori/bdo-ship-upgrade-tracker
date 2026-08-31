// Today, at sea: the clocks a sailor plays by, on the Plan screen.
//
// The plan says what is left; this says what today can do about it --
// the dailies still open that pay in something on the list, how long
// until the resets, when Vell is next up on this player's servers, and
// how many more days a build is at the pace it has been going.

import { esc } from './fmt.js';
import * as store from './state.js';
import { snapshot } from './ui-state.js';
import { questsFor } from './quests.js';
import { questDone } from './screen-quests.js';
import { VELL, VELL_CHECKED, nextSpawn, timeLabel, localLabel } from './clock.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { paceText } from './pace.js';
import { REGIONS } from './market.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const zoneShort = zone => `${zone.split('/').pop().replace(/_/g, ' ')} time`;

/** The timetable in force: the player's own if they set one (kept on
 *  their own clock), else the server's for the Market region they
 *  chose, else nothing -- an unknown region gets no guess. */
export function vellPlan() {
	const custom = store.getSetting('vellTimes', null);
	if (Array.isArray(custom) && custom.length) {
		return { label: 'your own', zone: Intl.DateTimeFormat().resolvedOptions().timeZone, times: custom, custom: true };
	}
	const region = String(store.getSetting('marketRegion', 'eu') || 'eu').replace('console_', '');
	return VELL[region] ? { ...VELL[region], custom: false } : null;
}

function vellTile() {
	const plan = vellPlan();
	const regionId = store.getSetting('marketRegion', 'eu');
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
	return `<div class="today-v">${esc(localLabel(next.at))} <span class="today-in">in <b data-until="at" data-at="${next.at}"></b></span></div>
		<div class="today-sub">${source} · ${edit}</div>`;
}

/** The strip itself. */
export function todayStrip() {
	const wanted = questsFor(snapshot.missing);
	const left = wanted.filter(q => !questDone(q));
	const questTile = wanted.length
		? `<div class="today-v">${left.length} ${left.length === 1 ? 'quest' : 'quests'} left</div>
			<div class="today-sub">of ${wanted.length} that pay in what you need · <button class="linky" data-act="view" data-id="quests">open</button></div>`
		: `<div class="today-v faint">—</div><div class="today-sub">no quest pays in what you are short of</div>`;

	const targets = (snapshot.targets || []).filter(t => t.missingUnits > 0);
	const paced = targets.map(t => ({ t, text: paceText(t) })).filter(x => x.text);
	const paceTile = paced.length
		? `<div class="today-v">${esc(paced[0].t.item)}</div><div class="today-sub">${esc(paced[0].text)}${paced.length > 1 ? ' · the rest on Builds' : ''}</div>`
		: targets.length
			? `<div class="today-v faint">—</div><div class="today-sub">a pace appears after a day of records</div>`
			: '';

	return `<div class="today">
		<div class="today-k">Today</div>
		<div class="today-tiles">
			<div class="today-tile"><div class="summary-k">Quests</div>${questTile}</div>
			<div class="today-tile"><div class="summary-k">Resets</div>
				<div class="today-v">dailies <b data-until="daily"></b></div>
				<div class="today-sub">weeklies <b data-until="weekly"></b> · barter refresh <b data-until="barter"></b></div></div>
			<div class="today-tile"><div class="summary-k">Vell</div>${vellTile()}</div>
			${paceTile ? `<div class="today-tile"><div class="summary-k">Pace</div>${paceTile}</div>` : ''}
		</div>
	</div>`;
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
