// What a guided tour cut short leaves in this browser, put back.
//
// The tour shows example data and never saves it, but two of the
// screens it walks keep a thing of their own in localStorage beside the
// save: the Barter tab's step, and the chart's preferences (the tour
// unfolds the chart's panel on a phone, and the fold is written down).
// The tour puts both back when it ends -- but a reload, or a tab that
// dies, ends it without that. So when it starts it notes what they said
// in this tab's sessionStorage, which outlives a reload and nothing
// more, and this, the first module the page runs, puts them back if the
// note is still there: before the Barter tab or the chart has read them.
// The address goes back too: the tour moves from tab to tab, and a page
// reloaded on the tour's tab would open there and write it down as the
// one the sailor was on.
//
// It imports nothing, so that it runs before every module that does.

/** The keys the tour's screens may write; a value of null is "not there". */
export const TOUR_KEYS = ['barter-step', 'bdo-tracker/map-view'];
const NOTE = 'bdo-tracker/tour-running';

/** What the keys say now, noted for a tour about to start. */
export function noteTourStart() {
	const was = {};
	try {
		for (const k of TOUR_KEYS) was[k] = localStorage.getItem(k);
		window.sessionStorage.setItem(NOTE, JSON.stringify({ ...was, '#': window.location.hash }));
	} catch { /* no storage: nothing to put back either */ }
	return was;
}

/**
 * The keys as they were noted, and the note gone: the tour is over. A
 * tour that ends by itself goes back to its own tab; one cut short by a
 * reload (`was` not given) has its address put back here as well.
 */
export function putBackTourKeys(was = null) {
	try {
		const noted = was || JSON.parse(window.sessionStorage.getItem(NOTE) || 'null');
		window.sessionStorage.removeItem(NOTE);
		if (!noted || typeof noted !== 'object') return;
		if (!was && typeof noted['#'] === 'string' && window.location.hash !== noted['#']) {
			window.history.replaceState(window.history.state, '', noted['#'] || window.location.pathname + window.location.search);
		}
		for (const k of TOUR_KEYS) {
			if (!(k in noted)) continue;
			const v = noted[k];
			if (localStorage.getItem(k) === v) continue;
			if (v === null) localStorage.removeItem(k);
			else localStorage.setItem(k, String(v));
		}
	} catch { /* the session keeps what it has */ }
}

// A note still here at load is a tour that never ended.
putBackTourKeys();
