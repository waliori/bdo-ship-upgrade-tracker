// Numbers in the app's language: shown the way the chosen language
// writes them, whatever the browser is set to, and read back to the same
// value whichever common form was typed.

import test from 'node:test';
import assert from 'node:assert/strict';

// setLang() stamps the page's lang and font; a bare stand-in is enough
// here, where only the number formatting is under test. The packs fail
// to load under node and fall back to English words -- the locale is
// what matters.
globalThis.document = {
	documentElement: { lang: '', style: { setProperty() {} } },
	head: { appendChild() {} },
	createElement: () => ({}),
	querySelectorAll: () => []
};

const { setLang, locale, LANGS } = await import('../js/i18n.js');
const { F, FD, FC, parseAmount } = await import('../js/fmt.js');

// What each interface language shows for 1,234,567 and for 1,234.5.
// The spaces are the ones the CLDR writes: a narrow no-break space in
// French, a no-break space in Russian.
const SHOWN = {
	us: ['1,234,567', '1,234.5'],
	de: ['1.234.567', '1.234,5'],
	fr: ['1 234 567', '1 234,5'],
	ru: ['1 234 567', '1 234,5'],
	es: ['1.234.567', '1234,5'],
	sp: ['1,234,567', '1,234.5'],
	pt: ['1.234.567', '1.234,5'],
	jp: ['1,234,567', '1,234.5'],
	kr: ['1,234,567', '1,234.5'],
	cn: ['1,234,567', '1,234.5'],
	tw: ['1,234,567', '1,234.5'],
	th: ['1,234,567', '1,234.5'],
	tr: ['1.234.567', '1.234,5']
};

for (const [id, [whole, tenth]] of Object.entries(SHOWN)) {
	test(`${id}: a figure is written the way ${id} writes it`, async () => {
		await setLang(id);
		assert.equal(F(1234567), whole, locale());
		assert.equal(FD(1234.5, 1), tenth, locale());
		// The chip's short forms carry the language's decimal mark.
		const mark = tenth.slice(-2, -1);
		assert.equal(FC(1.5e9), `1${mark}5b`);
		assert.equal(FC(12.3e6), `12${mark}3m`);
	});
}

test('every interface language has a row above', () => {
	const packs = new Set(LANGS.map(l => l.ui));
	for (const ui of packs) assert.ok(SHOWN[ui === 'en' ? 'us' : ui], ui);
});

test('the formatters follow a change of language without a reload', async () => {
	await setLang('de');
	assert.equal(F(12000), '12.000');
	await setLang('us');
	assert.equal(F(12000), '12,000');
	await setLang('fr');
	assert.equal(F(12000), '12 000');
});

const WHOLE = [0, 7, 999, 1000, 1500, 12000, 734512, 1_000_000, 1_234_567, 98_765_432_100];
const TENTHS = [0.5, 1.5, 12.3, 999.9, 1234.5, 98765.4];
const SHORT = [1.5e6, 12.3e6, 400e6, 1.5e9, 2.25e9];

for (const id of Object.keys(SHOWN)) {
	test(`${id}: what is shown is read back as the same value`, async () => {
		await setLang(id);
		for (const n of WHOLE) assert.equal(parseAmount(F(n)), n, `${id} F(${n}) = ${F(n)}`);
		for (const n of TENTHS) assert.equal(parseAmount(FD(n, 1), { decimals: true }), n, `${id} FD(${n}) = ${FD(n, 1)}`);
		for (const n of [1.25, 0.125, 1.234]) assert.equal(parseAmount(FD(n, 3), { decimals: true }), n, `${id} FD(${n}, 3)`);
		for (const n of SHORT) assert.equal(parseAmount(FC(n)), n, `${id} FC(${n}) = ${FC(n)}`);
	});
}

for (const id of ['us', 'fr', 'de']) {
	test(`${id}: one million in every common hand`, async () => {
		await setLang(id);
		for (const s of ['1.000.000', '1,000,000', '1 000 000', '1 000 000', '1 000 000', '1 000 000', "1'000'000", '1’000’000', '1000000', '1m', '１，０００，０００']) {
			assert.equal(parseAmount(s), 1_000_000, `${id} ${JSON.stringify(s)}`);
		}
	});
}

test('one mark used once: a decimal point unless it can only be grouping', async () => {
	for (const id of ['us', 'fr']) {
		await setLang(id);
		// Not three digits after it: a decimal point.
		assert.equal(parseAmount('1.5', { decimals: true }), 1.5);
		assert.equal(parseAmount('1,5', { decimals: true }), 1.5);
		assert.equal(parseAmount('1,25', { decimals: true }), 1.25);
		// A leading zero, or more than three digits before it, is never grouping.
		assert.equal(parseAmount('0,500', { decimals: true }), 0.5);
		assert.equal(parseAmount('1234.567', { decimals: true }), 1234.567);
		// A short form's mark is a decimal point.
		assert.equal(parseAmount('1,5k'), 1500);
		assert.equal(parseAmount('1.500k'), 1500);
		// A count has no thousandths: in a whole-number field a single
		// group of three is grouping, in any language.
		assert.equal(parseAmount('1.500'), 1500);
		assert.equal(parseAmount('1,500'), 1500);
		// Whole-number fields round a decimal.
		assert.equal(parseAmount('1,5'), 2);
	}
});

test('in a field that takes decimals, the language settles "1,500"', async () => {
	await setLang('fr');
	assert.equal(parseAmount('1,500', { decimals: true }), 1.5, 'French decimal comma');
	assert.equal(parseAmount('1.500', { decimals: true }), 1500, 'the other mark groups');
	await setLang('us');
	assert.equal(parseAmount('1,500', { decimals: true }), 1500);
	assert.equal(parseAmount('1.500', { decimals: true }), 1.5);
	await setLang('de');
	assert.equal(parseAmount('1.500', { decimals: true }), 1500);
	assert.equal(parseAmount('1,500', { decimals: true }), 1.5);
});

test('both marks: the last is the decimal point, the grouping must be in threes', async () => {
	await setLang('us');
	assert.equal(parseAmount('1,234.5', { decimals: true }), 1234.5);
	assert.equal(parseAmount('1.234,5', { decimals: true }), 1234.5);
	assert.equal(parseAmount('1.234.567,25', { decimals: true }), 1234567.25);
	assert.equal(parseAmount('12,34.5'), null);
	assert.equal(parseAmount('1.2.3'), null);
	assert.equal(parseAmount('1,23,456'), null);
	assert.equal(parseAmount('1.5.'), null);
});

test.after(() => setLang('us'));
