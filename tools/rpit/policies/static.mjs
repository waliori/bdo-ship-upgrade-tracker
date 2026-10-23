// A plan file as a policy: the moves it lists, in order, whatever the
// yields turn out to be. The simulator owns the definition, so that a
// plan is replayed the one way everywhere; this is where solvers find it.

export { planPolicy } from '../simulate.mjs';
