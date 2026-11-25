// The study of the planners, from the page's side.
//
// Every plan the tab proposes goes to the server with the day as the
// planner saw it and how it found the plan (the `study` barter-solve.js
// sends back with its answer), and the run sailed on it goes after it
// under the same id, tick by tick and as recorded -- so what a planner promised and what the
// day gave can be read together, and any planner run on that day again
// (server/study.js, tools/rpit/study/). Sent gzipped, in idle time, and
// forgotten if it fails: nothing the sailor sees waits on it.

import { V } from './state.js';
import * as store from '../state.js';
import { RELEASE } from '../about.js';

/** How many proposals' ids are remembered, to find the one cast off. */
const KEEP = 12;

/** A plan proposed: sent, and its id kept under the climbs it ticks. */
export function noteFound(result, { layout = null, day = null, port = null } = {}) {
	if (!result || !result.study || !result.best) return;
	// Nothing the study does may reach the tab: a study that cannot be
	// written is not written.
	try {
		const id = uuid();
		const key = keyOf(result.best.ids);
		V.studies = [...(V.studies || []).filter(s => s.key !== key).slice(-(KEEP - 1)), { id, key }];
		send('/api/study', { id, at: Date.now(), release: RELEASE, device: store.getSetting('sync.device', null), layout: layout === null || layout === undefined ? null : String(layout), day, port, ...result.study });
	} catch {
		// Left unsent.
	}
}

/**
 * The run cast off, when it is not a proposal as found -- climbs ticked by
 * hand, stops moved or taken off -- sent as a study of its own, `of` the
 * proposal's when there is one; its id, for the outcome to go under, or
 * null when the proposal's own study stands.
 */
export function noteLaid(laid, of, { layout = null, day = null, port = null } = {}) {
	if (!laid || !laid.edited) return null;
	try {
		const id = uuid();
		send('/api/study', { id, at: Date.now(), release: RELEASE, device: store.getSetting('sync.device', null), layout: layout === null || layout === undefined ? null : String(layout), day, port, of: of || null, ...laid });
		return id;
	} catch {
		return null;
	}
}

/** A search that failed -- threw, or never answered -- with the day it
 *  failed on, so it can be run again. */
export function noteFailed(study) {
	if (!study || !study.instance) return;
	try {
		send('/api/study', { id: uuid(), at: Date.now(), release: RELEASE, device: store.getSetting('sync.device', null), day: V.board ? V.board.day : null, port: V.port || null, ...study });
	} catch {
		// Left unsent.
	}
}

/** The study whose plan ticks these climbs, if one was proposed. */
export function studyOf(ids) {
	const key = keyOf(ids);
	const s = (V.studies || []).find(x => x.key === key);
	return s ? s.id : null;
}

/** The run under the study of the plan it sailed: as far as it went
 *  (`partial`), each send replacing the last, and the record at the end. */
export function noteSailed(id, outcome) {
	try {
		if (id) send(`/api/study/${id}/sailed`, outcome);
	} catch {
		// Left unsent.
	}
}

const keyOf = ids => (ids || []).map(String).sort().join('|');

const uuid = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
	? crypto.randomUUID()
	: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

function send(path, body) {
	const go = () => post(path, body).catch(() => {});
	if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 5000 });
	else setTimeout(go, 0);
}

async function post(path, body) {
	let blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
	let gz = false;
	if (typeof CompressionStream === 'function') {
		blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
		gz = true;
	}
	// `keepalive` lets the send outlive the page, under the browsers' limit
	// on what such a request may carry.
	await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) }, body: blob, keepalive: blob.size < 60000 });
}
