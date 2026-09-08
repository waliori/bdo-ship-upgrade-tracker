// A plan in a link.
//
// The save is small -- a few hundred counts and a handful of builds --
// so it fits in an address once gzipped and base64'd, and a link needs
// no account, no server and no file: open it on any browser and the
// plan is there to look at or to take in. The first character says how
// the rest was packed, so a browser without a compressor can still
// read a link, and vice versa.

// A slice at a time: spreading the bytes into one call puts every one
// of them on the argument stack, which gives out somewhere past a
// hundred thousand -- a profile with its traces and diaries is bigger.
const CHUNK = 0x8000;
const b64url = bytes => {
	let bin = '';
	for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = text => {
	const s = text.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
	return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function pipe(bytes, Stream, kind) {
	const stream = new Blob([bytes]).stream().pipeThrough(new Stream(kind));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

// What a slim link leaves out of the profile: the screens' views and the
// diaries the app keeps by itself. A plan shared is the stock, the
// builds, the ship and the crew; the other player has traces and a
// material log of their own, and these are what make a link long.
export const SLIM_DROP = ['views', 'matSeen', 'progress', 'runs', 'ratios', 'sevens'];

/** The save with the profile's diaries and views left out. */
export function slimShape(save) {
	if (!save || !save.profile || typeof save.profile !== 'object') return save;
	const profile = {};
	for (const [k, v] of Object.entries(save.profile)) if (!SLIM_DROP.includes(k)) profile[k] = v;
	const out = { ...save };
	if (Object.keys(profile).length) out.profile = profile;
	else delete out.profile;
	return out;
}

/** The save as link text: 'z' + gzip, or 'p' + plain where there is no
 *  compressor. `slim` leaves the views and diaries out (SLIM_DROP). */
export async function encodeShare(save, { slim = false } = {}) {
	const bytes = new TextEncoder().encode(JSON.stringify(slim ? slimShape(save) : save));
	if (typeof CompressionStream !== 'undefined') return 'z' + b64url(await pipe(bytes, CompressionStream, 'gzip'));
	return 'p' + b64url(bytes);
}

/** How long a link's payload is: the characters of the text encodeShare
 *  returned, which is what the address bar and the clipboard carry. */
export function shareSize(text) {
	return typeof text === 'string' ? text.length : 0;
}

/** Link text back to a save. Throws on anything that is not one. */
export async function decodeShare(text) {
	const flag = text[0];
	let bytes = unb64url(text.slice(1));
	if (flag === 'z') {
		if (typeof DecompressionStream === 'undefined') throw new Error('no decompressor');
		bytes = await pipe(bytes, DecompressionStream, 'gzip');
	} else if (flag !== 'p') {
		throw new Error('not a plan');
	}
	const save = JSON.parse(new TextDecoder().decode(bytes));
	if (!save || typeof save !== 'object' || !save.stock || typeof save.stock !== 'object' || Array.isArray(save.stock)) {
		throw new Error('not a plan');
	}
	return save;
}

export function shareLink(payload) {
	return `${location.origin}${location.pathname}#share/${payload}`;
}

/** Anything small as link text -- a traced route, say -- packed the same way. */
export async function encodeAny(obj) {
	const bytes = new TextEncoder().encode(JSON.stringify(obj));
	if (typeof CompressionStream !== 'undefined') return 'z' + b64url(await pipe(bytes, CompressionStream, 'gzip'));
	return 'p' + b64url(bytes);
}

/** Link text back to whatever encodeAny packed. Throws on anything else. */
export async function decodeAny(text) {
	const flag = text[0];
	let bytes = unb64url(text.slice(1));
	if (flag === 'z') {
		if (typeof DecompressionStream === 'undefined') throw new Error('no decompressor');
		bytes = await pipe(bytes, DecompressionStream, 'gzip');
	} else if (flag !== 'p') {
		throw new Error('not a link of ours');
	}
	return JSON.parse(new TextDecoder().decode(bytes));
}
