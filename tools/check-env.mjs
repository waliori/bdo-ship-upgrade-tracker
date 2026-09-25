// Checks a sync configuration before you open a browser.
//
// Signing in touches Discord, Turso and this server in one flow, so a
// single wrong character surfaces as a redirect to an error page with
// nothing useful in it. This asks each service directly instead, and
// says which one is unhappy.
//
//   npm run check
//
// Reads .env the same way `npm start` does. Nothing is written anywhere
// except the database schema, which is created if missing -- that is the
// same thing the server does on boot.

import fs from 'node:fs';
import path from 'node:path';
import { config, syncEnabled, pushEnabled } from '../server/config.js';

let failures = 0;
const pass = (what, detail) => console.log(`  ok    ${what}${detail ? ` — ${detail}` : ''}`);
const fail = (what, detail) => { failures++; console.log(`  FAIL  ${what}${detail ? ` — ${detail}` : ''}`); };
const note = text => console.log(`        ${text}`);

// Never print a secret, even to a terminal the user owns -- terminals get
// screenshotted and pasted into issues.
const mask = v => (v ? `${v.length} chars, ending ${v.slice(-4)}` : 'empty');

console.log('\nConfiguration');
if (!syncEnabled) {
	fail('sync is off', 'a client id, a client secret and a database url are all required');
} else {
	pass('sync is on');
}
config.discord.clientId
	? (/^\d{17,20}$/.test(config.discord.clientId)
		? pass('client id', config.discord.clientId)
		: fail('client id', 'expected 17-20 digits, as Discord issues'))
	: fail('client id', 'not set');
config.discord.clientSecret ? pass('client secret', mask(config.discord.clientSecret)) : fail('client secret', 'not set');
config.turso.url ? pass('database url', config.turso.url.replace(/\/\/[^@]*@/, '//')) : fail('database url', 'not set');

if (config.turso.url.startsWith('libsql://') && !config.turso.authToken) {
	fail('database token', 'a hosted database needs one; only file: urls do not');
} else if (config.turso.authToken) {
	pass('database token', mask(config.turso.authToken));
}

config.publicUrl.startsWith('https://')
	? pass('public url', config.publicUrl)
	: config.publicUrl.startsWith('http://localhost')
		? pass('public url', `${config.publicUrl} (local; cookies will not be Secure, which is right here)`)
		: fail('public url', 'should be https in production, or session cookies cannot be marked Secure');

config.sessionSecret.length >= 32
	? pass('session secret', `${config.sessionSecret.length} chars`)
	: fail('session secret', 'want 32 or more characters');

// The optional parts: said as notes when they are off, and failed only
// when half set -- a key pair with one half, a webhook that is not one.
console.log('\nOptional features');
const v = config.vapid;
if (pushEnabled) {
	pass('push reminders', `public key ${mask(v.publicKey)}`);
	v.subject ? pass('push contact', v.subject) : note('VAPID_SUBJECT is unset: the push services are given the site instead');
} else if (v.publicKey || v.privateKey) {
	fail('push reminders', 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are both needed (npx web-push generate-vapid-keys)');
} else note('push reminders are off: no VAPID keys');
config.adminIds.size
	? (![...config.adminIds].every(id => /^\d{17,20}$/.test(id))
		? fail('ADMIN_IDS', 'Discord account ids are 17-20 digits, comma-separated')
		: pass('feedback inbox', `${config.adminIds.size} admin${config.adminIds.size === 1 ? '' : 's'}`))
	: note('ADMIN_IDS is unset: nobody can open the feedback inbox');
config.feedbackWebhook
	? (/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//.test(config.feedbackWebhook)
		? pass('feedback webhook', 'a Discord webhook')
		: fail('feedback webhook', 'FEEDBACK_WEBHOOK_URL is not a Discord webhook address'))
	: note('FEEDBACK_WEBHOOK_URL is unset: feedback lands in the inbox without a ping');
if (config.uploadDir) {
	try {
		fs.mkdirSync(config.uploadDir, { recursive: true });
		const probe = path.join(config.uploadDir, `.check-${process.pid}`);
		fs.writeFileSync(probe, '');
		fs.unlinkSync(probe);
		pass('upload folder', config.uploadDir);
	} catch (err) {
		fail('upload folder', `${config.uploadDir} is not writable: ${err.code || err.message}`);
	}
}
process.env.APP_VERSION ? pass('build name', process.env.APP_VERSION) : note('APP_VERSION is unset: the build is named from git or the image stamp');
config.clientIpHeader ? pass('client address header', config.clientIpHeader) : note('CLIENT_IP_HEADER is unset: limits per address count whatever address reaches the app');

note('');
note(`register this redirect on the Discord application, exactly:`);
note(`  ${config.discord.redirectUri}`);

if (syncEnabled) {
	console.log('\nDiscord');
	try {
		// The client_credentials grant proves the id and secret are a real
		// pair without anyone signing in. It says nothing about the
		// redirect, which only Discord's own settings page can confirm.
		const res = await fetch('https://discord.com/api/oauth2/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: 'Basic ' + Buffer.from(
					`${config.discord.clientId}:${config.discord.clientSecret}`
				).toString('base64')
			},
			body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'identify' }),
			signal: AbortSignal.timeout(15000)
		});

		let body = null;
		try {
			body = await res.json();
		} catch {
			// Not JSON, so whatever answered was not Discord's API.
		}

		if (res.ok) {
			pass('accepted the client id and secret');
		} else if (body && body.error) {
			// A named OAuth error really is Discord turning you down.
			const why = body.error === 'invalid_client'
				? 'the client id and secret are not a matching pair -- reset the secret and copy it again'
				: `${body.error}${body.error_description ? `: ${body.error_description}` : ''}`;
			fail('rejected the credentials', why);
		} else {
			// A bare status with no OAuth error body is almost never
			// Discord: a corporate proxy, a firewall or a captive portal
			// answered instead. Reporting that as "bad credentials" would
			// send you off resetting a secret that was fine all along.
			fail('no clear answer from Discord', `HTTP ${res.status} with no OAuth error body — a proxy or firewall in the way, rather than a credential problem`);
			note('your credentials may well be correct; this check simply could not reach Discord');
		}
	} catch (err) {
		fail('could not reach Discord', `${err.message} — network, proxy or firewall, not your credentials`);
	}

	console.log('\nDatabase');
	try {
		const { db, migrate } = await import('../server/db.js');
		await db().execute('select 1');
		pass('connected');
		const version = await migrate();
		const { rows } = await db().execute(
			"select name from sqlite_master where type = 'table' order by name"
		);
		pass('schema ready', `version ${version}: ${rows.map(r => r.name).join(', ') || 'no tables'}`);
		const { rows: counts } = await db().execute('select count(*) as n from users');
		pass('accounts stored', String(counts[0].n));
	} catch (err) {
		fail('database', err.message);
	}
}

console.log(failures
	? `\n${failures} problem${failures === 1 ? '' : 's'} to fix.\n`
	: '\nEverything checks out. Start the server and sign in.\n');
process.exit(failures ? 1 : 0);
