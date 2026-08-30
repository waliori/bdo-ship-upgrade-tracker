// The game's file, written by the app itself.
//
// Chromium browsers let a page hold a folder handle across visits: you
// choose the account folder once, the handle is kept in IndexedDB, and
// each later write asks for read/write permission with one click. A
// folder rather than the file, because a folder is where a backup can
// go: gameVariable.xml.bak is a full copy of the file as it was, written
// before every edit. Nothing else can reach a file on disk from a page,
// so on Firefox and Safari this module says so and the paste path is
// what there is.
//
// The favourites block each write replaced is kept in localStorage as
// well, so Restore can put the favourites back without also reverting
// whatever else the game wrote to the file since.

import { spliceBlock } from './worldmap.js';

const DB = 'bdo-tracker/files';
const KEY = 'gameFolder';
const FILE = 'gameVariable.xml';
const BACKUP = 'gameVariable.xml.bak';
const PREV_KEY = 'bdo-tracker/worldmap-previous';

export function canWriteFiles() {
	return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
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

/** The chosen folder's name (the account number), or null. */
export async function gameFolderName() {
	const h = await loadHandle();
	return h ? h.name : null;
}

async function readFile(dir) {
	const fh = await dir.getFileHandle(FILE);
	return (await fh.getFile()).text();
}

/**
 * Ask for the folder. Must run from a click. Refuses a folder that has
 * no gameVariable.xml with a favourites block in it -- the lobby's copy
 * one level up has none, and the map does not read it.
 */
export async function pickGameFolder() {
	const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'bdo-account' });
	let text;
	try {
		text = await readFile(dir);
	} catch {
		throw new Error(`No ${FILE} in "${dir.name}" — choose the account-number folder inside UserCache.`);
	}
	if (!spliceBlock(text, '')) {
		throw new Error(`The ${FILE} in "${dir.name}" has no world-map favourites block — choose the account-number folder, not UserCache itself.`);
	}
	await saveHandle(dir);
	return dir.name;
}

async function permitted(dir) {
	const opts = { mode: 'readwrite' };
	if (await dir.queryPermission(opts) === 'granted') return true;
	return await dir.requestPermission(opts) === 'granted';
}

async function writeText(dir, name, text) {
	const fh = await dir.getFileHandle(name, { create: true });
	const w = await fh.createWritable();
	await w.write(text);
	await w.close();
}

/**
 * Put `xml` into gameVariable.xml in place of its favourites block,
 * after copying the whole file to gameVariable.xml.bak. Throws with a
 * sentence a person can act on.
 */
export async function writeGameFile(xml) {
	const dir = await loadHandle();
	if (!dir) throw new Error('Choose the account folder first.');
	if (!await permitted(dir)) throw new Error('The browser was not allowed to write in the folder.');
	const text = await readFile(dir);
	const out = spliceBlock(text, xml);
	if (!out) throw new Error(`${FILE} has no world-map favourites block any more — choose the folder again.`);
	await writeText(dir, BACKUP, text);
	try {
		localStorage.setItem(PREV_KEY, out.previous);
	} catch { /* the .bak still has it */ }
	await writeText(dir, FILE, out.text);
	return { folder: dir.name, backup: BACKUP };
}

/** The block the last write replaced, if any. */
export function previousBlock() {
	try {
		return localStorage.getItem(PREV_KEY);
	} catch {
		return null;
	}
}

/** Put the last write's predecessor back (the block only). */
export async function restoreGameFile() {
	const prev = previousBlock();
	if (!prev) throw new Error('Nothing to restore.');
	const r = await writeGameFile(prev);
	try {
		localStorage.removeItem(PREV_KEY);
	} catch { /* fine */ }
	return r;
}
