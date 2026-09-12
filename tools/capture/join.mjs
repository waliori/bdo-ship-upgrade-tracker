// The six chapters, joined into one film.
//
// This is what the README calls the walkthrough and what the app plays
// under Help. It is not shot: it is the six mp4s end to end, so there
// is one script, one voice and one set of pictures behind both ways of
// watching, and a chapter re-shot is a chapter replaced here.
//
// Every chapter comes out of mix.mjs with the same codecs, size and
// rate, so this is a stream copy -- seconds, and no second generation
// of h264 over an already-compressed screencast.
//
// Chapter marks go in as well, so a player can jump between the six,
// and the six caption files are merged into one with every cue pushed
// along by the running offset.
//
//   node tools/capture/join.mjs
//   node tools/capture/join.mjs docs/media/guide docs/media/walkthrough

import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);

const IN = process.argv[2] || 'docs/media/guide';
const OUT = process.argv[3] || 'docs/media/walkthrough';
const RAW = process.env.RAW || 'tools/capture/out/guide';

/**
 * The running order.
 *
 * Only the order lives here -- the numbers and titles are read back out
 * of each chapter's own timeline, so a chapter renamed in guides.mjs
 * cannot end up captioned one thing and marked another.
 */
const ORDER = ['the-yard', 'to-get', 'quests', 'your-ship', 'the-map', 'a-run', 'the-harbour'];

const seconds = async file => {
	const { stdout } = await exec('ffprobe', [
		'-v', 'error', '-show_entries', 'format=duration',
		'-of', 'default=nw=1:nk=1', file
	]);
	return Number(stdout.trim());
};

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** hh:mm:ss.mmm shifted by a number of seconds; SRT wants a comma. */
function shift(stamp, by, comma = false) {
	const m = /(\d\d):(\d\d):(\d\d)[.,](\d\d\d)/.exec(stamp);
	const t = Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000
		+ Number(m[4]) + Math.round(by * 1000);
	const p = (n, w = 2) => String(n).padStart(w, '0');
	return `${p(Math.floor(t / 3600000))}:${p(Math.floor(t / 60000) % 60)}:${p(Math.floor(t / 1000) % 60)}${comma ? ',' : '.'}${p(t % 1000, 3)}`;
}

/** A `.vtt` as cue objects, so the timings can be moved. */
function cuesOf(text) {
	const out = [];
	let block = [];
	for (const line of [...text.split('\n').slice(1), '']) {
		if (line.trim() === '') {
			if (block.length >= 2 && block[1].includes('-->')) {
				const [from, to] = block[1].split('-->').map(x => x.trim());
				out.push({ from, to, text: block.slice(2) });
			}
			block = [];
		} else block.push(line);
	}
	return out;
}

const work = await mkdtemp(path.join(tmpdir(), 'join-'));
try {
	const chapters = [];
	let at = 0;
	for (const id of ORDER) {
		const mp4 = path.resolve(IN, `${id}.mp4`);
		// The title is the chapter's own, off the timeline mix.mjs read.
		let n = '', title = id;
		try {
			const meta = JSON.parse(await readFile(path.join(RAW, `${id}.json`), 'utf8'));
			n = meta.n || '';
			title = meta.title || id;
		} catch {
			// Shot on another machine, or the raw folder swept. The order
			// still holds and the mark still lands; it just carries the
			// file's name instead of its title.
		}
		chapters.push({ id, mp4, at, dur: await seconds(mp4), label: n ? `${n} — ${title}` : title });
		at += chapters.at(-1).dur;
	}

	// --- the film ---------------------------------------------------
	const listing = path.join(work, 'concat.txt');
	await writeFile(listing, chapters.map(c => `file '${c.mp4}'\n`).join(''));
	const joined = path.join(work, 'joined.mp4');
	await exec('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0',
		'-i', listing, '-c', 'copy', joined]);

	// --- the marks --------------------------------------------------
	const meta = [';FFMETADATA1', 'title=Sailor’s Log — the guide'];
	for (const c of chapters) {
		meta.push('', '[CHAPTER]', 'TIMEBASE=1/1000',
			`START=${Math.round(c.at * 1000)}`, `END=${Math.round((c.at + c.dur) * 1000)}`,
			`title=${c.label}`);
	}
	const metafile = path.join(work, 'chapters.txt');
	await writeFile(metafile, `${meta.join('\n')}\n`);
	await exec('ffmpeg', ['-v', 'error', '-y', '-i', joined, '-i', metafile,
		'-map_metadata', '1', '-map', '0', '-c', 'copy', `${OUT}.mp4`]);

	// --- one caption track over the lot -----------------------------
	const vtt = ['WEBVTT', ''];
	const srt = [];
	const txt = [];
	let n = 0;
	for (const c of chapters) {
		txt.push(`== ${c.label} ==`, '');
		for (const q of cuesOf(await readFile(path.join(IN, `${c.id}.vtt`), 'utf8'))) {
			n++;
			vtt.push(String(n), `${shift(q.from, c.at)} --> ${shift(q.to, c.at)}`, ...q.text, '');
			srt.push(String(n), `${shift(q.from, c.at, true)} --> ${shift(q.to, c.at, true)}`, ...q.text, '');
			txt.push(...q.text);
		}
		txt.push('');
	}
	await writeFile(`${OUT}.vtt`, vtt.join('\n'));
	await writeFile(`${OUT}.srt`, srt.join('\n'));
	await writeFile(`${OUT}.txt`, txt.join('\n'));

	// The offsets the app's Help dialog jumps to. Written rather than
	// typed, because they move whenever a chapter is re-shot or the
	// speed changes, and a jump list that lies is worse than none.
	const film = [
		'// Where each chapter starts in docs/media/walkthrough.mp4, in seconds.',
		'//',
		'// Generated by tools/capture/join.mjs when the chapters are joined --',
		'// do not edit by hand. A browser will not surface an mp4\'s own chapter',
		'// marks, so the Help dialog seeks with these instead.',
		'',
		'export const film = [',
		...chapters.map(c => `\t{ at: ${Math.round(c.at)}, title: ${JSON.stringify(c.label)} },`),
		'];',
		''
	].join('\n');
	await writeFile('js/film.js', film);

	const total = await seconds(`${OUT}.mp4`);
	console.log(`→ ${OUT}.mp4  ${clock(total)}  ${n} cues  · js/film.js`);
	for (const c of chapters) console.log(`   ${clock(c.at).padStart(5)}  ${c.label}`);
} finally {
	await rm(work, { recursive: true, force: true });
}
