// The Barter tab's state, in one place: what the tab remembers between
// draws -- the plan's inputs, the board, the run under way, the searches
// out -- as fields of one object, so the modules the tab is split into
// read and write the same values. The view written to the profile is
// made from these (view.js); the rest is the session's.

import { DEFAULT_STOCK } from '../barter-orders.js';

// The step up is this device's own, kept across a reload: packing at
// the wharf and a reload no longer lands back on the plan.
export const STEP_KEY = 'barter-step';
export const STEPS = ['plan', 'load', 'sail', 'results'];

export const V = {
	goal: 'silver', // silver | stock | coin | material
	item: null, // the material a run is for
	qty: 1, // how many of it
	wants: {}, // and of every other material ticked today: material -> how many
	climb: 0, // the level a silver run's climbs stop at, 0 for the top
	stockGoal: { ...DEFAULT_STOCK, targets: { ...DEFAULT_STOCK.targets } }, // the stock run: what to keep of every good at a level, where the climbs stop, what the day is for
	matOrders: { reach: 'want', calls: true, pace: 'full', quests: 'near' }, // sail for the wants, or every island ticked; call at a harbour for a give held there; one departure, or as many as the hold needs
	port: 0, // the wharf the run sails from, 0 for none
	routes: { key: '', ids: [] }, // the chains ticked, for one board (day|layout)
	shape: 'full', // full | short: the board's chains searched and climbed, or one trade and what fits round it
	routesOther: { key: '', ids: [] }, // the other shape's ticks, kept while this one is on
	stash: '', // the wharf goods are left at, '' for the nearest
	board: { day: '', answers: [] }, // what islands were seen to show today: { npcId, give, recv }
	reach: '', // a good the item board is asked to reach, for the material run
	// What the material list was seen to show today: { npcId, give, recv,
	// took? }; `on` is the materials the run is for, which the sailor
	// chooses -- a whole window read, or a board taken, shows far more than
	// anyone sails for; `told` is how many read islands went to the fleet.
	matBoard: { day: '', answers: [], on: [], told: 0 },
	planSec: 'ladder', // the part of the plan that is open: parley | ladder | how | chains | all | none
	advOpen: false, // every order, unfolded
	ownWay: false, // "my own way" chosen, whether or not the orders happen to match a card
	routeEdit: { key: '', skip: [], nudge: {}, trips: [] }, // the route as the sailor changed it on the wharf: islands taken off, stops moved
	questSkip: { day: '', ids: [] }, // quests left out of today's runs by hand
	questPull: { day: '', ids: [] }, // quests taken in by hand today, whatever the way round
	sailAll: { open: false, stops: true, quests: true }, // the ask before every stop and quest is ticked off at once
	sail: null, // the run being sailed: { key, done: [stop keys], seen: { npcId: paid }, got: { npcId: item }, kept: [wharf stop keys whose [Level 7]s were not sold], stops: [...] }
	// The filters on the hold and the chain list, for the session.
	holdQ: '',
	holdLv: new Set(),
	holdAt: '',
	chainQ: '',
	chainFrom: '',
	chainTop: 0,
	proposed: { key: '', proposals: [], best: null, solos: new Map(), partial: false, working: false }, // the runs worth sailing, for one set of inputs; `working` while the worker is still out on them
	routesAuto: '', // the routes key whose ticks were left to the search still out, to be set when it answers
	filling: false, // "fill the rest" asked and not yet answered
	lastSearch: null, // what the last search was given, for "fill the rest
	readSig: null, // the view as last read from the profile, as text: a different one -- synced in, imported, migrated -- is read again
	// The page is four steps -- plan, load, sail, results -- and these are
	// the session's own: which step is up, where the cockpit stands.
	step: (() => { try { const v = localStorage.getItem(STEP_KEY) || ''; return STEPS.includes(v) ? v : ''; } catch { return ''; } })(), // plan | load | sail | results; '' follows the run
	slotsOpen: true, // the hold's slots, under the cockpit's one press
	glance: true, // the cockpit drawn large, to be read across a room: how it starts, since a run is sailed with the game in front and the page beside it
	cursor: null, // the stop the cockpit was sent to, by its key
	skipped: new Set(), // stops passed over on the cockpit, by their key
	packed: new Set(), // goods bought or fetched and ticked aboard on the packing list
	lastTrip: null, // what the last Record came to, for the results
	migrated: false,
	writeTimer: null, // a write of the view still to be made
	writing: false, // the write under way: the store redraws the page from inside it
	sheetOpen: null, // which sheet is up, if any
	lastRoute: null,
	payMemo: { key: '', html: '' },
	kindsMemo: null,
	worker: null, // the one long-lived worker, made on first use
	workerLost: false, // no Worker here, or it failed: search on this thread
	reqSeq: 0,
	pending: null, // the request out: { id, tag, args, then, timer }
	presetWorker: null,
	presetLost: false,
	presetState: { key: '', res: new Map(), queue: [], busy: false },
	expected: { key: '', value: null, pending: '' },
	expectWorker: null,
	expectLost: false,
	expectSeq: 0,
	// The plan on screen, for the record button to read back.
	shownPlan: null,
	// What each trade would add, kept for one set of inputs and ticks: a
	// trade laid beside the picked ones is a run each, and a redraw that
	// changed nothing should not lay them all again.
	shortMemo: { key: '', res: null },
	appearMemo: { key: '', rows: [] },
	matFleet: { day: '', list: [], asked: false },
	matBookMemo: null,
	matAutoTold: '',
	// The material list's filters, for the session.
	matQ: '',
	matOnly: '',
	matLv: 0,
	untilBeat: null,
	fleet: { day: '', list: [], asked: false },
};
