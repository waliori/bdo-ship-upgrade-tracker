// Is this actually a picture, and how big is it?
//
// The one question worth asking of an upload. Not the filename, which is
// the sender's to invent, and not the Content-Type, which is the
// sender's too -- the bytes. A file whose first bytes do not spell out
// one of the four formats below is refused, and the type it is later
// served with is the one read here rather than the one it claimed.
//
// That is the whole defence. An HTML page uploaded as `shot.png` and
// served back as `text/html` would be a stored cross-site script on this
// origin; sniffed, it is simply not an image and never lands.
//
// The dimensions come out of the same few bytes, and are worth having:
// the inbox can lay a screenshot out before it has loaded, so a page of
// them does not jump about as they arrive.

/** PNG, JPEG, GIF or WebP -- what it is and how big, or null. */
export function sniff(buf) {
	if (!buf || buf.length < 16) return null;
	return png(buf) || gif(buf) || webp(buf) || jpeg(buf);
}

/** The extension a sniffed type is stored under. */
export const EXTENSION = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp'
};

function png(buf) {
	if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return null;
	// The header chunk is always first and always IHDR, which carries the
	// size in the eight bytes after its name.
	if (buf.length < 24 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
	return { mime: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function gif(buf) {
	const magic = buf.toString('latin1', 0, 6);
	if (magic !== 'GIF87a' && magic !== 'GIF89a') return null;
	return { mime: 'image/gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function webp(buf) {
	if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
	const kind = buf.toString('latin1', 12, 16);
	// Three encodings under one name: lossy, lossless, and the extended
	// container that animation and transparency use.
	if (kind === 'VP8 ' && buf.length >= 30) {
		return { mime: 'image/webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
	}
	if (kind === 'VP8L' && buf.length >= 25) {
		const bits = buf.readUInt32LE(21);
		return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	if (kind === 'VP8X' && buf.length >= 30) {
		const size = at => buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16);
		return { mime: 'image/webp', width: size(24) + 1, height: size(27) + 1 };
	}
	return null;
}

function jpeg(buf) {
	if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
	// Walk the segments to the frame header, which is the only one that
	// says how large the image is. Anything that is not a segment where
	// a segment must be means this is not a JPEG after all.
	let at = 2;
	while (at + 9 < buf.length) {
		if (buf[at] !== 0xff) return null;
		const marker = buf[at + 1];
		if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { at += 2; continue; }
		const length = buf.readUInt16BE(at + 2);
		if (length < 2) return null;
		// SOF0..SOF15, less the four that are not frame headers at all.
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			return { mime: 'image/jpeg', height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
		}
		at += 2 + length;
	}
	// A JPEG whose size could not be found is still a JPEG; it only means
	// the inbox has to wait for the picture to know its shape.
	return { mime: 'image/jpeg', width: null, height: null };
}
