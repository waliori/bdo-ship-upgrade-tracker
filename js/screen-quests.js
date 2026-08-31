// The Quests screen: what the sea hands out for free, how often, and
// which of it you have already collected today.
//
// Every quest whose reward is a ship material, grouped by how often it
// can be done, searchable by name, place or what it pays, and narrowed
// by what you need, what is still to do, or one reward in particular.
// "Claimed" puts the reward in stock the way a craft does and ticks the
// quest for the day -- one press, one undoable change -- and the tick
// wears off by itself at the reset, because a done list that has to be
// cleared by hand is a list nobody keeps.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { img, codexName } from './ui-bits.js';
import { toast } from './dialogs.js';
import { rows, query } from './ui-state.js';
import { quests, questById, cadenceOf } from './quests.js';
import { periodKey } from './clock.js';

// Session state: which chip is lit, and which reward the list is
// narrowed to, if any.
let filter = 'all';
let payFilter = '';

export function setQuestPay(item) { payFilter = item || ''; }

const CADENCE = [
	['daily', 'Daily', 'once a day', 'daily'],
	['weekly', 'Weekly', 'once a week', 'weekly'],
	['once', 'Once', 'once per family', null]
];

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
	if (kinds.has('short')) return 'pays what you are short of';
	return kinds.has('craft') ? 'pays what you would craft' : 'pays what you would buy';
}

function rewardChips(rewards, short) {
	return Object.entries(rewards).map(([item, n]) => `<span class="reward ${short.has(item) ? 'wanted' : ''}${item === payFilter ? ' lit' : ''}" data-peek="${esc(item)}"
		title="${short.has(item) ? `The plan still wants ${esc(item)}` : esc(item)}">${img(item, 'reward-icon')}<b>${F(n)}×</b> ${codexName(item)}</span>`).join('');
}

const doneWord = q => cadenceOf(q) === 'daily' ? 'done today' : cadenceOf(q) === 'weekly' ? 'done this week' : 'done';

function questRow(q, short, wanted, isDone) {
	const claim = q.choice
		? q.choice.map((c, i) => `<button class="pill-btn" data-act="quest-claim" data-quest="${esc(q.id)}" data-choice="${i}">Claimed, took ${esc(Object.entries(c).map(([item, n]) => `${F(n)}× ${item}`).join(', '))}</button>`).join('')
		: `<button class="pill-btn" data-act="quest-claim" data-quest="${esc(q.id)}">Claimed</button>`;
	const buttons = isDone
		? `<span class="quest-done-tag">✓ ${doneWord(q)}</span>
			<button class="link-btn" data-act="quest-undone" data-quest="${esc(q.id)}" title="Take the tick off without touching your stock">not done</button>`
		: claim;
	return `<div class="quest ${wanted ? 'wanted' : ''}${isDone ? ' done' : ''}">
		<div class="quest-main">
			<div class="quest-name">${esc(q.name)}${wanted ? `<span class="quest-tag">${esc(wanted)}</span>` : ''}</div>
			<div class="quest-where">${esc(q.where)}${q.note ? ` · ${esc(q.note)}` : ''}${q.monster
				? ` · <button class="link-btn" data-act="quest-map" data-monster="${esc(q.monster)}" title="Show where they are on the Map">on the map ↗</button>` : ''}</div>
			<div class="quest-rewards">${rewardChips(q.rewards, short)}${q.choice
				? `<span class="quest-or">and one of</span>${q.choice.map(c => rewardChips(c, short)).join('<span class="quest-or">or</span>')}` : ''}</div>
		</div>
		<div class="quest-actions">${buttons}</div>
	</div>`;
}

/** The reward select: every item any quest pays, the ones on your list
 *  first, each with how many quests pay it. */
function paySelect(need) {
	const count = new Map();
	for (const q of quests) for (const item of new Set(rewardItems(q))) count.set(item, (count.get(item) || 0) + 1);
	const items = [...count.keys()].sort((a, b) => a.localeCompare(b));
	const mine = items.filter(i => need.has(i));
	const rest = items.filter(i => !need.has(i));
	const opt = i => `<option value="${esc(i)}"${i === payFilter ? ' selected' : ''}>${esc(i)} · ${count.get(i)}</option>`;
	return `<select class="field select" data-act="quest-pay" aria-label="Only quests paying in">
		<option value="">Paying in anything</option>
		${mine.length ? `<optgroup label="On your list">${mine.map(opt).join('')}</optgroup>` : ''}
		<optgroup label="${mine.length ? 'Everything else' : 'Every reward'}">${rest.map(opt).join('')}</optgroup>
	</select>`;
}

export function renderQuests() {
	const need = needMap();
	const short = new Set([...need.keys()]);
	const done = store.getProfile('questsDone', {}) || {};
	const wanted = new Map(quests.map(q => [q.id, sparesYou(q, need)]).filter(([, w]) => w));
	const isDone = q => questDone(q, done);
	const q = query.toLowerCase();
	const matches = quest => {
		if (filter === 'wanted' && !wanted.has(quest.id)) return false;
		if (filter === 'left' && isDone(quest)) return false;
		if (filter === 'done' && !isDone(quest)) return false;
		if (['daily', 'weekly', 'once'].includes(filter) && cadenceOf(quest) !== filter) return false;
		if (payFilter && !rewardItems(quest).includes(payFilter)) return false;
		if (!q) return true;
		const hay = [quest.name, quest.where, quest.repeat, quest.note || '', quest.monster || '', ...rewardItems(quest)].join(' ').toLowerCase();
		return hay.includes(q);
	};
	const shown = quests.filter(matches);
	const leftCount = quests.filter(quest => !isDone(quest)).length;
	const wantedLeft = [...wanted.keys()].filter(id => !isDone(questById[id])).length;

	const chips = [
		['all', 'All'],
		['left', `Still to do · ${leftCount}`],
		['wanted', `Pays what I need${wantedLeft ? ` · ${wantedLeft}` : ''}`],
		...CADENCE.map(([id, label]) => [id, label]),
		['done', 'Done']
	].map(([id, label]) => `<button class="chip ${filter === id ? 'active' : ''}" data-act="quest-filter" data-id="${id}">${label}</button>`).join('');

	const groups = CADENCE.map(([id, label, sub, clock]) => {
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
			? `<div class="quest-chain">Ravinia's log: ${ravinia.filter(isDone).length} of ${ravinia.length} letters recorded</div>` : '';
		return `<div class="panel">
			<div class="panel-head">
				<h2 class="panel-title ${id === 'daily' ? 'teal' : id === 'weekly' ? 'blue' : 'amber'}">${label}</h2>
				<span class="panel-sub">${list.length} quest${list.length === 1 ? '' : 's'} · ${esc(sub)}${doneN ? ` · ${doneN} done` : ''}${clock
					? ` · resets in <b data-until="${clock}"></b>` : ''}</span>
			</div>
			${chain}
			${list.map(quest => questRow(quest, short, wanted.get(quest.id), isDone(quest))).join('')}
			<div class="quest-total"><span>All ${list.length} together${id === 'daily' ? ', each day' : id === 'weekly' ? ', each week' : ''}:</span> ${rewardChips(total, short)}</div>
		</div>`;
	}).join('');

	const clocks = `<div class="quest-clocks">
		<span>Dailies reset in <b data-until="daily"></b></span>
		<span>weeklies <b data-until="weekly"></b></span>
		<span>barter refresh <b data-until="barter"></b></span>
		<span class="quest-clocks-note">00:00 UTC · Thursday 00:00 UTC · 06:00 UTC</span>
	</div>`;

	const nothing = q ? 'No quest matches that search.'
		: payFilter ? `No quest pays in ${payFilter} under that filter.`
		: filter === 'left' ? 'Everything is done for now — the ticks wear off at the reset.'
		: filter === 'done' ? 'Nothing ticked yet. Claim a reward and it lands here.'
		: 'Nothing pays in what you are short of right now.';

	return `${clocks}<div class="controls">
		<input class="field" type="search" placeholder="Search quests, places and rewards…" value="${esc(query)}" data-act="query">
		${paySelect(need)}
		<div class="chips">${chips}</div>
	</div>
	${groups || `<div class="panel"><p class="empty">${esc(nothing)}</p></div>`}`;
}

/** Every quest-* click. Returns false for one this screen does not own. */
export function questAction(act, el) {
	if (act === 'quest-filter') {
		filter = el.dataset.id;
		return true;
	}
	if (act === 'quest-claim') {
		const q = questById[el.dataset.quest];
		if (!q) return true;
		const delta = { ...q.rewards };
		const pick = q.choice && q.choice[Number(el.dataset.choice)];
		if (pick) for (const [item, n] of Object.entries(pick)) delta[item] = (delta[item] || 0) + n;
		store.claimQuest(q.id, delta, periodKey(cadenceOf(q)), `Claimed ${q.name}`);
		toast(`Recorded the reward for ${q.name} — ${doneWord(q)}`, true);
		return true;
	}
	if (act === 'quest-undone') {
		const q = questById[el.dataset.quest];
		if (q) store.unclaimQuest(q.id, `${q.name} — not done`);
		return true;
	}
	return false;
}
