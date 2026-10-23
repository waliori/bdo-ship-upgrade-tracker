// The study of the planners: what each was asked and what it found, as
// the app's sailors meet it day by day -- kept so that any planner, the
// one aboard or the paper's, can be run on the same days again and the
// two compared on what a real board gave. The browser sends a study when
// a plan is proposed (js/barter/study.js) and the run's outcome when the
// sailor records it, gzipped and in idle time; nothing here answers
// anything the page waits for.
//
// Incurious, as boards.js is: a study is an id, a planner's name and a
// body the tools read (tools/rpit/study/). The body is kept as sent,
// gzipped and in base64 -- a text column, so a backup carries it as it
// does every other table.

import express from 'express';
import { gzipSync } from 'node:zlib';
import { insertStudy, markStudySailed } from './db.js';
import { sessionUser } from './session.js';
import { perAccount } from './limit.js';
import { wrap } from './wrap.js';
import { config } from './config.js';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const short = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);
const pack = o => gzipSync(JSON.stringify(o)).toString('base64');

/** A study as it may be stored, or a complaint about it. */
export function readStudy(body) {
	if (!body || typeof body !== 'object') return { error: 'Expected a study.' };
	if (!ID.test(String(body.id || ''))) return { error: 'A study needs an id.' };
	const planner = short(body.planner, 16);
	if (!planner) return { error: 'A study has to name its planner.' };
	return { id: body.id, planner, release: short(body.release, 24), layout: short(body.layout, 12), day: short(body.day, 24), device: short(body.device, 64), body: pack(body) };
}

export function studyRoutes() {
	const router = express.Router();
	const body = express.json({ limit: config.maxStudyBytes });
	const limit = perAccount(config.maxStudiesPerMinute, 'That is a lot of plans.');
	// Signed in or not: a stranger's study is kept under no account, and
	// counted by address.
	const who = (req, res, next) => { req.userId = sessionUser(req); next(); };
	router.post('/study', who, limit, body, wrap(async (req, res) => {
		const s = readStudy(req.body);
		if (s.error) return res.status(400).json({ error: s.error });
		await insertStudy({ ...s, userId: req.userId });
		res.json({ ok: true });
	}));
	router.post('/study/:id/sailed', who, limit, body, wrap(async (req, res) => {
		if (!ID.test(req.params.id) || !req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Expected the outcome of a study.' });
		const ok = await markStudySailed(req.params.id, req.userId, pack(req.body));
		res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'No such study.' });
	}));
	return router;
}
