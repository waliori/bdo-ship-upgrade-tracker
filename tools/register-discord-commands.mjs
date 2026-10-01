// Tells Discord which slash commands the bot has.
//
//   DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node tools/register-discord-commands.mjs
//
// With a guild id the commands appear at once in that server; without one
// they are global and take up to an hour. Safe to run again: the list is
// replaced, not added to.

import { COMMAND_DEFINITIONS } from '../server/discord-bot.js';

const token = (process.env.DISCORD_BOT_TOKEN || '').trim();
const guild = (process.env.DISCORD_GUILD_ID || '').trim();
if (!token) {
	console.error('Set DISCORD_BOT_TOKEN.');
	process.exit(1);
}
const api = 'https://discord.com/api/v10';
const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
const me = await (await fetch(`${api}/oauth2/applications/@me`, { headers })).json();
const url = `${api}/applications/${me.id}/${guild ? `guilds/${guild}/` : ''}commands`;
const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(COMMAND_DEFINITIONS) });
if (!res.ok) {
	console.error(res.status, await res.text());
	process.exit(1);
}
console.log('registered:', (await res.json()).map(c => `/${c.name}`).join(' '));
console.log('public key for DISCORD_BOT_PUBLIC_KEY:', me.verify_key);
