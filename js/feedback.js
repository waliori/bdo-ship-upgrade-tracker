// Something wrong, or something wanted: More -> Feedback.
//
// A kind, some words, and the page you were on. On a deployment with a
// database it goes to the server's inbox (and to the operator's Discord,
// when a webhook is set); on a browser-only copy there is no inbox, so
// the dialog points at the project's issues instead. Either way the
// issues link is there, for anyone who would rather write in public.
//
// The inbox is the other half, for the accounts named as admins: what
// came in, open first, and a button to mark each done.

import { esc } from './fmt.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { feature, me, call } from './sync.js';
import { view } from './ui-state.js';
import { RELEASE } from './about.js';

const ISSUES = 'https://github.com/waliori/bdo-ship-upgrade-tracker/issues';

const KINDS = [
	{ id: 'bug', label: 'Something is wrong', hint: 'a number that is off, a button that does nothing, a screen that breaks' },
	{ id: 'idea', label: 'An idea', hint: 'something the app should do, or do differently' },
	{ id: 'other', label: 'Something else', hint: 'a question, a thank-you, a correction to the data' }
];

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

/** The feedback form. */
export function openFeedback(kind = 'bug') {
	const inbox = feature('feedback');
	const who = me();
	const host = openDialog(`
		<h2>Feedback</h2>
		<p class="dialog-copy">${inbox
			? 'Say what is wrong, or what you want. It goes straight to whoever runs this copy of the app, with the section you are on and the build you are running attached.'
			: 'This copy of the app has no inbox of its own, so feedback goes to the project on GitHub — the button below opens an issue with the section and the build filled in.'}</p>
		<div class="fb-kinds" role="radiogroup" aria-label="What kind of feedback">
			${KINDS.map(k => `<button type="button" class="fb-kind${k.id === kind ? ' on' : ''}" role="radio" aria-checked="${k.id === kind}" data-kind="${k.id}"><b>${esc(k.label)}</b><small>${esc(k.hint)}</small></button>`).join('')}
		</div>
		<textarea class="field fb-text" rows="6" maxlength="4000" placeholder="What happened, or what you would like — and if it went wrong, what you had done just before" aria-label="Your feedback"></textarea>
		${inbox && !who ? '<input class="field fb-contact" maxlength="120" placeholder="Where a reply can reach you — a Discord name, say (optional)" aria-label="How to reach you">' : ''}
		<p class="fb-meta">${inbox ? `Sent ${who ? `as <b>${esc(who.username)}</b>` : 'without a name'} · ` : ''}on <b>${esc(view)}</b> · build <b>${esc(RELEASE)}</b> · ${esc(agent())}</p>
		<div class="dialog-actions">
			<a class="ghost-btn fb-issues" href="${ISSUES}/new" target="_blank" rel="noopener">Open an issue on GitHub ↗</a>
			<span class="fb-space"></span>
			<button class="act quiet" data-close>Cancel</button>
			${inbox ? '<button class="act" data-send>Send</button>' : ''}
		</div>`);

	let picked = kind;
	host.querySelectorAll('.fb-kind').forEach(btn => btn.addEventListener('click', () => {
		picked = btn.dataset.kind;
		host.querySelectorAll('.fb-kind').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-checked', String(b === btn)); });
	}));
	const text = host.querySelector('.fb-text');
	text.focus();

	// The GitHub link carries whatever was typed, so a change of mind
	// half-way through loses nothing.
	const issues = host.querySelector('.fb-issues');
	const fill = () => {
		const title = { bug: 'Something is wrong', idea: 'An idea', other: 'Feedback' }[picked];
		const body = `${text.value.trim()}\n\n---\nSection: ${view}\nBuild: ${RELEASE}\nBrowser: ${agent()}`;
		issues.href = `${ISSUES}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
	};
	fill();
	text.addEventListener('input', fill);
	host.querySelectorAll('.fb-kind').forEach(btn => btn.addEventListener('click', fill));

	const send = host.querySelector('[data-send]');
	if (!send) return;
	send.addEventListener('click', async () => {
		const words = text.value.trim();
		if (words.length < 3) return toast('Say a little more than that');
		send.disabled = true;
		const contact = host.querySelector('.fb-contact');
		let res;
		try {
			res = await call('POST', '/api/feedback', {
				kind: picked, text: words, page: view, version: RELEASE,
				contact: contact ? contact.value.trim() : '',
				username: who ? who.username : ''
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

/** The inbox, for admins. */
export async function openInbox() {
	const host = openDialog('<h2>Feedback inbox</h2><p class="dialog-copy">Fetching…</p>');
	const res = await call('GET', '/api/feedback').catch(() => null);
	if (!res || !res.ok) {
		host.querySelector('.dialog-box').innerHTML = `<h2>Feedback inbox</h2><p class="dialog-copy">${esc(res && res.body && res.body.error ? res.body.error : 'The inbox did not answer.')}</p><div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`;
		return;
	}
	paintInbox(host, res.body.entries || []);
}

function paintInbox(host, entries) {
	const open = entries.filter(e => e.status === 'open');
	const done = entries.filter(e => e.status !== 'open');
	const when = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
	const row = e => `<div class="fb-entry ${esc(e.kind)}${e.status === 'open' ? '' : ' done'}" data-id="${e.id}">
		<div class="fb-entry-head">
			<span class="fb-entry-kind">${esc({ bug: 'wrong', idea: 'idea', other: 'other' }[e.kind] || e.kind)}</span>
			<span class="fb-entry-who">${e.username ? esc(e.username) : 'a visitor'}${e.contact ? ` · ${esc(e.contact)}` : ''}</span>
			<span class="fb-entry-when">#${e.id} · ${when(e.createdAt)}</span>
		</div>
		<div class="fb-entry-text">${esc(e.text)}</div>
		<div class="fb-entry-foot">
			<span>${[e.page ? `on ${e.page}` : '', e.version ? `build ${e.version}` : '', e.agent ? e.agent.replace(/^Mozilla\/5\.0 /, '').slice(0, 70) : ''].filter(Boolean).map(esc).join(' · ')}</span>
			<button class="chip tiny" data-status="${e.status === 'open' ? 'done' : 'open'}">${e.status === 'open' ? 'Mark done' : 'Reopen'}</button>
		</div>
	</div>`;
	host.querySelector('.dialog-box').innerHTML = `<h2>Feedback inbox</h2>
		<p class="dialog-copy">${open.length} open · ${done.length} done · the newest ${entries.length} entries</p>
		<div class="fb-list">${open.map(row).join('') || '<p class="dialog-copy">Nothing open.</p>'}</div>
		${done.length ? `<details class="fb-done"><summary>Done (${done.length})</summary><div class="fb-list">${done.map(row).join('')}</div></details>` : ''}
		<div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`;
	host.querySelectorAll('[data-status]').forEach(btn => btn.addEventListener('click', async () => {
		const id = Number(btn.closest('.fb-entry').dataset.id);
		const status = btn.dataset.status;
		btn.disabled = true;
		const res = await call('POST', `/api/feedback/${id}/status`, { status }).catch(() => null);
		if (!res || !res.ok) { btn.disabled = false; return toast('That did not stick.'); }
		const entry = entries.find(e => e.id === id);
		if (entry) entry.status = status;
		paintInbox(host, entries);
	}));
}
