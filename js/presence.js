// How many sailors are out right now.
//
// One line in the masthead, and the only thing on the page that is
// about other people without asking anything of you: the number of
// browsers with the tracker open at this moment, and the number that
// have ever opened it. No sign-in, nothing of the save, and the token
// the server counts is one this browser invents for itself and keeps --
// so the roll is of browsers, not of people, which is the honest word
// for it and the reason the tooltip says so.
//
// It is quiet by design: nothing is drawn until the server answers, a
// deployment with the count switched off never shows the slot, and a
// failed request simply leaves it as it was.

import { esc, F } from './fmt.js';

const KEY = 'bdo-tracker/visitor';
// The client says hello on this beat; the server counts a browser as
// out for five minutes, so a missed beat or two is forgiven.
const BEAT_MS = 60_000;

let timer = null;
let last = null;

/** This browser's own token: made once, kept, and meaning nothing
 *  anywhere else. Storage can be shut off, in which case it is made
 *  afresh each load and the roll counts this visit once. */
function token() {
	let t = null;
	try { t = localStorage.getItem(KEY); } catch { /* private window */ }
	if (t && /^[A-Za-z0-9_-]{8,64}$/.test(t)) return t;
	const bytes = new Uint8Array(16);
	const rng = globalThis.crypto;
	if (rng && rng.getRandomValues) rng.getRandomValues(bytes);
	else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
	t = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	try { localStorage.setItem(KEY, t); } catch { /* not kept, then */ }
	return t;
}

async function hello() {
	try {
		const res = await fetch('/api/presence', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: token() }),
			keepalive: true
		});
		if (!res.ok) return;
		const body = await res.json();
		if (body && !body.off) paint(body);
	} catch { /* offline, or the server has better things to do */ }
}

/** The counts, in the masthead: how many are out now, and beside it the
 *  crew -- the accounts that have ever signed in. The second number is
 *  the steady one and the first is the live one, so the live one leads
 *  and keeps the dot; on a phone only it survives. */
function paint({ online = 0, sailors = 0, crew = 0 }) {
	last = { online, sailors, crew };
	const host = document.getElementById('crowd');
	if (!host) return;
	if (!online) { host.innerHTML = ''; return; }
	// "you" included, because the reader is one of them and a count that
	// said 0 while they were plainly here would read as broken.
	const roll = sailors > 1 ? ` · ${F(sailors)} browsers have opened it` : '';
	const signed = crew > 0 ? ` · ${F(crew)} ${crew === 1 ? 'has' : 'have'} signed in and keep a save` : '';
	const title = `${F(online)} browser${online === 1 ? '' : 's'} have the tracker open right now, yours among them${roll}${signed}. Nobody is named and nothing of your save is counted.`;
	const fleet = crew > 0
		? `<span class="crowd-roll"> · ${F(crew)} <span class="crowd-word">crew</span></span>`
		: '';
	host.innerHTML = `<span class="crowd-chip" title="${esc(title)}">
		<i aria-hidden="true"></i>${F(online)} <span class="crowd-word">at sea</span>${fleet}</span>`;
}

/** Say hello, and keep saying it while the tab is being looked at. */
export function startPresence() {
	if (timer) return;
	const beat = () => {
		if (document.visibilityState === 'hidden') return;
		hello();
	};
	beat();
	timer = setInterval(beat, BEAT_MS);
	// Coming back to the tab is worth a hello of its own: the count on
	// screen may be twenty minutes stale.
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') beat();
	});
}

/** What the last answer said, for anything else that wants it. */
export const crowd = () => (last ? { ...last } : null);
