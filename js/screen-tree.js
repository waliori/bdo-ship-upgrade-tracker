// The Tree: the requirement tree exactly as the planner built it,
// unflattened, so the upgrade path you chose is something you can see
// rather than infer. The fold state lives here too -- which build is
// open and which branches are folded away -- with the two hooks the
// shell's event handling needs to steer it.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { openDialog } from './dialogs.js';
import { img, codexName, amountInput } from './ui-bits.js';
import { snapshot, barterData, query } from './ui-state.js';
import { parseEnhanced } from './planner.js';
import { startHere } from './screen-plan.js';

// Which build's tree is open, and which nodes are folded shut.
export const folded = new Set();
let treeTarget = null;
// Builds whose enhancement chains have had their one-time auto-fold, by
// target id -- a boolean here meant a build queued after the first
// render never got its chains folded at all.
const chainsFolded = new Set();

export const setTreeTarget = item => { treeTarget = item; };

/** Fold every top-level branch shut (the shell's Collapse button). */
export function collapseAll() {
	folded.clear();
	snapshot.targets.forEach(t => {
		chainsFolded.add(t.id);
		(t.tree.children || []).forEach(n => {
			folded.add(`/${t.tree.item}/${n.item}`);
		});
	});
}


/**
 * The requirement tree, as the planner already built it.
 *
 * The Plan flattens every build into one row per material, which is the
 * right shape for "what do I still need" and the wrong one for "why does
 * it need that". This is the same data unflattened: a Carrack sits above
 * its Caravel, which sits above its Sailboat, with the materials of each
 * hanging off the step that wants them -- so the upgrade path you chose
 * is something you can see rather than infer.
 */
function nodeState(node) {
	if (node.missing > 0) return 'missing';
	if (node.toCraft > 0) return parseEnhanced(node.item).level > 0 ? 'enhance' : 'make';
	return 'covered';
}

const STATE_WORD = {
	missing: 'missing',
	make: 'to craft',
	enhance: 'to enhance',
	covered: 'covered'
};

/** Depth-first, carrying enough about ancestors to draw the guide lines. */
function walkTree(node, rows, depth = 0, path = '', trail = []) {
	const id = `${path}/${node.item}`;
	const kids = node.children || [];
	rows.push({ node, depth, id, trail: [...trail], kids: kids.length });
	if (!kids.length || folded.has(id)) return rows;
	kids.forEach((kid, i) => walkTree(kid, rows, depth + 1, id, [...trail, i === kids.length - 1]));
	return rows;
}

/** Mid-chain enhancement steps are folded to start with: a +10 pulling in
 *  +9 pulling in +8 is ten rows that all say the same thing. */
function foldChains(node, path = '') {
	const id = `${path}/${node.item}`;
	const here = parseEnhanced(node.item);
	if (here.level > 1 && node.children.some(k => parseEnhanced(k.item).base === here.base)) {
		folded.add(id);
	}
	node.children.forEach(kid => foldChains(kid, id));
}


export function renderTree() {
	const targets = snapshot.targets;
	if (!targets.length) return startHere();

	// Fold the chains of any build seen here for the first time, and let
	// go of state belonging to builds that have left the queue -- fold
	// paths are rooted at the tree's top item, processed marks at the id.
	const ids = new Set(targets.map(t => t.id));
	for (const id of chainsFolded) if (!ids.has(id)) chainsFolded.delete(id);
	for (const path of folded) {
		if (!targets.some(t => path === `/${t.tree.item}` || path.startsWith(`/${t.tree.item}/`))) {
			folded.delete(path);
		}
	}
	targets.forEach(t => {
		if (chainsFolded.has(t.id)) return;
		chainsFolded.add(t.id);
		foldChains(t.tree);
	});
	const current = targets.find(t => t.item === treeTarget) || targets[0];

	// One control, not a wrapping row of them. Seven builds turned the
	// chips into six rows on a phone before any of the tree was visible,
	// and the row grows without bound as the queue does.
	const picker = `<button class="tpick" data-act="tree-pick">
		${img(current.item, 'tchip-icon')}
		<span class="tpick-name">${esc(current.item)}</span>
		<span class="tpick-of">${targets.indexOf(current) + 1} of ${targets.length}</span>
		<span class="tpick-caret" aria-hidden="true">▾</span>
	</button>`;

	// A search keeps the rows that match and the branch that leads to
	// them, so a thing found deep in a Carrack still shows its way in.
	const q = query.trim().toLowerCase();
	let walked = walkTree(current.tree, []);
	if (q) {
		const hits = walked.filter(r => r.node.item.toLowerCase().includes(q)).map(r => r.id);
		walked = walked.filter(r => hits.some(h => h === r.id || h.startsWith(r.id + '/') || r.id.startsWith(h + '/')));
	}
	const rows = walked.map(row => {
		const { node, depth, id, trail, kids } = row;
		const state = nodeState(node);
		const own = store.getStock(node.item);
		const guides = trail.map(last =>
			`<span class="tguide ${last ? 'stop' : ''}"></span>`).join('') +
			(depth ? '<span class="tguide elbow"></span>' : '');

		const bits = [];
		if (node.fromStock) bits.push(`${F(node.fromStock)} from stock`);
		if (node.toCraft) bits.push(`${F(node.toCraft)} ${parseEnhanced(node.item).level > 0 ? 'to enhance' : 'to craft'}`);
		if (node.missing) bits.push(`${F(node.missing)} missing`);

		return `<div class="trow ${state}" style="--depth:${depth}">
			${guides}
			${kids
				? `<button class="tcaret" data-act="tree-fold" data-id="${esc(id)}">${folded.has(id) ? '+' : '−'}</button>`
				: '<span class="tcaret empty"></span>'}
			${img(node.item, 'trow-icon')}
			<span class="trow-main">
				<span class="trow-name">${codexName(node.item)}</span>
				<span class="trow-sub">${esc(bits.join(' · ') || 'nothing needed')}</span>
			</span>
			<span class="trow-need">${F(node.need)}</span>
			<span class="trow-own">${amountInput('own-input', own,
				`data-act="own-set" data-item="${esc(node.item)}" aria-label="How many ${esc(node.item)} you hold"`)} held</span>
			${barterData && barterData.some(b => b.name === node.item)
				? `<button class="tmap" data-act="goto-map" data-item="${esc(node.item)}"
					title="Where to barter it" aria-label="Show ${esc(node.item)} on the map">⌖</button>`
				: '<span class="tmap empty"></span>'}
			<span class="badge ${state === 'missing' ? 'red' : state === 'covered' ? 'teal' : 'blue'}">${STATE_WORD[state]}</span>
		</div>`;
	}).join('');

	return `<div class="tbar">
			${picker}
			<input class="field tsearch" type="search" placeholder="Find in this tree…" value="${esc(query)}" data-act="query" aria-label="Find in this tree">
			<span class="panel-spacer"></span>
			<button class="ghost-btn" data-act="tree-all">Expand all</button>
			<button class="ghost-btn" data-act="tree-none">Collapse</button>
		</div>
		<div class="panel tpanel">${rows || `<p class="empty">Nothing in this tree matches “${esc(query)}”.</p>`}</div>
		<div class="tlegend">
			<span><i class="dot teal"></i>covered from stock</span>
			<span><i class="dot blue"></i>to craft or enhance</span>
			<span><i class="dot red"></i>still missing</span>
		</div>`;
}

/** Which build's tree to look at. A list rather than a row of chips, so
 *  it costs the same whether you have two builds queued or twenty. */
export function pickTreeTarget() {
	const targets = snapshot.targets;
	const current = targets.find(t => t.item === treeTarget) || targets[0];
	openDialog(`
		<h2>Which build</h2>
		<div class="picker">${targets.map(t => `
			<button type="button" class="picker-row ${t === current ? 'on' : ''}"
				data-act="tree-target" data-item="${esc(t.item)}">
				${img(t.item, 'row-icon sm')}
				<span class="picker-name">${esc(t.item)}</span>
				<span class="picker-tag">${Math.round(t.progress)}%</span>
			</button>`).join('')}</div>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>
	`);
}
