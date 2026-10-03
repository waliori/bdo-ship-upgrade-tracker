// Posts release notes from js/about.js to a Discord channel through a webhook.
//
//   DISCORD_RELEASES_WEBHOOK=<url> node tools/post-release-notes.mjs 1.5
//   node tools/post-release-notes.mjs --all --skip=1.5 --dry
//
// One message per release, with its clips attached.
//
// Releases go oldest first so the newest ends at the bottom.

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

// One message per release: a text embed (title, date, blurb, who asked for
// it, the changes), then one image-only embed per clip. Discord caps the
// text of a message's embeds at 6000 characters, so each change is cut to
// its opening words to fit; the full notes are in the app.
function messages(r) {
	const LIMIT = 5800;
	const head = {
		title: cut(`Sailor's Log ${r.id} — ${r.name}`, 256),
		url: SITE,
		color: COLOR,
		description: cut(`**${r.date}** · ${md(r.sum)}\n\n${md(r.blurb)}`, 900),
		footer: { text: 'Full notes under Menu → What\'s new' },
	};
	const t = r.thanks;
	const fields = [];
	if (t && t.who && t.who.length) {
		fields.push({
			name: 'Asked for by you',
			value: cut(t.who.map(w => `**${w.name}** — ${md(w.did)}`).join('\n')
				+ (t.also && t.also.length ? `\n\nAlso reported and tested: ${t.also.join(', ')}.` : ''), 900),
		});
	}
	const used = head.title.length + head.description.length + head.footer.text.length
		+ fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
	const n = r.sections.length;
	const each = Math.min(1000, Math.floor((LIMIT - used) / n) - 40);
	const files = [];
	for (const sec of r.sections) {
		const title = md(sec.title).replace(/\*/g, '');
		const first = md(sec.text || (sec.points || [])[0] || '');
		fields.push({ name: cut(title, 256), value: cut(first, Math.max(each - title.length, 50)) || '—' });
		if (sec.media) files.push({ name: path.basename(sec.media), data: fs.readFileSync(path.join(root, sec.media)) });
	}
	head.fields = fields.slice(0, 25);
	const embeds = [head, ...files.slice(0, 9).map(f => ({ url: SITE, image: { url: `attachment://${f.name}` } }))];
	return [{ payload: { embeds }, files: files.slice(0, 9) }];
}

async function send({ payload, files }) {
	for (;;) {
		let init;
		if (files.length) {
			const form = new FormData();
			form.append('payload_json', JSON.stringify({ ...payload, allowed_mentions: { parse: [] }, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }));
			files.forEach((f, i) => form.append(`files[${i}]`, new Blob([f.data]), f.name));
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

const skip = args.filter(a => a.startsWith('--skip=')).map(a => a.slice(7));
const picked = RELEASES.filter(r => (args.includes('--all') || ids.includes(r.id)) && !skip.includes(r.id)).reverse();
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
