// The Quests screen: what the sea hands out for free, and how often.
//
// Every quest whose reward is a ship material, grouped by how often it
// can be done, searchable by name or by what it pays, and filterable to
// the ones that pay in something the plan is short of. "Claimed" puts
// the reward in stock the way a craft does -- one press, one undoable
// change -- because a letter opened in the game is stock the plan
// should know about the moment it lands.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { img, codexName } from './ui-bits.js';
import { toast } from './dialogs.js';
import { rows, query } from './ui-state.js';
import { quests, questById, cadenceOf } from './quests.js';

// Session state: which cadence chip is lit.
let filter = 'all';

const CADENCE = [
	['daily', 'Daily', 'once a day, from 06:00 UTC'],
	['weekly', 'Weekly', 'once a week'],
	['once', 'Once', 'once per family']
];

function rewardChips(rewards, short) {
	return Object.entries(rewards).map(([item, n]) => `<span class="reward ${short.has(item) ? 'wanted' : ''}" data-peek="${esc(item)}"
		title="${short.has(item) ? `The plan still wants ${esc(item)}` : esc(item)}">${img(item, 'reward-icon')}<b>${F(n)}×</b> ${codexName(item)}</span>`).join('');
}

/** What a quest's reward would spare you: "short of" when the plan has
 *  no way to get it, "to craft" or "to buy" when it does but you have
 *  not yet -- a quest that pays in Violent Wave Plywood saves the craft
 *  as surely as one that pays in a thing you cannot make. */
function sparesYou(q, need) {
	const items = [...Object.keys(q.rewards), ...(q.choice || []).flatMap(c => Object.keys(c))];
	const kinds = new Set(items.map(i => need.get(i)).filter(Boolean));
	if (!kinds.size) return '';
	if (kinds.has('short')) return 'pays what you are short of';
	return kinds.has('craft') ? 'pays what you would craft' : 'pays what you would buy';
}

function questRow(q, short, wanted) {
	const buttons = q.choice
		? q.choice.map((c, i) => `<button class="pill-btn" data-act="quest-claim" data-quest="${esc(q.id)}" data-choice="${i}">Claimed, took ${esc(Object.entries(c).map(([item, n]) => `${F(n)}× ${item}`).join(', '))}</button>`).join('')
		: `<button class="pill-btn" data-act="quest-claim" data-quest="${esc(q.id)}">Claimed</button>`;
	return `<div class="quest ${wanted ? 'wanted' : ''}">
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

export function renderQuests() {
	// Everything the plan still wants, by how it would get it: with no
	// route at all ("short"), by a craft still to do, or by a purchase.
	const need = new Map();
	for (const [item, r] of Object.entries(rows)) {
		if (r.short > 0) need.set(item, 'short');
		else if (r.craft > 0) need.set(item, 'craft');
		else if (r.need - r.take > 0) need.set(item, 'buy');
	}
	const short = new Set([...need.keys()]);
	const wanted = new Map(quests.map(q => [q.id, sparesYou(q, need)]).filter(([, w]) => w));
	const q = query.toLowerCase();
	const matches = quest => {
		if (filter === 'wanted' && !wanted.has(quest.id)) return false;
		if (filter !== 'all' && filter !== 'wanted' && cadenceOf(quest) !== filter) return false;
		if (!q) return true;
		const hay = [quest.name, quest.where, ...Object.keys(quest.rewards), ...(quest.choice || []).flatMap(c => Object.keys(c))].join(' ').toLowerCase();
		return hay.includes(q);
	};
	const shown = quests.filter(matches);

	const chips = [['all', 'All'], ['wanted', `Pays what I need${wanted.size ? ` · ${wanted.size}` : ''}`], ...CADENCE.map(([id, label]) => [id, label])]
		.map(([id, label]) => `<button class="chip ${filter === id ? 'active' : ''}" data-act="quest-filter" data-id="${id}">${label}</button>`).join('');

	const groups = CADENCE.map(([id, label, sub]) => {
		const list = shown.filter(quest => cadenceOf(quest) === id)
			.sort((a, b) => Number(wanted.has(b.id)) - Number(wanted.has(a.id)) || a.name.localeCompare(b.name));
		if (!list.length) return '';
		// What a full round of this cadence pays, added up.
		const total = {};
		for (const quest of list) for (const [item, n] of Object.entries(quest.rewards)) total[item] = (total[item] || 0) + n;
		return `<div class="panel">
			<div class="panel-head">
				<h2 class="panel-title ${id === 'daily' ? 'teal' : id === 'weekly' ? 'blue' : 'amber'}">${label}</h2>
				<span class="panel-sub">${list.length} quest${list.length === 1 ? '' : 's'} · ${esc(sub)}</span>
			</div>
			${list.map(quest => questRow(quest, short, wanted.get(quest.id))).join('')}
			<div class="quest-total"><span>All ${list.length} together${id === 'daily' ? ', each day' : id === 'weekly' ? ', each week' : ''}:</span> ${rewardChips(total, short)}</div>
		</div>`;
	}).join('');

	return `<div class="controls">
		<input class="field" type="search" placeholder="Search quests, places and rewards…" value="${esc(query)}" data-act="query">
		<div class="chips">${chips}</div>
	</div>
	${groups || `<div class="panel"><p class="empty">${q ? 'No quest matches that search.' : 'Nothing pays in what you are short of right now.'}</p></div>`}`;
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
		store.applyDelta(delta, 'quest', `Claimed ${q.name}`);
		toast(`Recorded the reward for ${q.name}`, true);
		return true;
	}
	return false;
}
