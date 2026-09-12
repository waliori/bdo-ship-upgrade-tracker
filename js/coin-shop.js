// Spending Crow Coins.
//
// The purse has always been a number you typed: the app knew what a
// thing cost at Oquilla's Eye and knew how many coins you held, and
// still made you do both halves of the sum by hand -- add nine hundred
// Tidal Black Stones here, take nine thousand coins off there, and hope
// you did not fumble one of them.
//
// So this is the shop, as far as the app is concerned: one dialog, one
// change. What you buy goes into the inventory at the storage that kind
// of thing lives at, the coins come off the purse in the same step, and
// one Undo takes back both -- because a purchase undone by halves is
// worse than one never recorded.
//
// It buys nothing in game, of course. It is a record of a purchase, and
// the only claim it makes is that the price is the one the shop showed
// when sea_coins.js was last read.

import { coins } from './sea_coins.js';
import { esc, F, FC, parseAmount } from './fmt.js';
import { T, TT, said, gameName } from './i18n.js';
import * as store from './state.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { img, codexName } from './ui-bits.js';
import { CROW_COIN } from './ui-state.js';

/** Where the coins are spent, for a dialog that should say so. */
export const SHOP = TT('the Crow Coin Shop at Oquilla’s Eye');

/** What one costs in coins, or 0 for anything the shop does not sell. */
export const coinPrice = item => Number(coins[item]) || 0;

/** The coins in the purse right now. */
const purse = () => store.getStock(CROW_COIN);

/**
 * The button that opens the shop for an item -- nothing at all for the
 * things the shop does not sell, so a caller can drop it into any row
 * without asking first. `want` is what it opens on: the shortfall on
 * the To Get list, one from the Inventory panel.
 */
export function coinBuyButton(item, want = 1, { small = true, label = null } = {}) {
	const price = coinPrice(item);
	if (!price) return '';
	const n = Math.max(1, Math.floor(Number(want) || 1));
	return `<button class="act quiet${small ? ' small' : ''} coin-buy" data-act="coin-buy"
		data-item="${esc(item)}" data-n="${n}"
		title="${T('Record buying {item} at {shop} — the coins come off your purse', { item: esc(gameName(item)), shop: esc(said(SHOP)) })}">🪙 ${esc(label || T('Buy with coins'))}</button>`;
}

/**
 * The shop, for one item.
 *
 * The quantity is the whole of it: it opens on what you are short of,
 * clamped to what the purse can actually cover, and every figure under
 * it follows what is typed. Buy is off while the sum does not work --
 * a purchase that would take the purse below zero is not a purchase,
 * and clamping it silently would leave the record saying something
 * that never happened.
 */
export function openCoinBuy(item, want = 1) {
	const price = coinPrice(item);
	if (!price) return;
	const held = purse();
	const afford = Math.floor(held / price);
	const start = Math.max(1, Math.min(Math.max(1, Math.floor(Number(want) || 1)), Math.max(1, afford)));

	const host = openDialog(`
		<h2>${T('Buy with Crow Coins')}</h2>
		<div class="buy-head">
			${img(item, 'row-icon')}
			<div>
				<div class="buy-name">${codexName(item)}</div>
				<div class="row-sub">${T('{price} coins each', { price: F(price) })} · ${esc(said(SHOP))}</div>
			</div>
		</div>
		<label class="dialog-field">${T('How many')}
			<input class="field buy-n" inputmode="numeric" value="${F(start)}" aria-label="${T('How many to buy')}"></label>
		<div class="buy-sum" data-sum></div>
		<p class="dialog-note quiet">${T('This records the purchase: the goods into your inventory, the coins off your purse, as one change. One Undo takes back both.')}</p>
		<div class="dialog-actions">
			<button class="act quiet" data-close>${T('Cancel')}</button>
			<button class="act" data-buy>${T('Buy')}</button>
		</div>`);

	const field = host.querySelector('.buy-n');
	const sum = host.querySelector('[data-sum]');
	const buy = host.querySelector('[data-buy]');

	const asked = () => Math.max(0, Math.floor(parseAmount(field.value) || 0));
	const paint = () => {
		const n = asked();
		const cost = n * price;
		const over = cost > held;
		sum.className = `buy-sum${over ? ' over' : ''}`;
		sum.innerHTML = n
			? `<span>${T('<b>{cost}</b> coins', { cost: FC(cost) })}</span><span>${over
				? T('you hold {held} — enough for {afford}', { held: FC(held), afford: F(afford) })
				: T('{left} left of {held}', { left: FC(held - cost), held: FC(held) })}</span>`
			: `<span>—</span><span>${T('nothing to buy')}</span>`;
		buy.disabled = !n || over;
		buy.textContent = n && !over ? T('Buy {n}', { n: F(n) }) : T('Buy');
	};
	field.addEventListener('input', paint);
	paint();

	buy.addEventListener('click', () => {
		const n = asked();
		const cost = n * price;
		if (!n || cost > purse()) return;
		record(item, n, cost);
		closeDialog();
	});
	field.focus();
	field.select();
}

/** The purchase itself: goods in, coins out, one step. */
function record(item, n, cost) {
	store.applyDelta({ [item]: n, [CROW_COIN]: -cost }, 'stock',
		T('Bought {n} × {item} for {coins} Crow Coins', { n: F(n), item: gameName(item), coins: F(cost) }));
	toast(T('Bought {n} × {item} — {coins} coins spent', { n: F(n), item: gameName(item), coins: FC(cost) }), true);
}
