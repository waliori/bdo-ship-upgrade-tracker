// What a save's profile may hold, and how each field is bounded.
//
// The profile travels with the save, exports and syncs, so a save written
// by a newer version -- or by hand -- must not put anything unexpected in
// front of the planner. Only known keys survive, each clipped to the
// range the game itself allows. state.js calls this on every read.

/**
 * The profile, keyed and bounded.
 *
 * Only known keys survive, so a save written by a newer version cannot
 * put anything unexpected in front of the planner. `barterCount` is a
 * running total that only goes up, and a Value Pack is on or it is not.
 */
export const isProfile = raw => Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);

export function readProfile(raw) {
	const out = {};
	if (!isProfile(raw)) return out;
	const count = Math.max(0, Math.floor(Number(raw.barterCount) || 0));
	if (count > 0) out.barterCount = count;
	if (raw.valuePack === true) out.valuePack = true;
	if (raw.crew === true) out.crew = true;
	if (typeof raw.level === 'string' && raw.level) out.level = raw.level.slice(0, 20);
	const vouchers = Math.max(0, Math.floor(Number(raw.vouchers) || 0));
	if (vouchers > 0) out.vouchers = vouchers;
	const held = Math.max(0, Math.floor(Number(raw.parleyHeld) || 0));
	if (held > 0) out.parleyHeld = held;
	// The failstack the player takes into a yellow attempt. Bounded the
	// way the game bounds one; zero means "the quoted stack", so only a
	// real number is kept.
	// The failstack each yellow part currently carries, by part. Absent
	// means "the stack the quoted rate assumes for its next level".
	if (isProfile(raw.failstacks)) {
		const stacks = {};
		for (const [base, n] of Object.entries(raw.failstacks)) {
			const v = Math.min(500, Math.max(0, Math.floor(Number(n))));
			if (Number.isFinite(v) && typeof base === 'string' && base.length <= 80) stacks[base] = v;
		}
		if (Object.keys(stacks).length) out.failstacks = stacks;
	}
	// The crew plan: which hull it is for, and how many of each sailor
	// type. Types are checked where they are used (sailors.js knows the
	// pool); here a name is a name and a count is a small whole number.
	if (typeof raw.crewShip === 'string' && raw.crewShip) out.crewShip = raw.crewShip.slice(0, 60);
	// The crew itself: the sailors hired (a name, a type, a level and a
	// condition each), who sits where on each hull, and two saved
	// arrangements per hull. Bounded the way the game bounds them -- sixty
	// sailors, levels one to ten, condition nought to a hundred.
	if (Array.isArray(raw.roster)) {
		const seen = new Set();
		const roster = [];
		for (const r of raw.roster.slice(0, 60)) {
			if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue;
			if (typeof r.type !== 'string' || !r.type) continue;
			seen.add(r.id);
			const entry = {
				id: r.id.slice(0, 24),
				name: String(r.name || r.type).slice(0, 30),
				type: r.type.slice(0, 40),
				lv: Math.min(10, Math.max(1, Math.floor(Number(r.lv) || 1))),
				cond: Math.min(100, Math.max(0, Math.floor(Number(r.cond ?? 100))))
			};
			// The sailor's real stats as the game shows them, when typed in.
			if (isProfile(r.stats)) {
				const st = {};
				for (const k of ['speed', 'accel', 'turn', 'brake', 'force', 'focus', 'vision']) {
					const v = Number(r.stats[k]);
					if (Number.isFinite(v) && v >= 0 && v <= 500) st[k] = Math.round(v * 10) / 10;
				}
				if (Object.keys(st).length) entry.stats = st;
			}
			roster.push(entry);
		}
		if (roster.length) out.roster = roster;
	}
	const seatMap = raw => {
		if (!isProfile(raw)) return null;
		const m = {};
		for (const [seat, id] of Object.entries(raw)) {
			if (/^[a-z]+:\d{1,2}$/.test(seat) && typeof id === 'string' && id) m[seat] = id.slice(0, 24);
		}
		return Object.keys(m).length ? m : null;
	};
	if (isProfile(raw.seats)) {
		const seats = {};
		for (const [ship, m] of Object.entries(raw.seats)) {
			const clean = seatMap(m);
			if (clean && ship.length <= 60) seats[ship] = clean;
		}
		if (Object.keys(seats).length) out.seats = seats;
	}
	if (isProfile(raw.presets)) {
		const presets = {};
		for (const [ship, p] of Object.entries(raw.presets)) {
			if (!isProfile(p) || ship.length > 60) continue;
			const clean = {};
			for (const k of ['p1', 'p2']) {
				const m = seatMap(p[k]);
				if (m) clean[k] = m;
			}
			if (Object.keys(clean).length) presets[ship] = clean;
		}
		if (Object.keys(presets).length) out.presets = presets;
	}
	// What is fitted on each hull by hand: slot -> item (with its level),
	// or '' for an empty slot. Absent means "the best you own".
	if (isProfile(raw.fitted)) {
		const fitted = {};
		for (const [ship, slots] of Object.entries(raw.fitted)) {
			if (ship.length > 60 || !isProfile(slots)) continue;
			const clean = {};
			for (const [slot, item] of Object.entries(slots)) {
				if (['cannon', 'sail', 'figurehead', 'plating'].includes(slot) && typeof item === 'string' && item.length <= 80) clean[slot] = item;
			}
			if (Object.keys(clean).length) fitted[ship] = clean;
		}
		if (Object.keys(fitted).length) out.fitted = fitted;
	}
	// The sea crystal on each hull, by its codex id: one slot, one crystal.
	if (isProfile(raw.crystal)) {
		const crystal = {};
		for (const [ship, id] of Object.entries(raw.crystal)) {
			const n = Math.floor(Number(id));
			if (ship.length <= 60 && Number.isFinite(n) && n > 0) crystal[ship] = n;
		}
		if (Object.keys(crystal).length) out.crystal = crystal;
	}
	// Where each build stood, day by day, for the pace: build id -> date
	// -> units covered. Bounded to a month per build and twenty builds.
	if (isProfile(raw.progress)) {
		const progress = {};
		for (const [id, days] of Object.entries(raw.progress).slice(0, 20)) {
			if (id.length > 40 || !isProfile(days)) continue;
			const clean = {};
			for (const [d, n] of Object.entries(days).sort().slice(-31)) {
				const v = Math.floor(Number(n));
				if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v) && v >= 0) clean[d] = v;
			}
			if (Object.keys(clean).length) progress[id] = clean;
		}
		if (Object.keys(progress).length) out.progress = progress;
	}
	// Which quests are done, stamped with the period they were done in:
	// a date for a daily, a week key for a weekly, 'once' for the chain.
	// A stamp from an earlier period simply stops matching at the reset,
	// so nothing has to sweep them.
	// Where the stock is: per item, how many sit in which storage. A
	// note beside the count, never a second count -- the total stays the
	// number the plan works from.
	if (isProfile(raw.stash)) {
		const stash = {};
		for (const [item, towns] of Object.entries(raw.stash)) {
			if (item.length > 80 || !isProfile(towns)) continue;
			const clean = {};
			for (const [town, n] of Object.entries(towns)) {
				const v = Math.floor(Number(n));
				if (town.length <= 40 && Number.isFinite(v) && v > 0) clean[town] = v;
			}
			if (Object.keys(clean).length) stash[item] = clean;
		}
		if (Object.keys(stash).length) out.stash = stash;
	}
	if (isProfile(raw.questsDone)) {
		const done = {};
		for (const [id, key] of Object.entries(raw.questsDone)) {
			if (id.length <= 40 && typeof key === 'string' && /^(once|W?\d{4}-\d{2}-\d{2})$/.test(key)) done[id] = key;
		}
		if (Object.keys(done).length) out.questsDone = done;
	}
	return out;
}
