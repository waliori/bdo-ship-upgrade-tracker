// The sea crystal: what each one does to the hull, in the app's own
// stat keys.
//
// sea_crystals.js is what the codex says, an effect line per id. This
// turns those lines into numbers the ship can add up -- the same keys
// the parts use, so a crystal's +4.5% speed and a sail's +9.1% land in
// one sum -- and names the grades in the order the game ranks them.

import { crystals, crystalById } from './sea_crystals.js';
import { T, TT, said } from './i18n.js';

export const GRADES = [
	{ id: 'eltro', label: 'Eltro', colour: '#cfe3f5', note: TT('white · drops from sea monsters'), local: true },
	{ id: 'serni', label: 'Serni', colour: '#5be07a', note: TT('green · Serni Crystal, or ten Origins of Eltro'), local: true },
	{ id: 'zulatia', label: 'Zulatia', colour: '#4aa8ff', note: TT('blue · Zulatia Crystal, or ten Origins of Serni'), local: true },
	{ id: 'margoria', label: 'Margoria', colour: '#f3c14a', note: TT('yellow · Margoria Crystal, or Origins of Zulatia'), local: true },
	{ id: 'rusalka', label: 'Rusalka', colour: '#f04a4a', note: TT('red · Rusalka Crystal, or ten Origins of Margoria · works in every sea'), local: false },
	{ id: 'nol', label: "Ebenruth's Nol", colour: '#8ff0e0', note: TT('the Nol shares the slot; the Oceanteared Nol is a Rusalka crystal and the Nol in one'), local: false }
];
export const gradeById = Object.fromEntries(GRADES.map(g => [g.id, g]));

const num = s => Number(String(s).replace(/,/g, ''));

/** The stats a crystal adds, in the parts' keys; `breezy` for the Nol's skill. */
export function crystalStats(c) {
	const out = {};
	for (const line of (c && c.effects) || []) {
		let m;
		if ((m = /^(?:Movement )?Speed \+([\d.]+)%/.exec(line))) out.speed = num(m[1]);
		else if ((m = /^Acceleration \+([\d.]+)%/.exec(line))) out.accel = num(m[1]);
		else if ((m = /^Turn \+([\d.]+)%/.exec(line))) out.turn = num(m[1]);
		else if ((m = /^Brake \+([\d.]+)%/.exec(line))) out.brake = num(m[1]);
		else if ((m = /^Weight Limit \+([\d,]+) LT/.exec(line))) out.weight = num(m[1]);
		else if ((m = /^Max Durability \+([\d,]+)/.exec(line))) out.durability = num(m[1]);
		else if ((m = /^Extra Damage to Ships.*?\+([\d,]+) x ship hits/.exec(line))) out.damage = num(m[1]);
		else if (/BreezySail/.test(line)) out.breezy = true;
	}
	return out;
}

const WORD = { speed: TT('speed +{n}%'), accel: TT('acceleration +{n}%'), turn: TT('turn +{n}%'), brake: TT('brake +{n}%'), weight: TT('weight limit'), durability: TT('durability'), damage: TT('damage') };

/** "Speed +4.5%" -- the one number a crystal is chosen for. */
export function crystalVariant(c) {
	const s = crystalStats(c);
	for (const k of ['speed', 'accel', 'turn', 'brake']) if (s[k] !== undefined) return said(WORD[k], { n: s[k] });
	if (s.weight !== undefined) return T('weight +{n} LT', { n: s.weight.toLocaleString('en-US') });
	if (s.durability !== undefined) return T('durability +{n}', { n: s.durability.toLocaleString('en-US') });
	if (s.damage !== undefined) return T('damage +{n} × hits', { n: s.damage.toLocaleString('en-US') });
	if (s.breezy) return T('BreezySail twice, +50% distance');
	return '';
}

/** Every effect line, for the tooltip. */
export const crystalLine = c => ((c && c.effects) || []).join(' · ');

/** The crystals of one grade, strongest variant first within each stat. */
export function crystalsOf(grade) {
	return crystals.filter(c => c.grade === grade);
}

export { crystals, crystalById };
