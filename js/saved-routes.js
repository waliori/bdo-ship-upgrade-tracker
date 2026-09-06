// Routes kept by name, and the one kept by accident.
//
// The Route tab keeps up to eight routes under names a player gave
// them, and one more it names itself: "Previous route", the plot that
// was on the chart before the last replot. The two used to share one
// list, so every replot pushed the previous plot in at the top and the
// eighth named route -- twenty minutes of choosing, kept on purpose --
// fell off the end without a word. Here they are kept apart: the
// previous route has a slot of its own that is always overwritten and
// never counted, and a named route is only ever dropped by hand. Pure,
// so the rule can be checked without a chart.

export const SAVED_MAX = 8;
export const PREVIOUS = 'Previous route';

/**
 * A named route kept in the list: replacing the one of the same name
 * when there is one, put in at the top when there is room, and refused
 * -- `full` -- when the eight are taken by other names, so the screen
 * can ask which to let go rather than choose for the player.
 */
export function keepNamed(list, entry, max = SAVED_MAX) {
	const rest = list.filter(r => r.name !== entry.name);
	if (rest.length === list.length && rest.length >= max) return { list, full: true };
	return { list: [entry, ...rest].slice(0, max), full: false };
}

/** The route at `i` let go and `entry` kept in its place -- the
 *  answer to "which one", when the list was full. */
export function replaceAt(list, i, entry, max = SAVED_MAX) {
	if (!(i >= 0 && i < list.length)) return keepNamed(list, entry, max).list;
	const rest = list.filter((r, k) => k !== i && r.name !== entry.name);
	return [entry, ...rest].slice(0, max);
}

/** A list from before the two were kept apart, taken apart: the named
 *  routes, and the previous route if one was among them. */
export function splitPrevious(list) {
	const previous = list.find(r => r.name === PREVIOUS) || null;
	return { routes: list.filter(r => r.name !== PREVIOUS), previous };
}
