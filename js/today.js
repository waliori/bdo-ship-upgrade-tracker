// Today, at sea: the clocks a sailor plays by, on the Plan screen.
//
// The plan says what is left; this says what today can do about it --
// the dailies still open that pay in something on the list, how long
// until the resets, and how many more days a build is at the pace it
// has been going.

import { esc, F } from './fmt.js';
import { T, TT, said, gameName } from './i18n.js';
import * as store from './state.js';
import { snapshot } from './ui-state.js';
import { quests } from './quests.js';
import { questDone, wantedQuests } from './screen-quests.js';
import { resetPlan, setResetPlan, RESETS_CHECKED } from './clock.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { paceText } from './pace.js';
import { currentShip } from './ship.js';
import { REGIONS, DEFAULT_REGION } from './market.js';

const zoneShort = zone => T('{zone} time', { zone: zone.split('/').pop().replace(/_/g, ' ') });

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
	const when = `${String(plan.daily).padStart(2, '0')}:00 ${zone} · ${said(DAY_NAMES[plan.weekly.day])} · ${String(plan.barter).padStart(2, '0')}:00`;
	const edit = `<button class="linky" data-act="resets-edit">${T('change')}</button>`;
	if (plan.custom) return `${T('{when} — your own times', { when: esc(when) })} · ${edit}`;
	if (plan.sure) return `${T('{label}: {when}, as of {checked}', { label: esc(label), when: esc(when), checked: RESETS_CHECKED })} · ${edit}`;
	return `${T('{label}: assumed the same as NA/EU — {when}. Nobody has published {label}\'s.', { label: esc(label), when: esc(when) })} ${edit}`;
}

const DAY_NAMES = [TT('Sunday'), TT('Monday'), TT('Tuesday'), TT('Wednesday'), TT('Thursday'), TT('Friday'), TT('Saturday')];

/** The same fact as resetNote(), short enough for a tooltip. */
function resetTitle() {
	const { plan } = currentResets();
	const zone = plan.zone === 'UTC' ? 'UTC' : plan.zone;
	const hh = h => `${String(h).padStart(2, '0')}:00`;
	const parts = { daily: hh(plan.daily), zone, barter: hh(plan.barter) };
	return plan.sure
		? T('Dailies reset at {daily} {zone}, the barter refill at {barter}', parts)
		: T('Dailies reset at {daily} {zone}, the barter refill at {barter} — assumed; nobody has published this region\'s', parts);
}

/** The strip itself. */
export function todayStrip() {
	const wanted = wantedQuests();
	const leftAll = quests.filter(q => !questDone(q)).length;
	const left = wanted.filter(q => !questDone(q));
	const questTile = `<div class="today-v">${T('{n} of {total} left', { n: leftAll, total: quests.length })}</div>
			<div class="today-sub">${wanted.length ? T('{n} of them pay in what your plan still wants', { n: left.length }) : T('none of them pays in what you are short of')} · <button class="linky" data-act="view" data-id="quests">${T('open')}</button></div>`;

	const targets = (snapshot.targets || []).filter(t => t.missingUnits > 0);
	const paced = targets.map(t => ({ t, text: paceText(t) })).filter(x => x.text);
	const paceTile = paced.length
		? `<div class="today-v">${esc(gameName(paced[0].t.item))}</div><div class="today-sub">${esc(paced[0].text)}${paced.length > 1 ? ` · ${T('the rest on Builds')}` : ''}</div>`
		: targets.length
			? `<div class="today-v faint">—</div><div class="today-sub">${T('a pace appears after a day of records')}</div>`
			: '';

	const me = currentShip();
	const fitted = me.fit.slots.filter(s => s.part).length + (me.crystal ? 1 : 0);
	const shipTile = `<div class="today-v">${esc(gameName(me.name))}</div>
		<div class="today-sub">${me.speed.total}% · ${T('limit {lt} LT', { lt: esc(F(me.hold.limit)) })} · ${T('{n} of 5 fitted', { n: fitted })}${me.crew.seated ? ` · ${T('{n} aboard', { n: me.crew.seated })}` : ''} · <button class="linky" data-act="view" data-id="crew">${T('fit out')}</button></div>`;
	return `<div class="today">
		<div class="today-k">${T('Today')}</div>
		<div class="today-tiles">
			<div class="today-tile"><div class="summary-k">${T('Your ship')}</div>${shipTile}</div>
			<div class="today-tile"><div class="summary-k">${T('Quests')}</div>${questTile}</div>
			<div class="today-tile"><div class="summary-k">${T('Resets')}</div>
				<div class="today-v">${T('dailies')} <b data-until="daily"></b></div>
				<div class="today-sub">${T('weeklies')} <b data-until="weekly"></b> · ${T('barter refresh')} <b data-until="barter"></b></div>
				<div class="today-sub">${resetNote()}</div></div>
			${paceTile ? `<div class="today-tile"><div class="summary-k">${T('Pace')}</div>${paceTile}</div>` : ''}
		</div>
	</div>`;
}

/** The day in one line, for the tabs that do not carry the strip. */
export function statusLine() {
	const me = currentShip();
	const wanted = wantedQuests();
	const left = wanted.filter(q => !questDone(q)).length;
	const leftAll = quests.filter(q => !questDone(q)).length;
	const targets = (snapshot.targets || []).filter(t => t.missingUnits > 0);
	const paced = targets.map(t => ({ t, text: paceText(t) })).find(x => x.text);
	const bits = [
		`<button class="status-bit" data-act="view" data-id="crew" title="${T('Your ship — hull, parts, crew and setups, on the Ship tab')}">⚓ <b>${esc(gameName(me.name))}</b> ${me.speed.total}% · ${T('{lt} LT', { lt: F(me.hold.limit) })}</button>`,
		`<button class="status-bit" data-act="view" data-id="quests" title="${wanted.length ? T('Quests still to do this period; {n} of them pay in what your plan still wants — short of, or still to craft or buy', { n: left }) : T('Quests still to do this period')}">✦ ${leftAll === 1 ? T('<b>{n}</b> quest left', { n: leftAll }) : T('<b>{n}</b> quests left', { n: leftAll })}${wanted.length ? ` · ${T('<b>{n}</b> for your list', { n: left })}` : ''}</button>`,
		`<span class="status-bit" title="${esc(resetTitle())}">${T('dailies')} <b data-until="daily"></b> · ${T('barter')} <b data-until="barter"></b></span>`,
		paced ? `<button class="status-bit" data-act="view" data-id="builds" title="${esc(paced.text)}">${esc(gameName(paced.t.item))}: <b>${esc(paced.text.replace(/ at the last.*$/, ''))}</b></button>` : ''
	].filter(Boolean);
	return bits.join('<span class="status-sep">·</span>');
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
		<h2>${T('When your server\'s day turns over')}</h2>
		<p class="dialog-copy">${plan.sure && !plan.custom
			? T('NA and EU share one clock and it is UTC — checked {checked}.', { checked: esc(RESETS_CHECKED) })
			: T('These are what <b>{label}</b> is assumed to use: the NA/EU clock. No public source has tested {label}, so if your game says otherwise, this is where to say so.', { label: esc(label) })}
			${T('Times are read on the clock you pick, so daylight saving looks after itself.')}</p>
		<div class="dialog-field"><span>${T('Dailies')}</span>
			<input class="field" type="time" data-reset-daily value="${esc(hh(plan.daily))}"></div>
		<div class="dialog-field"><span>${T('Barter refill')}</span>
			<input class="field" type="time" data-reset-barter value="${esc(hh(plan.barter))}"></div>
		<div class="dialog-field"><span>${T('Weeklies')}</span>
			<select class="field select" data-reset-weekday>
				${DAY_NAMES.map((d, k) => `<option value="${k}"${plan.weekly.day === k ? ' selected' : ''}>${said(d)}</option>`).join('')}
			</select></div>
		<div class="dialog-field"><span>${T('On which clock')}</span>
			<select class="field select" data-reset-zone>
				<option value="UTC"${plan.zone === 'UTC' ? ' selected' : ''}>${T('UTC — what NA and EU use')}</option>
				<option value="${esc(mine)}"${plan.zone === mine ? ' selected' : ''}>${T('{zone} — my own', { zone: esc(mine) })}</option>
			</select></div>
		<div class="dialog-actions">
			<button class="ghost-btn" data-reset-default>${T('Use the default')}</button>
			<button class="ghost-btn" data-close>${T('Cancel')}</button>
			<button class="act" data-reset-save>${T('Save')}</button>
		</div>`);
	host.querySelector('[data-reset-default]').addEventListener('click', () => {
		store.setSetting('resetTimes', null);
		closeDialog();
		toast(T('Back on the default reset times'));
	});
	host.querySelector('[data-reset-save]').addEventListener('click', () => {
		const hour = sel => {
			const m = /^(\d{1,2}):/.exec(host.querySelector(sel).value || '');
			return m ? Number(m[1]) : null;
		};
		const daily = hour('[data-reset-daily]');
		const barter = hour('[data-reset-barter]');
		if (daily === null || barter === null) return toast(T('Both times are needed'));
		store.setSetting('resetTimes', {
			zone: host.querySelector('[data-reset-zone]').value,
			daily,
			barter,
			weekly: { day: Number(host.querySelector('[data-reset-weekday]').value), hour: daily }
		});
		closeDialog();
		toast(T('Reset times saved'));
	});
}
