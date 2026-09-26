// What an instance, a plan and a result must look like.
//
// Every solver on the bench reads the same instance file and hands back
// the same plan file, and the simulator scores it: a malformed file
// caught here is a wrong number that never reaches a table. Each check
// returns the list of what is wrong, empty when nothing is, so a caller
// can say all of it at once rather than the first thing.

const num = v => typeof v === 'number' && Number.isFinite(v);
const int = v => Number.isInteger(v);
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** What is wrong with an instance, or []. */
export function validateInstance(I) {
	const e = [];
	if (!obj(I)) return ['instance is not an object'];
	if (typeof I.name !== 'string' || !I.name) e.push('name missing');
	if (!obj(I.goods)) e.push('goods missing');
	else for (const [g, v] of Object.entries(I.goods)) {
		if (!obj(v) || !num(v.w) || v.w < 0 || !num(v.p) || v.p < 0 || !num(v.b) || v.b < 0 || !int(v.level)) e.push(`good ${g} malformed`);
		else if (v.cap !== null && v.cap !== undefined && !(num(v.cap) && v.cap >= 0)) e.push(`good ${g} cap malformed`);
	}
	const ids = new Set();
	const seen = id => { if (ids.has(id)) e.push(`id ${id} repeated`); ids.add(id); };
	if (!Array.isArray(I.stations)) e.push('stations missing');
	else for (const s of I.stations) {
		seen(s.id);
		const goods = I.goods || {};
		if (!(s.in in goods)) e.push(`station ${s.id} gives an unknown good ${s.in}`);
		if (!(s.out in goods)) e.push(`station ${s.id} pays an unknown good ${s.out}`);
		if (!int(s.q) || s.q < 1) e.push(`station ${s.id} q < 1`);
		if (!num(s.ymin) || !num(s.ymax) || s.ymin < 0 || s.ymin > s.ymax) e.push(`station ${s.id} ymin > ymax`);
		if (!num(s.p) || s.p < 0 || s.p > 1) e.push(`station ${s.id} p outside [0, 1]`);
		if (!int(s.m) || s.m < 1) e.push(`station ${s.id} m < 1`);
		if (!num(s.c) || s.c < 0) e.push(`station ${s.id} c < 0`);
	}
	if (!Array.isArray(I.depots) || !I.depots.length) e.push('depots missing');
	else for (const d of I.depots) {
		seen(d.id);
		if (!obj(d.storage)) e.push(`depot ${d.id} storage missing`);
	}
	if (!obj(I.start) || I.start.id !== 'start') e.push('start missing');
	const T = I.travel;
	if (!obj(T) || !Array.isArray(T.points) || !Array.isArray(T.matrix)) e.push('travel missing');
	else {
		const n = T.points.length;
		if (T.matrix.length !== n || T.matrix.some(r => !Array.isArray(r) || r.length !== n)) e.push('travel matrix is not points × points');
		else {
			for (let i = 0; i < n; i++) {
				if (T.matrix[i][i] !== 0) e.push(`travel matrix diagonal ${i} not 0`);
				for (let j = 0; j < n; j++) {
					const v = T.matrix[i][j];
					if (!num(v) || v < 0) { e.push(`travel ${i},${j} negative or not a number`); continue; }
					if (Math.abs(v - T.matrix[j][i]) > 1e-6) e.push(`travel matrix not symmetric at ${i},${j}`);
				}
			}
		}
		const want = ['start', ...(I.depots || []).map(d => d.id), ...(I.stations || []).map(s => s.id)];
		for (const id of want) if (!T.points.includes(id)) e.push(`point ${id} not in travel`);
	}
	const V = I.vehicle;
	if (!obj(V) || !num(V.Wfree) || !num(V.Wdeal) || !num(V.Wmax) || !num(V.speed)) e.push('vehicle malformed');
	else {
		if (!(V.Wfree <= V.Wdeal && V.Wdeal <= V.Wmax)) e.push('vehicle needs Wfree ≤ Wdeal ≤ Wmax');
		if (!(V.speed > 0)) e.push('vehicle speed ≤ 0');
		if (!num(V.slowAtMax) || V.slowAtMax <= 0 || V.slowAtMax > 1) e.push('vehicle slowAtMax outside (0, 1]');
	}
	if (!obj(I.service) || !num(I.service.station) || !num(I.service.depot)) e.push('service malformed');
	if (!obj(I.budgets) || !num(I.budgets.P) || !(I.budgets.H === null || num(I.budgets.H))) e.push('budgets malformed');
	if (!obj(I.initial) || !obj(I.initial.hold) || !obj(I.initial.floors)) e.push('initial malformed');
	const R = I.rules;
	const depots = new Set((I.depots || []).map(d => d.id));
	if (!obj(R)) e.push('rules missing');
	else {
		if (!['fast', 'steady', 'full'].includes(R.pace)) e.push(`rules pace ${R.pace} unknown`);
		if (!['any', 'home_only'].includes(R.dropPolicy)) e.push(`rules dropPolicy ${R.dropPolicy} unknown`);
		if (!depots.has(R.home)) e.push(`rules home ${R.home} is not a depot`);
		if (!depots.has(R.end)) e.push(`rules end ${R.end} is not a depot`);
	}
	if (I.objective !== 'silver_per_hour') e.push(`objective ${I.objective} unknown`);
	return e;
}

/** What is wrong with a plan for `I`, or []. */
export function validatePlan(P, I) {
	const e = [];
	if (!obj(P)) return ['plan is not an object'];
	// Bought ashore and loaded from the home storage before casting off.
	for (const key of ['buy', 'load']) {
		if (P[key] === undefined) continue;
		if (!obj(P[key])) { e.push(`${key} is not an object`); continue; }
		for (const [g, n] of Object.entries(P[key])) {
			if (!(g in I.goods)) e.push(`${key} of unknown good ${g}`);
			if (!num(n) || n < 0) e.push(`${key} ${g} negative`);
		}
	}
	if (!Array.isArray(P.visits)) return [...e, 'visits missing'];
	const stations = new Map(I.stations.map(s => [s.id, s]));
	const depots = new Set(I.depots.map(d => d.id));
	const once = new Set();
	const counts = (v, key, k) => {
		if (v[key] === undefined) return;
		if (key === 'sell' && v[key] === 'all') return;
		if (key === 'drop' && v[key] === 'spare') return;
		if (!obj(v[key])) { e.push(`visit ${k}: ${key} is not an object`); return; }
		for (const [g, n] of Object.entries(v[key])) {
			if (!(g in I.goods)) e.push(`visit ${k}: ${key} of unknown good ${g}`);
			if (!num(n) || n < 0) e.push(`visit ${k}: ${key} ${g} negative`);
		}
	};
	P.visits.forEach((v, k) => {
		if (!obj(v)) { e.push(`visit ${k} is not an object`); return; }
		if (stations.has(v.at)) {
			if (once.has(v.at)) e.push(`visit ${k}: station ${v.at} visited twice`);
			once.add(v.at);
			if (!int(v.a) || v.a < 0 || v.a > stations.get(v.at).m) e.push(`visit ${k}: attempts ${v.a} outside [0, ${stations.get(v.at).m}]`);
		} else if (depots.has(v.at)) {
			for (const key of ['sell', 'drop', 'load']) counts(v, key, k);
		} else e.push(`visit ${k}: ${v.at} is neither a station nor a depot`);
	});
	if (!P.visits.length || !depots.has(P.visits[P.visits.length - 1].at)) e.push('the last visit is not a depot');
	return e;
}

/** What is wrong with a result, or []. */
export function validateResult(r) {
	const e = [];
	if (!obj(r)) return ['result is not an object'];
	for (const k of ['instance', 'solver', 'mode']) if (typeof r[k] !== 'string') e.push(`${k} missing`);
	for (const k of ['scenarios', 'seed', 'computeMs', 'rateOfMeans']) if (!num(r[k])) e.push(`${k} missing`);
	for (const k of ['R', 'T', 'rate', 'P', 'trades', 'calls', 'distance', 'carried']) if (!obj(r.mean) || !num(r.mean[k])) e.push(`mean.${k} missing`);
	for (const k of ['deviations', 'pointless', 'robust', 'std', 'min', 'max']) if (!obj(r[k])) e.push(`${k} missing`);
	return e;
}
