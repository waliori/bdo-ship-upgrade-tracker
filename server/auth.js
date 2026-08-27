// Signing in with Discord.
//
// The whole exchange is three requests and no library: send the browser
// to Discord, trade the code it comes back with for a token, ask who the
// token belongs to. The token is used once, here, and then dropped -- the
// tracker has no use for it afterwards, so there is nothing to store and
// nothing to leak.

import express from 'express';
import { config } from './config.js';
import { upsertUser } from './db.js';
import { beginOAuth, finishOAuth, startSession, endSession } from './session.js';
import { wrap } from './wrap.js';

const AUTHORIZE = 'https://discord.com/oauth2/authorize';
const TOKEN = 'https://discord.com/api/oauth2/token';
const ME = 'https://discord.com/api/users/@me';

// Discord is a third party on the far side of the internet. Without a
// deadline a hung connection would hold the request open indefinitely.
const TIMEOUT_MS = 10_000;

async function post(url, body) {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`Discord said ${res.status} to ${url}`);
	return res.json();
}

export function authRoutes() {
	const router = express.Router();

	// Start. `to` is where the user was, so they come back to it.
	router.get('/discord', (req, res) => {
		const state = beginOAuth(res, typeof req.query.to === 'string' ? req.query.to : '/');
		const url = new URL(AUTHORIZE);
		url.searchParams.set('client_id', config.discord.clientId);
		url.searchParams.set('redirect_uri', config.discord.redirectUri);
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('scope', config.discord.scope);
		url.searchParams.set('state', state);
		// No `prompt` override. `prompt=none` would skip the approval
		// screen for anyone who has already granted `identify`, which is
		// nicer -- but when the grant is missing Discord answers with an
		// error rather than the screen, and turning a first sign-in into
		// an error message is a poor trade for saving a returning user
		// one click.
		res.redirect(url.toString());
	});

	// Finish.
	router.get('/discord/callback', wrap(async (req, res) => {
		// The user pressed Cancel on Discord's prompt, or Discord refused.
		if (req.query.error) return res.redirect('/?signin=cancelled');

		const check = finishOAuth(req, res, typeof req.query.state === 'string' ? req.query.state : null);
		if (!check) return res.redirect('/?signin=expired');
		if (typeof req.query.code !== 'string') return res.redirect('/?signin=failed');

		try {
			const token = await post(TOKEN, {
				client_id: config.discord.clientId,
				client_secret: config.discord.clientSecret,
				grant_type: 'authorization_code',
				code: req.query.code,
				redirect_uri: config.discord.redirectUri
			});

			const who = await fetch(ME, {
				headers: { Authorization: `Bearer ${token.access_token}` },
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});
			if (!who.ok) throw new Error(`Discord said ${who.status} to ${ME}`);
			const user = await who.json();

			await upsertUser({
				id: String(user.id),
				username: user.global_name || user.username || 'Sailor',
				avatar: user.avatar || null
			});
			startSession(res, user.id);
			res.redirect(check.returnTo);
		} catch (err) {
			// The reason belongs in the log, not in a query string that
			// ends up in the user's history and any referrer that follows.
			console.error('[auth] Discord sign-in failed:', err.message);
			res.redirect('/?signin=failed');
		}
	}));

	// Signing out clears the cookie and stops there. The save stays put,
	// because signing out of a device is not the same as wanting the
	// account deleted -- /api/account handles that, deliberately separately.
	router.post('/logout', (req, res) => {
		endSession(res);
		res.json({ ok: true });
	});

	return router;
}
