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
const { F, FD, FC, parseAmount, figure } = await import('../js/fmt.js');

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
		for (const n of TENTHS) assert.equal(figure(FD(n, 1)), n, `${id} FD(${n}) = ${FD(n, 1)}`);
		for (const n of SHORT) assert.equal(parseAmount(FC(n)), n, `${id} FC(${n}) = ${FC(n)}`);
	});
}

test('a count is its digits: every mark in it is grouping, wherever it sits, in any language', async () => {
	for (const id of ['us', 'fr', 'de', 'es']) {
		await setLang(id);
		for (const s of ['1.000.000', '1,000,000', '1 000 000', '1\u202f000\u202f000', '1\u00a0000\u00a0000', "1'000'000", '1\u2019000\u2019000', '1000000', '1m', '\uff11\uff0c\uff10\uff10\uff10\uff0c\uff10\uff10\uff10']) {
			assert.equal(parseAmount(s), 1_000_000, `${id} ${JSON.stringify(s)}`);
		}
		// A grouped count edited in place: a digit added, taken away, put in front.
		assert.equal(parseAmount('1,2345'), 12345);
		assert.equal(parseAmount('1.2345'), 12345);
		assert.equal(parseAmount('1,23'), 123);
		assert.equal(parseAmount('9123.456'), 9123456);
		assert.equal(parseAmount(',234'), 234);
		// And so a mark is never a decimal point in a count.
		assert.equal(parseAmount('1,5'), 15);
		assert.equal(parseAmount('1.500'), 1500);
	}
});

test('a short form takes either mark as its decimal point', () => {
	assert.equal(parseAmount('1.5k'), 1500);
	assert.equal(parseAmount('1,5k'), 1500);
	assert.equal(parseAmount('2,25b'), 2_250_000_000);
	assert.equal(parseAmount('400m'), 400_000_000);
	assert.equal(parseAmount('1.2.3k'), null);
	assert.equal(parseAmount('.'), null);
	assert.equal(parseAmount('12a'), null);
});

test('a figure with a fraction: the last mark with one or two digits after it is the decimal point', () => {
	assert.equal(figure('3.5'), 3.5);
	assert.equal(figure('3,5'), 3.5);
	assert.equal(figure('1,628.7'), 1628.7);
	assert.equal(figure('1.628,7'), 1628.7);
	assert.equal(figure('1 628,7'), 1628.7);
	assert.equal(figure('1.628,75'), 1628.75);
	assert.equal(figure('1,628'), 1628, 'three digits after it is thousands');
	assert.equal(figure('12'), 12);
	assert.equal(figure('1,62,0'), null, 'thousands come in threes');
	assert.equal(figure('3.'), null);
	assert.equal(figure('-3'), null);
});

test.after(() => setLang('us'));
