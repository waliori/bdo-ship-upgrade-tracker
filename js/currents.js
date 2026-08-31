// The ocean's currents, as the community charted them.
//
// The game draws its currents on the world map and publishes no data
// for them. The Shaiaya Explorers Guild traced them onto a screenshot
// of that map -- arrows by speed, 10 to 40 -- and released it to be
// edited and reuploaded without asking. It is fitted to this chart by
// eighteen islands whose positions the app knows to the pixel; the fit
// is good to about 160 m, which for a current's breadth is plenty.
// A tracing, not a measurement: it says where the water runs, not how
// fast today.

export const CURRENTS = {
	src: 'map/currents.webp',
	// The image's corners in chart pixels (least squares over 18 islands, 2026-08-31).
	x0: 41776, y0: 43063, x1: 93396, y1: 72983,
	credit: 'Ocean currents traced by the Shaiaya Explorers Guild on the game map (via grumpygreen.cricket); fitted to 18 islands, ±160 m'
};
