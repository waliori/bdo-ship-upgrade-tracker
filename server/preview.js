// What a link looks like when it is dropped in a chat.
//
// Discord, WhatsApp, X and the rest read a page's og: tags without
// running it, and never see the part of an address after the `#` --
// which is where every shared thing in this app travels. So a link
// says what it carries in its query too: `?s=<id>` for a short link,
// `?l=<kind>` beside the long form's fragment. The page is the same
// page whatever the query says; only the tags at its head change, so a
// ship reads as that ship, a drawing as a drawing, and a bare address
// is not the same old picture every time.
//
// The pictures are the app's own, shot by the capture harness into
// og/ (tools/capture/scenes.mjs, the `og` scene). Nothing is drawn here.

import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[A-Za-z0-9_-]{10}$/;

/** One picture and one pair of lines per thing a link can carry, and
 *  per tab a bare address may name. */
const CARDS = {
	home: {
		title: 'Sailor’s Log — Black Desert sailing',
		text: 'One inventory behind every ship part, the sailing quests, an optimized barter route, and a map you can draw on, share and export into the game.',
		alt: 'Sailor’s Log, the Black Desert sailing planner'
	},
	plan: {
		title: 'A shared plan — Sailor’s Log',
		text: 'Someone’s ship builds and what they hold. Open it to compare with your own, or take it on.',
		alt: 'The Plan screen: builds queued and what they still need'
	},
	ship: {
		title: 'A shared ship — Sailor’s Log',
		text: 'A hull with its parts, crystal and crew. Open it to see its hold, speed and figures.',
		alt: 'The Ship tab: a hull, its four parts and its crew'
	},
	trace: {
		title: 'A drawing on the sea chart — Sailor’s Log',
		text: 'Lines, stops and notes drawn on the Black Desert sea. Open it and the chart flies there.',
		alt: 'A route drawn freehand on the sea chart'
	},
	route: {
		title: 'A barter route — Sailor’s Log',
		text: 'Islands in order with the trade at each. Open it to sail it as a checklist.',
		alt: 'A barter loop plotted on the chart, every leg timed'
	},
	barter: {
		title: 'Barter planner — Sailor’s Log',
		text: 'Name today’s layout from one island or a screenshot, pick silver, a stock, Crow Coins or a material, and sail the run it lays out.',
		alt: 'The Barter tab: today’s chains and the run they make'
	},
	map: {
		title: 'Sea chart — Sailor’s Log',
		text: 'Every barterer, quest and ground on the Black Desert sea; plot a loop, draw on it, export it into the game.',
		alt: 'The sea chart with a pin for every barterer'
	},
	quests: {
		title: 'Sailing quests — Sailor’s Log',
		text: 'The sailing dailies and weeklies, and which of them pay something your builds need.',
		alt: 'The Quests tab'
	},
	community: {
		title: 'The fleet — Sailor’s Log',
		text: 'The boards, the day’s barter layouts the fleet has read, and the hall of fame.',
		alt: 'The Community tab: the boards'
	}
};
const KINDS = new Set(['plan', 'ship', 'trace', 'route']);
/** The pictures a bare address shows, a different one each day. */
const ROTATION = ['home', 'barter', 'map', 'ship', 'route'];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** The lines a kept link earns from what it carries. The server is as
 *  incurious here as everywhere: it counts, and names only what the
 *  payload already names in words. */
export function linesFor(kind, data) {
	const base = CARDS[kind];
	if (!data || typeof data !== 'object') return base;
	if (kind === 'ship' && typeof data.ship === 'string') {
		const parts = Object.values(data.fitted || {}).filter(v => typeof v === 'string' && v);
		const crew = Array.isArray(data.roster) ? data.roster.length : 0;
		const bits = [parts.length ? parts.map(p => p.replace(/^\+\d+\s+/, '')).join(', ') : 'No parts fitted yet'];
		if (crew) bits.push(count(crew, 'sailor', 'sailors'));
		return { ...base, title: `${clip(data.ship, 60)} — Sailor’s Log`, text: clip(bits.join(' · '), 280) };
	}
	if (kind === 'trace') {
		const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null;
		const n = key => (Array.isArray(data[key]) ? data[key].length : 0);
		const bits = [
			n('points') && count(n('points'), 'stop', 'stops'),
			n('strokes') && count(n('strokes'), 'line', 'lines'),
			n('texts') && count(n('texts'), 'note', 'notes'),
			n('areas') && count(n('areas'), 'area', 'areas')
		].filter(Boolean);
		return {
			...base,
			title: name ? `${clip(name, 60)} — a drawing on the sea chart` : base.title,
			text: bits.length ? `${bits.join(', ')} on the Black Desert sea. Open it and the chart flies there.` : base.text
		};
	}
	if (kind === 'route' && Array.isArray(data.r)) {
		const trades = Array.isArray(data.x) ? data.x.length : 0;
		const text = `${count(data.r.length, 'stop', 'stops')}${trades ? `, ${count(trades, 'trade', 'trades')} written out` : ''}${data.h ? ', back to where it started' : ''}. Open it to sail it as a checklist.`;
		return { ...base, title: `A barter route of ${count(data.r.length, 'stop', 'stops')} — Sailor’s Log`, text };
	}
	if (kind === 'plan') {
		const builds = Array.isArray(data.targets) ? data.targets.length : 0;
		const held = data.stock && typeof data.stock === 'object' ? Object.keys(data.stock).length : 0;
		const bits = [builds && count(builds, 'build', 'builds') + ' queued', held && count(held, 'thing', 'things') + ' held'].filter(Boolean);
		return bits.length ? { ...base, text: `${bits.join(', ')}. Open it to compare with your own, or take it on.` } : base;
	}
	return base;
}

/** Which card a bare address gets today. */
export function cardOfTheDay(now = Date.now()) {
	return ROTATION[Math.floor(now / 86400000) % ROTATION.length];
}

/** The tags for one card. `image` is the picture's path on the site. */
export function tags({ title, text, alt }, { origin, url, image, stamp }) {
	const img = `${origin}/${image}?b=${encodeURIComponent(stamp)}`;
	return [
		'<meta property="og:type" content="website">',
		'<meta property="og:site_name" content="Sailor’s Log">',
		`<meta property="og:title" content="${esc(title)}">`,
		`<meta property="og:description" content="${esc(text)}">`,
		`<meta property="og:url" content="${esc(url)}">`,
		`<meta property="og:image" content="${esc(img)}">`,
		'<meta property="og:image:width" content="1200">',
		'<meta property="og:image:height" content="630">',
		`<meta property="og:image:alt" content="${esc(alt)}">`,
		'<meta name="twitter:card" content="summary_large_image">',
		`<meta name="twitter:title" content="${esc(title)}">`,
		`<meta name="twitter:description" content="${esc(text)}">`,
		`<meta name="twitter:image" content="${esc(img)}">`
	].join('\n    ');
}

const OPEN = '<!-- preview -->';
const CLOSE = '<!-- /preview -->';

/**
 * The page with its preview tags written for one request. `lookup`
 * reads a kept link (null on a deployment without a database); the
 * `origin` handed each request is where the pictures are fetched from,
 * which a chat app needs absolute.
 */
export function previewPage({ file, stamp, lookup = null, have = () => false }) {
	const read = () => fs.readFileSync(file, 'utf8');
	// Read once in production, every time while developing, as the
	// service worker's stamp is.
	const cached = process.env.NODE_ENV === 'production' ? read() : null;
	return async function page(query, origin, now = Date.now()) {
		const html = cached || read();
		const at = html.indexOf(OPEN);
		const end = html.indexOf(CLOSE);
		if (at < 0 || end < at) return html;
		// A bare address keeps the front page's words and changes only
		// its picture, a different part of the app each day.
		let card = cardOfTheDay(now);
		let lines = { ...CARDS.home, alt: CARDS[card].alt };
		let url = `${origin}/`;
		const s = typeof query.s === 'string' ? query.s : '';
		const l = typeof query.l === 'string' ? query.l : '';
		if (s && ID_RE.test(s) && lookup) {
			try {
				const link = await lookup(s);
				if (link && KINDS.has(link.kind)) {
					card = link.kind;
					let data = null;
					try { data = JSON.parse(link.payload); } catch { /* the plain card */ }
					lines = linesFor(link.kind, data);
					url = `${origin}/?s=${s}`;
				}
			} catch { /* the plain card; the page still opens the link */ }
		} else if (l && CARDS[l] && l !== 'home') {
			card = l;
			lines = CARDS[l];
			url = `${origin}/?l=${l}`;
		}
		// A card whose picture was never shot keeps its words and borrows
		// the one picture that is always there.
		const image = have(card) ? `og/${card}.png` : 'og.png';
		const head = tags(lines, { origin, url, image, stamp });
		return html.slice(0, at + OPEN.length) + '\n    ' + head + '\n    ' + html.slice(end);
	};
}

/** Which og/ pictures exist, so a card whose picture was never shot
 *  falls back to the home one rather than a broken image. */
export function picturesIn(dir) {
	try {
		const have = new Set(fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => path.basename(f, '.png')));
		return name => have.has(name);
	} catch {
		return () => false;
	}
}

export const PREVIEW_CARDS = Object.keys(CARDS);
