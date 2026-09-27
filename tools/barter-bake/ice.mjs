// ICE, Matthew Kwan's block cipher, at level 0 ("Thin-ICE": 8 rounds, a
// 64-bit key) -- what the game keeps a few of its tables in. Of the
// barter set only `barter_npclist.bss` is encrypted, and the extractor
// hands it over as it sits in the archive. Written from the reference
// ice.c; checked byte for byte against a copy decrypted by other means.

const SMOD = [[333, 313, 505, 369], [379, 375, 319, 391], [361, 445, 451, 397], [397, 425, 395, 505]];
const SXOR = [[0x83, 0x85, 0x9b, 0xcd], [0xcc, 0xa7, 0xad, 0x41], [0x4b, 0x2e, 0xd4, 0x33], [0xea, 0xcb, 0x2e, 0x04]];
const PBOX = [
	0x00000001, 0x00000080, 0x00000400, 0x00002000, 0x00080000, 0x00200000, 0x01000000, 0x40000000,
	0x00000008, 0x00000020, 0x00000100, 0x00004000, 0x00010000, 0x00800000, 0x04000000, 0x20000000,
	0x00000004, 0x00000010, 0x00000200, 0x00008000, 0x00020000, 0x00400000, 0x08000000, 0x10000000,
	0x00000002, 0x00000040, 0x00000800, 0x00001000, 0x00040000, 0x00100000, 0x02000000, 0x80000000
];
const KEYROT = [0, 1, 2, 3, 2, 1, 3, 0];

/** The key the game's tables are encrypted with. */
export const BDO_KEY = [0x51, 0xf3, 0x0f, 0x11, 0x04, 0x24, 0x6a, 0x00];

const gfMult = (a, b, m) => {
	let r = 0;
	while (b) {
		if (b & 1) r ^= a;
		a <<= 1;
		b >>= 1;
		if (a >= 256) a ^= m;
	}
	return r;
};
const gfExp7 = (b, m) => {
	if (!b) return 0;
	let x = gfMult(b, b, m);
	x = gfMult(b, x, m);
	x = gfMult(x, x, m);
	return gfMult(b, x, m);
};
const perm32 = x => {
	let r = 0;
	for (let i = 0; x; i++, x >>>= 1) if (x & 1) r |= PBOX[i];
	return r >>> 0;
};
const SBOX = [0, 1, 2, 3].map(j => Array.from({ length: 1024 }, (_, i) => {
	const col = (i >> 1) & 0xff, row = (i & 1) | ((i & 0x200) >> 8);
	return perm32(gfExp7(col ^ SXOR[j][row], SMOD[j][row]) << (24 - j * 8));
}));

function round(p, sk) {
	const tl = ((p >>> 16) & 0x3ff) | (((p >>> 14) | (p << 18)) & 0xffc00);
	const tr = (p & 0x3ff) | ((p << 2) & 0xffc00);
	let al = sk[2] & (tl ^ tr);
	let ar = al ^ tr;
	al ^= tl;
	al ^= sk[0];
	ar ^= sk[1];
	return (SBOX[0][al >>> 10] | SBOX[1][al & 0x3ff] | SBOX[2][ar >>> 10] | SBOX[3][ar & 0x3ff]) >>> 0;
}

/** The eight round subkeys of a 64-bit key. */
export function schedule(key) {
	const kb = [0, 1, 2, 3].map(i => (key[i * 2] << 8) | key[i * 2 + 1]).reverse();
	return KEYROT.map(kr => {
		const sk = [0, 0, 0];
		for (let j = 0; j < 15; j++) {
			for (let k = 0; k < 4; k++) {
				const at = (kr + k) & 3, bit = kb[at] & 1;
				sk[j % 3] = ((sk[j % 3] << 1) | bit) >>> 0;
				kb[at] = (kb[at] >>> 1) | ((bit ^ 1) << 15);
			}
		}
		return sk;
	});
}

function block(ks, buf, o, forward) {
	let l = buf.readUInt32BE(o), r = buf.readUInt32BE(o + 4);
	if (forward) for (let i = 0; i < 8; i += 2) { l = (l ^ round(r, ks[i])) >>> 0; r = (r ^ round(l, ks[i + 1])) >>> 0; }
	else for (let i = 7; i > 0; i -= 2) { l = (l ^ round(r, ks[i])) >>> 0; r = (r ^ round(l, ks[i - 1])) >>> 0; }
	buf.writeUInt32BE(r, o);
	buf.writeUInt32BE(l, o + 4);
}

// Eight bytes at a time; a tail shorter than a block is left as it is.
const run = (data, key, forward) => {
	const ks = schedule(key), out = Buffer.from(data);
	for (let o = 0; o + 8 <= out.length; o += 8) block(ks, out, o, forward);
	return out;
};
export const iceDecrypt = (data, key = BDO_KEY) => run(data, key, false);
export const iceEncrypt = (data, key = BDO_KEY) => run(data, key, true);
