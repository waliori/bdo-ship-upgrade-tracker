// The community boards: who is on them, and what they add up to.
//
// Two things are drawn from the digests of the accounts that opted in.
// The hall of fame ranks each sailor on a board -- mastery, the best
// ship, the most silver from runs -- and shows the top of it by name,
// or as "a sailor" for those who asked to stay unnamed. The fleet in
// numbers adds everyone up: the hulls most sailed, the parts most
// fitted, the islands most plotted, the monsters most hunted, and the
// totals of the whole fleet.
//
// Nothing here reads a save that has not been offered. A community row
// exists only while an account is opted in, it holds the digest and
// nothing else, and leaving deletes it. The digest itself is worked out
// by js/digest.js, the same module the page runs to show what it would
// send before anyone agrees.
//
// The boards are held between builds: a request answers from the held
// copy, and only the caller's own place on each board is looked up per
// request. A quiet board is rebuilt no more often than the deployment's
// window; one where somebody has saved since is rebuilt within seconds,
// because saves.js says the moment a push lands and a board that is
// known to be wrong is not worth holding. So a ship fitted on the Ship
// tab is on the boards by the time the player has walked to them.

import express from 'express';
import crypto from 'node:crypto';
import { digest, BOARDS } from '../js/digest.js';
import { config } from './config.js';
import { listCommunity, putCommunity, putDigest, deleteCommunity, getShareState, setCommunityOff } from './db.js';
import { onSaveChanged, readSave } from './saves.js';
import { requireUser, sessionUser } from './session.js';
import { wrap } from './wrap.js';

export const SHARES = ['named', 'anon'];

/** How an account is shown when it has never said. */
export const DEFAULT_SHARE = 'named';

let held = null;       // the boards as last built
let building = null;   // the build in progress, so two requests share one

/**
 * Accounts whose digest is known to be behind their save.
 *
 * saves.js says so the moment a push is accepted, which is the only
 * signal that is both immediate and certain. The `saves` table's own
 * revision is still compared during a build, as a second line for the
 * cases this set cannot cover -- a save written by another process, or
 * one pushed before this process started.
 */
const behind = new Set();

/**
 * Who is on the boards, kept apart from the boards themselves.
 *
 * Only these accounts are worth marking behind: everybody else's save
 * has nothing derived from it, and a set that grew with every player
 * who ever synced would be a slow leak and a needless rebuild every
 * few seconds. It is refreshed by each build and written directly on
 * joining and leaving, so the gap between "joined" and "the boards
 * were next built" is covered -- which is exactly when a new arrival
 * is most likely to be changing things.
 */
const members = new Set();

function safeParse(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** The digest of an account's save as it stands now, and the save's revision. */
async function digestOf(userId) {
	const save = await readSave(userId);
	const data = save && save.payload ? safeParse(save.payload) : null;
	return { stats: digest(data || {}), rev: save ? save.rev : 0 };
}

const avatarURL = r => (r.avatar ? `https://cdn.discordapp.com/avatars/${r.userId}/${r.avatar}.png?size=64` : null);

/**
 * A sailor's handle on the boards: the account id through a keyed hash,
 * so a card can be opened -- an unnamed sailor's too -- without the
 * page ever learning who is behind it. Stable across rebuilds while
 * the session secret is, which is all a link needs.
 */
const refOf = userId => crypto.createHmac('sha256', config.sessionSecret).update(`community:${userId}`).digest('base64url').slice(0, 16);

/** A row as its card shows it: who, where they stand, and the digest. */
function card(r, boards) {
	const places = {};
	for (const f of boards) {
		const p = f.places.get(r.userId);
		if (p) places[f.id] = { ...p, of: f.n };
	}
	return {
		ref: r.ref,
		named: r.share === 'named',
		name: r.share === 'named' ? r.username : null,
		avatar: r.share === 'named' ? avatarURL(r) : null,
		joinedAt: r.joinedAt,
		places,
		digest: r.digest
	};
}

/** A table of counts cut to its largest rows. */
const top = (counts, max) => Object.fromEntries(Object.entries(counts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, max));
const add = (table, key, n = 1) => { if (key !== undefined && key !== null && key !== '') table[key] = (table[key] || 0) + n; };

/**
 * One board, ranked. Ties share a rank, the way a podium does, and the
 * top ten are kept with their names; every placing is kept by account
 * so a request can say where its caller stands.
 */
function rank(board, rows) {
	const entries = rows.map(r => ({ r, value: board.value(r.digest) }))
		.filter(e => Number.isFinite(e.value) && e.value >= board.min)
		.sort((a, b) => b.value - a.value || a.r.joinedAt - b.r.joinedAt);
	const places = new Map();   // userId -> { rank, value }
	let last = null, place = 0;
	entries.forEach((e, i) => {
		if (e.value !== last) { place = i + 1; last = e.value; }
		e.rank = place;
		places.set(e.r.userId, { rank: place, value: e.value });
	});
	const entry = e => ({
		rank: e.rank,
		value: e.value,
		detail: board.detail(e.r.digest),
		face: board.face ? board.face(e.r.digest) : null,
		named: e.r.share === 'named',
		name: e.r.share === 'named' ? e.r.username : null,
		avatar: e.r.share === 'named' ? avatarURL(e.r) : null,
		ref: e.r.ref,
		// So the caller can be told "that one is you" without the
		// server having to know who is asking when the boards are
		// built. Anonymous entries carry it too; it is matched
		// against the caller's own id and never shown to anyone else.
		key: e.r.userId
	});
	return {
		id: board.id, title: board.title, icon: board.icon, unit: board.unit,
		n: entries.length,
		top: entries.slice(0, 10).map(entry),
		// The whole board, to a hundred, for "show all".
		all: entries.slice(0, 100).map(entry),
		places
	};
}

/** Everyone added up. */
function aggregate(rows) {
	const totals = { silver: 0, runs: 0, trades: 0, barters: 0, quests: 0, hunts: 0, crafts: 0, ships: 0, sailors: 0, hulls: 0, traces: 0, points: 0, tries: 0, wins: 0, units: 0, mastery: 0, withMastery: 0 };
	const hulls = {}, sailing = {}, parts = {}, crystals = {}, sailorTypes = {}, quests = {}, hunts = {}, builds = {}, shipsMade = {}, islands = {}, levels = {};
	const masteryBuckets = [0, 0, 0, 0, 0, 0];   // <500, <1000, <1500, <2000, <2500, 2500+
	const crewLevels = new Array(10).fill(0);
	const fleetSizes = [0, 0, 0, 0];   // 0, 1, 2, 3+
	const runDays = [0, 0, 0, 0, 0, 0, 0];
	for (const { digest: d } of rows) {
		if (!d) continue;
		totals.silver += d.runs.silver; totals.runs += d.runs.n; totals.trades += d.runs.trades; totals.barters += d.barters;
		totals.quests += d.quests.n; totals.hunts += d.quests.huntsN; totals.crafts += d.yard.crafts; totals.ships += d.yard.ships;
		totals.sailors += d.crew.n; totals.hulls += d.fleet.n; totals.traces += d.charts.traces; totals.points += d.charts.points;
		totals.tries += d.yard.tries; totals.wins += d.yard.wins; totals.units += d.stock.units;
		if (d.mastery > 0) { totals.mastery += d.mastery; totals.withMastery++; masteryBuckets[Math.min(5, Math.floor(d.mastery / 500))]++; }
		for (const h of d.fleet.hulls) add(hulls, h);
		add(sailing, d.fleet.sailing);
		for (const p of Object.keys(d.fleet.parts)) add(parts, p);
		for (const c of Object.keys(d.fleet.crystals)) add(crystals, c);
		for (const [t, c] of Object.entries(d.crew.byType)) add(sailorTypes, t, c);
		d.crew.levels.forEach((c, i) => { crewLevels[i] += c; });
		for (const [q, c] of Object.entries(d.quests.byId)) add(quests, q, c);
		for (const [m, c] of Object.entries(d.quests.hunts)) add(hunts, m, c);
		for (const b of Object.keys(d.yard.byItem)) add(builds, b);
		for (const [s, c] of Object.entries(d.yard.shipsMade)) add(shipsMade, s, c);
		for (const [i, c] of Object.entries(d.charts.stops)) add(islands, i, c);
		add(levels, d.level);
		fleetSizes[Math.min(3, d.fleet.n)]++;
		d.runs.days.forEach((c, i) => { runDays[i] += c; });
	}
	return {
		totals: { ...totals, mastery: totals.withMastery ? Math.round(totals.mastery / totals.withMastery) : 0 },
		hulls: top(hulls, 16), sailing: top(sailing, 16), parts: top(parts, 15), crystals: top(crystals, 10),
		sailorTypes: top(sailorTypes, 15), quests: top(quests, 15), hunts: top(hunts, 12), builds: top(builds, 15),
		shipsMade: top(shipsMade, 12), islands: top(islands, 15), levels: top(levels, 12),
		masteryBuckets, crewLevels, fleetSizes, runDays
	};
}

/** Build the boards, refreshing any digest whose save has moved on. */
async function build() {
	const rows = await listCommunity();
	// Taken now, before the first await below: a push that lands while
	// this build is running must leave its account marked, so the next
	// build re-reads it rather than trusting what this one wrote.
	const stale = new Set(behind);
	for (const id of stale) behind.delete(id);
	for (const r of rows) {
		if (stale.has(r.userId) || (r.saveRev !== null && r.saveRev > r.rev)) {
			try {
				const fresh = await digestOf(r.userId);
				await putDigest(r.userId, fresh.stats, fresh.rev);
				r.digest = fresh.stats;
				r.rev = fresh.rev;
				continue;
			} catch (err) {
				// The digest stays behind, so the account stays marked --
				// the next build tries again rather than leaving a stale
				// row on the boards until its save happens to move.
				behind.add(r.userId);
				console.warn(`[community] could not refresh ${r.userId}'s digest:`, err.message);
			}
		}
		r.digest = safeParse(r.stats);
	}
	const live = rows.filter(r => r.digest && typeof r.digest === 'object');
	// The roll as the database has it. Rebuilt rather than patched, so a
	// row deleted by another process -- an account deletion, a restore --
	// drops off it too.
	members.clear();
	for (const r of live) {
		members.add(r.userId);
		r.ref = refOf(r.userId);
	}
	const fame = BOARDS.map(b => rank(b, live));
	return {
		at: Date.now(),
		sailors: live.length,
		named: live.filter(r => r.share === 'named').length,
		fame,
		stats: aggregate(live),
		byRef: new Map(live.map(r => [r.ref, r])),
		byId: new Map(live.map(r => [r.userId, r]))
	};
}

/**
 * The boards, built if they are missing or stale. Two callers share one
 * build.
 *
 * Stale means one of two things. The held copy has simply aged past the
 * deployment's window -- which is what keeps a quiet board from being
 * rebuilt on every request -- or somebody on the boards has saved since
 * it was built, in which case it is wrong now and the window is beside
 * the point. Only the floor holds that second case back, so a ship
 * fitted on the Ship tab is on the boards a few seconds later instead
 * of whenever the window happens to turn over.
 */
async function boards(force = false) {
	if (!force && held) {
		const age = Date.now() - held.at;
		if (age < (behind.size ? Math.min(config.communityRebuildMs, config.communityTtlMs) : config.communityTtlMs)) return held;
	}
	if (!building) {
		building = build().then(b => { held = b; return b; }).finally(() => { building = null; });
	}
	return building;
}

/** A push landed: if it was somebody's who is on the boards, theirs is
 *  now behind, and the next request rebuilds. */
onSaveChanged(userId => {
	if (members.has(userId)) behind.add(userId);
});

/** The boards are stale: the next request builds them afresh. */
export function invalidate() {
	held = null;
}

/** An account is leaving -- or being deleted -- so its place goes. */
export function leaveBoards(userId) {
	if (userId) {
		members.delete(userId);
		behind.delete(userId);
	}
	invalidate();
}

/** An entry as the page sees it: its key turned into "you" or nothing. */
const shown = userId => ({ key, ...e }) => ({ ...e, you: Boolean(userId) && key === userId });

/** What the boards say, as the page reads them, with the caller's own places. */
function answer(b, userId) {
	const fame = b.fame.map(f => ({
		id: f.id, title: f.title, icon: f.icon, unit: f.unit, n: f.n,
		top: f.top.map(shown(userId))
	}));
	let you = null;
	if (userId) {
		const r = b.byId.get(userId);
		const places = {};
		for (const f of b.fame) {
			const p = f.places.get(userId);
			if (p) places[f.id] = { ...p, of: f.n };
		}
		// The caller's own line on the head of the tab: the level and
		// the day they joined, beside their places.
		you = { places, ref: r ? r.ref : null, share: r ? r.share : null, joinedAt: r ? r.joinedAt : null, level: r && r.digest ? r.digest.level : null, mastery: r && r.digest ? r.digest.mastery : 0 };
	}
	return { sailors: b.sailors, named: b.named, updatedAt: b.at, fame, stats: b.stats, you };
}

/**
 * Put a signed-in account on the boards unless it has asked not to be.
 *
 * The boards were opt-in and nearly empty, which is the usual fate of a
 * leaderboard nobody is on: there is nothing to look at, so nobody
 * joins, so there is nothing to look at. They are opt-out instead --
 * signing in puts you on them by name, and one press on the Community
 * tab takes you off again and remembers it.
 *
 * Called from /api/me, which every load asks: that is the one place
 * that already knows who is signed in and already reads how they stand.
 * It writes only when there is no row and no refusal on record, so the
 * common case is the read it was doing anyway.
 *
 * Returns how the account is shown, which is what the caller answers.
 */
export async function ensureOnBoards(userId) {
	const state = await getShareState(userId);
	if (state.share || state.off || !state.known) return state.share;
	const { stats, rev } = await digestOf(userId);
	await putCommunity(userId, DEFAULT_SHARE, stats, rev);
	members.add(userId);
	invalidate();
	return DEFAULT_SHARE;
}

export function communityRoutes() {
	const router = express.Router();

	/** The boards. Signed in or not: what is on them was offered to
	 *  anyone who opens this page. A signed-in caller is told which
	 *  entries are theirs and where they stand on every board. */
	router.get('/community', wrap(async (req, res) => {
		const uid = sessionUser(req);
		res.set('Cache-Control', 'no-store');
		res.json(answer(await boards(), uid));
	}));

	/**
	 * Take part, change how you are shown, or leave.
	 *
	 * Joining takes the digest of the save as it stands and puts it on
	 * the boards at once; leaving deletes the row, and with it the only
	 * derived copy of anything about the account.
	 */
	router.put('/community/share', requireUser, express.json({ limit: 1024 }), wrap(async (req, res) => {
		const share = req.body && req.body.share;
		if (share !== 'off' && !SHARES.includes(share)) {
			return res.status(400).json({ error: 'Say how you want to be shown: named, anon, or off.' });
		}
		if (share === 'off') {
			// Remembered on the account, so the next sign-in does not
			// quietly put them back on the boards they just left.
			await setCommunityOff(req.userId, true);
			await deleteCommunity(req.userId);
			members.delete(req.userId);
			behind.delete(req.userId);
		} else {
			const { stats, rev } = await digestOf(req.userId);
			await putCommunity(req.userId, share, stats, rev);
			await setCommunityOff(req.userId, false);
			members.add(req.userId);
			behind.delete(req.userId);
		}
		invalidate();
		res.set('Cache-Control', 'no-store');
		res.json({ share: share === 'off' ? null : share });
	}));

	/** One board whole, to a hundred places. */
	router.get('/community/board/:id', wrap(async (req, res) => {
		const b = await boards();
		const f = b.fame.find(x => x.id === req.params.id);
		res.set('Cache-Control', 'no-store');
		if (!f) return res.status(404).json({ error: 'No such board.' });
		res.json({ id: f.id, title: f.title, icon: f.icon, unit: f.unit, n: f.n, all: f.all.map(shown(sessionUser(req))) });
	}));

	/** A sailor's card: their places, their ship, their crew, their career. */
	router.get('/community/sailor/:ref', wrap(async (req, res) => {
		const b = await boards();
		const r = b.byRef.get(String(req.params.ref));
		res.set('Cache-Control', 'no-store');
		if (!r) return res.status(404).json({ error: 'No sailor by that handle is on the boards.' });
		res.json({ ...card(r, b.fame), you: sessionUser(req) === r.userId });
	}));

	/** The named sailors whose name holds `q`, ten at most. Unnamed
	 *  sailors are not found this way: that is what unnamed means. */
	router.get('/community/find', wrap(async (req, res) => {
		const q = String(req.query.q || '').trim().toLowerCase();
		res.set('Cache-Control', 'no-store');
		if (q.length < 2) return res.json({ sailors: [] });
		const b = await boards();
		const hits = [...b.byRef.values()].filter(r => r.share === 'named' && String(r.username).toLowerCase().includes(q)).slice(0, 10);
		res.json({ sailors: hits.map(r => ({ ref: r.ref, name: r.username, avatar: avatarURL(r) })) });
	}));

	/** The caller's own digest as the boards would take it right now --
	 *  for the page to show what it is offering before anyone agrees. */
	router.get('/community/mine', requireUser, wrap(async (req, res) => {
		res.set('Cache-Control', 'no-store');
		res.json({ digest: (await digestOf(req.userId)).stats });
	}));

	return router;
}
