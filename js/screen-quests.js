// The Quests screen: what the sea hands out for free, how often, and
// which of it you have already collected today.
//
// Every quest whose reward is a ship material, grouped by how often it
// can be done, searchable by name, place or what it pays, and narrowed
// by what you need, what is still to do, or one reward in particular.
// "Claimed" puts the reward in stock the way a craft does and ticks the
// quest for the day -- one press, one undoable change -- and the tick
// wears off by itself at the reset, because a done list that has to be
// cleared by hand is a list nobody keeps. A pick-one reward is
// remembered, so next time the same choice is one press too; quests can
// be ticked several at a time and finished together; and a set that is
// run every day can be starred, or kept as a named group.

import { esc, F } from './fmt.js';
import { T, said, gameName } from './i18n.js';
import * as store from './state.js';
import { img, codexName } from './ui-bits.js';
import { toast, openDialog, closeDialog } from './dialogs.js';
import { rows, query } from './ui-state.js';
import { quests, questById, cadenceOf } from './quests.js';
import { periodKey } from './clock.js';
import { openPicker } from './picker.js';

// Session state: which chip is lit, which rewards the list is narrowed
// to, and which quests are ticked for finishing together.
let filter = 'all';
let payFilter = [];   // reward items the list is narrowed to; empty for all
let selected = new Set();

let focus = '';   // a quest to show first, sent from another tab

/** A quest sent for from another tab: shown whatever the filters say,
 *  lit, and scrolled to on the next draw. */
export function setQuestFocus(id) { focus = questById[id] ? id : ''; if (focus) { filter = 'all'; payFilter = []; } }

export function setQuestPay(items) { payFilter = Array.isArray(items) ? items : items ? [items] : []; }

const CADENCE = [
	['daily', 'Daily', 'once a day', 'daily'],
	['weekly', 'Weekly', 'once a week', 'weekly'],
	['once', 'Once', 'once per family', null]
];

const cadenceLabel = id => (id === 'daily' ? T('Daily') : id === 'weekly' ? T('Weekly') : T('Once'));
const cadenceSub = id => (id === 'daily' ? T('once a day') : id === 'weekly' ? T('once a week') : T('once per family'));

const picks = () => store.getProfile('questPicks', {}) || {};
const favs = () => store.getProfile('questFavs', []) || [];
const groups = () => store.getProfile('questGroups', {}) || {};
const codexURL = q => q.codex ? `https://bdocodex.com/us/quest/${q.codex}/` : null;

/** Whether a quest is done for the period it is in right now. */
export function questDone(q, done = store.getProfile('questsDone', {}) || {}) {
	return done[q.id] === periodKey(cadenceOf(q));
}

/** Everything the plan still wants, by how it would get it: with no
 *  route at all ("short"), by a craft still to do, or by a purchase. */
export function needMap() {
	const need = new Map();
	for (const [item, r] of Object.entries(rows)) {
		if (r.short > 0) need.set(item, 'short');
		else if (r.craft > 0) need.set(item, 'craft');
		else if (r.need - r.take > 0) need.set(item, 'buy');
	}
	return need;
}

const rewardItems = q => [...Object.keys(q.rewards), ...(q.choice || []).flatMap(c => Object.keys(c))];

/** What a quest's reward would spare you: "short of" when the plan has
 *  no way to get it, "to craft" or "to buy" when it does but you have
 *  not yet -- a quest that pays in Violent Wave Plywood saves the craft
 *  as surely as one that pays in a thing you cannot make. */
function sparesYou(q, need) {
	const kinds = new Set(rewardItems(q).map(i => need.get(i)).filter(Boolean));
	if (!kinds.size) return '';
	if (kinds.has('short')) return T('pays what you are short of');
	return kinds.has('craft') ? T('pays what you would craft') : T('pays what you would buy');
}

/** The quests that pay in something the plan still wants -- the one
 *  list the tab badge, the Today strip and the "Pays what I need" chip
 *  all count from. */
export function wantedQuests(need = needMap()) {
	return quests.filter(q => sparesYou(q, need));
}

function rewardChips(rewards, short) {
	return Object.entries(rewards).map(([item, n]) => `<span class="reward ${short.has(item) ? 'wanted' : ''}${payFilter.includes(item) ? ' lit' : ''}" data-peek="${esc(item)}"
		title="${short.has(item) ? T('The plan still wants {item}', { item: esc(gameName(item)) }) : esc(gameName(item))}">${img(item, 'reward-icon')}<b>${F(n)}×</b> ${codexName(item)}</span>`).join('');
}

const doneWord = q => cadenceOf(q) === 'daily' ? T('done today') : cadenceOf(q) === 'weekly' ? T('done this week') : T('done');

/** The pick-one reward remembered for a quest, if it still exists. */
function recalled(q) {
	const i = picks()[q.id];
	return q.choice && Number.isInteger(i) && q.choice[i] ? { i, item: Object.entries(q.choice[i])[0] } : null;
}

function questRow(q, short, wanted, isDone) {
	const last = recalled(q);
	const claim = q.choice
		? (last
			? `<button class="pill-btn" data-act="quest-claim" data-quest="${esc(q.id)}" title="${T('Record it with {item} again, as last time', { item: esc(gameName(last.item[0])) })}">${T('Claimed')}</button>
				<button class="link-btn" data-act="quest-claim-pick" data-quest="${esc(q.id)}" title="${T('Took a different reward this time')}">${T('other reward…')}</button>`
			: `<button class="pill-btn" data-act="quest-claim-pick" data-quest="${esc(q.id)}" title="${T('Which of the pick-one rewards you took')}">${T('Claimed')} ▾</button>`)
		: `<button class="pill-btn" data-act="quest-claim" data-quest="${esc(q.id)}">${T('Claimed')}</button>`;
	const buttons = isDone
		? `<span class="quest-done-tag">✓ ${doneWord(q)}</span>
			<button class="link-btn" data-act="quest-undone" data-quest="${esc(q.id)}" title="${T('Take the tick off without touching your stock')}">${T('not done')}</button>`
		: claim;
	const fav = favs().includes(q.id);
	const url = codexURL(q);
	const name = url
		? `<a class="quest-codex" href="${url}" target="_blank" rel="noopener" title="${T('Open on BDOCodex')}">${esc(gameName(q.name))}</a>`
		: esc(gameName(q.name));
	return `<div class="quest ${wanted ? 'wanted' : ''}${isDone ? ' done' : ''}${selected.has(q.id) ? ' selected' : ''}${focus === q.id ? ' focus' : ''}" data-quest-id="${esc(q.id)}">
		<input type="checkbox" class="quest-check" data-act="quest-check" data-quest="${esc(q.id)}" ${selected.has(q.id) ? 'checked' : ''} ${isDone ? 'disabled' : ''} aria-label="${T('Tick {name} to finish it with others', { name: esc(gameName(q.name)) })}">
		<button class="quest-star${fav ? ' on' : ''}" data-act="quest-fav" data-quest="${esc(q.id)}" aria-pressed="${fav}" title="${fav ? T('A favourite — click to unstar') : T('Star it: favourites have a chip of their own')}">★</button>
		<div class="quest-main">
			<div class="quest-name">${name}${wanted ? `<span class="quest-tag">${esc(wanted)}</span>` : ''}</div>
			<div class="quest-where">${esc(said(q.where))}${q.note ? ` · ${esc(said(q.note))}` : ''}${q.monster
				? ` · <button class="link-btn" data-act="quest-map" data-monster="${esc(q.monster)}" title="${T('Show where they are on the Map')}">${T('on the map')} ↗</button>` : ''}</div>
			<div class="quest-rewards">${rewardChips(q.rewards, short)}${q.choice
				? `<span class="quest-or">${T('and one of')}</span>${q.choice.map(c => rewardChips(c, short)).join(`<span class="quest-or">${T('or')}</span>`)}` : ''}</div>
			${q.choice ? (last
				? `<div class="quest-recall">${T('You take {n}× {item} — Claimed records that again.', { n: F(last.item[1]), item: esc(gameName(last.item[0])) })} <button class="link-btn" data-act="quest-pick-set" data-quest="${esc(q.id)}" title="${T('Keep a different reward as the favourite')}">${T('change')}</button></div>`
				: `<div class="quest-recall">${T('Claimed will ask which reward.')} <button class="link-btn" data-act="quest-pick-set" data-quest="${esc(q.id)}" title="${T('Answer once now; every claim after is one press')}">${T('choose ahead')}</button></div>`) : ''}
		</div>
		<div class="quest-actions">${buttons}</div>
	</div>`;
}

/** Every item any quest pays, with how many pay it. */
function payCounts() {
	const count = new Map();
	for (const q of quests) for (const item of new Set(rewardItems(q))) count.set(item, (count.get(item) || 0) + 1);
	return count;
}

/** The reward filter: a button that opens a picker with pictures, and a
 *  chip per item chosen, each with its own ×. */
function payControl() {
	const chips = payFilter.map(item => `<span class="reward lit pay-chip" data-peek="${esc(item)}">${img(item, 'reward-icon')}${esc(gameName(item))}
		<button class="map-x" data-act="quest-pay-del" data-item="${esc(item)}" aria-label="${T('Stop filtering by {item}', { item: esc(gameName(item)) })}">×</button></span>`).join('');
	return `<button class="ghost-btn" data-act="quest-pay-pick" title="${T('Only the quests that pay in the items you choose')}">${payFilter.length ? (payFilter.length === 1 ? T('Paying in {n} item', { n: payFilter.length }) : T('Paying in {n} items', { n: payFilter.length })) : T('Paying in…')}</button>${chips}`;
}

/** The named groups, each a chip that ticks its quests; and a × to forget one. */
function groupsRow() {
	const g = groups();
	const names = Object.keys(g);
	if (!names.length) return '';
	return `<div class="quest-groups"><span class="summary-k">${T('Groups')}</span>${names.map(name => `<span class="quest-group">
		<button class="chip" data-act="quest-group-pick" data-name="${esc(name)}" title="${T('Tick every quest in {name} that is still to do', { name: esc(name) })}">${esc(name)} · ${g[name].length}</button>
		<button class="map-x" data-act="quest-group-del" data-name="${esc(name)}" aria-label="${T('Forget the group {name}', { name: esc(name) })}">×</button></span>`).join('')}</div>`;
}

/** The bar above the list while quests are ticked. */
function bulkBar(isDone) {
	const ids = [...selected].filter(id => questById[id] && !isDone(questById[id]));
	if (!ids.length) return '';
	const asking = ids.filter(id => questById[id].choice && !recalled(questById[id])).length;
	return `<div class="quest-bulk">${T('<b>{n}</b> ticked', { n: ids.length })}
		<button class="act go small" data-act="quest-finish" title="${T('Record every ticked quest as done, rewards into stock, in one undoable change')}">${T('Finish {n}', { n: ids.length })}</button>
		${asking ? `<span class="row-sub">${T('{n} of them will ask which reward you took', { n: asking })}</span>
		<button class="link-btn" data-act="quest-pick-all" title="${T('Answer each one now — Finish then runs in one go')}">${T('choose now…')}</button>` : ''}
		<span class="panel-spacer"></span>
		<button class="act quiet small" data-act="quest-group-save" title="${T('Keep these as a named group to tick again in one go')}">${T('Save as group…')}</button>
		<button class="link-btn" data-act="quest-select-none">${T('untick all')}</button>
	</div>`;
}

/** Open the picker: the ones on your list first, then the rest. */
function openPayPicker(need) {
	const count = payCounts();
	const items = [...count.keys()].sort((a, b) => (need.has(b) ? 1 : 0) - (need.has(a) ? 1 : 0) || a.localeCompare(b))
		.map(item => ({ id: item, label: gameName(item), icon: img(item, ''), sub: count.get(item) === 1 ? T('{n} quest pay it', { n: count.get(item) }) : T('{n} quests pay it', { n: count.get(item) }),
			meta: need.get(item) === 'short' ? T('short of it') : need.get(item) === 'craft' ? T('would craft') : need.get(item) === 'buy' ? T('would buy') : '',
			group: need.has(item) ? T('On your list') : T('Everything else') }));
	openPicker({
		title: T('Only quests paying in…'), hint: T('Tick as many as you like; a quest shows if it pays in any of them.'),
		items, multi: true, selected: payFilter, apply: T('Show those quests'),
		onPick: chosen => { setQuestPay(chosen); document.dispatchEvent(new CustomEvent('quests-refilter')); }
	});
}

/**
 * The quests the screen is showing: the chip, the pay filter and the
 * search, all applied. One function, so "tick all N" ticks the N it
 * counted rather than a list of its own.
 */
function shownQuests() {
	const need = needMap();
	const done = store.getProfile('questsDone', {}) || {};
	const wanted = new Map(quests.map(q => [q.id, sparesYou(q, need)]).filter(([, w]) => w));
	const isDone = q => questDone(q, done);
	const starred = favs();
	const q = query.toLowerCase();
	const matches = quest => {
		if (filter === 'wanted' && !wanted.has(quest.id)) return false;
		if (filter === 'left' && isDone(quest)) return false;
		if (filter === 'done' && !isDone(quest)) return false;
		if (filter === 'fav' && !starred.includes(quest.id)) return false;
		if (['daily', 'weekly', 'once'].includes(filter) && cadenceOf(quest) !== filter) return false;
		if (payFilter.length && !rewardItems(quest).some(i => payFilter.includes(i))) return false;
		if (!q) return true;
		const hay = [quest.name, quest.where, quest.repeat, quest.note || '', quest.monster || '', ...rewardItems(quest)].join(' ').toLowerCase();
		return hay.includes(q);
	};
	return { shown: quests.filter(matches), need, done, wanted, isDone, starred };
}

export function renderQuests() {
	const { shown, need, wanted, isDone, starred } = shownQuests();
	if (focus) {
		const id = focus;
		setTimeout(() => { const el = [...document.querySelectorAll(".quest[data-quest-id]")].find(x => x.dataset.questId === id); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); focus = ''; }, 50);
	}
	const short = new Set([...need.keys()]);
	const q = query.toLowerCase();
	const leftCount = quests.filter(quest => !isDone(quest)).length;
	const wantedLeft = [...wanted.keys()].filter(id => !isDone(questById[id])).length;
	const favLeft = starred.filter(id => questById[id] && !isDone(questById[id])).length;

	const chips = [
		['all', T('All')],
		['left', `${T('Still to do')} · ${leftCount}`],
		['wanted', `${T('Pays what I need')}${wantedLeft ? ` · ${wantedLeft}` : ''}`],
		['fav', `★ ${T('Favourites')}${starred.length ? ` · ${favLeft}` : ''}`],
		...CADENCE.map(([id]) => [id, cadenceLabel(id)]),
		['done', T('Done')]
	].map(([id, label]) => `<button class="chip ${filter === id ? 'active' : ''}" data-act="quest-filter" data-id="${id}" aria-pressed="${filter === id}">${label}</button>`).join('');

	const groupsHTML = CADENCE.map(([id, , , clock]) => {
		const list = shown.filter(quest => cadenceOf(quest) === id)
			.sort((a, b) => Number(isDone(a)) - Number(isDone(b))
				|| Number(wanted.has(b.id)) - Number(wanted.has(a.id))
				|| a.name.localeCompare(b.name));
		if (!list.length) return '';
		const doneN = list.filter(isDone).length;
		// What a full round of this cadence pays, added up -- the fixed
		// rewards only; a pick-one is not a sum.
		const total = {};
		for (const quest of list) for (const [item, n] of Object.entries(quest.rewards)) total[item] = (total[item] || 0) + n;
		const ravinia = id === 'once' ? quests.filter(x => x.id.startsWith('ravinia')) : [];
		const chain = ravinia.length
			? `<div class="quest-chain">${T("Ravinia's log: {done} of {total} letters recorded", { done: ravinia.filter(isDone).length, total: ravinia.length })}</div>` : '';
		const open = list.filter(x => !isDone(x));
		return `<div class="panel">
			<div class="panel-head">
				<h2 class="panel-title ${id === 'daily' ? 'teal' : id === 'weekly' ? 'blue' : 'amber'}">${cadenceLabel(id)}</h2>
				<span class="panel-sub">${list.length === 1 ? T('{n} quest', { n: list.length }) : T('{n} quests', { n: list.length })} · ${esc(cadenceSub(id))}${doneN ? ` · ${T('{n} done', { n: doneN })}` : ''}${clock
					? ` · ${T('resets in <b data-until="{clock}"></b>', { clock })}` : ''}</span>
				${open.length > 1 ? `<span class="panel-spacer"></span><button class="link-btn" data-act="quest-select-shown" data-cadence="${id}" title="${T('Tick every {cadence} quest shown that is still to do', { cadence: cadenceLabel(id).toLowerCase() })}">${T('tick all {n}', { n: open.length })}</button>` : ''}
			</div>
			${chain}
			${list.map(quest => questRow(quest, short, wanted.get(quest.id), isDone(quest))).join('')}
			<div class="quest-total"><span>${id === 'daily' ? T('All {n} together, each day:', { n: list.length }) : id === 'weekly' ? T('All {n} together, each week:', { n: list.length }) : T('All {n} together:', { n: list.length })}</span> ${rewardChips(total, short)}</div>
		</div>`;
	}).join('');

	const clocks = `<div class="quest-clocks">
		<span>${T('Dailies reset in <b data-until="daily"></b>')}</span>
		<span>${T('weeklies <b data-until="weekly"></b>')}</span>
		<span>${T('barter refresh <b data-until="barter"></b>')}</span>
		<span class="quest-clocks-note">${T('00:00 UTC · Thursday 00:00 UTC · 06:00 UTC')}</span>
	</div>`;

	const nothing = q ? T('No quest matches that search.')
		: payFilter.length ? T('No quest pays in {items} under that filter.', { items: payFilter.map(item => gameName(item)).join(` ${T('or')} `) })
		: filter === 'left' ? T('Everything is done for now — the ticks wear off at the reset.')
		: filter === 'done' ? T('Nothing ticked yet. Claim a reward and it lands here.')
		: filter === 'fav' ? T('No favourites yet — star a quest and it lands here.')
		: T('Nothing pays in what you are short of right now.');

	return `${clocks}<div class="controls">
		<input class="field" type="search" placeholder="${T('Search quests, places and rewards…')}" value="${esc(query)}" data-act="query" aria-label="${T('Search quests, places and rewards')}">
		<div class="chips">${chips}</div>
		<div class="pay-row">${payControl()}</div>
		${groupsRow()}
	</div>
	${bulkBar(isDone)}
	${groupsHTML || `<div class="panel"><p class="empty">${esc(nothing)}</p></div>`}`;
}

/** The change one claim makes to stock: the fixed rewards, plus the
 *  pick-one at `choice`. */
function claimDelta(q, choice) {
	const delta = { ...q.rewards };
	const pick = choice !== null && q.choice && q.choice[choice];
	if (pick) for (const [item, n] of Object.entries(pick)) delta[item] = (delta[item] || 0) + n;
	return delta;
}

/** Record a claim: the fixed rewards, plus the pick-one at `choice`,
 *  which is remembered for next time. */
function claim(q, choice) {
	if (q.choice && Number.isInteger(choice)) store.setProfileQuiet('questPicks', { ...picks(), [q.id]: choice });
	store.claimQuest(q.id, claimDelta(q, choice), periodKey(cadenceOf(q)), T('Claimed {name}', { name: gameName(q.name) }));
	selected.delete(q.id);
	toast(T('Recorded the reward for {name} — {when}', { name: gameName(q.name), when: doneWord(q) }), true);
	document.dispatchEvent(new CustomEvent('quests-refilter'));
}

/** The reward a quest hands over when claimed without asking: the fixed
 *  rewards plus the pick-one remembered for it; null when a pick is
 *  wanted and none is remembered. */
export function rewardOf(q) {
	const last = recalled(q);
	if (q.choice && !last) return null;
	return claimDelta(q, last ? last.i : null);
}

/** Ask which pick-one reward was taken; resolves to the index, or null
 *  when the picker is closed without an answer. */
function askChoice(q, need, title = T('Which reward did you take?')) {
	const last = recalled(q);
	return new Promise(resolve => {
		let answered = false;
		openPicker({
			title,
			hint: T('{name} pays {rewards} and one of these. Your pick is kept as the favourite — one press claims it next time, and Finish uses it without asking.', { name: esc(gameName(q.name)), rewards: esc(Object.entries(q.rewards).map(([item, n]) => `${F(n)}× ${gameName(item)}`).join(', ')) }),
			items: q.choice.map((c, i) => {
				const [item, n] = Object.entries(c)[0];
				return { id: String(i), label: `${F(n)}× ${gameName(item)}`, icon: img(item, ''), meta: last && last.i === i ? T('last time') : need.get(item) === 'short' ? T('short of it') : need.get(item) ? T('on your list') : '' };
			}),
			selected: last ? [String(last.i)] : [],
			onPick: i => { answered = true; resolve(Number(i)); },
			onClose: () => { if (!answered) resolve(null); }
		});
	});
}

/** Keep a favourite without claiming: the pick is remembered, the
 *  stock untouched. Claimed and Finish then run on it in one press. */
async function choosePick(q) {
	const i = await askChoice(q, needMap(), T('Which reward do you take?'));
	if (i === null) return;
	store.setProfileQuiet('questPicks', { ...picks(), [q.id]: i });
	document.dispatchEvent(new CustomEvent('quests-refilter'));
}

/** Answer for every ticked quest that would ask, one picker after
 *  another; closing one stops the walk with the earlier answers kept. */
async function chooseAllPicks() {
	const done = store.getProfile('questsDone', {}) || {};
	const need = needMap();
	for (const id of [...selected]) {
		const q = questById[id];
		if (!q || !q.choice || recalled(q) || questDone(q, done)) continue;
		const i = await askChoice(q, need, T('Which reward do you take?'));
		if (i === null) break;
		store.setProfileQuiet('questPicks', { ...picks(), [q.id]: i });
	}
	document.dispatchEvent(new CustomEvent('quests-refilter'));
}

/** Finish every ticked quest: the recalled choice where there is one,
 *  a question where there is not, then one change for the lot. */
async function finishSelected() {
	const done = store.getProfile('questsDone', {}) || {};
	const list = [...selected].map(id => questById[id]).filter(q => q && !questDone(q, done));
	if (!list.length) return;
	const need = needMap();
	const entries = [];
	const remembered = { ...picks() };
	for (const q of list) {
		let choice = null;
		if (q.choice) {
			const last = recalled(q);
			choice = last ? last.i : await askChoice(q, need);
			if (choice === null) continue;   // closed the question: this one stays open
			remembered[q.id] = choice;
		}
		entries.push({ id: q.id, key: periodKey(cadenceOf(q)), delta: claimDelta(q, choice) });
	}
	if (!entries.length) return;
	store.setProfileQuiet('questPicks', remembered);
	store.claimQuests(entries, entries.length === 1 ? T('Finished {n} quest', { n: entries.length }) : T('Finished {n} quests', { n: entries.length }));
	for (const e of entries) selected.delete(e.id);
	toast(entries.length === 1 ? T('Recorded {n} quest — rewards in stock', { n: entries.length }) : T('Recorded {n} quests — rewards in stock', { n: entries.length }), true);
	document.dispatchEvent(new CustomEvent('quests-refilter'));
}

function saveGroupDialog() {
	const ids = [...selected].filter(id => questById[id]);
	if (!ids.length) return;
	const host = openDialog(`
		<h2>${T('Keep these {n} as a group', { n: ids.length })}</h2>
		<p class="dialog-copy">${T('A group is a chip on the Quests tab: one click ticks every quest in it that is still to do, and Finish records them together.')}</p>
		<input class="field" type="text" maxlength="30" placeholder="${T('A name — “Morning dailies”')}" data-quest-group-name>
		<div class="dialog-actions">
			<button class="ghost-btn" data-close>${T('Cancel')}</button>
			<button class="act" data-quest-group-save>${T('Keep it')}</button>
		</div>`);
	const input = host.querySelector('[data-quest-group-name]');
	input.focus();
	const save = () => {
		const name = input.value.trim().slice(0, 30);
		if (!name) return toast(T('Give it a name'));
		store.setProfileQuiet('questGroups', { ...groups(), [name]: ids });
		closeDialog();
		toast(T('Kept {name}', { name }));
		document.dispatchEvent(new CustomEvent('quests-refilter'));
	};
	host.querySelector('[data-quest-group-save]').addEventListener('click', save);
	input.addEventListener('keydown', evt => { if (evt.key === 'Enter') save(); });
}

/** Every quest-* click. Returns false for one this screen does not own. */
export function questAction(act, el) {
	if (act === 'quest-filter') {
		filter = el.dataset.id;
		return true;
	}
	if (act === 'quest-pay-pick') {
		openPayPicker(needMap());
		return true;
	}
	if (act === 'quest-pay-del') {
		payFilter = payFilter.filter(i => i !== el.dataset.item);
		return true;
	}
	if (act === 'quest-check') {
		const id = el.dataset.quest;
		if (selected.has(id)) selected.delete(id); else selected.add(id);
		return true;
	}
	if (act === 'quest-select-none') {
		selected = new Set();
		return true;
	}
	if (act === 'quest-select-shown') {
		const cadence = el.dataset.cadence;
		const { shown, isDone } = shownQuests();
		for (const q of shown) {
			if (cadenceOf(q) !== cadence || isDone(q)) continue;
			selected.add(q.id);
		}
		return true;
	}
	if (act === 'quest-fav') {
		const id = el.dataset.quest;
		const list = favs();
		store.setProfileQuiet('questFavs', list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
		return true;
	}
	if (act === 'quest-group-pick') {
		const ids = groups()[el.dataset.name] || [];
		const done = store.getProfile('questsDone', {}) || {};
		let n = 0;
		for (const id of ids) if (questById[id] && !questDone(questById[id], done)) { selected.add(id); n++; }
		toast(n ? T('{n} of {name} ticked', { n, name: el.dataset.name }) : T('Everything in {name} is done for now', { name: el.dataset.name }));
		return true;
	}
	if (act === 'quest-group-del') {
		const g = { ...groups() };
		delete g[el.dataset.name];
		store.setProfileQuiet('questGroups', Object.keys(g).length ? g : null);
		return true;
	}
	if (act === 'quest-group-save') {
		saveGroupDialog();
		return true;
	}
	if (act === 'quest-finish') {
		finishSelected();
		return true;
	}
	if (act === 'quest-pick-set') {
		const q = questById[el.dataset.quest];
		if (q && q.choice) choosePick(q);
		return true;
	}
	if (act === 'quest-pick-all') {
		chooseAllPicks();
		return true;
	}
	if (act === 'quest-claim-pick') {
		const q = questById[el.dataset.quest];
		if (!q || !q.choice) return true;
		askChoice(q, needMap()).then(i => { if (i !== null) claim(q, i); });
		return true;
	}
	if (act === 'quest-claim') {
		const q = questById[el.dataset.quest];
		if (!q) return true;
		const last = recalled(q);
		if (q.choice && !last) askChoice(q, needMap()).then(i => { if (i !== null) claim(q, i); });
		else claim(q, last ? last.i : null);
		return true;
	}
	if (act === 'quest-undone') {
		const q = questById[el.dataset.quest];
		if (q) store.unclaimQuest(q.id, `${q.name} — not done`);
		return true;
	}
	return false;
}
