// Something wrong, or something wanted: More -> Feedback.
//
// A report is a post: a kind, words written the way anyone already
// writes them on Discord -- **bold**, a list, a quoted error, ||the
// spoiler|| -- and up to a few screenshots of the thing that is wrong.
// A picture of the wrong number is worth more than a paragraph about
// it, and the old single line made people flatten three steps into one
// sentence.
//
// Sending needs an account, which is the one thing here that used to be
// looser. Three reasons, and the last is the real one: a report worth
// answering is worth being able to answer; a screenshot has to belong
// to somebody before it can be shown to anybody; and the ceilings that
// keep the inbox a list of things to do rather than a feed have to be
// counted against something. Anyone signed out still has the GitHub
// link, which is the same box in public.
//
// The inbox is the other half, for the accounts named as admins: what
// came in, open first, with the pictures where they were put and the
// words as they were written.

import { esc } from './fmt.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { feature, me, call, signIn } from './sync.js';
import { view } from './ui-state.js';
import { RELEASE } from './about.js';
import { renderMarkup, renderPlain, fileURL, MAX_MARKUP } from './markup.js';

const ISSUES = 'https://github.com/waliori/bdo-ship-upgrade-tracker/issues';

const KINDS = [
	{ id: 'bug', label: 'Something is wrong', hint: 'a number that is off, a button that does nothing, a screen that breaks' },
	{ id: 'idea', label: 'An idea', hint: 'something the app should do, or do differently' },
	{ id: 'other', label: 'Something else', hint: 'a question, a thank-you, a correction to the data' }
];

// What the box may take, until the server says otherwise. These are the
// same numbers server/config.js keeps; the dialog asks for its own copy
// as it opens, so a deployment that has set them differently is obeyed.
const FALLBACK = { images: 4, bytes: 4 * 1024 * 1024, pixels: 1600, text: MAX_MARKUP, open: 4, exempt: false };

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

/** What the browser is, in a few words -- for a bug that only happens on one. */
function agent() {
	const ua = navigator.userAgent || '';
	const browser = /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)[1]}`
		: /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)[1]}`
		: /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)[1]}`
		: /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)[1]}`
		: 'a browser';
	const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
	return [browser, os].filter(Boolean).join(' on ');
}

const MB = n => `${Math.round(n / 104857.6) / 10} MB`;

/* ------------------------------------------------------------------ *
 * Shrinking a screenshot before it is sent
 * ------------------------------------------------------------------ */

function toBlob(canvas, type, quality) {
	return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

/**
 * A picture, cut down to something worth sending.
 *
 * A screenshot of a 4K screen is eight megabytes of PNG and says
 * nothing a 1600-pixel one does not. The work happens here rather than
 * on the server because here is where the picture already is: the
 * browser decoded it to show the thumbnail anyway, and the bytes that
 * never leave are bytes nobody waits for on a phone at sea.
 *
 * A file already small enough is sent exactly as it is -- re-encoding a
 * crisp screenshot of a number to make it smaller than it needs to be
 * is how the number stops being readable. An animation is never
 * re-encoded at all, because a canvas would flatten it to its first
 * frame.
 */
async function shrink(file, limits) {
	if (file.size > limits.bytes * 6) {
		throw new Error(`That file is ${MB(file.size)}; ${MB(limits.bytes)} is the most a report can carry.`);
	}
	if (file.type === 'image/gif') {
		if (file.size > limits.bytes) throw new Error(`That animation is ${MB(file.size)}, and ${MB(limits.bytes)} is the most.`);
		return file;
	}

	const bitmap = await createImageBitmap(file).catch(() => null);
	if (!bitmap) {
		if (file.size <= limits.bytes) return file;
		throw new Error('That image could not be read here, and it is too large to send as it is.');
	}
	const long = Math.max(bitmap.width, bitmap.height);
	if (long <= limits.pixels && file.size <= limits.bytes) {
		if (bitmap.close) bitmap.close();
		return file;
	}

	const scale = Math.min(1, limits.pixels / long);
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	if (bitmap.close) bitmap.close();

	// A photograph stays a photograph; everything else is a screenshot
	// until proved otherwise, and text survives PNG and does not survive
	// JPEG. If the PNG is still too heavy, it was a photograph.
	const first = file.type === 'image/jpeg' ? 'image/jpeg' : file.type === 'image/webp' ? 'image/webp' : 'image/png';
	let blob = await toBlob(canvas, first, 0.92);
	if (blob && blob.size > limits.bytes && first !== 'image/jpeg') blob = await toBlob(canvas, 'image/jpeg', 0.85);
	if (!blob) throw new Error('This browser would not re-encode that image.');
	if (blob.size > limits.bytes) throw new Error(`That one is still ${MB(blob.size)} once shrunk; ${MB(limits.bytes)} is the most.`);
	return blob;
}

/** Send one picture up, and get back what the inbox will know it as. */
async function upload(blob, name) {
	const res = await fetch(`/api/feedback/image?name=${encodeURIComponent(name || '')}`, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'Content-Type': blob.type || 'application/octet-stream' },
		body: blob
	});
	let payload = null;
	try {
		payload = await res.json();
	} catch {
		// A proxy's error page rather than ours.
	}
	if (!res.ok) throw new Error((payload && payload.error) || 'That image did not go up.');
	return payload;
}

/* ------------------------------------------------------------------ *
 * Making the words
 * ------------------------------------------------------------------ */

// What each button on the bar does to the selection. `wrap` puts marks
// either side of it; `line` puts a mark at the head of every line it
// covers, which is what a list and a quote are.
const MARKS = {
	bold: { wrap: '**', hint: 'bold' },
	italic: { wrap: '*', hint: 'italic' },
	strike: { wrap: '~~', hint: 'struck out' },
	code: { wrap: '`', hint: 'code' },
	spoiler: { wrap: '||', hint: 'hidden until asked for' },
	head: { line: '## ', hint: 'A heading' },
	list: { line: '- ', hint: 'one thing' },
	steps: { line: '1. ', hint: 'first' },
	quote: { line: '> ', hint: 'what it said' }
};

/** Put a mark around, or in front of, whatever is selected. */
function mark(box, what) {
	const rule = MARKS[what];
	if (!rule) return;
	const from = box.selectionStart;
	const to = box.selectionEnd;
	const chosen = box.value.slice(from, to);
	let text;
	let caret;

	if (rule.line) {
		// A line mark belongs at the head of every line the selection
		// touches, whole lines -- not at the caret, which would cut a
		// sentence in half and put a bullet in the wound.
		const head = box.value.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
		const after = box.value.indexOf('\n', to);
		const end = after === -1 ? box.value.length : after;
		const region = box.value.slice(head, end) || rule.hint;
		const numbered = rule.line === '1. ';
		text = region.split('\n').map((line, i) => `${numbered ? `${i + 1}. ` : rule.line}${line}`).join('\n');
		box.value = box.value.slice(0, head) + text + box.value.slice(end);
		caret = [head + text.length, head + text.length];
	} else {
		const body = chosen || rule.hint;
		text = rule.wrap + body + rule.wrap;
		box.value = box.value.slice(0, from) + text + box.value.slice(to);
		caret = chosen
			? [from + text.length, from + text.length]
			: [from + rule.wrap.length, from + rule.wrap.length + body.length];
	}
	box.focus();
	box.setSelectionRange(caret[0], caret[1]);
	box.dispatchEvent(new Event('input'));
}

/** Put something at the caret -- a link, or a picture that has landed. */
function insert(box, text) {
	const from = box.selectionStart;
	const to = box.selectionEnd;
	const pad = from && !/\s/.test(box.value[from - 1] || '') ? '\n' : '';
	box.value = box.value.slice(0, from) + pad + text + box.value.slice(to);
	const at = from + pad.length + text.length;
	box.focus();
	box.setSelectionRange(at, at);
	box.dispatchEvent(new Event('input'));
}

/* ------------------------------------------------------------------ *
 * Reading the words back
 * ------------------------------------------------------------------ */

/** The ids a post puts in the middle of its own text. Anything else it
 *  carries is shown underneath instead, so nothing is hidden by being
 *  attached and never mentioned. */
function mentioned(text) {
	const found = new Set();
	for (const m of String(text || '').matchAll(/attachment:([A-Za-z0-9_-]{4,64})/g)) found.add(m[1]);
	return found;
}

/** A post as HTML, with the pictures it did not place laid out under it. */
function postHTML(entry) {
	const files = entry.files || [];
	const body = entry.format === 'md'
		? renderMarkup(entry.text, { files })
		: renderPlain(entry.text);
	const placed = mentioned(entry.text);
	const loose = files.filter(f => !placed.has(String(f.id)));
	const gallery = loose.length
		? `<div class="fb-gallery">${loose.map(f => `
			<a class="mk-shot" href="${esc(fileURL(f.id))}" data-file="${esc(f.id)}">
				<img src="${esc(fileURL(f.id))}" alt="${esc(f.name || 'a screenshot')}" loading="lazy" decoding="async">
			</a>`).join('')}</div>`
		: '';
	return `<div class="fb-body mk">${body}</div>${gallery}`;
}

/**
 * The parts of a rendered post that only work once they are in the page:
 * a film that is not loaded until it is asked for, a spoiler that opens,
 * a screenshot that fills the screen.
 */
function enhance(root) {
	root.querySelectorAll('.mk-video-thumb').forEach(img => {
		img.addEventListener('error', () => img.remove(), { once: true });
	});
	root.querySelectorAll('.mk-play').forEach(btn => btn.addEventListener('click', () => {
		const card = btn.closest('.mk-video');
		if (!card) return;
		const frame = document.createElement('iframe');
		frame.src = `${card.dataset.embed}?autoplay=1`;
		frame.title = `${card.dataset.host} video`;
		frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
		frame.allowFullscreen = true;
		frame.loading = 'lazy';
		card.classList.add('playing');
		card.replaceChildren(frame);
	}));
	root.querySelectorAll('.mk-spoiler').forEach(el => {
		const open = () => el.classList.add('on');
		el.addEventListener('click', open);
		el.addEventListener('keydown', evt => { if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); open(); } });
	});
	root.querySelectorAll('.mk-shot').forEach(link => link.addEventListener('click', evt => {
		// Modifier-clicks are a request for the picture itself, in a tab
		// of its own; a plain one is a request to look at it here.
		if (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.button) return;
		evt.preventDefault();
		lightbox(link.getAttribute('href'), link.querySelector('img'));
	}));
}

/** One picture, as large as the screen will hold it. Its own layer, over
 *  the dialog rather than instead of it -- the inbox is still there
 *  underneath when it closes. */
function lightbox(href, img) {
	const box = document.createElement('div');
	box.className = 'fb-lightbox';
	box.innerHTML = `<img src="${esc(href)}" alt="${esc(img ? img.alt : '')}">
		<a class="fb-lightbox-out" href="${esc(href)}" target="_blank" rel="noopener">Open the file ↗</a>`;
	const shut = () => {
		box.remove();
		document.removeEventListener('keydown', onKey);
	};
	const onKey = evt => { if (evt.key === 'Escape') { evt.stopPropagation(); shut(); } };
	box.addEventListener('click', evt => { if (!evt.target.closest('.fb-lightbox-out')) shut(); });
	document.addEventListener('keydown', onKey);
	document.body.appendChild(box);
}

/* ------------------------------------------------------------------ *
 * The form
 * ------------------------------------------------------------------ */

/** The feedback form. */
export function openFeedback(kind = 'bug') {
	const inbox = feature('feedback');
	const who = me();
	const limits = { ...FALLBACK, images: feature('uploads') ? FALLBACK.images : 0 };
	const shots = [];        // what has gone up and not yet been sent
	let picked = KINDS.some(k => k.id === kind) ? kind : 'bug';

	const host = openDialog(`
		<h2>Feedback</h2>
		<p class="dialog-copy">${inbox
		? 'Say what is wrong, or what you want. It goes straight to whoever runs this copy of the app, with the section you are on and the build you are running attached.'
		: 'This copy of the app has no inbox of its own, so feedback goes to the project on GitHub — the button below opens an issue with the section and the build filled in.'}</p>
		<div class="fb-kinds" role="radiogroup" aria-label="What kind of feedback">
			${KINDS.map(k => `<button type="button" class="fb-kind${k.id === picked ? ' on' : ''}" role="radio" aria-checked="${k.id === picked}" data-kind="${k.id}"><b>${esc(k.label)}</b><small>${esc(k.hint)}</small></button>`).join('')}
		</div>
		${inbox && !who ? signInPanel() : ''}
		<div class="fb-compose"${inbox && !who ? ' hidden' : ''}>
			<div class="fb-bar" role="toolbar" aria-label="How the words look">
				<button type="button" class="fb-mark" data-mark="bold" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>
				<button type="button" class="fb-mark" data-mark="italic" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>
				<button type="button" class="fb-mark" data-mark="strike" title="Struck out" aria-label="Struck out"><s>S</s></button>
				<button type="button" class="fb-mark" data-mark="code" title="Code" aria-label="Code">&lt;/&gt;</button>
				<button type="button" class="fb-mark" data-mark="spoiler" title="Hidden until asked for" aria-label="Spoiler">▨</button>
				<span class="fb-bar-gap"></span>
				<button type="button" class="fb-mark" data-mark="head" title="A heading" aria-label="Heading">H</button>
				<button type="button" class="fb-mark" data-mark="list" title="A list" aria-label="List">•</button>
				<button type="button" class="fb-mark" data-mark="steps" title="Steps, in order" aria-label="Numbered list">1.</button>
				<button type="button" class="fb-mark" data-mark="quote" title="Something quoted" aria-label="Quote">❝</button>
				<button type="button" class="fb-mark" data-act="link" title="A link (Ctrl+K)" aria-label="Link">↗</button>
				<span class="fb-bar-gap"></span>
				<button type="button" class="fb-mark fb-attach" data-act="attach" title="A screenshot">🖼<span class="btn-label"> Image</span></button>
				<button type="button" class="fb-mark fb-eye" data-act="preview" aria-pressed="false">Preview</button>
			</div>
			<textarea class="field fb-text" rows="8" maxlength="${MAX_MARKUP}"
				placeholder="What happened, or what you would like — and if it went wrong, what you had done just before.&#10;&#10;A screenshot can be pasted straight in."
				aria-label="Your feedback"></textarea>
			<div class="fb-preview mk" hidden></div>
			<div class="fb-shots" hidden></div>
			<p class="fb-hint"><b>**bold**</b> · <i>*italic*</i> · <code>\`code\`</code> · &gt; quote · - list · ||spoiler|| · a link to a film becomes the film</p>
			<input type="file" class="fb-file" accept="${ACCEPT}" multiple hidden>
			${inbox && who ? '<input class="field fb-contact" maxlength="120" placeholder="Somewhere else a reply could reach you (optional)" aria-label="How to reach you">' : ''}
		</div>
		<p class="fb-meta">${inbox ? `Sent ${who ? `as <b>${esc(who.username)}</b>` : 'once you are signed in'} · ` : ''}on <b>${esc(view)}</b> · build <b>${esc(RELEASE)}</b> · ${esc(agent())}</p>
		<div class="dialog-actions">
			<a class="ghost-btn fb-issues" href="${ISSUES}/new" target="_blank" rel="noopener">Open an issue on GitHub ↗</a>
			<span class="fb-space"></span>
			<button class="act quiet" data-close>Cancel</button>
			${inbox ? `<button class="act" data-send${who ? '' : ' disabled'}>Send</button>` : ''}
		</div>`);

	const text = host.querySelector('.fb-text');
	const preview = host.querySelector('.fb-preview');
	const strip = host.querySelector('.fb-shots');
	const picker = host.querySelector('.fb-file');
	const attach = host.querySelector('.fb-attach');
	const send = host.querySelector('[data-send]');

	host.querySelectorAll('.fb-kind').forEach(btn => btn.addEventListener('click', () => {
		picked = btn.dataset.kind;
		host.querySelectorAll('.fb-kind').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-checked', String(b === btn)); });
		fillIssue();
	}));

	if (!who) {
		const link = host.querySelector('[data-act="signin"]');
		if (link) link.addEventListener('click', () => signIn());
		wireIssues();
		return;
	}
	if (attach && !limits.images) attach.hidden = true;
	text.focus();

	/* ---- the ceilings, and anything left from last time ---- */

	// Asked as the dialog opens: what this deployment allows, how many
	// reports are already waiting on an answer, and any picture that was
	// uploaded for a report that was never sent.
	call('GET', '/api/feedback/mine').then(res => {
		if (!res || !res.ok || !res.body) return;
		Object.assign(limits, res.body.limits || {});
		if (attach) attach.hidden = !limits.images;
		for (const file of res.body.files || []) if (shots.length < limits.images) shots.push(file);
		paintShots();
		const left = limits.exempt ? null : (limits.open || 0) - (res.body.open || 0);
		if (left !== null && left <= 0) {
			note(`You have ${res.body.open} reports waiting on an answer — that is as many as the box takes at once. The GitHub link still works.`);
			if (send) send.disabled = true;
		} else if (left !== null && left === 1 && res.body.open) {
			note(`${res.body.open} of your reports are still open; this would be the last one the box takes until they are answered.`);
		}
	}).catch(() => {
		// The ceilings are the server's to enforce anyway; without this
		// answer the dialog simply does not say them in advance.
	});

	function note(words) {
		let line = host.querySelector('.fb-note');
		if (!line) {
			line = document.createElement('p');
			line.className = 'fb-note';
			host.querySelector('.fb-compose').prepend(line);
		}
		line.textContent = words;
	}

	/* ---- the bar ---- */

	host.querySelectorAll('[data-mark]').forEach(btn => btn.addEventListener('click', () => mark(text, btn.dataset.mark)));
	host.querySelector('[data-act="link"]').addEventListener('click', () => {
		const chosen = text.value.slice(text.selectionStart, text.selectionEnd);
		const words = chosen || 'what it is';
		insert(text, `[${words}](https://)`);
		// The caret lands on the part that still has to be typed.
		const at = text.selectionStart - 1;
		text.setSelectionRange(at - 'https://'.length, at);
	});
	const eye = host.querySelector('[data-act="preview"]');
	eye.addEventListener('click', () => {
		const showing = preview.hidden;
		preview.innerHTML = showing
			? (renderMarkup(text.value, { files: shots }) || '<p class="fb-hint">Nothing written yet.</p>')
			: '';
		if (showing) enhance(preview);
		preview.hidden = !showing;
		text.hidden = showing;
		eye.classList.toggle('on', showing);
		eye.setAttribute('aria-pressed', String(showing));
		eye.textContent = showing ? 'Write' : 'Preview';
		if (!showing) text.focus();
	});

	text.addEventListener('keydown', evt => {
		if (!(evt.ctrlKey || evt.metaKey)) return;
		const key = evt.key.toLowerCase();
		if (key === 'b' || key === 'i') { evt.preventDefault(); mark(text, key === 'b' ? 'bold' : 'italic'); }
		if (key === 'k') { evt.preventDefault(); host.querySelector('[data-act="link"]').click(); }
		if (key === 'enter' && send && !send.disabled) { evt.preventDefault(); send.click(); }
	});

	/* ---- pictures ---- */

	function paintShots() {
		strip.hidden = !shots.length;
		strip.innerHTML = shots.map(f => `
			<figure class="fb-shot" data-id="${esc(f.id)}">
				<img src="${esc(fileURL(f.id))}" alt="${esc(f.name || 'a screenshot')}">
				<figcaption>${esc(f.name || 'screenshot')}</figcaption>
				<button type="button" class="fb-shot-in" data-put="${esc(f.id)}" title="Put it in the text where the caret is">Place</button>
				<button type="button" class="fb-shot-x" data-drop="${esc(f.id)}" aria-label="Take this one off">×</button>
			</figure>`).join('');
		strip.querySelectorAll('[data-put]').forEach(btn => btn.addEventListener('click', () => {
			const file = shots.find(f => f.id === btn.dataset.put);
			insert(text, `![${(file && file.name) || 'screenshot'}](attachment:${btn.dataset.put})`);
		}));
		strip.querySelectorAll('[data-drop]').forEach(btn => btn.addEventListener('click', async () => {
			btn.disabled = true;
			const id = btn.dataset.drop;
			const res = await call('DELETE', `/api/feedback/image/${id}`).catch(() => null);
			if (!res || !res.ok) { btn.disabled = false; return toast('That one would not come off.'); }
			const at = shots.findIndex(f => f.id === id);
			if (at >= 0) shots.splice(at, 1);
			// The text may still point at it; a picture the post no longer
			// carries renders as the words it was written as, so this only
			// tidies rather than breaking anything.
			text.value = text.value.replace(new RegExp(`!\\[[^\\]\\n]*\\]\\(attachment:${id}\\)\\n?`, 'g'), '');
			paintShots();
		}));
	}

	async function take(files) {
		const list = [...files].filter(f => f && /^image\//.test(f.type));
		if (!list.length) return;
		if (!limits.images) return toast('This copy of the app cannot take images.');
		for (const file of list) {
			if (shots.length >= limits.images) { toast(`${limits.images} images is the most one report carries.`); break; }
			strip.hidden = false;
			const waiting = document.createElement('div');
			waiting.className = 'fb-shot waiting';
			waiting.textContent = 'sending…';
			strip.appendChild(waiting);
			try {
				const blob = await shrink(file, limits);
				const landed = await upload(blob, file.name);
				shots.push(landed);
			} catch (err) {
				toast(err.message || 'That image did not go up.');
			}
			waiting.remove();
			paintShots();
		}
	}

	if (picker) {
		picker.addEventListener('change', () => { take(picker.files); picker.value = ''; });
		if (attach) attach.addEventListener('click', () => picker.click());
	}
	text.addEventListener('paste', evt => {
		const files = evt.clipboardData && evt.clipboardData.files;
		if (files && files.length) { evt.preventDefault(); take(files); }
	});
	const compose = host.querySelector('.fb-compose');
	compose.addEventListener('dragover', evt => {
		if (!evt.dataTransfer || ![...evt.dataTransfer.types].includes('Files')) return;
		evt.preventDefault();
		compose.classList.add('over');
	});
	compose.addEventListener('dragleave', () => compose.classList.remove('over'));
	compose.addEventListener('drop', evt => {
		if (!evt.dataTransfer || !evt.dataTransfer.files.length) return;
		evt.preventDefault();
		compose.classList.remove('over');
		take(evt.dataTransfer.files);
	});

	/* ---- the way out that is always open ---- */

	function fillIssue() {
		const issues = host.querySelector('.fb-issues');
		const title = { bug: 'Something is wrong', idea: 'An idea', other: 'Feedback' }[picked];
		const body = `${text ? text.value.trim() : ''}\n\n---\nSection: ${view}\nBuild: ${RELEASE}\nBrowser: ${agent()}`;
		issues.href = `${ISSUES}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
	}
	function wireIssues() {
		fillIssue();
		if (text) text.addEventListener('input', fillIssue);
	}
	wireIssues();

	/* ---- sending ---- */

	if (!send) return;
	send.addEventListener('click', async () => {
		const words = text.value.trim();
		if (words.length < 3 && !shots.length) return toast('Say a little more than that');
		send.disabled = true;
		const contact = host.querySelector('.fb-contact');
		let res;
		try {
			res = await call('POST', '/api/feedback', {
				kind: picked, text: words, format: 'md', page: view, version: RELEASE,
				files: shots.map(f => f.id),
				contact: contact ? contact.value.trim() : '',
				username: who.username
			});
		} catch {
			res = null;
		}
		if (!res || !res.ok) {
			send.disabled = false;
			return toast(res && res.body && res.body.error ? res.body.error : 'That did not send — the server did not answer. The GitHub link still works.');
		}
		closeDialog();
		toast(picked === 'bug' ? 'Sent — thank you for saying' : 'Sent — thank you');
	});
}

/** What stands where the box would be, for anyone signed out. */
function signInPanel() {
	return `<div class="fb-signin">
		<p>Reports come from accounts now — so that an answer has somewhere to go, and so that a screenshot belongs to somebody. Signing in asks Discord for a name and nothing else.</p>
		<div class="fb-signin-acts">
			<button type="button" class="act" data-act="signin">Sign in with Discord</button>
			<span class="fb-hint">or write it in public, with the GitHub link below</span>
		</div>
	</div>`;
}

/* ------------------------------------------------------------------ *
 * The inbox
 * ------------------------------------------------------------------ */

/** The inbox, for admins. */
export async function openInbox() {
	const host = openDialog('<h2>Feedback inbox</h2><p class="dialog-copy">Fetching…</p>');
	const res = await call('GET', '/api/feedback').catch(() => null);
	if (!res || !res.ok) {
		host.querySelector('.dialog-box').innerHTML = `<h2>Feedback inbox</h2><p class="dialog-copy">${esc(res && res.body && res.body.error ? res.body.error : 'The inbox did not answer.')}</p><div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`;
		return;
	}
	paintInbox(host, res.body.entries || [], 'all');
}

const KIND_WORD = { bug: 'wrong', idea: 'idea', other: 'other' };

function paintInbox(host, entries, only) {
	const box = host.querySelector('.dialog-box');
	box.classList.add('wide');
	const shown = entries.filter(e => only === 'all' || e.kind === only);
	const open = shown.filter(e => e.status === 'open');
	const done = shown.filter(e => e.status !== 'open');
	const when = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

	const row = e => `<div class="fb-entry ${esc(e.kind)}${e.status === 'open' ? '' : ' done'}" data-id="${e.id}">
		<div class="fb-entry-head">
			<span class="fb-entry-kind">${esc(KIND_WORD[e.kind] || e.kind)}</span>
			<span class="fb-entry-who">${e.username ? esc(e.username) : 'a visitor'}${e.contact ? ` · ${esc(e.contact)}` : ''}</span>
			<span class="fb-entry-when">#${e.id} · ${when(e.createdAt)}</span>
		</div>
		${postHTML(e)}
		<div class="fb-entry-foot">
			<span>${[
		e.page ? `on ${e.page}` : '',
		e.version ? `build ${e.version}` : '',
		e.files && e.files.length ? `${e.files.length} image${e.files.length === 1 ? '' : 's'}` : '',
		e.userId ? `id ${e.userId}` : '',
		e.agent ? e.agent.replace(/^Mozilla\/5\.0 /, '').slice(0, 70) : ''
	].filter(Boolean).map(esc).join(' · ')}</span>
			<span class="fb-entry-acts">
				<button class="chip tiny" data-status="${e.status === 'open' ? 'done' : 'open'}">${e.status === 'open' ? 'Mark done' : 'Reopen'}</button>
				<button class="chip tiny danger" data-drop="${e.id}">Delete</button>
			</span>
		</div>
	</div>`;

	const counts = kind => entries.filter(e => kind === 'all' || e.kind === kind).length;
	box.innerHTML = `<h2>Feedback inbox</h2>
		<p class="dialog-copy">${open.length} open · ${done.length} done · the newest ${entries.length} entries</p>
		<div class="fb-filter">${['all', 'bug', 'idea', 'other'].map(k =>
		`<button type="button" class="chip${k === only ? ' on' : ''}" data-only="${k}">${k === 'all' ? 'Everything' : esc(KIND_WORD[k])} <span class="n">${counts(k)}</span></button>`).join('')}</div>
		<div class="fb-list">${open.map(row).join('') || '<p class="dialog-copy">Nothing open.</p>'}</div>
		${done.length ? `<details class="fb-done"><summary>Done (${done.length})</summary><div class="fb-list">${done.map(row).join('')}</div></details>` : ''}
		<div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`;

	enhance(box);

	box.querySelectorAll('[data-only]').forEach(btn =>
		btn.addEventListener('click', () => paintInbox(host, entries, btn.dataset.only)));

	box.querySelectorAll('[data-status]').forEach(btn => btn.addEventListener('click', async () => {
		const id = Number(btn.closest('.fb-entry').dataset.id);
		const status = btn.dataset.status;
		btn.disabled = true;
		const res = await call('POST', `/api/feedback/${id}/status`, { status }).catch(() => null);
		if (!res || !res.ok) { btn.disabled = false; return toast('That did not stick.'); }
		const entry = entries.find(e => e.id === id);
		if (entry) entry.status = status;
		paintInbox(host, entries, only);
	}));

	// Deleting takes the pictures with it and there is no undo, so the
	// button asks once by becoming the question.
	box.querySelectorAll('[data-drop]').forEach(btn => {
		let asked = false;
		btn.addEventListener('click', async () => {
			if (!asked) {
				asked = true;
				btn.textContent = 'Really?';
				setTimeout(() => { asked = false; btn.textContent = 'Delete'; }, 4000);
				return;
			}
			const id = Number(btn.dataset.drop);
			btn.disabled = true;
			const res = await call('DELETE', `/api/feedback/${id}`).catch(() => null);
			if (!res || !res.ok) { btn.disabled = false; return toast('That one would not go.'); }
			const at = entries.findIndex(e => e.id === id);
			if (at >= 0) entries.splice(at, 1);
			paintInbox(host, entries, only);
		});
	});
}
