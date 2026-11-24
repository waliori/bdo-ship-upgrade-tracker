# The run planner

The Barter tab's runs -- which chains to climb on today's board, in what
order, with which wharf calls, refills and loads -- are laid by the planner
in `js/barter-solve.js` and `js/rpit/`. It replaced the classic planner
(`chainRun` in `js/barter-chains.js` and the beam search in
`js/barter-optimizer.js`), which is kept to fall back on and to compare
against: set `bdo-tracker/planner` to `classic` in the browser's storage and
the tab lays runs the old way.

## The problem

A barter run is a routing problem with a twist: the cargo changes on the
way. Each island exchanges *q* of one good for *y* of another, at most *m*
times a day, for a price in Parley; a [Level 4] climbs to [Level 7] through
three islands, and only the top sells. On top of the route itself:

- **the hold**: a weight limit a wharf loads to (100 %) and the exchanges
  carry past (up to 170 %, slower), and slots -- [Level 5] and up take one
  each;
- **the storages**: seven wharves keep goods and buy what sells; the home
  storage is where a stocked sailor's goods wait;
- **rations**: the pool drains by the minute and fills at any wharf call; a
  leg longer than a pool needs a call on the way;
- **Parley and vouchers**: the bar, and vouchers worth a quarter of it each,
  two hours apart;
- **the sailor's rules**: nothing stored twice, nothing taken out of storage
  only to go back;
- **the session**: the hours under way the sailor gives (the "time under
  way" order), or none -- the most the board gives.

In the code this is the *instance*: stations (island exchanges), depots
(storage wharves), supply wharves, goods with weights and prices, the
vehicle, the budgets and the rules (`instanceOf` in `js/barter-solve.js`).

## How a run is judged

`js/rpit/simulate.js` sails a plan -- the start's buys and loads, then
station visits with their attempts and wharf calls with what they sell,
drop, load or take out of the bag -- exactly, step by step, and reports the
silver, the hours, the hours under way, the Parley, the refills and what
went wrong. Payouts are counted at the least the island pays, weighed at the
most (`robust`); a board read off screenshots has them exact.

`robustEval` (`js/rpit/common.js`) turns that into one figure:

- silver -- or, for the coin goal, Crow Coins first; for the stock goal, how
  much it fills, each good counted to its level's target (`fillOfRun`);
- minus a price per hour past the session, larger than any hour earns;
- minus a price per broken rule (stored twice, taken back), larger still;
- minus a price for running out of rations at sea, or missing a climb the
  sailor ticked, larger than everything.

In the last pass only (step 4 below): minus a few silver an hour, plus a
sum for each quest handed in.

Hours under way are measured as the classic planner measured them: the
cargo's route -- islands and trading calls, not the supply calls the tab lays
after -- at the ship's own speed.

## How a run is found

`newPropose` (the proposals) and `planFor` (the laying of ticked climbs)
both run the same pipeline:

1. **Starts.** Three: a greedy insertion of whole climbs (`build`, capped at
   thirty candidates judged); *trip by trip* (`byTrips`): each climb alone
   from home and back, laid one after another while it still pays, in three
   orders -- the best an hour, the most silver, the longest first -- the
   best kept; and, for ticked climbs, the climbs threaded by the shortest
   route.
2. **The best an hour.** Two rounds of Dinkelbach's method: search at a
   price of time, set the price to the rate found, search again. The plan
   that earns most an hour is a better start than the one that only fills
   time.
3. **The session.** Adaptive large-neighbourhood search (`js/rpit/alns.js`)
   from that plan, with time priced at nothing inside the session: tear
   part of the plan down (random islands, a cluster, a whole climb, fewer or
   more attempts, the order searched again, climbs one after another) and
   build it back (islands where they cost least, climbs offered as greedy
   offers them), keeping what is better and sometimes what is a little worse
   early on. Forty steps, counted in steps and not milliseconds, so the same
   board gives the same run on any machine.
4. **Time and quests** (`tighten`, `js/barter-solve.js`). With no session
   an hour costs nothing in step 3, so two plans that earn alike tie and the
   first found stays, however it zig-zags. From step 3's plan, twenty more
   steps price each hour at 10,000 silver, too little to give up anything
   earned. Then, when the run takes quests in, the islands are moved a block
   of one to three at a time (`relocate`), each climb keeping its order,
   with the quests laid round every move as the tab lays them
   (`layQuests`): a quest handed in counts 100,000 silver, ahead of any time
   it costs and behind anything earned. The step-3 search moves an island
   to where it adds the least sailing and never sees the quest stops laid
   after, so it cannot find these orders. The moves start from both the
   shorter plan and step 3's, and the better is kept: from the shorter one
   alone, no move of three islands brought the run back past a quest giver
   the longer one took in. Priced from the start instead,
   the same hours sent the search other ways, and it ended worse on 17 of
   155 real days.

Every candidate is made sailable by `finish`: a call before each island the
hold stops; a call home for goods the storage still has -- or, with a bag,
the goods carried in it from the start and taken out at the wharf nearest
the way; later climbs' goods left at home behind a call when they would fill
the hold; calls that do nothing taken out; islands that deal nothing dropped;
and the refills laid last, as a shortest path over where the pool was last
filled (`refuel`, the fixed-route charging problem of electric-vehicle
routing), every wharf tried when the nearest five cannot feed the ship.

On the search's answer, once, `trimLoads` leaves ashore what the plan loads and
brings back unused, as long as the run gives up no trade and no value for it.

## From the plan to the tab

- The search runs in the worker (`js/barter-worker.js`, `planner: 'new'`), as
  the classic search did. The plan found comes back with the proposals and
  is remembered on the page (`rememberFound`), so ticking the proposed climbs
  lays the run proposed.
- Ticking goods aboard asks the tab for the run again with the goods moved
  from the storage to the hold; a found plan is matched on the goods its
  islands use, aboard and ashore counted together, so the packed run is the
  proposed run. A later search of the same day does not replace it, and the
  plan for the chains ticked is kept in this device's storage, so a reload
  while loading lays the same run.
- An island the plan deals at whose climb stops short of the top is proposed
  as that climb cut there (`<chain>><k>`, as a short trip's are).
- The sailor's edits from the wharf step -- islands taken off the route, the
  trip order, moved stops, the chain way -- are laid onto the plan as
  `chainRun` lays them, and the calls laid again round them.
- `runOf` writes the plan in `chainRun`'s shape: stops, sales, drops, loads,
  bag moves, refill stops, trips, coins.

Not yet the new planner's: the five *How to sail it* cards are still each
searched by the classic search, and the material run has its own planner
(`js/barter-material.js`) -- a different problem, a tour through ticked
islands that leaves heavy and comes back light.

## Testing it

- `npm test` runs the planner's own tests (`test/rpit-*.test.mjs`): the
  simulator on a board small enough to work by hand, the solvers against an
  exact search on tiny cuts of real boards, and the tab's own options through
  `solveRun` (`test/rpit-app.test.mjs`).
- `tools/rpit/` is the bench: `setup.mjs` builds instances from the game's
  layouts, `bench.mjs` runs the solvers and the classic planner over them,
  `report.mjs` tabulates.
- The comparison in the real app -- boards read off the sailor's own
  screenshots, both planners proposing, packing and sailing every stop in
  headless Chrome, the Market frozen per board, a scorecard per run -- is
  run from a frozen worktree of the commit tested. Its results are kept
  under `tools/rpit/results/` (not in the repository); the last:
  +40 % silver over 288 runs on three boards, 113 wins, 7 losses, 6 ties,
  no plan short of rations, nothing stored twice.
