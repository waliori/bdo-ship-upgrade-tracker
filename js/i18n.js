// The app in the player's own language.
//
// Two different things are translated here, and they are translated in
// two different ways.
//
//   * The app's own words -- every label, hint, heading and paragraph
//     the interface is made of. Those are ours, and they live in
//     js/lang/<code>.json as a flat map from the English sentence to
//     the translated one. The English string in the code IS the key,
//     so wrapping a string costs one call and no invented name, an
//     untranslated string falls back to the English that is already
//     there, and a pack can never leave a hole on the screen.
//
//   * The game's own words -- item, ship, part, quest, sailor and
//     barterer names. Those are not ours to write: they are whatever
//     the client prints, and BDOCodex already carries every one of
//     them in every language the game ships. tools/fetch-names.mjs
//     pulls them into js/lang/names.<code>.json, keyed by the English
//     name the app stores. So `Zinc Ingot` stays the key in every
//     save, every share link and every recipe -- only the pixels
//     change. Nothing translated is ever written back to state.
//
// The languages are BDOCodex's own sixteen, so the look-up link always
// lands on the database the player reads. Three of those sixteen --
// Basa Indonesia, SEA English and Global Lab -- serve English item
// names (checked against tip.php, 2026-09-09), so they carry the
// English interface and differ only in where a look-up opens.

/**
 * The sixteen, in BDOCodex's own order.
 *
 * `id` is the setting and the codex path segment; `ui` is which
 * interface pack it reads, so the three English databases share one;
 * `font` names a Google face for a script Chakra Petch and Noto Sans
 * have no glyphs for, fetched only when that language is chosen.
 */
export const LANGS = [
	{ id: 'us', label: 'US English', ui: 'en' },
	{ id: 'de', label: 'Deutsch', ui: 'de' },
	{ id: 'fr', label: 'Français', ui: 'fr' },
	{ id: 'ru', label: 'Русский', ui: 'ru' },
	{ id: 'es', label: 'Español (NA/EU)', ui: 'es' },
	{ id: 'sp', label: 'Español (SA)', ui: 'sp' },
	{ id: 'pt', label: 'Português', ui: 'pt' },
	{ id: 'jp', label: '日本語', ui: 'jp', font: 'Noto+Sans+JP' },
	{ id: 'kr', label: '한국어', ui: 'kr', font: 'Noto+Sans+KR' },
	{ id: 'cn', label: '中文', ui: 'cn', font: 'Noto+Sans+SC' },
	{ id: 'tw', label: '繁體中文', ui: 'tw', font: 'Noto+Sans+TC' },
	{ id: 'th', label: 'ภาษาไทย', ui: 'th', font: 'Noto+Sans+Thai' },
	{ id: 'tr', label: 'Türkçe', ui: 'tr' },
	{ id: 'id', label: 'Basa Indonesia', ui: 'en' },
	{ id: 'seaen', label: 'SEA English', ui: 'en' },
	{ id: 'gl', label: 'Global Lab', ui: 'en' }
];

export const langById = Object.fromEntries(LANGS.map(l => [l.id, l]));

/** The BCP 47 tag each pack counts and sorts in. */
const BCP47 = {
	en: 'en', de: 'de', fr: 'fr', ru: 'ru', es: 'es', sp: 'es-419', pt: 'pt-BR',
	jp: 'ja', kr: 'ko', cn: 'zh-Hans', tw: 'zh-Hant', th: 'th', tr: 'tr'
};

/* ------------------------------------------------------------------ *
 * What is loaded, right now
 * ------------------------------------------------------------------ */

let current = 'us';
let ui = {};       // English sentence -> translation, or plural forms
let names = {};    // English game name -> the client's name
let plurals = null;

/** The chosen language's id ('us', 'fr', ...). */
export const lang = () => current;

/** Its interface pack code -- the three English databases share 'en'. */
export const uiLang = () => (langById[current] || LANGS[0]).ui;

/** Its BCP 47 tag, for Intl. */
export const locale = () => BCP47[uiLang()] || 'en';

/* ------------------------------------------------------------------ *
 * The app's own words
 * ------------------------------------------------------------------ */

// A key may carry a disambiguating context in front of a pipe --
// T('tab|Get') and T('verb|Get') are two entries in the pack and one
// word on an English screen. A context is one lower-case word with no
// space in it and the pipe tight against it, which is what keeps a
// sentence like 'and | or' from losing its first half.
const CONTEXT = /^[a-z][a-z0-9-]{0,20}\|/;
const bare = key => (CONTEXT.test(key) ? key.slice(key.indexOf('|') + 1) : key);

const fill = (text, params) => (params
	? String(text).replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
	: String(text));

/**
 * One of the app's own sentences, in the chosen language.
 *
 * The English is the key, so `T('Log a trip')` reads as what it draws
 * and a missing translation draws the English rather than a key. Values
 * go in as `{name}` placeholders -- never by cutting the sentence in
 * half, which is how a translation ends up in the wrong word order.
 *
 * Escaping is the caller's, exactly as it was when these strings were
 * written inline: T() returns text, and a caller putting text into
 * innerHTML escapes it there. Placeholder values are inserted as given,
 * so a value that needs escaping is escaped before it is passed in.
 *
 * A pack entry may be an object of plural forms
 * ({ one: '...', other: '...' }) instead of a string; the form is
 * chosen by `params.n` -- or `params.count` -- through the language's
 * own rules, which is the only way Russian's three forms and Japanese's
 * one can share a call site.
 *
 * @param {string} key      the English sentence, optionally 'context|Sentence'
 * @param {object} [params] values for its {placeholders}
 */
function translate(key, params) {
	const hit = ui[key];
	if (hit === undefined) return fill(bare(key), params);
	if (typeof hit === 'string') return fill(hit, params);
	// Plural forms. A pack that carries them without a count to choose
	// by falls back to `other`, which every language's rules define.
	const n = params && (params.n ?? params.count);
	let form = 'other';
	if (typeof n === 'number' && Number.isFinite(n)) {
		try {
			plurals = plurals || new Intl.PluralRules(locale());
			form = plurals.select(n);
		} catch { /* a browser without the rules keeps `other` */ }
	}
	const text = hit[form] ?? hit.other ?? hit.one ?? bare(key);
	return fill(text, params);
}

/**
 * The name every call site uses. tools/build-lang.mjs reads the
 * catalogue off `T(` calls, so the translator has to be reachable under
 * exactly that name and with a literal for its key.
 */
export const T = translate;

/**
 * A sentence marked here and shown somewhere else.
 *
 * A data module -- the ships, the quests, the sailors, the diary behind
 * What's new -- is a list of literals evaluated the moment the module is
 * imported, which is long before a language has been chosen. T() there
 * would return the English and freeze it: the pack that arrives a
 * moment later would never be consulted again. So the data marks its
 * sentences with TT(), which does nothing but hand back the English and
 * put the sentence in the catalogue, and whatever draws that data calls
 * said() on it at the moment of drawing.
 */
export const TT = key => key;

/**
 * A sentence that arrived from somewhere else, looked up at the moment
 * it is drawn.
 *
 * Two kinds of thing arrive this way. The TT()-marked labels above, out
 * of a data module. And the server's own refusals -- "Someone else saved
 * first.", "That save is too large to sync." -- which travel as English
 * over the wire and are printed straight at the player; they are the
 * app's words too, written in another file, so build-lang.mjs collects
 * them from server/ into the same catalogue.
 *
 * Anything the packs have never heard of is returned untouched, which is
 * what should happen to a message from a newer server than this page.
 */
export const said = (text, params) => (text ? translate(String(text), params) : text);

/* ------------------------------------------------------------------ *
 * The game's own words
 * ------------------------------------------------------------------ */

// An enhancement level is written round the name -- "+7 Epheria Sailboat:
// Black Sail" and "Epheria Sailboat: Black Sail +7" are both in the
// data -- and the level is a number in every language. So the name is
// translated and the level put back exactly where it was.
const LEVEL_BEFORE = /^(\+\d+)\s+(.+)$/;
const LEVEL_AFTER = /^(.+?)\s+(\+\d+)$/;

/**
 * A game name as the client prints it, for display only.
 *
 * The English name stays the key everywhere else -- in state, in a
 * share link, in a recipe, in a saved route -- because it is the only
 * name every deployment agrees on. This is the last step before the
 * pixels, and nothing it returns is ever stored.
 */
export function gameName(en) {
	if (!en) return en;
	const key = String(en);
	const direct = names[key];
	if (direct) return direct;
	let m = LEVEL_BEFORE.exec(key);
	if (m && names[m[2]]) return `${m[1]} ${names[m[2]]}`;
	m = LEVEL_AFTER.exec(key);
	if (m && names[m[1]]) return `${names[m[1]]} ${m[2]}`;
	return key;
}

/** Whether a name has a translation at all -- for search, which offers both. */
export const hasGameName = en => Boolean(en && names[String(en)]);

/* ------------------------------------------------------------------ *
 * Choosing one
 * ------------------------------------------------------------------ */

const PACKS = new Map();   // 'ui:fr' | 'names:fr' -> the parsed pack

async function pack(kind, code) {
	const cacheKey = `${kind}:${code}`;
	if (PACKS.has(cacheKey)) return PACKS.get(cacheKey);
	const file = kind === 'ui' ? `${code}.json` : `names.${code}.json`;
	const load = fetch(new URL(`./lang/${file}`, import.meta.url))
		.then(res => (res.ok ? res.json() : {}))
		// No pack, or a pack that will not parse, is the English screen
		// the app has always drawn -- never a broken one.
		.catch(() => ({}));
	PACKS.set(cacheKey, load);
	return load;
}

// A script the app's two faces have no glyphs for. Added once, kept:
// switching back and forth should not refetch a font, and an unused
// stylesheet costs nothing.
const fonts = new Set();
function wantFont(family) {
	// The page says which face to reach for; a Latin language puts the
	// token back to the body face, or German would go on being drawn in
	// Japanese metrics after one visit to the Japanese screen.
	document.documentElement.style.setProperty('--script-font', family ? `'${family.replace(/\+/g, ' ')}'` : "'Noto Sans'");
	if (!family || fonts.has(family)) return;
	fonts.add(family);
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;
	document.head.appendChild(link);
}

/**
 * The words that are in the page rather than in a render function.
 *
 * The masthead, the brand and the landmarks' labels are written in
 * index.html, so no template literal ever passes them through T(). They
 * carry the English as an attribute instead -- `data-t` for the text of
 * an element, `data-t-title` and `data-t-aria` for the two attributes a
 * player reads -- and this walks them after a language is loaded. The
 * English stays in the markup, so the page reads correctly before a
 * single line of script has run.
 */
export function translateStatic(root = document) {
	for (const el of root.querySelectorAll('[data-t]')) {
		if (!el.dataset.tSource) el.dataset.tSource = el.textContent.trim();
		el.textContent = T(el.dataset.tSource);
	}
	for (const [selector, attr, key] of [['[data-t-title]', 'title', 'tTitle'], ['[data-t-aria]', 'aria-label', 'tAria']]) {
		for (const el of root.querySelectorAll(selector)) el.setAttribute(attr, T(el.dataset[key]));
	}
}

/**
 * Load a language and make it the one the app draws in.
 *
 * Awaited before the first paint at boot and before the redraw that
 * follows a change, so a screen is never half one language and half
 * another. The setting is written by the caller: this function only
 * reads what has been chosen.
 */
export async function setLang(id) {
	const chosen = langById[id] ? id : 'us';
	const spec = langById[chosen];
	const [words, gameWords] = await Promise.all([
		spec.ui === 'en' ? Promise.resolve({}) : pack('ui', spec.ui),
		chosen === 'us' ? Promise.resolve({}) : pack('names', chosen)
	]);
	current = chosen;
	ui = words || {};
	names = gameWords || {};
	plurals = null;
	document.documentElement.lang = locale();
	wantFont(spec.font);
	translateStatic();
	return chosen;
}

/**
 * The language this browser is on, for a first visit that has not
 * chosen one. A player whose browser is Portuguese should not have to
 * find a setting to be read to in Portuguese.
 */
export function preferredLang() {
	// Called from a tool or a test, there is no browser to ask.
	if (typeof navigator === 'undefined') return 'us';
	const tags = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
	for (const raw of tags) {
		const tag = String(raw).toLowerCase();
		const base = tag.split('-')[0];
		if (base === 'es') return /-(ar|bo|cl|co|cr|do|ec|gt|hn|mx|ni|pa|pe|pr|py|sv|uy|ve|419)$/.test(tag) ? 'sp' : 'es';
		if (base === 'zh') return /hant|tw|hk|mo/.test(tag) ? 'tw' : 'cn';
		if (base === 'ja') return 'jp';
		if (base === 'ko') return 'kr';
		if (base === 'pt') return 'pt';
		const direct = { de: 'de', fr: 'fr', ru: 'ru', th: 'th', tr: 'tr', id: 'id' }[base];
		if (direct) return direct;
		if (base === 'en') return 'us';
	}
	return 'us';
}

/**
 * What the app should start in: what was chosen, what an older build
 * chose for its look-up links, or what the browser asks for.
 *
 * The two saved values are handed in rather than read here, so this
 * module imports nothing at all. Every data module can then say
 * `import { T }` without dragging the store -- and the browser with it
 * -- into a tool or a test that runs in Node, where T falls back to the
 * English it was given and nothing else happens.
 *
 * @param {string} [saved]   the `lang` setting
 * @param {string} [legacy]  the older `codexLang` setting
 */
export function startingLang(saved, legacy) {
	if (saved && langById[saved]) return saved;
	// Before this existed, the only choice was which language the
	// BDOCodex link opened in. Someone who set that meant it.
	if (legacy && langById[legacy]) return legacy;
	return preferredLang();
}
