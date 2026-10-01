// Chimes by Discord message: the same moments as the browser's notification,
// said to an account's own direct messages by the bot, for the sailors who
// asked. Nobody is messaged unless they switched it on themselves, and the
// bot can only reach someone who shares the community server with it and
// accepts messages from its members -- which is checked at the moment they
// switch it on, by sending the first message.

import express from 'express';
import { config } from './config.js';
import { getDiscordAlerts, setDiscordAlerts } from './db.js';
import { perAddress } from './limit.js';
import { requireUser } from './session.js';

const API = process.env.DISCORD_API || 'https://discord.com/api/v10';
const COLOR = 0xe0a83a;
const rooms = new Map();

async function discord(method, path, body, tries = 2) {
	const res = await fetch(API + path, {
		method,
		headers: { Authorization: `Bot ${config.botToken}`, 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(10_000)
	});
	if (res.status === 429 && tries > 1) {
		const j = await res.json().catch(() => ({}));
		const wait = Math.min(Number(j.retry_after) || 1, 5);
		await new Promise(resolve => setTimeout(resolve, wait * 1000));
		return discord(method, path, body, tries - 1);
	}
	return res;
}

/** Say something to one account. `{ ok }`, or `{ ok: false, closed }` where
 *  closed means Discord will not let the bot into that person's messages. */
export async function sendDm(userId, { title, body }) {
	try {
		let room = rooms.get(userId);
		if (!room) {
			const made = await discord('POST', '/users/@me/channels', { recipient_id: userId });
			if (!made.ok) return { ok: false, closed: made.status === 403 || made.status === 400 };
			room = (await made.json()).id;
			rooms.set(userId, room);
		}
		const res = await discord('POST', `/channels/${room}/messages`, {
			embeds: [{ title: String(title).slice(0, 250), description: String(body || '').slice(0, 1000), color: COLOR }],
			allowed_mentions: { parse: [] }
		});
		if (res.ok) return { ok: true };
		if (res.status === 403) rooms.delete(userId);
		return { ok: false, closed: res.status === 403 };
	} catch (err) {
		console.warn('[discord-dm] could not send:', err.message);
		return { ok: false, closed: false };
	}
}

export { getDiscordAlerts };

export function dmRoutes() {
	const router = express.Router();
	router.use('/discord-dm', express.json({ limit: 1024 }), (req, res, next) => {
		res.set('Cache-Control', 'no-store');
		next();
	});
	const limited = perAddress(20, 300, 'That is a lot of switching; try again in a minute.');

	router.get('/discord-dm', requireUser, async (req, res) => {
		try {
			res.json({ available: true, on: await getDiscordAlerts(req.userId) });
		} catch {
			res.status(503).json({ error: 'The database did not answer.' });
		}
	});

	router.put('/discord-dm', requireUser, limited, async (req, res) => {
		const on = Boolean(req.body && req.body.on);
		try {
			if (on) {
				const said = await sendDm(req.userId, {
					title: 'Chimes will come here',
					body: 'You asked Falasi to message you when a stop or a run is due. Switch it off in Sailor’s Log whenever you like.'
				});
				if (!said.ok) {
					return res.status(409).json({
						error: said.closed
							? 'Discord would not let the bot message you. Join the community server and allow direct messages from its members, then try again.'
							: 'Discord did not answer. Try again in a moment.'
					});
				}
			}
			await setDiscordAlerts(req.userId, on);
			res.json({ on });
		} catch {
			res.status(503).json({ error: 'The database did not answer.' });
		}
	});
	return router;
}
