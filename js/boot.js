// Starts the app. A file rather than an inline <script> so the page can
// carry a Content-Security-Policy that does not have to allow inline
// script -- which is most of what a CSP is for.
import { init } from './ui.js';
import './cheer.js';   // the burst of light for a thing done, listening from the start

init();

// The offline half of local-first: a service worker that keeps the last
// complete set of assets for when there is no network. Registered after
// init so it never competes with the first paint, and best-effort --
// a browser without it just stays online-only, as before.
if ('serviceWorker' in navigator) {
	// A newer deploy installs behind the page and waits its turn: the
	// browser lets it in on the next visit once every tab of the old
	// one is closed. Nothing is offered and nothing reloads under a
	// half-typed field.
	navigator.serviceWorker.register('/sw.js').catch(() => { /* online-only, then */ });
}
