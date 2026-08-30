// The game's file, written by the app itself.
//
// Chromium browsers let a page hold a file handle across visits: you
// choose gameVariable.xml once, the handle is kept in IndexedDB, and
// each later write asks for read/write permission with one click.
// Nothing else can reach a file on disk from a page, so on Firefox and
// Safari this module says so and the paste path is what there is.
//
// The previous favourites block is kept in localStorage after every
// write, so a route pasted over something worth keeping can be undone.

import { spliceBlock } from './worldmap.js';

const DB = 'bdo-tracker/files';
const KEY = 'gameVariable';
const PREV_KEY = 'bdo-tracker/worldmap-previous';

export function canWriteFiles() {
	return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

function db() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore('handles');
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function loadHandle() {
	try {
		const d = await db();
		return await new Promise((resolve, reject) => {
			const req = d.transaction('handles').objectStore('handles').get(KEY);
			req.onsuccess = () => resolve(req.result || null);
			req.onerror = () => reject(req.error);
		});
	} catch {
		return null;
	}
}

async function saveHandle(handle) {
	const d = await db();
	await new Promise((resolve, reject) => {
		const tx = d.transaction('handles', 'readwrite');
		tx.objectStore('handles').put(handle, KEY);
		tx.oncomplete = resolve;
		tx.onerror = () => reject(tx.error);
	});
}

/** The chosen file's name, or null when none has been chosen yet. */
export async function gameFileName() {
	const h = await loadHandle();
	return h ? h.name : null;
}

/** Ask for the file. Must run from a click. */
export async function pickGameFile() {
	const [handle] = await window.showOpenFilePicker({
		types: [{ description: 'gameVariable.xml', accept: { 'application/xml': ['.xml'] } }],
		excludeAcceptAllOption: false
	});
	await saveHandle(handle);
	return handle.name;
}

async function permitted(handle) {
	const opts = { mode: 'readwrite' };
	if (await handle.queryPermission(opts) === 'granted') return true;
	return await handle.requestPermission(opts) === 'granted';
}

/**
 * Put `xml` into the chosen file in place of its favourites block.
 * Throws with a sentence a person can act on.
 */
export async function writeGameFile(xml) {
	const handle = await loadHandle();
	if (!handle) throw new Error('Choose gameVariable.xml first.');
	if (!await permitted(handle)) throw new Error('The browser was not allowed to write the file.');
	const file = await handle.getFile();
	const text = await file.text();
	const out = spliceBlock(text, xml);
	if (!out) throw new Error(`${handle.name} has no world-map favourites block — pick the gameVariable.xml inside the account-number folder.`);
	try {
		localStorage.setItem(PREV_KEY, out.previous);
	} catch { /* no undo, then */ }
	const w = await handle.createWritable();
	await w.write(out.text);
	await w.close();
	return handle.name;
}

/** The block the last write replaced, if any. */
export function previousBlock() {
	try {
		return localStorage.getItem(PREV_KEY);
	} catch {
		return null;
	}
}

/** Put the last write's predecessor back. */
export async function restoreGameFile() {
	const prev = previousBlock();
	if (!prev) throw new Error('Nothing to restore.');
	const name = await writeGameFile(prev);
	try {
		localStorage.removeItem(PREV_KEY);
	} catch { /* fine */ }
	return name;
}
