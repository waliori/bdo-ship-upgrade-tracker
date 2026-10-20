// The study of the planners, from the page's side.
//
// Every plan the tab proposes goes to the server with the day as the
// planner saw it and how it found the plan (the `study` barter-solve.js
// sends back with its answer), and the run the sailor then records goes
// after it under the same id -- so what a planner promised and what the
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
	const id = uuid();
	const key = keyOf(result.best.ids);
	V.studies = [...(V.studies || []).filter(s => s.key !== key).slice(-(KEEP - 1)), { id, key }];
	send('/api/study', { id, at: Date.now(), release: RELEASE, device: store.getSetting('sync.device', null), layout: layout === null || layout === undefined ? null : String(layout), day, port, ...result.study });
}

/** The study whose plan ticks these climbs, if one was proposed. */
export function studyOf(ids) {
	const key = keyOf(ids);
	const s = (V.studies || []).find(x => x.key === key);
	return s ? s.id : null;
}

/** The run recorded, under the study of the plan it sailed. */
export function noteSailed(id, outcome) {
	if (id) send(`/api/study/${id}/sailed`, outcome);
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
