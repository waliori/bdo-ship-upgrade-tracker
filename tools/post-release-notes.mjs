// Posts release notes from js/about.js to a Discord channel through a webhook.
//
//   DISCORD_RELEASES_WEBHOOK=<url> node tools/post-release-notes.mjs 1.5
//   node tools/post-release-notes.mjs --all --skip=1.5 --dry
//
// The notes in full, as the What's New dialog has them: a head with the
// thanks, then every section with its before and now, its points and its
// picture, packed into as few messages as Discord's limits allow.
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

const md = html => String(html)
	.replace(/<\/?b>/g, '**')
	.replace(/<\/?i>/g, '*')
	.replace(/<\/?(kbd|code)>/g, '`')
	.replace(/<[^>]+>/g, '');
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
const size = e => (e.title || '').length + (e.description || '').length + (e.footer ? e.footer.text.length : 0)
	+ (e.fields || []).reduce((n, f) => n + f.name.length + f.value.length, 0);

// Discord takes ten embeds and 6000 characters of text a message, and
// ten files; an embed's text is at most 4096.
function messages(r) {
	const t = r.thanks;
	const head = {
		title: cut(`Sailor's Log ${r.id} — ${r.name}`, 256),
		url: SITE,
		color: COLOR,
		description: cut(`**${r.date}**\n\n${md(r.blurb || r.sum)}`, 4096),
	};
	if (t && t.who && t.who.length) {
		head.fields = [{
			name: 'Asked for by you',
			value: cut([md(t.text || ''), ...t.who.map(w => `**${w.name}** — ${md(w.did)}`),
				t.also && t.also.length ? `Also reported and tested: ${t.also.join(', ')}.` : '', md(t.foot || '')].filter(Boolean).join('\n\n'), 1024),
		}];
	}
	const items = [{ embed: head, file: null }];
	for (const sec of r.sections) {
		const parts = [];
		if (sec.before) parts.push(`**Before:** ${md(sec.before)}`);
		if (sec.text) parts.push(sec.before ? `**Now:** ${md(sec.text)}` : md(sec.text));
		if (sec.points && sec.points.length) parts.push(sec.points.map(x => `• ${md(x)}`).join('\n'));
		const embed = { title: cut(md(sec.title || '').replace(/\*/g, '') || 'More', 256), color: COLOR, description: cut(parts.join('\n\n'), 4096) };
		let file = null;
		if (sec.media) {
			file = { name: path.basename(sec.media), data: fs.readFileSync(path.join(root, sec.media)) };
			embed.image = { url: `attachment://${file.name}` };
		}
		items.push({ embed, file });
	}
	items[items.length - 1].embed.footer = { text: `${SITE.replace('https://', '')} · Menu → What's new` };
	const out = [];
	let cur = null;
	for (const it of items) {
		const n = size(it.embed);
		if (!cur || cur.embeds.length >= 10 || cur.chars + n > 5900 || (it.file && cur.files.length >= 10)) out.push(cur = { embeds: [], files: [], chars: 0 });
		cur.embeds.push(it.embed); cur.chars += n;
		if (it.file) cur.files.push(it.file);
	}
	return out.map(m => ({ payload: { embeds: m.embeds }, files: m.files, chars: m.chars }));
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
	console.log(`${r.id}: ${list.length} messages — ${list.map(m => `${m.payload.embeds.length} embeds, ${m.chars} chars, ${m.files.length} files`).join(' | ')}`);
	if (dry) continue;
	for (const m of list) await send(m);
}
