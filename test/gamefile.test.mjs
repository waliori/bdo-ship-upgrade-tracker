// The game's file, written and put back: the byte-order mark survives,
// and Restore is a restore.

import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeXML, encodeXML, writeGameFile, restoreGameFile, previousBlock } from '../js/gamefile.js';
import { bookmarkXML } from '../js/worldmap.js';

/** A folder handle holding one file, the way the File System Access
 *  API hands one over: enough of it for a read, a backup and a write. */
function fakeDir(files) {
	const enc = new TextEncoder();
	return {
		name: '12345',
		files,
		queryPermission: async () => 'granted',
		getFileHandle: async (name, { create = false } = {}) => {
			if (!(name in files) && !create) throw new Error('not found');
			return {
				getFile: async () => ({ arrayBuffer: async () => enc.encode(files[name]).buffer }),
				createWritable: async () => ({ write: async text => { files[name] = text; }, close: async () => {} })
			};
		}
	};
}

const block = '<WorldMapQuickScreenPosition Version="4">\r\n\t<WorldMapQuickScreenPosition index="0" x="1" y="2" z="3"/>\r\n\t<WorldmapBookMark/>\r\n</WorldMapQuickScreenPosition>';
const BOM = '\uFEFF';
const file = `${BOM}<A/>\r\n${block}\r\n<B/>\r\n`;

test('a byte-order mark is read off the bytes and put back on the write', () => {
	const bytes = new TextEncoder().encode('\uFEFF<x/>');
	assert.deepEqual(decodeXML(bytes), { text: '<x/>', bom: true });
	assert.deepEqual(decodeXML(new TextEncoder().encode('<x/>')), { text: '<x/>', bom: false });
	assert.equal(encodeXML('<x/>', true), '\uFEFF<x/>');
	assert.equal(encodeXML('<x/>', false), '<x/>');
	// Never two of them.
	assert.equal(encodeXML('\uFEFF<x/>', true), '\uFEFF<x/>');
});

test('a write keeps the mark and the rest of the file; a restore puts the block back byte for byte', async () => {
	const dir = fakeDir({ 'gameVariable.xml': file });
	const mine = bookmarkXML([{ name: '1: x', x: 60000, y: 60000 }]).xml;
	await writeGameFile(mine, dir);
	const written = dir.files['gameVariable.xml'];
	assert.ok(written.startsWith(`${BOM}<A/>\r\n<WorldMapQuickScreenPosition Version="4">`));
	assert.ok(written.includes('BookMarkName="1: x"'));
	assert.ok(written.endsWith('</WorldMapQuickScreenPosition>\r\n<B/>\r\n'));
	assert.equal(dir.files['gameVariable.xml.bak'], file);
	assert.equal(dir.files['gameVariable.xml.orig'], file);
	assert.equal(previousBlock(), block);
	// Meanwhile the game wrote something else into the file, and its
	// camera slot went: a merge would have carried the slot the write
	// kept back in; a restore must not.
	dir.files['gameVariable.xml'] = dir.files['gameVariable.xml'].replace('<B/>', '<B changed="1"/>');
	await restoreGameFile(dir);
	assert.equal(dir.files['gameVariable.xml'], `${BOM}<A/>\r\n${block}\r\n<B changed="1"/>\r\n`);
	assert.equal(previousBlock(), null);
	await assert.rejects(() => restoreGameFile(dir), /Nothing to restore/);
});

test('the .orig is the file before the first write and stays so; the .bak follows every write', async () => {
	const dir = fakeDir({ 'gameVariable.xml': file });
	const one = bookmarkXML([{ name: '1: x', x: 60000, y: 60000 }]).xml;
	const two = bookmarkXML([{ name: '2: y', x: 61000, y: 61000 }]).xml;
	const r1 = await writeGameFile(one, dir);
	assert.equal(r1.first, true);
	const afterOne = dir.files['gameVariable.xml'];
	const r2 = await writeGameFile(two, dir);
	assert.equal(r2.first, false);
	assert.equal(dir.files['gameVariable.xml.orig'], file);
	assert.equal(dir.files['gameVariable.xml.bak'], afterOne);
	assert.ok(dir.files['gameVariable.xml'].includes('BookMarkName="2: y"'));
	// A restore is a write too: it moves the .bak on and leaves the .orig alone.
	await restoreGameFile(dir);
	assert.equal(dir.files['gameVariable.xml.orig'], file);
	assert.ok(dir.files['gameVariable.xml.bak'].includes('BookMarkName="2: y"'));
});
