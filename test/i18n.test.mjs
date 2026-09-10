// The app in another language: the translator, the game's own names,
// and the two things a translation pack can get wrong.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { T, TT, said, gameName, LANGS, langById, startingLang } from '../js/i18n.js';

const run = promisify(execFile);
const LANG_DIR = new URL('../js/lang/', import.meta.url);

test('the sixteen are BDOCodex’s sixteen, each with a pack to read', () => {
	assert.equal(LANGS.length, 16);
	assert.deepEqual(LANGS.map(l => l.id), [
		'us', 'de', 'fr', 'ru', 'es', 'sp', 'pt', 'jp', 'kr', 'cn', 'tw', 'th', 'tr', 'id', 'seaen', 'gl'
	]);
	// No two share an id, and every one says which interface it reads.
	assert.equal(new Set(LANGS.map(l => l.id)).size, 16);
	for (const l of LANGS) {
		assert.ok(l.label, l.id);
		assert.ok(l.ui, l.id);
		assert.equal(langById[l.id], l);
	}
	// The three English databases carry the English interface: their
	// item names are English too, checked against tip.php.
	assert.deepEqual(LANGS.filter(l => l.ui === 'en').map(l => l.id), ['us', 'id', 'seaen', 'gl']);
});

test('with no pack loaded every sentence is the English it was written as', () => {
	assert.equal(T('Log a trip'), 'Log a trip');
	assert.equal(T('{n} short', { n: 3 }), '3 short');
	// A placeholder with nothing to fill it is left standing rather than
	// printed as "undefined".
	assert.equal(T('{n} short'), '{n} short');
	// The disambiguating context is for the translator, never the player.
	assert.equal(T('tab|Get'), 'Get');
	assert.equal(T('verb|Get'), 'Get');
	// A sentence that happens to contain a pipe is not a context: a
	// context is one lower-case word with the pipe tight against it.
	assert.equal(T('Press Ctrl | to split'), 'Press Ctrl | to split');
	assert.equal(T('and | or'), 'and | or');
	assert.equal(T('map-row|Done'), 'Done');
});

test('a sentence marked in a data module is the English, and is looked up when it is drawn', () => {
	// TT() runs when a data module is imported, which is before any
	// language has been chosen. It must hand the English straight back,
	// or the value would freeze into whatever was loaded at that moment.
	assert.equal(TT('Log a trip'), 'Log a trip');
	// said() is the other half: it looks up whatever arrived. With no
	// pack loaded that is the English again -- and anything it has never
	// heard of comes back untouched, which is what should happen to a
	// message from a newer server than this page.
	assert.equal(said('Log a trip'), 'Log a trip');
	assert.equal(said('Someone else saved first.'), 'Someone else saved first.');
	assert.equal(said('a sentence from a newer server'), 'a sentence from a newer server');
	assert.equal(said(''), '');
	assert.equal(said(null), null);
	assert.equal(said('{n} short', { n: 2 }), '2 short');
});

test('the diary marker What’s new compares on never moves between languages', async () => {
	// LATEST is written to localStorage and compared with !==. If it were
	// built from a translated title, switching language would announce the
	// newest entry as new again.
	const { LATEST, CHANGES } = await import('../js/about.js');
	assert.equal(LATEST, `${CHANGES[0].date}:${CHANGES[0].title}`);
	assert.match(LATEST, /^\d{4}-\d{2}-\d{2}:[\x20-\x7e\u2018-\u201d]+$/, 'LATEST must stay plain English');
});

test('a game name is display only, and an enhancement level rides through it', () => {
	// Nothing is loaded, so every name is its own key -- which is the
	// guarantee that matters: what is stored is never what is drawn.
	assert.equal(gameName('Zinc Ingot'), 'Zinc Ingot');
	assert.equal(gameName('+7 Epheria Carrack: Toro Sail'), '+7 Epheria Carrack: Toro Sail');
	assert.equal(gameName(''), '');
	assert.equal(gameName(undefined), undefined);
});

test('a save that chose a language keeps it, and an older one keeps its look-up', () => {
	assert.equal(startingLang('fr'), 'fr');
	// The setting that used to choose only the BDOCodex link.
	assert.equal(startingLang(undefined, 'pt'), 'pt');
	assert.equal(startingLang('not-a-language', 'de'), 'de');
	// And with neither, and no browser to ask, the English it started as.
	assert.equal(startingLang(), 'us');
});

test('the runtime imports nothing, so a tool or a test can use it in Node', async () => {
	const src = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');
	assert.equal(/^import /m.test(src), false, 'js/i18n.js must not import anything');
});

test('no T() call is out of a translator’s reach', async () => {
	// build-lang.mjs parses every module and exits non-zero on three
	// things: a key built at runtime, a T() at module level -- which
	// would resolve before a language is chosen and freeze into English
	// -- and a pack that has lost a {placeholder}.
	await run(process.execPath, ['tools/build-lang.mjs', '--check'], { cwd: new URL('..', import.meta.url) });
});

test('every pack answers the catalogue, and can break neither a value nor the markup round it', async () => {
	const catalogue = JSON.parse(await readFile(new URL('en.json', LANG_DIR), 'utf8'));
	const holes = s => (String(s).match(/\{(\w+)\}/g) || []).sort().join(',');
	// A straight double quote drawn into title="..." closes the attribute
	// and takes the rest of the markup with it, so a translation may keep
	// the quotes the English gave it and may not invent one.
	const quotes = s => (String(s).match(/"/g) || []).length;
	// And a translation that drops a closing tag leaves the whole screen
	// after it inside a <b>.
	const tags = s => (String(s).match(/<\/?[a-z][^>]*>/g) || []).map(t => t.replace(/\s+[^>]*>/, '>')).sort().join('');
	const files = (await readdir(LANG_DIR)).filter(f => f.endsWith('.json') && f !== 'en.json' && !f.startsWith('names.'));
	for (const file of files) {
		const pack = JSON.parse(await readFile(new URL(file, LANG_DIR), 'utf8'));
		for (const [key, value] of Object.entries(pack)) {
			assert.ok(key in catalogue, `${file}: "${key}" is not a sentence the app says`);
			const forms = typeof value === 'string' ? [value] : Object.values(value);
			assert.ok(forms.length, `${file}: "${key}" has no translation at all`);
			for (const form of forms) {
				assert.ok(form, `${file}: "${key}" has an empty form`);
				assert.equal(holes(form), holes(key), `${file}: "${key}" lost or gained a {placeholder}`);
				assert.ok(quotes(form) <= quotes(key), `${file}: "${key}" invented a straight quote`);
				assert.equal(tags(form), tags(key), `${file}: "${key}" changed the markup`);
			}
		}
	}
});

test('a names pack maps the English the app stores, never the other way about', async () => {
	const files = (await readdir(LANG_DIR)).filter(f => f.startsWith('names.'));
	const icons = JSON.parse(await readFile(new URL('../icon_mapping.json', import.meta.url), 'utf8'));
	for (const file of files) {
		const pack = JSON.parse(await readFile(new URL(file, LANG_DIR), 'utf8'));
		for (const [en, there] of Object.entries(pack)) {
			assert.equal(typeof there, 'string', `${file}: ${en}`);
			assert.notEqual(there, '', `${file}: ${en} is empty`);
			// A pack that repeats the English is a pack carrying weight
			// for nothing: gameName() already falls through to its key.
			assert.notEqual(there, en, `${file}: ${en} is not translated and should not be in the file`);
		}
		// The names it does carry are names the app can actually show.
		const unknown = Object.keys(pack).filter(en => !(en in icons));
		assert.ok(unknown.length < Object.keys(pack).length, `${file}: none of its names are the app's`);
	}
});
