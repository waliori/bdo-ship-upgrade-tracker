// Posts release notes from js/about.js to a Discord channel through a webhook.
//
//   DISCORD_RELEASES_WEBHOOK=<url> node tools/post-release-notes.mjs 1.5
//   node tools/post-release-notes.mjs --all --dry     # show what would be sent
//
// One header message per release (summary, blurb, who asked for it), then one
// message per section with its clip attached. Releases go oldest first so the
// channel reads as a log with the newest at the bottom.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASES } from '../js/about.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = process.env.DISCORD_RELEASES_WEBHOOK;
const COLOR = 0xe0a83a;
const SITE = 'https://sail.walior.it';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const ids = args.filter(a => !a.startsWith('--'));
if (!args.includes('--all') && !ids.length) {
	console.error('Name a release (1.5) or pass --all.');
	process.exit(1);
}
if (!dry && !HOOK) {
	console.error('Set DISCORD_RELEASES_WEBHOOK.');
	process.exit(1);
}

const md = html => html
	.replace(/<\/?b>/g, '**')
	.replace(/<\/?i>/g, '*')
	.replace(/<kbd>(.*?)<\/kbd>/g, '`$1`');
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

function messages(r) {
	const out = [];
	const head = {
		title: cut(`Sailor's Log ${r.id} — ${r.name}`, 256),
		url: SITE,
		color: COLOR,
		description: cut(`*${md(r.sum)}*\n\n${md(r.blurb)}`, 4000),
		footer: { text: `Released ${r.date} · also under Menu → What's new` },
	};
	const t = r.thanks;
	if (t && t.who && t.who.length) {
		head.fields = [{
			name: 'Asked for by you',
			value: cut(t.who.map(w => `**${w.name}** — ${w.said ? `*“${md(w.said)}”* ` : ''}${md(w.did)}`).join('\n')
				+ (t.also && t.also.length ? `\n\nBugs reported and runs tested by ${t.also.map(n => `**${n}**`).join(', ')}.` : ''), 1024),
		}];
	}
	out.push({ payload: { embeds: [head] } });

	for (const s of r.sections) {
		const parts = [];
		if (s.text) parts.push(md(s.text));
		if (s.points) parts.push(s.points.map(p => `• ${md(p)}`).join('\n'));
		const embed = { title: cut(md(s.title).replace(/\*/g, ''), 256), color: COLOR, description: cut(parts.join('\n\n'), 4000) };
		let file = null;
		if (s.media) {
			const name = path.basename(s.media);
			file = { name, data: fs.readFileSync(path.join(root, s.media)) };
			embed.image = { url: `attachment://${name}` };
		}
		out.push({ payload: { embeds: [embed] }, file });
	}
	return out;
}

async function send({ payload, file }) {
	for (;;) {
		let init;
		if (file) {
			const form = new FormData();
			form.append('payload_json', JSON.stringify({ ...payload, allowed_mentions: { parse: [] }, attachments: [{ id: 0, filename: file.name }] }));
			form.append('files[0]', new Blob([file.data]), file.name);
			init = { method: 'POST', body: form };
		} else {
			init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }) };
		}
		const res = await fetch(`${HOOK}?wait=true`, init);
		if (res.status === 429) {
			const j = await res.json();
			await new Promise(s => setTimeout(s, (j.retry_after ?? 1) * 1000 + 100));
			continue;
		}
		if (!res.ok) throw new Error(`webhook ${res.status}: ${(await res.text()).slice(0, 300)}`);
		return;
	}
}

const picked = RELEASES.filter(r => args.includes('--all') || ids.includes(r.id)).reverse();
if (!picked.length) {
	console.error('No such release.');
	process.exit(1);
}
for (const r of picked) {
	const list = messages(r);
	console.log(`${r.id}: ${list.length} messages`);
	if (dry) continue;
	for (const m of list) await send(m);
}
