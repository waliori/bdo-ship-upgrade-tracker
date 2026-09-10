// Laying the narration under a film, and writing the subtitles out.
//
// A shoot leaves two things behind: the silent screencast, and a
// timeline saying what was said and how many milliseconds in. This
// turns that pair into the mp4 the README links to, plus the caption
// sidecars a player can switch on.
//
// The film already carries its words on screen -- the caption bar is
// drawn in the page, in the app's own typeface, and most people meet
// these clips muted in a README. The `.vtt` is for everywhere else: a
// player's own caption track, and the transcript YouTube builds a
// search index out of.
//
//   node tools/capture/mix.mjs tools/capture/out/the-yard
//   node tools/capture/mix.mjs tools/capture/out/the-yard docs/media

import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);

/** hh:mm:ss.mmm, which is what WebVTT wants; SRT wants a comma for the dot. */
function stamp(ms, comma = false) {
	const t = Math.max(0, ms);
	const h = String(Math.floor(t / 3600000)).padStart(2, '0');
	const m = String(Math.floor(t / 60000) % 60).padStart(2, '0');
	const s = String(Math.floor(t / 1000) % 60).padStart(2, '0');
	const f = String(t % 1000).padStart(3, '0');
	return `${h}:${m}:${s}${comma ? ',' : '.'}${f}`;
}

/**
 * A caption per line.
 *
 * Held a beat past the end of its audio, because that is what the bar
 * on screen does -- a caption stays up through the pause after it, and
 * a sidecar that blinked off early would disagree with the picture it
 * is captioning. Cut short where the next line starts sooner than that,
 * and cut short again where the film goes quiet: a beat that ends in
 * `hush` has taken its caption down, and holding this one all the way
 * to the next line would caption a silence that is showing something
 * else entirely.
 */
function cues(lines, lead, total) {
	return lines.map((l, i) => {
		const from = l.at + lead;
		const next = lines[i + 1];
		const held = from + l.ms + 900;
		return {
			from,
			to: Math.min(next ? next.at + lead : total, held, total),
			text: l.text
		};
	});
}

const vtt = c => 'WEBVTT\n\n' + c.map((q, i) =>
	`${i + 1}\n${stamp(q.from)} --> ${stamp(q.to)}\n${q.text}\n`).join('\n');

const srt = c => c.map((q, i) =>
	`${i + 1}\n${stamp(q.from, true)} --> ${stamp(q.to, true)}\n${q.text}\n`).join('\n');

/**
 * Build the soundtrack and mux it onto the picture.
 *
 * Each line is delayed to its own moment and the lot summed. They never
 * overlap -- a beat holds until its line has finished speaking, which is
 * how the film was paced in the first place -- so the sum is really a
 * sequence, and `normalize=0` keeps amix from quietly halving every
 * voice because there are thirty inputs rather than one.
 *
 * `loudnorm` at the end puts the result at the loudness streaming
 * services and browsers expect, so these do not play noticeably quieter
 * than everything else in a README; `apad` runs the track out to the
 * end of the picture, since the film holds a beat after its last word.
 */
export async function mix(stem, outDir = null) {
	const timeline = JSON.parse(await readFile(`${stem}.json`, 'utf8'));
	const { lines, lead = 0, ms: total } = timeline;
	const webm = `${stem}.webm`;
	const name = path.basename(stem);
	const dir = outDir || path.dirname(stem);
	// Asked for rather than assumed: mixing one chapter by hand into a
	// directory that does not exist yet is the ordinary way to use this,
	// and ffmpeg's complaint about it is not a helpful one.
	await mkdir(dir, { recursive: true });
	const mp4 = path.join(dir, `${name}.mp4`);

	const args = ['-v', 'error', '-y', '-i', webm];
	for (const l of lines) args.push('-i', l.file);

	if (lines.length) {
		const parts = lines.map((l, i) =>
			`[${i + 1}:a]adelay=${Math.max(0, Math.round(l.at + lead))}:all=1[d${i}]`);
		const sum = lines.map((_, i) => `[d${i}]`).join('');
		parts.push(`${sum}amix=inputs=${lines.length}:normalize=0:dropout_transition=0[m]`);
		parts.push('[m]loudnorm=I=-16:TP=-1.5:LRA=11,apad[a]');
		args.push('-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[a]');
	} else {
		args.push('-map', '0:v', '-an');
	}

	args.push(
		'-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.CRF || '30',
		'-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0',
		'-movflags', '+faststart'
	);
	if (lines.length) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
	args.push(mp4);

	await exec('ffmpeg', args, { maxBuffer: 1 << 26 });

	const c = cues(lines, lead, total);
	await writeFile(path.join(dir, `${name}.vtt`), vtt(c));
	await writeFile(path.join(dir, `${name}.srt`), srt(c));
	// A plain transcript, for the README and for anyone who would rather
	// read the thing than watch it.
	await writeFile(path.join(dir, `${name}.txt`), lines.map(l => l.text).join('\n') + '\n');

	return { mp4, lines: lines.length, ms: total };
}

// Run directly: mix one stem, or a whole directory's worth.
if (import.meta.url === `file://${process.argv[1]}`) {
	const stem = process.argv[2];
	const out = process.argv[3] || null;
	if (!stem) {
		console.error('usage: node tools/capture/mix.mjs <out/stem> [outdir]');
		process.exit(1);
	}
	const r = await mix(stem.replace(/\.(webm|json)$/, ''), out);
	console.log(`→ ${r.mp4}  (${r.lines} lines, ${(r.ms / 1000).toFixed(1)}s)`);
}
