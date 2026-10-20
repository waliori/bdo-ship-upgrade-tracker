// The studies as tables for the paper's figures.
//   node tools/rpit/study/charts.mjs <dir of pulled studies> <out dir>
// records.csv  one row a study: when, who (hashed), planner, release,
//              layout, session, chains, what the planner said (R, T,
//              μ, steps, ms) and what the run gave once recorded.
// steps.csv    one row a search step: the candidate's value, the
//              current and the best, the operators, acceptance.
// rounds.csv   one row a price-of-time round: μ, R, T, rate.
// thick.csv    one row a thickening try after the search.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: charts.mjs <studies dir> <out dir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const who = id => (id ? createHash('sha256').update(String(id)).digest('hex').slice(0, 10) : '');
const cell = v => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '""')}"`);
const csv = (name, head, rows) => fs.writeFileSync(path.join(out, name), [head.join(','), ...rows.map(r => r.map(cell).join(','))].join('\n') + '\n');
const records = [], steps = [], rounds = [], thick = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
	const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
	const st = rec.body || {};
	const s = rec.sailed;
	const hours = s && s.timer && s.timer.startedAt ? (s.at - s.timer.startedAt) / 3600000 : null;
	records.push([rec.id, rec.createdAt, who(rec.userId), rec.planner, rec.release, rec.layout, rec.day, st.session ?? '', st.chains ?? '', st.R ?? '', st.T ?? '', st.mu ?? '', (st.trace || []).filter(e => e.k === 'step').length, st.ms ?? '', st.value ?? '', st.hours_ ?? '',
		s ? s.silver - (s.spent || 0) : '', s ? s.trades : '', s ? s.done : '', s ? s.all : '', hours ?? '', s ? (s.abandoned ? 1 : 0) : '', s && s.planned ? s.planned.net : '', s && s.planned ? s.planned.hours : '']);
	// A search's steps come before the round event that judges them: the
	// searches are counted by their starts, the last one the final search.
	let round = -1;
	for (const e of st.trace || []) {
		if (e.k === 'start') round++;
		if (e.k === 'round') rounds.push([rec.id, e.round, e.mu, e.f, e.R, e.T, e.rate]);
		else if (e.k === 'step') steps.push([rec.id, round, e.it, e.op, e.rep, e.f, e.cur, e.best, e.acc, e.ok, e.temp]);
		else if (e.k === 'thick') thick.push([rec.id, e.chain, e.top, e.f, e.kept]);
	}
}
csv('records.csv', ['id', 'at', 'who', 'planner', 'release', 'layout', 'day', 'session', 'chains', 'R', 'T', 'mu', 'steps', 'ms', 'value', 'hours', 'sailed_net', 'sailed_trades', 'sailed_done', 'sailed_all', 'sailed_hours', 'abandoned', 'planned_net', 'planned_hours'], records);
csv('steps.csv', ['id', 'round', 'it', 'op', 'rep', 'f', 'cur', 'best', 'acc', 'ok', 'temp'], steps);
csv('rounds.csv', ['id', 'round', 'mu', 'f', 'R', 'T', 'rate'], rounds);
csv('thick.csv', ['id', 'chain', 'top', 'f', 'kept'], thick);
console.log(`${records.length} studies: ${steps.length} steps, ${rounds.length} rounds, ${thick.length} thickenings → ${out}`);
