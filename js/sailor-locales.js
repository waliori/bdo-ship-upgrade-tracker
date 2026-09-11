// The sailor window in the fourteen languages the game runs in.
//
// The reader in sailor-shot.js finds every value by the label beside
// it, and those labels are the client's, not ours: a player on the
// Korean service screenshots 식성 where one on the European service
// screenshots Appetite. This is that vocabulary -- and the engine that
// has to make out the glyphs in the first place, which is why each
// language also names the Tesseract model the reader must fetch.
//
// Three sources, and they are not equally sure:
//
//   * Korean, 繁體中文 and Русский were read off the screenshots a
//     player sent, so they are the client's own words;
//   * the type titles come from BDOCodex, which carries the game's
//     strings (js/sailor_titles.js);
//   * every other label here is BDOCodex's sailor page, which prints
//     the generic character-stat names in two or three places where the
//     sailor window prints something else -- 슈퍼아머 for 완력, say.
//
// So the labels are a help, not a foundation. What actually holds the
// reader up in a language nobody here can check is the shape of the
// panel, which is the same in all of them: the weight carries "LT", the
// growths are a grid of per-cents in a fixed order, and digits are
// digits everywhere. sailor-shot.js reads that shape when the labels
// come up short, and a wrong word in this file costs nothing worse than
// falling back to it.

import { sailorTitles } from './sailor_titles.js';

/**
 * The eight growths, in the order the window sets them.
 *
 * Both layouts run down these: the Manage Sailors window in two
 * columns, six rows deep, with the four traits we do not model filling
 * the right of the first four; the Selected Sailor panel in one column
 * of eight. That order is the same in every language, and is what the
 * reader falls back on when a label is not made out.
 */
export const GROWTH_KEYS = ['speed', 'accel', 'turn', 'brake', 'patience', 'force', 'focus', 'vision'];
export const GRID_TWO_COL = { left: ['speed', 'accel', 'turn', 'brake', 'patience', 'force'], right: [null, null, null, null, 'focus', 'vision'] };
export const GRID_ONE_COL = ['speed', 'accel', 'turn', 'brake', 'patience', 'focus', 'force', 'vision'];

/** English, which every language is read alongside. */
const EN = {
	exp: ['EXP'],
	condition: ['Condition', 'Health'],
	appetite: ['Appetite'],
	cabin: ['Cabin Cost'],
	weight: ['Weight'],
	speed: ['Endurance'],
	accel: ['Wits'],
	turn: ['Awareness'],
	brake: ['Strength'],
	patience: ['Patience'],
	force: ['Force'],
	focus: ['Focus'],
	vision: ['Vision'],
	traits: ['Seasoned Sailor', 'Son of the Wind', 'Abstain', 'Natural Born Soldier']
};

/**
 * Every language the game is played in, in the order its own menu
 * lists them.
 *
 * `tess` is the model the reader fetches: the Latin services all read
 * on the English one, which is already aboard and makes out an umlaut
 * or a cedilla well enough for a name to be corrected by hand, while
 * Cyrillic, Thai and the three CJK scripts each need their own -- a
 * megabyte or two, fetched the first time that language is chosen and
 * kept afterwards. `mb` is what to warn about before it is.
 *
 * `level` is what stands before the number on the name line, and the
 * only one that is not "Lv." is the Russian "Ур.".
 */
export const LANGS = [
	{ tag: 'en', label: 'US English', tess: 'eng', labels: {} },
	{ tag: 'de', label: 'Deutsch', tess: 'eng', labels: {
		condition: ['Gesundheit'], appetite: ['Vorliebe'], cabin: ['Benötigte Kajüte'], weight: ['Last'],
		speed: ['Ausdauer'], accel: ['Wahrnehmung'], turn: ['Instinkt'], brake: ['Super-Rüstung', 'Stärke'],
		patience: ['Geduldigkeit'], force: ['Stärke'], focus: ['Fokus'], vision: ['Sehkraft'] } },
	{ tag: 'fr', label: 'Français', tess: 'eng', labels: {
		condition: ['Santé'], appetite: ['Préférence'], cabin: ['Coût de la cabine'], weight: ['Poids'],
		speed: ['Endurance'], accel: ['Perception'], turn: ['Instinct'], brake: ['Super armure'],
		patience: ['Patience'], force: ['Force'], focus: ['Concentration'], vision: ['Vision'] } },
	{ tag: 'ru', label: 'Русский', tess: 'rus', mb: 2.6, level: ['Ур'], aboard: ['На борту'], idle: ['Ожидание'], labels: {
		exp: ['Опыт'], condition: ['Здоровье'], appetite: ['Аппетит'], cabin: ['Требуется кают'], weight: ['Вес'],
		speed: ['Выносливость'], accel: ['Проницательность'], turn: ['Чутьё', 'Чутье'], brake: ['Устойчивость'],
		patience: ['Терпение'], force: ['Сила'], focus: ['Сосредоточенность'], vision: ['Обзор'],
		traits: ['Опыт службы', 'Дитя ветра', 'Соблюдающий пост', 'Прирождённый силач', 'Прирожденный силач'] } },
	{ tag: 'es', label: 'Español (NA/EU)', tess: 'eng', labels: {
		condition: ['Salud'], appetite: ['Preferencias'], cabin: ['Complexión'], weight: ['Peso'],
		speed: ['Aguante'], accel: ['Percepción'], turn: ['Instinto'], brake: ['Inamovible'],
		patience: ['Paciencia'], force: ['Fuerza'], focus: ['Concentración'], vision: ['Visión'] } },
	{ tag: 'es-419', label: 'Español (SA)', tess: 'eng', labels: {
		condition: ['Salud'], appetite: ['Paladar'], cabin: ['Cabina Requerida'], weight: ['Peso'],
		speed: ['Estamina'], accel: ['Astucia'], turn: ['Instinto'], brake: ['Super Armadura'],
		patience: ['Paciencia'], force: ['Fuerza'], focus: ['Concentración'], vision: ['Visión'] } },
	{ tag: 'pt', label: 'Português', tess: 'eng', labels: {
		condition: ['Saúde'], appetite: ['Apetite'], cabin: ['Cabine Desejada'], weight: ['Peso'],
		speed: ['Stamina'], accel: ['Senso'], turn: ['Sentido'], brake: ['Super Armadura'],
		patience: ['Paciência'], force: ['Força'], focus: ['Foco'], vision: ['Visão'] } },
	{ tag: 'ja', label: '日本語', tess: 'jpn', mb: 2.0, labels: {
		exp: ['経験値'], condition: ['健康'], appetite: ['食性'], cabin: ['要求船室'], weight: ['生活物資', '重量'],
		speed: ['持久力'], accel: ['目端'], turn: ['感覚'], brake: ['腕力', 'スーパーアーマー'],
		patience: ['忍耐'], force: ['迫力', '力'], focus: ['集中'], vision: ['視野'] } },
	{ tag: 'ko', label: '한국어', tess: 'kor', mb: 1.5, aboard: ['탑승중'], idle: ['대기중'], labels: {
		exp: ['경험치'], condition: ['건강'], appetite: ['식성'], cabin: ['요구 선실'], weight: ['생활 물자'],
		speed: ['끈기'], accel: ['눈치'], turn: ['감각'], brake: ['완력'],
		patience: ['인내'], force: ['박력'], focus: ['집중'], vision: ['시야'],
		traits: ['고참 뱃사람', '바람의 아들', '금식 수행자', '타고난 장정'] } },
	{ tag: 'zh', label: '中文', tess: 'chi_sim', mb: 1.7, labels: {
		exp: ['经验值'], condition: ['健康'], appetite: ['食物消耗量', '粮食消耗量'], cabin: ['要求船舱', '所需船舱'], weight: ['生活物资', '重量'],
		speed: ['韧性', '耐力'], accel: ['眼色', '察言观色'], turn: ['感觉'], brake: ['腕力', '霸体'],
		patience: ['忍耐'], force: ['魄力'], focus: ['集中'], vision: ['视野'] } },
	{ tag: 'zh-Hant', label: '繁體中文', tess: 'chi_tra', mb: 1.6, idle: ['正在等待'], aboard: ['搭乘中'], labels: {
		exp: ['經驗值'], condition: ['健康'], appetite: ['食物消耗量'], cabin: ['要求船艙'], weight: ['生活物資'],
		speed: ['韌性'], accel: ['眼色'], turn: ['感覺'], brake: ['腕力'],
		patience: ['忍耐'], force: ['魄力'], focus: ['集中'], vision: ['視野'],
		traits: ['老手船員', '風之子', '禁食修行者', '天生的壯丁'] } },
	{ tag: 'th', label: 'ภาษาไทย', tess: 'tha', mb: 0.9, labels: {
		condition: ['สุขภาพ'], appetite: ['การกิน'], cabin: ['ห้องเรือที่ต้องการ'], weight: ['น้ำหนัก'],
		speed: ['พละกำลัง'], accel: ['ไหวพริบ'], turn: ['ประสาทสัมผัส'], brake: ['ซูเปอร์อาร์เมอร์'],
		patience: ['ความอดทน'], force: ['แรงกาย'], focus: ['สมาธิ'], vision: ['วิสัยทัศน์'] } },
	{ tag: 'tr', label: 'Türkçe', tess: 'eng', labels: {
		condition: ['Sağlık'], appetite: ['İştah'], cabin: ['Talep Edilen Kamara'], weight: ['Ağırlık'],
		speed: ['Nefes'], accel: ['İvme'], turn: ['Hassaslık'], brake: ['Süper Zırh'],
		patience: ['Sabır'], force: ['Güç'], focus: ['Odaklanma'], vision: ['Görüş Mesafesi'] } },
	{ tag: 'id', label: 'Basa Indonesia', tess: 'eng', labels: {
		cabin: ['Cabin yang diperlukan'], weight: ['Berat'] } },
	// The two English services the game's own menu lists apart. Their
	// client is the US one as far as a screenshot is concerned.
	{ tag: 'sea', label: 'SEA English', tess: 'eng', labels: {} },
	{ tag: 'gl', label: 'Global Lab', tess: 'eng', labels: {} }
];

export const langByTag = Object.fromEntries(LANGS.map(l => [l.tag, l]));

/** Which language a tag means, falling back to the English client. */
export const DEFAULT_LANG = 'en';

/**
 * One language, ready for the reader: every label phrase it can print,
 * English alongside it, and the type titles it prints in brackets.
 *
 * English comes too because it costs nothing and covers the player who
 * runs the game in one language and the launcher in another, and
 * because it is what the app's own fixtures are in.
 */
export function localeFor(tag) {
	const lang = langByTag[tag] || langByTag[DEFAULT_LANG];
	const labels = {};
	for (const field of [...Object.keys(EN), ...Object.keys(lang.labels || {})]) {
		const said = [...(lang.labels?.[field] || []), ...(EN[field] || [])];
		labels[field] = [...new Set(said)];
	}
	// Every type, under the name this language prints and under English
	// -- the fixtures and the app both speak English types.
	const titles = {};
	for (const [type, said] of Object.entries(sailorTitles)) {
		titles[type] = type;
		const local = said[lang.tag === 'sea' || lang.tag === 'gl' ? 'en' : lang.tag];
		if (local) titles[local] = type;
	}
	return {
		tag: lang.tag,
		tess: lang.tess,
		labels,
		titles,
		level: [...(lang.level || []), 'Lv'],
		aboard: [...(lang.aboard || []), 'On board', 'onboard'],
		idle: [...(lang.idle || []), 'Idle']
	};
}
