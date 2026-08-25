// Express 4 does not await a handler, so a rejected promise inside one
// becomes an unhandled rejection -- which on current Node ends the
// process. Every async route goes through here instead, where the
// rejection is handed to the error middleware like any other throw.

export const wrap = handler => (req, res, next) =>
	Promise.resolve(handler(req, res, next)).catch(next);
