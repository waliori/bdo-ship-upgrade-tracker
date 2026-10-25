// The app's line icons: one stroke, one size, drawn in the text's own
// colour. They stand where emoji used to, which every system painted in
// its own colours and at its own size.
//
//   ico('camera')            an <svg> sized to the text beside it
//   ico('lock', 'warn')      with an extra class

const P = {
	plan: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
	tree: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M6 12h10"/>',
	cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
	list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
	swap: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
	menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
	check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
	anchor: '<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V21M5 13H3a9 8 0 0 0 18 0h-2M8 11h8"/>',
	sail: '<path d="M12 3v14M12 4 5 15h7M13.5 7 18 15h-4.5M3 18h18l-2.5 3h-13z"/>',
	camera: '<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>',
	bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0"/>',
	'bell-off': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0M3 3l18 18"/>',
	device: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M11 18.5h2"/>',
	chat: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
	dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
	lock: '<rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
	box: '<path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
	bread: '<path d="M5 12a7 5 0 0 1 14 0v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM9 8.5v3M12 8v3M15 8.5v3"/>',
	scroll: '<path d="M7 3h11a2 2 0 0 1 2 2v12M7 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2H9M9 8h7M9 12h7"/>',
	target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
	pin: '<path d="M19 10c0 6-7 11-7 11s-7-5-7-11a7 7 0 0 1 14 0z"/><circle cx="12" cy="10" r="2.5"/>',
	home: '<path d="M3 10.5 12 3l9 7.5V21H3zM9.5 21v-6h5v6"/>',
	book: '<path d="M3 4.5h6a3 3 0 0 1 3 3V21a2.5 2.5 0 0 0-2.5-2.5H3zM21 4.5h-6a3 3 0 0 0-3 3V21a2.5 2.5 0 0 1 2.5-2.5H21z"/>',
	horn: '<path d="M3 10v4a1 1 0 0 0 1 1h3l7 5V4L7 9H4a1 1 0 0 0-1 1zM18 9a4 4 0 0 1 0 6"/>',
	map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
	warn: '<path d="M12 3.5 2.5 20h19zM12 10v4.5M12 17.2h.01"/>',
	user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
	users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
	coins: '<circle cx="9" cy="9" r="6"/><path d="M15.2 9.3a6 6 0 1 1-5.9 5.9"/>',
	wave: '<path d="M2 10c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 16c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>',
	fin: '<path d="M2 18c3 0 5-2 7-2s4 2 7 2 4-1 6-2M7.5 16C9 10 13 5.5 18 4.5c-2 4-2 7.5-1 11.5"/>',
	hammer: '<path d="m14 10-9 9a2 2 0 0 1-3-3l9-9M10.5 6.5 14 3l7 7-3.5 3.5z"/>',
	chart: '<path d="M3 3v18h18M7 15l4-4 3 3 6-7"/>',
	calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
	folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
	gem: '<path d="M6.5 3.5h11l4 5.5L12 21 2.5 9zM2.5 9h19M12 21 8.5 9l3.5-5.5L15.5 9z"/>',
	image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 16-5-5-9 9"/>',
	keep: '<path d="M3.5 21V8h4V4.5h3V8h3V4.5h3V8h4v13zM10 21v-5h4v5"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>'
};

/** An inline line icon. Unknown names draw nothing rather than throw. */
export function ico(name, cls = '') {
	const d = P[name];
	if (!d) return '';
	return `<svg class="ico${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
}

// The emoji a shared module still carries (digest.js also writes to
// Discord, where an emoji is right), read as the icon that stands for it.
const FOR = {
	'⚓': 'anchor', '⛵': 'sail', '🚢': 'sail', '📷': 'camera', '🔔': 'bell', '🔇': 'bell-off', '📱': 'device',
	'💬': 'chat', '🎲': 'dice', '🔒': 'lock', '📦': 'box', '🍞': 'bread', '📜': 'scroll', '🎯': 'target',
	'📍': 'pin', '🏠': 'home', '📖': 'book', '📣': 'horn', '🗺': 'map', '⚠': 'warn', '👤': 'user', '👥': 'users',
	'🪙': 'coins', '💰': 'coins', '🌊': 'wave', '🦈': 'fin', '🔨': 'hammer', '📈': 'chart', '📅': 'calendar',
	'🗂': 'folder', '💎': 'gem', '🖼': 'image', '🏰': 'keep', '☀': 'sun', '🧭': 'anchor'
};

/** The icon for an emoji, or the character itself when it is a plain glyph (✦ ⚒ ✎). */
export const icoFor = ch => {
	const n = FOR[ch.replace('\uFE0F', '')];
	return n ? ico(n) : ch;
};
