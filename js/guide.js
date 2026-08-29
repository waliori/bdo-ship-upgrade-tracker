// The field guide: the game's own windows, one small card per concept,
// so a number in this app can be traced to the screen it came from.
// Opened from a single ⓘ where the jargon lives -- nothing is shown
// until asked for, because a tracker that lectures is worse than one
// that doesn't explain.
//
// The screenshots under guide/ are the user's own captures, shrunk.

import { openDialog } from './dialogs.js';
import { esc } from './fmt.js';

const ENTRIES = [
	{
		id: 'parley',
		img: 'guide/parley-window.webp',
		title: 'Parley, and the bar it fills',
		where: 'World Map (M) → Barter Information',
		text: 'The bar refills to 1,000,000 at the 06:00 UTC reset. Every row prints '
			+ '“Parley: N required” — the rate depends on which list the row is on, and '
			+ 'your discounts are already applied to it. “Total Barters” in the header is '
			+ 'the number this app calls Total Barters in the Bartering tile: type it there '
			+ 'and the route-unlock line will agree with your game.'
	},
	{
		id: 'refresh',
		img: 'guide/refresh.webp',
		title: 'Two lists, refreshed apart',
		where: 'the ↻ button in Barter Information',
		text: 'Trade items and ship materials are separate lists with separate refresh '
			+ 'costs — 20/40/50 points and 10/30 — plus 30 to skip the two-hour cooldown, '
			+ 'and parley can buy the cooldown down a minute per 10,000. The point pool is '
			+ '100 a day, 150 with a Value Pack. The map’s Materials / Trade goods filter '
			+ 'exists because of this split.'
	},
	{
		id: 'level',
		img: 'guide/barter-level.webp',
		title: 'The level discount',
		where: 'Profile (P) → Life Skill → hover “Barter”',
		text: 'Higher Barter levels cut the parley of every exchange — the tooltip states '
			+ 'the exact percentage. It adds with the Value Pack’s −10% and a parley-crew '
			+ 'member’s −10%; the sum comes off the base price. Pick your level in the '
			+ 'Bartering tile and every parley figure in the app uses it.'
	},
	{
		id: 'voucher',
		img: 'guide/voucher.webp',
		title: 'Crow’s Trade Voucher',
		where: 'a Special Item, processed from an Item Collection Increase Scroll',
		text: 'Using one recovers 250,000 Parley — a quarter of the bar — on its own '
			+ 'two-hour cooldown, and refuses a full bar. The “vouchers” count in the '
			+ 'Bartering tile is how many you keep; it raises the trades-a-refill figure.'
	},
	{
		id: 'draw',
		img: 'guide/exchanges-left.webp',
		title: 'One offer per island, so many tries',
		where: 'the rows of Barter Information',
		text: 'Each refresh deals every island one offer per list, drawn from that '
			+ 'island’s own pool — the map’s “1 of N a refresh” is that pool. '
			+ '“Exchanges Left” caps how many times you can take the offer: ten for the '
			+ 'low rungs, as few as one or two at the top, which is why the forecast '
			+ 'counts refreshes rather than parley.'
	},
	{
		id: 'island',
		img: 'guide/island.webp',
		title: 'What a pin is in the game',
		where: 'the World Map, zoomed to any barter island',
		text: 'Every pin on this app’s chart is one of these: an island — or a wreck '
			+ 'adrift in Margoria — with a barterer on it. The count on the node is the '
			+ 'exchange allowance still standing there today.'
	}
];

export function openGuide() {
	openDialog(`<h2>The game’s own numbers</h2>
		<p>Where each thing this app tracks lives in Black Desert.</p>
		<div class="guide">
			${ENTRIES.map(e => `<section class="guide-card">
				<h3>${esc(e.title)}</h3>
				<div class="guide-where">${esc(e.where)}</div>
				<img src="${esc(e.img)}" alt="" loading="lazy">
				<p>${esc(e.text)}</p>
			</section>`).join('')}
		</div>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>`);
}

/**
 * The same cards, in place: any element marked data-guide="<id>" grows
 * the game's own window on hover -- and on tap, for a thumb -- so the
 * jargon explains itself exactly where it is used. One floating card,
 * reused; nothing rendered until a term is actually asked.
 */
export function wireGuide() {
	let tip = null;
	let showing = null;

	const card = () => {
		if (tip) return tip;
		tip = document.createElement('div');
		tip.className = 'guide-tip';
		tip.id = 'guide-tip';
		tip.setAttribute('role', 'tooltip');
		tip.hidden = true;
		document.body.appendChild(tip);
		return tip;
	};

	let anchor = null;

	// Below the term when there is room, above it when there is not, and
	// never past an edge. Run again when the screenshot finishes loading,
	// because the card's height is not known until it has.
	const place = () => {
		if (!tip || tip.hidden || !anchor) return;
		const r = anchor.getBoundingClientRect();
		const w = Math.min(320, window.innerWidth - 20);
		tip.style.width = `${w}px`;
		tip.style.left = `${Math.max(10, Math.min(window.innerWidth - w - 10, r.left))}px`;
		const h = tip.offsetHeight;
		tip.style.top = `${r.bottom + h + 12 < window.innerHeight
			? r.bottom + 8
			: Math.max(10, r.top - h - 8)}px`;
	};

	const show = el => {
		const e = ENTRIES.find(x => x.id === el.dataset.guide);
		if (!e) return;
		const t = card();
		if (showing !== e.id) {
			showing = e.id;
			t.innerHTML = `<div class="guide-where">${esc(e.where)}</div>
				<img src="${esc(e.img)}" alt="">
				<p>${esc(e.text)}</p>`;
			t.querySelector('img').addEventListener('load', place, { once: true });
		}
		t.hidden = false;
		anchor = el;
		el.setAttribute('aria-describedby', 'guide-tip');
		place();
	};

	const hide = () => {
		if (tip) tip.hidden = true;
		if (anchor) anchor.removeAttribute('aria-describedby');
	};

	document.addEventListener('pointerover', evt => {
		const el = evt.target.closest('[data-guide]');
		if (el) show(el);
		else if (tip && !tip.hidden && !evt.target.closest('.guide-tip')) hide();
	});
	document.addEventListener('click', evt => {
		const el = evt.target.closest('[data-guide]');
		if (el) {
			// A tap toggles what a hover would show.
			if (tip && !tip.hidden && showing === el.dataset.guide) hide();
			else show(el);
		} else if (!evt.target.closest('.guide-tip')) hide();
	});
	// The same card for a keyboard: tabbing onto a term shows it, and
	// Enter or Space toggles it, the way a tap does.
	document.addEventListener('focusin', evt => {
		const el = evt.target.closest ? evt.target.closest('[data-guide]') : null;
		if (el) show(el);
	});
	document.addEventListener('focusout', evt => {
		if (evt.target.closest && evt.target.closest('[data-guide]')) hide();
	});
	window.addEventListener('scroll', hide, true);
	document.addEventListener('keydown', evt => {
		if (evt.key === 'Escape') { hide(); return; }
		if (evt.key !== 'Enter' && evt.key !== ' ') return;
		const el = evt.target.closest ? evt.target.closest('[data-guide]') : null;
		if (!el) return;
		evt.preventDefault();
		if (tip && !tip.hidden && showing === el.dataset.guide) hide();
		else show(el);
	});
}
