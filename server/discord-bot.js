// The bot's slash commands, answered over Discord's interactions webhook.
//
// Discord posts every use of /ship or /sailors to one address, signed with
// the application's key. The answer is built from the sailor's own saved
// account, through the same code the app runs in the browser, so a card in
// the channel and the Ship tab cannot disagree. A Discord id is the app's
// account id, so there is nothing to link: whoever has signed in once has
// a ship to show.

import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import { config } from './config.js';
import { readSave } from './saves.js';
import { insertLink, trimLinks, getUser } from './db.js';
import { newId } from './links.js';
import { digest } from '../js/digest.js';

const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
const COLOR = 0xe0a83a;
const EPHEMERAL = 64;

export function verifier(publicKeyHex) {
	const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
	return (raw, signature, timestamp) => {
		try {
			return crypto.verify(null, Buffer.concat([Buffer.from(String(timestamp)), raw]), key, Buffer.from(String(signature), 'hex'));
		} catch {
			return false;
		}
	};
}

/* The app's own modules, loaded once. They read the save through the
 * browser's storage, so a throwaway one stands in; everything is
 * synchronous between adopting a save and reading the answer, so two
 * requests cannot see each other's account. */
let app = null;
async function loadApp() {
	if (app) return app;
	if (!globalThis.localStorage) {
		const mem = new Map();
		globalThis.localStorage = {
			getItem: k => (mem.has(k) ? mem.get(k) : null),
			setItem: (k, v) => { mem.set(k, String(v)); },
			removeItem: k => { mem.delete(k); }
		};
	}
	const [store, ship, sailors, stats, roles, i18n] = await Promise.all([
		import('../js/state.js'), import('../js/ship.js'), import('../js/sailors.js'),
		import('../js/ship_stats.js'), import('../js/ship_roles.js'), import('../js/i18n.js')
	]);
	const icons = JSON.parse(fs.readFileSync(new URL('../icon_mapping.json', import.meta.url), 'utf8'));
	app = { store, ship, sailors, stats, roles, i18n, icons };
	return app;
}

const F = n => Math.round(n).toLocaleString('en-US');
const pct = n => `${Math.round(n * 10) / 10}%`;
const cap = s => String(s).slice(0, 1000);

/** The account's save as the app reads it, or null if it has none. */
async function savedAccount(userId) {
	const save = await readSave(userId);
	if (!save || !save.payload) return null;
	try {
		return JSON.parse(save.payload);
	} catch {
		return null;
	}
}

/** The saved setup called `name`, else the one being sailed. */
function pickSetup(a, name) {
	const want = String(name || '').trim().toLowerCase();
	if (want) {
		const all = a.store.getProfile('setups', {}) || {};
		const hit = Object.values(all).find(s => String(s.name || '').toLowerCase() === want)
			|| Object.values(all).find(s => String(s.name || '').toLowerCase().includes(want));
		if (hit) return hit;
	}
	return a.ship.currentSetup();
}

const linked = new Map();

/** A short link to the setup, the same kind the app's own button makes. */
async function linkTo(a, userId, setup) {
	const crew = a.store.getProfile('roster', []) || [];
	const ids = new Map(crew.map((s, i) => [s.id, i.toString(36)]));
	const seats = {};
	for (const [seat, id] of Object.entries(setup.seats || {})) if (ids.has(id)) seats[seat] = ids.get(id);
	const data = { ship: setup.ship, fitted: setup.fitted || {}, crystal: setup.crystal || null, roster: crew.map(s => ({ ...s, id: ids.get(s.id) })), seats };
	const payload = JSON.stringify(data);
	const key = `${userId}:${crypto.createHash('sha1').update(payload).digest('hex')}`;
	let id = linked.get(key);
	if (!id) {
		for (let tries = 0; tries < 3 && !id; tries++) {
			const draw = newId();
			if (await insertLink({ id: draw, userId, kind: 'ship', payload })) id = draw;
		}
		if (!id) return null;
		linked.set(key, id);
		if (linked.size > 500) linked.delete(linked.keys().next().value);
		trimLinks(userId, config.maxLinksPerAccount, config.maxLinkBytesPerAccount).catch(() => {});
	}
	return `${config.publicUrl}/#s/${id}`;
}

const avatarOf = u => (u && u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : undefined);
const reply = (data, flags = 0) => ({ type: 4, data: { ...data, flags, allowed_mentions: { parse: [] } } });
const say = text => reply({ content: text }, EPHEMERAL);

const NOT_SIGNED_IN = `You have no ship on Sailor's Log yet. Sign in with Discord at ${config.publicUrl} once and set a ship up, then try again.`;

async function whoIs(interaction) {
	const u = (interaction.member && interaction.member.user) || interaction.user || {};
	const row = u.id ? await getUser(u.id).catch(() => null) : null;
	return { id: u.id, name: (row && row.username) || u.global_name || u.username || 'A sailor', avatar: avatarOf(u) };
}

const opt = (interaction, name) => {
	const o = ((interaction.data && interaction.data.options) || []).find(x => x.name === name);
	return o ? o.value : undefined;
};

async function shipCard(interaction) {
	const who = await whoIs(interaction);
	const data = who.id ? await savedAccount(who.id) : null;
	if (!data) return say(NOT_SIGNED_IN);
	const a = await loadApp();
	a.store.adopt(data);
	const setup = pickSetup(a, opt(interaction, 'setup'));
	if (!a.stats.shipStats[setup.ship]) return say('That ship is not one this app knows.');
	const me = a.ship.shipFrom(setup);
	const role = a.roles.roleOf(setup.ship);
	const name = a.i18n.gameName(setup.ship);
	const slots = me.fit.slots.map(s => {
		const label = s.slot.charAt(0).toUpperCase() + s.slot.slice(1);
		return s.part ? `**${label}** ${s.level ? `+${s.level} ` : ''}${a.i18n.gameName(s.part).replace(/^.*?: /, '')}` : `**${label}** —`;
	}).join('\n');
	const seatsOf = a.sailors.seatsFor(setup.ship, me.stats);
	const crewLine = `${me.crew.seated} of ${seatsOf.length} seats filled`;
	const parts = [`hull ${me.speed.hull}`, me.speed.parts ? `parts +${me.speed.parts}` : '', me.speed.crew ? `crew +${me.speed.crew}` : '', me.speed.crystal ? `crystal +${me.speed.crystal}` : '']
		.filter(Boolean).join(' · ');
	const link = await linkTo(a, who.id, setup).catch(() => null);
	const icon = a.icons[setup.ship] && a.icons[setup.ship].icon;
	const origin = config.publicOrigin || config.publicUrl;
	const embed = {
		title: name,
		url: link || config.publicUrl,
		color: COLOR,
		author: { name: `${who.name}'s ship`, icon_url: who.avatar },
		thumbnail: icon ? { url: `${origin}/icons/${icon}` } : undefined,
		description: role ? `Built for **${role.role}**.` : undefined,
		fields: [
			{ name: 'Speed', value: `**${pct(me.speed.total)}**\n${parts}`, inline: true },
			{ name: 'Acceleration', value: pct(me.accel), inline: true },
			{ name: 'Turning · Braking', value: `${pct(me.turn)} · ${pct(me.brake)}`, inline: true },
			{ name: 'Hold', value: `${F(me.hold.limit)} LT\n${F(me.hold.free)} free once fitted out`, inline: true },
			{ name: 'Durability', value: F(me.durability), inline: true },
			{ name: 'Rations', value: F(me.rations), inline: true },
			{ name: 'Fitted', value: cap(slots), inline: true },
			{ name: 'Crystal', value: me.crystal ? a.i18n.gameName(me.crystal.name) : '—', inline: true },
			{ name: 'Crew', value: `${crewLine}\n/sailors for who sits where`, inline: true }
		],
		footer: { text: link ? 'Click the title to open this setup in Sailor’s Log' : "Sailor's Log" }
	};
	return reply({ embeds: [embed] }, opt(interaction, 'private') ? EPHEMERAL : 0);
}

const SEAT_STATS = {
	sail: [['speed', 2], ['accel', 2]],
	wheel: [['turn', 2], ['brake', 2]],
	cannon: [['force', 2], ['focus', 2], ['vision', 2]]
};
const STAT_WORD = { speed: 'speed', accel: 'accel', turn: 'turn', brake: 'brake', force: 'force', focus: 'focus', vision: 'vision' };

async function sailorsCard(interaction) {
	const who = await whoIs(interaction);
	const data = who.id ? await savedAccount(who.id) : null;
	if (!data) return say(NOT_SIGNED_IN);
	const a = await loadApp();
	a.store.adopt(data);
	const setup = pickSetup(a, opt(interaction, 'setup'));
	const stats = a.stats.shipStats[setup.ship];
	if (!stats) return say('That ship is not one this app knows.');
	const roster = a.store.getProfile('roster', []) || [];
	const seats = a.sailors.fitSeats(setup.ship, setup.seats || {}, stats);
	const byId = new Map(roster.map(s => [s.id, s]));
	const lines = [];
	let emptyCabins = 0;
	for (const seat of a.sailors.seatsFor(setup.ship, stats)) {
		const s = byId.get(seats[seat.key]);
		const label = a.i18n.said ? a.i18n.said(seat.label) : seat.label;
		if (!s) {
			if (seat.pos === 'cabin') emptyCabins++;
			else lines.push(`**${label}** — empty`);
			continue;
		}
		const type = a.sailors.anyType[s.type];
		const sick = (s.cond ?? 100) <= 0;
		const adds = sick ? 'sick, adds nothing'
			: (SEAT_STATS[seat.pos] || []).map(([k, m]) => `${STAT_WORD[k]} +${Math.round(a.sailors.statOf(s, k) * m * 10) / 10}`).join(', ')
			|| (type && type.mate && type.skill ? type.skill : seat.pos === 'deck' ? `durability +${F(type.cabin * 10000)}` : seat.pos === 'mess' ? `rations +${F(type.cabin * 5000)}` : 'aboard');
		lines.push(`**${label}** — ${s.name}${s.name !== s.type ? ` (${s.type})` : ''}, Lv ${s.lv}\n· ${adds}`);
	}
	if (emptyCabins) lines.push(`${emptyCabins} empty cabin${emptyCabins === 1 ? '' : 's'}`);
	const t = a.sailors.crewTotals(roster, seats, stats);
	const free = roster.length - new Set(Object.values(seats)).size;
	const embed = {
		title: `Crew of the ${a.i18n.gameName(setup.ship)}`,
		color: COLOR,
		author: { name: `${who.name}'s sailors`, icon_url: who.avatar },
		description: cap(lines.join('\n')) || 'Nobody is seated yet.',
		fields: [
			{ name: 'Together they add', value: `speed +${t.speed} · accel +${t.accel}\nturn +${t.turn} · brake +${t.brake}`, inline: true },
			{ name: 'Cabins', value: `${t.cabins} of ${t.space} used${t.overSpace ? ' — over space' : ''}`, inline: true },
			{ name: 'Ashore', value: free > 0 ? `${free} more on the roster` : 'nobody waiting', inline: true }
		],
		footer: { text: t.guessed ? 'Sailors whose own figures were not typed in count at the middle of their level.' : "Sailor's Log" }
	};
	return reply({ embeds: [embed] }, opt(interaction, 'private') ? EPHEMERAL : 0);
}

async function fleetCard(interaction) {
	const who = await whoIs(interaction);
	const data = who.id ? await savedAccount(who.id) : null;
	if (!data) return say(NOT_SIGNED_IN);
	const a = await loadApp();
	a.store.adopt(data);
	const current = a.ship.shipName();
	const rows = a.ship.listFleet().filter(r => a.stats.shipStats[r.ship]).map(r => {
		const me = a.ship.shipFrom(r.owned ? { ship: r.ship } : r);
		const seats = a.sailors.seatsFor(r.ship, me.stats).length;
		const fitted = me.fit.slots.filter(sl => sl.part).length;
		const title = r.owned ? a.i18n.gameName(r.ship) : `${r.name}${r.name === r.ship ? '' : ` · ${a.i18n.gameName(r.ship)}`}`;
		return { text: `**${title}**${r.ship === current && !r.owned ? ' ◂ sailing' : ''}\n· ${pct(me.speed.total)} speed · ${F(me.hold.free)} LT free · ${fitted}/${me.stats.slots > 4 ? 4 : me.stats.slots || 4} parts · ${me.crew.seated}/${seats} crew`, speed: me.speed.total };
	});
	if (!rows.length) return say('There are no ships in your fleet yet. Save a setup on the Ship tab, or record a hull in your inventory.');
	const shown = rows.slice(0, 15);
	const embed = {
		title: `Fleet of ${who.name}`,
		url: config.publicUrl,
		color: COLOR,
		author: { name: `${rows.length} ship${rows.length === 1 ? '' : 's'}`, icon_url: who.avatar },
		description: cap(shown.map(r => r.text).join('\n')) + (rows.length > shown.length ? `\n…and ${rows.length - shown.length} more` : ''),
		footer: { text: '/ship setup:<name> shows one in full' }
	};
	return reply({ embeds: [embed] }, opt(interaction, 'private') ? EPHEMERAL : 0);
}

async function barterCard(interaction) {
	const who = await whoIs(interaction);
	const data = who.id ? await savedAccount(who.id) : null;
	if (!data) return say(NOT_SIGNED_IN);
	const d = digest(data);
	const profile = data.profile && typeof data.profile === 'object' ? data.profile : {};
	const today = new Date().toISOString().slice(0, 10);
	const log = Array.isArray(profile.boardLog) ? profile.boardLog : [];
	const todays = log.length && String(log[log.length - 1][0]).slice(0, 10) === today ? log[log.length - 1][1] : null;
	const r = d.runs;
	const net = r.silver - r.cost;
	const embed = {
		title: `${who.name} at the barter`,
		url: `${config.publicUrl}/#barter`,
		color: COLOR,
		author: { name: 'Barter record', icon_url: who.avatar },
		fields: [
			{ name: 'Level', value: d.level || '—', inline: true },
			{ name: 'Total Barters', value: F(d.barters), inline: true },
			{ name: 'Mastery', value: F(d.mastery), inline: true },
			{ name: 'Runs recorded', value: F(r.n), inline: true },
			{ name: 'Trades · stops', value: `${F(r.trades)} · ${F(r.stops)}`, inline: true },
			{ name: 'Parley spent', value: F(r.parley), inline: true },
			{ name: 'Silver made', value: `${F(r.silver)}\nnet ${F(net)} after costs`, inline: true },
			{ name: 'Best run', value: r.best ? `${F(r.best.silver)} on ${r.best.day}` : '—', inline: true },
			{ name: "Today's board", value: todays ? `layout ${todays}` : 'not settled yet', inline: true }
		],
		footer: { text: r.last ? `Last run recorded ${r.last}` : "Sailor's Log" }
	};
	return reply({ embeds: [embed] }, opt(interaction, 'private') ? EPHEMERAL : 0);
}

const COMMANDS = { ship: shipCard, sailors: sailorsCard, fleet: fleetCard, barter: barterCard };

export async function answer(interaction) {
	if (interaction.type === 1) return { type: 1 };
	if (interaction.type === 2 && interaction.data && COMMANDS[interaction.data.name]) {
		try {
			return await COMMANDS[interaction.data.name](interaction);
		} catch (err) {
			console.warn('[discord-bot] a command failed:', err.message);
			return say('Something went wrong reading your ship. Try again in a moment.');
		}
	}
	return say('That command is not one I know.');
}

export function botRoutes() {
	const router = express.Router();
	const verify = verifier(config.botPublicKey);
	router.post('/discord/interactions', express.raw({ type: '*/*', limit: 64 * 1024 }), async (req, res) => {
		const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
		if (!verify(raw, req.get('x-signature-ed25519'), req.get('x-signature-timestamp'))) return res.status(401).end('bad signature');
		let interaction;
		try {
			interaction = JSON.parse(raw.toString('utf8'));
		} catch {
			return res.status(400).end();
		}
		res.json(await answer(interaction));
	});
	return router;
}

export const COMMAND_DEFINITIONS = [
	{
		name: 'ship', type: 1, description: 'Show your ship: speed, hold, fitted parts and a link to open it',
		options: [
			{ type: 3, name: 'setup', description: 'A saved setup by name (default: the ship you sail now)', required: false },
			{ type: 5, name: 'private', description: 'Only show it to you', required: false }
		]
	},
	{
		name: 'sailors', type: 1, description: 'Show who sits where on your ship and what each sailor adds',
		options: [
			{ type: 3, name: 'setup', description: 'A saved setup by name (default: the ship you sail now)', required: false },
			{ type: 5, name: 'private', description: 'Only show it to you', required: false }
		]
	},
	{
		name: 'fleet', type: 1, description: 'List every ship you have, side by side: speed, hold, parts and crew',
		options: [{ type: 5, name: 'private', description: 'Only show it to you', required: false }]
	},
	{
		name: 'barter', type: 1, description: 'Show your barter record: level, runs, silver made and today\'s board',
		options: [{ type: 5, name: 'private', description: 'Only show it to you', required: false }]
	}
];
