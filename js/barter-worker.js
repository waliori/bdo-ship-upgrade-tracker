// The run search, off the main thread.
//
// propose() is a beam search over a board's chains, each set laid out
// exactly by chainRun, and it runs again whenever anything it reads
// changes -- the stock included, so every count typed into the hold
// used to stall the page for as long as the search took. Here it runs
// in a module worker: the Barter tab posts what propose() takes, this
// answers with what it returns, and the tab draws in the meantime.
//
// The protocol is one message each way. In: { id, chains, opts, ship,
// seed, timeCap, width, depth, budgetMs } -- exactly propose()'s
// arguments under an id the tab chose, `budgetMs` defaulting to a
// second and a half so a stale answer is never long in coming. Out:
// { id, result } with propose()'s { proposals, best, partial }, or
// { id, error } with the message of whatever threw, so the tab can
// fall back to searching on its own thread.
//
// Everything propose() imports is pure -- tables and arithmetic, no
// document, no storage -- which is what lets this file import it as
// the page does. handleRequest is the whole of the worker's logic,
// exported so a test can call it without a Worker.

import { propose } from './barter-optimizer.js';

export const DEFAULT_BUDGET_MS = 1500;

/** One request answered: the reply to post back for the message in. */
export function handleRequest(msg) {
	const { id = null, budgetMs = DEFAULT_BUDGET_MS, ...args } = msg || {};
	try {
		return { id, result: propose({ ...args, budgetMs }) };
	} catch (err) {
		return { id, error: String(err && err.message || err) };
	}
}

// Wired only inside a worker: a test imports this file from Node, where
// there is no `self` to listen on, and the page never imports it at all.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
	self.onmessage = evt => self.postMessage(handleRequest(evt.data));
}
