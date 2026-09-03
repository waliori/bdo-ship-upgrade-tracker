// Starts the app. A file rather than an inline <script> so the page can
// carry a Content-Security-Policy that does not have to allow inline
// script -- which is most of what a CSP is for.
import { init } from './ui.js';

init();

// The offline half of local-first: a service worker that keeps the last
// complete set of assets for when there is no network. Registered after
// init so it never competes with the first paint, and best-effort --
// a browser without it just stays online-only, as before.
if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/sw.js').then(reg => {
		// A newer deploy has installed and is waiting. It is not let in
		// on its own: the running modules and the cache it would replace
		// have to change together, which a reload does and a takeover
		// does not. So the page offers the reload, and the worker is
		// only told to take over once the reload is on its way.
		const offer = worker => {
			if (!worker || !navigator.serviceWorker.controller) return;
			let reloading = false;
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				if (reloading) return;
				reloading = true;
				location.reload();
			});
			document.dispatchEvent(new CustomEvent('app-update', {
				detail: { apply: () => worker.postMessage({ type: 'SKIP_WAITING' }) }
			}));
		};
		if (reg.waiting) offer(reg.waiting);
		reg.addEventListener('updatefound', () => {
			const fresh = reg.installing;
			if (!fresh) return;
			fresh.addEventListener('statechange', () => {
				if (fresh.state === 'installed') offer(reg.waiting);
			});
		});
	}).catch(() => { /* online-only, then */ });
}
