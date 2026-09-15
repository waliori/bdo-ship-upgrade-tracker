// The little markup a feedback post is written in, and the HTML it
// becomes.
//
// A bug report is worth reading, and a wall of unbroken text is not: a
// list of steps, a quoted error, a screenshot in the middle of the
// sentence it belongs to. So the box takes a forum's markup rather than
// plain words -- the same handful of marks anyone has already typed a
// hundred times on Discord.
//
// Nothing a stranger writes is ever trusted as HTML. The source is
// escaped first and the grammar below is applied to the escaped text, so
// every tag in the output was put there by this file. That is the whole
// of the safety argument, and it is why this module renders rather than
// sanitises: there is no path by which a `<script>` in the source
// becomes a `<script>` in the page, because the `<` stopped being a `<`
// before any rule ran.
//
// Two more rules follow from it:
//
//   * a link may only be http, https or mailto. Anything else -- and
//     `javascript:` is the one that matters -- is left as text.
//   * an image may only be an attachment of the post it is in. An
//     `![](a pixel somewhere else)` would be blocked by the page's
//     own image policy anyway, and it would tell somewhere else that an
//     admin had opened the inbox, so it renders as a plain link instead.

import { esc } from './fmt.js';

/** How long a post may be, in characters. Matched by the server. */
export const MAX_MARKUP = 8000;

/** Where an attachment is fetched from, by id. */
export const fileURL = id => `/api/feedback/file/${encodeURIComponent(id)}`;

/* ------------------------------------------------------------------ *
 * Links, and the ones that are videos
 * ------------------------------------------------------------------ */

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

// A film someone points at is almost always one of these, and a bare
// link to it reads as a card rather than as a line of URL. Everything
// else stays an ordinary link -- guessing at an embed for a host that
// does not offer one only produces a dead frame.
const VIDEO = [
	{ host: 'YouTube', embed: id => `https://www.youtube-nocookie.com/embed/${id}`,
		thumb: id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
		of: url => {
			const m = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/)([\w-]{6,20})/i.exec(url)
				|| /^https?:\/\/youtu\.be\/([\w-]{6,20})/i.exec(url);
			return m ? m[1] : null;
		} },
	{ host: 'Streamable', embed: id => `https://streamable.com/e/${id}`, thumb: () => null,
		of: url => {
			const m = /^https?:\/\/streamable\.com\/(?:e\/)?([\w]{4,12})/i.exec(url);
			return m ? m[1] : null;
		} }
];

/** The video a URL points at, or null. */
export function videoOf(url) {
	for (const site of VIDEO) {
		const id = site.of(url);
		if (id) return { host: site.host, id, embed: site.embed(id), thumb: site.thumb(id), url };
	}
	return null;
}

/* ------------------------------------------------------------------ *
 * Inline marks
 * ------------------------------------------------------------------ */

// Code spans are pulled out before anything else runs and put back
// after everything has, so a `**` inside one stays two asterisks. The
// marker is a NUL, which is stripped from the source on the way in --
// so no post can write one and forge a slot.
const NUL = '\u0000';

function inline(raw, ctx) {
	const held = [];
	const hold = html => `${NUL}${held.push(html) - 1}${NUL}`;

	let out = esc(raw);

	// `code`
	out = out.replace(/`([^`\n]+)`/g, (m, code) => hold(`<code>${code}</code>`));

	// ![alt](attachment:id) -- a picture of the post's own
	out = out.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (m, alt, src) => {
		const file = attached(src, ctx);
		if (!file) return SAFE_LINK.test(src) ? link(src, alt || src, hold) : m;
		return hold(picture(file, alt));
	});

	// [words](url)
	out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, words, href) =>
		(SAFE_LINK.test(href) ? link(href, words, hold) : m));

	// A bare URL, with the sentence's punctuation left outside it.
	out = out.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+)/g, (m, before, url) => {
		const tail = /[.,;:!?]+$/.exec(url);
		const clean = tail ? url.slice(0, -tail[0].length) : url;
		return `${before}${link(clean, shortURL(clean), hold)}${tail ? tail[0] : ''}`;
	});

	out = out
		.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^\w*])\*([^\s*][^\n*]*?)\*(?![\w*])/g, '$1<em>$2</em>')
		.replace(/(^|[^\w_])_([^\s_][^\n_]*?)_(?![\w_])/g, '$1<em>$2</em>')
		.replace(/~~([^\n]+?)~~/g, '<del>$1</del>')
		// A forum's spoiler: there under the blur, once it is asked for.
		.replace(/\|\|([^\n]+?)\|\|/g, '<span class="mk-spoiler" tabindex="0" role="button">$1</span>');

	return out.replace(new RegExp(`${NUL}(\\d+)${NUL}`, 'g'), (m, i) => held[Number(i)]);
}

/** An `attachment:id` that this post actually carries, or null. */
function attached(src, ctx) {
	const m = /^attachment:([A-Za-z0-9_-]{4,64})$/.exec(src);
	if (!m) return null;
	// Escaping ran before this, so the id is still the id: it is
	// alphanumeric by the pattern above and nothing in it can be escaped.
	return ctx.files.get(m[1]) || null;
}

function picture(file, alt) {
	const label = alt || file.name || 'a screenshot';
	const size = file.width && file.height ? ` width="${file.width}" height="${file.height}"` : '';
	return `<a class="mk-shot" href="${esc(fileURL(file.id))}" data-file="${esc(file.id)}">`
		+ `<img src="${esc(fileURL(file.id))}" alt="${esc(label)}"${size} loading="lazy" decoding="async"></a>`;
}

function link(href, words, hold) {
	return hold(`<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${words}</a>`);
}

/** A URL as a line of text rather than as a paragraph of one. */
function shortURL(url) {
	if (url.length <= 58) return url;
	return `${url.slice(0, 40)}…${url.slice(-12)}`;
}

/* ------------------------------------------------------------------ *
 * Blocks
 * ------------------------------------------------------------------ */

const FENCE = /^\s*```(\w*)\s*$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

/** True where a line would start a block of its own, so a paragraph
 *  knows where it ends without needing a blank line after it. */
function starts(line) {
	return FENCE.test(line) || HEADING.test(line) || QUOTE.test(line)
		|| BULLET.test(line) || NUMBER.test(line) || RULE.test(line) || !line.trim();
}

function blocks(text, ctx) {
	const lines = text.split('\n');
	const out = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (!line.trim()) { i++; continue; }

		const fence = FENCE.exec(line);
		if (fence) {
			const body = [];
			i++;
			while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
			i++;   // the closing fence, or the end of the post
			out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
			continue;
		}

		const heading = HEADING.exec(line);
		if (heading) {
			const level = heading[1].length + 2;   // the dialog's own title is the h2
			out.push(`<h${level}>${inline(heading[2], ctx)}</h${level}>`);
			i++;
			continue;
		}

		if (RULE.test(line)) { out.push('<hr>'); i++; continue; }

		if (QUOTE.test(line)) {
			const body = [];
			while (i < lines.length && QUOTE.test(lines[i])) body.push(QUOTE.exec(lines[i++])[1]);
			out.push(`<blockquote>${blocks(body.join('\n'), ctx)}</blockquote>`);
			continue;
		}

		if (BULLET.test(line) || NUMBER.test(line)) {
			const ordered = !BULLET.test(line);
			const items = [];
			while (i < lines.length) {
				const item = ordered ? NUMBER.exec(lines[i]) : BULLET.exec(lines[i]);
				if (!item) break;
				i++;
				// A line under an item that is not itself a block carries on
				// with it, so a wrapped sentence stays one bullet.
				const more = [item[1]];
				while (i < lines.length && !starts(lines[i])) more.push(lines[i++].trim());
				items.push(`<li>${inline(more.join(' '), ctx)}</li>`);
			}
			out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
			continue;
		}

		const para = [line];
		i++;
		while (i < lines.length && !starts(lines[i])) para.push(lines[i++]);
		out.push(paragraph(para, ctx));
	}

	return out.join('');
}

/** A paragraph -- or, where it is nothing but a link to a film, a card
 *  for the film. A line break inside stays a line break: someone laying
 *  out steps should not have to know that a blank line is what a
 *  paragraph wants. */
function paragraph(lines, ctx) {
	const whole = lines.join('\n').trim();
	if (!/\s/.test(whole)) {
		const video = videoOf(whole);
		if (video) return card(video);
	}
	return `<p>${lines.map(l => inline(l, ctx)).join('<br>')}</p>`;
}

/** A film, as a still that turns into the player when it is asked for.
 *  Nothing loads from the video host until then -- the card is this
 *  site's own markup, and the only thing it fetches unbidden is the
 *  thumbnail. */
function card(video) {
	const thumb = video.thumb
		? `<img class="mk-video-thumb" src="${esc(video.thumb)}" alt="" loading="lazy" decoding="async">`
		: '';
	return `<div class="mk-video" data-embed="${esc(video.embed)}" data-host="${esc(video.host)}">
		${thumb}
		<button type="button" class="mk-play" aria-label="Play this ${esc(video.host)} video">▶</button>
		<a class="mk-video-out" href="${esc(video.url)}" target="_blank" rel="noopener noreferrer">${esc(video.host)} ↗</a>
	</div>`;
}

/* ------------------------------------------------------------------ *
 * The whole of it
 * ------------------------------------------------------------------ */

/**
 * A post, as HTML.
 *
 * `files` are the attachments it may show: anything else an
 * `attachment:` points at is not this post's to display, and renders as
 * the text it was written as.
 */
export function renderMarkup(source, { files = [] } = {}) {
	const ctx = { files: new Map(files.map(f => [String(f.id), f])) };
	const text = clean(source);
	if (!text) return '';
	return blocks(text, ctx);
}

/**
 * A post from before the box could do any of this.
 *
 * The entries already in the inbox were typed as plain words, and words
 * that were plain when they were written must not start meaning
 * something now -- an `*` that was an asterisk stays an asterisk. Only
 * the links are picked out, because a link was always a link.
 */
export function renderPlain(source) {
	const text = clean(source);
	if (!text) return '';
	const held = [];
	const hold = html => `${NUL}${held.push(html) - 1}${NUL}`;
	const out = esc(text).replace(/(^|[\s(])(https?:\/\/[^\s<>()]+)/g, (m, before, url) => {
		const tail = /[.,;:!?]+$/.exec(url);
		const clean2 = tail ? url.slice(0, -tail[0].length) : url;
		return `${before}${link(clean2, shortURL(clean2), hold)}${tail ? tail[0] : ''}`;
	});
	return `<div class="mk-plain">${out.replace(new RegExp(`${NUL}(\\d+)${NUL}`, 'g'), (m, i) => held[Number(i)])}</div>`;
}

function clean(source) {
	return String(source == null ? '' : source)
		.replace(/\r\n?/g, '\n')
		// eslint-disable-next-line no-control-regex -- the NUL is the point
		.replace(/\u0000/g, '')
		.slice(0, MAX_MARKUP)
		.trim();
}

/**
 * The one line a post is worth in a list: its words, with the marks
 * taken off and the pictures named.
 */
export function plainOf(source, limit = 160) {
	const text = clean(source)
		.replace(/```[\s\S]*?```/g, ' code ')
		.replace(/!\[([^\]\n]*)\]\([^)\s]+\)/g, (m, alt) => (alt ? `[${alt}]` : '[image]'))
		.replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
		.replace(/[*_~`>#|]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
