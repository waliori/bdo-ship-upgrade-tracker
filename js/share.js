// A plan in a link.
//
// The save is small -- a few hundred counts and a handful of builds --
// so it fits in an address once gzipped and base64'd, and a link needs
// no account, no server and no file: open it on any browser and the
// plan is there to look at or to take in. The first character says how
// the rest was packed, so a browser without a compressor can still
// read a link, and vice versa.

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = text => {
	const s = text.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
	return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function pipe(bytes, Stream, kind) {
	const stream = new Blob([bytes]).stream().pipeThrough(new Stream(kind));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The save as link text: 'z' + gzip, or 'p' + plain where there is no compressor. */
export async function encodeShare(save) {
	const bytes = new TextEncoder().encode(JSON.stringify(save));
	if (typeof CompressionStream !== 'undefined') return 'z' + b64url(await pipe(bytes, CompressionStream, 'gzip'));
	return 'p' + b64url(bytes);
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
