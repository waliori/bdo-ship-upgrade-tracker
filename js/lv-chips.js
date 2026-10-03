// A level named in the barter's prose, drawn as the level chip.
//
// The shelves, the run's goods and the chain starts all wear a level as a
// small chip in its tier's colour. The sentences around them said the
// same thing as "[Level 5]" in brackets, which reads as code in the
// middle of a sentence and is easy to miss on a phone. So a sentence is
// translated first, the way every other is, and then each level tag in
// it is swapped for the chip -- after T(), so no translation has to know
// about the markup, and the chip says the level the way the language's
// own badge does ("St.5", "Nv.5").
//
// Every pack writes the tag its own way, in the sentences and in the
// game's item names alike: German "[Stufe 5]" and "[St. 5]", Russian
// "[5 ур.]", Turkish "[+5]", and Spanish not as a tag at all but as the
// start of a name -- "Nivel 5 - Lágrima…", and in a sentence «Nivel 5 -
// …», a name with the rest left out. The forms below were read off the
// packs (js/lang/*.json and names.*.json) on 2026-10-02. English's own
// "[Level N]" is matched in every language, since a sentence a pack has
// not yet translated is shown in English.

import { T, uiLang } from './i18n.js';

const N = '([1-7])';
const FORMS = {
	en: [],
	de: [`\\[St(?:ufe|\\.) ?${N}\\]`],
	fr: [`\\[Niveau ${N}\\]`],
	pt: [`\\[N(?:ível|v\\.) ?${N}\\]`],
	ru: [`\\[${N}(?:-й)? ур(?:\\.|овень)\\]`, `\\[Уровень ${N}\\]`],
	// «Nivel 5 - …» and "Nivel 5 - …" whole, then the "Nivel 5 -" a name
	// starts with, the space after it left before the name.
	es: [`«Nivel ${N} - …»`, `\\bNivel ${N} - …`, `\\[[Nn]ivel ${N}\\]`, `\\bNivel ${N} -(?= [^\\s…])`],
	sp: [`\\[Nv\\. ?${N}\\]`, `\\[Nivel ${N}\\]`],
	jp: [`\\[レベル ?${N}\\]`, `\\[${N}段階\\]`],
	kr: [`\\[레벨 ?${N}\\]`, `\\[${N}단계\\]`],
	cn: [`\\[${N}阶段\\]`, `\\[等级 ?${N}\\]`],
	tw: [`\\[${N}階段\\]`, `\\[等級 ?${N}\\]`],
	th: [`\\[ระดับ ${N}\\]`],
	tr: [`\\[\\+${N}\\]`, `\\[Seviye ${N}\\]`]
};
const LEVEL = `\\[Level ${N}\\]`;

const made = new Map();
const formsOf = ui => {
	if (!made.has(ui)) made.set(ui, new RegExp([...(FORMS[ui] || []), LEVEL].join('|'), 'gu'));
	return made.get(ui);
};

/** The chip for level `lv`: the language's badge on its tier's colour. */
export const lvChip = lv => `<i class="lv-chip" style="--tier:var(--tier-${lv})" title="${T('Level {lv}', { lv })}">${T('L{lv}', { lv })}</i>`;

/**
 * `html` with every level tag in its text drawn as the chip. Only the
 * text between tags is touched: a tag inside an attribute -- a title,
 * an aria-label -- stays as it is written. `ui` is the language the
 * text is in, the app's own by default.
 */
export function lvChips(html, ui = uiLang()) {
	if (!html) return html;
	const re = formsOf(ui);
	return String(html).split(/(<[^>]*>)/).map(part => (part.startsWith('<') ? part
		: part.replace(re, (...m) => lvChip(Number(m.slice(1, -2).find(Boolean)))))).join('');
}
