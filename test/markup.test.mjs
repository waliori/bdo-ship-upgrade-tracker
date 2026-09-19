// The markup a feedback post is written in.
//
// Two things are being checked, and the first one is the one that
// matters: nothing a stranger writes can become a tag. The renderer
// escapes first and applies its grammar to the escaped text, so these
// are not sanitiser tests looking for a hole -- they are the statement
// that there is no hole to look for.
//
// The second is that the marks people already type mean what they mean
// everywhere else.

import test from 'node:test';
import assert from 'node:assert/strict';

const { renderMarkup, renderPlain, plainOf, videoOf } = await import('../js/markup.js');

const shot = { id: 'aBc123xyz', name: 'shot.png', width: 800, height: 600 };

/* ------------------------------------------------------------------ *
 * Nothing becomes a tag
 * ------------------------------------------------------------------ */

test('HTML in a post is text, wherever it is put', () => {
	for (const attempt of [
		'<script>alert(1)</script>',
		'<img src=x onerror=alert(1)>',
		'**<b>bold</b>**',
		'> <iframe src="https://evil"></iframe>',
		'`<script>`',
		'```\n<script>\n```',
		'## <script>x</script>',
		'- <script>x</script>'
	]) {
		const html = renderMarkup(attempt);
		// No tag of theirs, and no handler on a tag of ours -- the text
		// of the attempt is still in there, escaped, which is the point.
		assert.equal(/<(script|iframe|img|object|embed|style)\b/i.test(html), false, attempt);
		assert.equal(/<[a-z][^>]*\son\w+\s*=/i.test(html), false, attempt);
		assert.ok(html.includes('&lt;'), attempt);
	}
});

test('a link may only be one that a browser can safely follow', () => {
	const html = renderMarkup('[press me](javascript:alert(1)) and [here](https://example.com)');
	assert.equal(html.includes('href="javascript'), false);
	assert.ok(html.includes('[press me](javascript:alert(1))'), 'it stays the text it was typed as');
	assert.ok(html.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">'));
});

test('the slots the renderer holds its work in cannot be forged', () => {
	// The placeholder is a NUL and an index; a post that writes one is
	// stripped of it on the way in rather than being allowed to name a
	// slot that has not been filled.
	const html = renderMarkup('\u00000\u0000 and `code`');
	assert.equal(html.includes('\u0000'), false);
	assert.ok(html.includes('<code>code</code>'));
	assert.ok(html.includes('0 and'));
});

/* ------------------------------------------------------------------ *
 * The marks
 * ------------------------------------------------------------------ */

test('the marks anyone already types mean what they mean elsewhere', () => {
	assert.ok(renderMarkup('**loud**').includes('<strong>loud</strong>'));
	assert.ok(renderMarkup('*soft*').includes('<em>soft</em>'));
	assert.ok(renderMarkup('_soft_').includes('<em>soft</em>'));
	assert.ok(renderMarkup('~~gone~~').includes('<del>gone</del>'));
	assert.ok(renderMarkup('`x = 1`').includes('<code>x = 1</code>'));
	assert.ok(renderMarkup('||the ending||').includes('class="mk-spoiler"'));
	assert.ok(renderMarkup('## A heading').includes('<h4>A heading</h4>'));
	assert.ok(renderMarkup('---').includes('<hr>'));

	// A star inside code is a star, not emphasis.
	assert.ok(renderMarkup('`a * b`').includes('<code>a * b</code>'));
	// And a name with underscores is a name.
	assert.equal(renderMarkup('snake_case_name').includes('<em>'), false);
});

test('lists, quotes and fenced code are blocks', () => {
	const list = renderMarkup('- one\n- two');
	assert.ok(list.includes('<ul><li>one</li><li>two</li></ul>'));

	const steps = renderMarkup('1. first\n2. second');
	assert.ok(steps.includes('<ol><li>first</li><li>second</li></ol>'));

	const quote = renderMarkup('> what it said\n> on two lines');
	assert.ok(quote.includes('<blockquote>'));
	assert.ok(quote.includes('what it said<br>on two lines'));

	const code = renderMarkup('```\nline one\nline two\n```');
	assert.ok(code.includes('<pre><code>line one\nline two</code></pre>'));

	// A single newline inside a paragraph is a line break: somebody
	// laying out steps should not have to know what a blank line does.
	assert.ok(renderMarkup('one\ntwo').includes('one<br>two'));
});

test('a bare link is picked up, and the sentence keeps its punctuation', () => {
	const html = renderMarkup('see https://example.com/page, then stop');
	assert.ok(html.includes('>https://example.com/page</a>, then stop'));
});

/* ------------------------------------------------------------------ *
 * Pictures
 * ------------------------------------------------------------------ */

test('a post may show its own attachments and nothing else', () => {
	const html = renderMarkup(`![what I see](attachment:${shot.id})`, { files: [shot] });
	assert.ok(html.includes(`<img src="/api/feedback/file/${shot.id}"`));
	assert.ok(html.includes('width="800" height="600"'));
	assert.ok(html.includes('alt="what I see"'));

	// An id this post does not carry is not a picture of anyone's.
	const borrowed = renderMarkup('![theirs](attachment:someoneElse)', { files: [shot] });
	assert.equal(borrowed.includes('<img'), false);
	assert.ok(borrowed.includes('![theirs](attachment:someoneElse)'));

	// A picture from somewhere else on the internet is a link, not an
	// image: the page would refuse to load it, and fetching it would
	// tell that somewhere when the inbox was opened.
	const outside = renderMarkup('![a pixel](https://tracker.example/p.png)');
	assert.equal(outside.includes('<img'), false);
	assert.ok(outside.includes('<a href="https://tracker.example/p.png"'));
});

/* ------------------------------------------------------------------ *
 * Films
 * ------------------------------------------------------------------ */

test('a link that is nothing but a film becomes the film', () => {
	for (const url of [
		'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		'https://youtu.be/dQw4w9WgXcQ',
		'https://www.youtube.com/shorts/dQw4w9WgXcQ'
	]) {
		const found = videoOf(url);
		assert.equal(found.id, 'dQw4w9WgXcQ', url);
		assert.equal(found.embed, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
		const html = renderMarkup(url);
		assert.ok(html.includes('class="mk-video"'), url);
		assert.ok(html.includes('data-embed="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'), url);
		// Nothing plays until it is asked to: the card is a still and a
		// button, and the frame is written only when the button is pressed.
		assert.equal(html.includes('<iframe'), false, url);
	}

	assert.equal(videoOf('https://example.com/not-a-film'), null);
	// In the middle of a sentence it is a link like any other.
	const inline = renderMarkup('watch https://youtu.be/dQw4w9WgXcQ later');
	assert.equal(inline.includes('mk-video'), false);
	assert.ok(inline.includes('<a href="https://youtu.be/dQw4w9WgXcQ"'));
});

/* ------------------------------------------------------------------ *
 * What was written before any of this
 * ------------------------------------------------------------------ */

test('an entry written as plain words is still read as plain words', () => {
	const html = renderPlain('2 * 3 is 6, and _this_ is not italic <b>either</b>');
	assert.ok(html.includes('2 * 3'));
	assert.ok(html.includes('_this_'));
	assert.ok(html.includes('&lt;b&gt;'));
	assert.equal(html.includes('<em>'), false);
	// A link was always a link, though.
	assert.ok(renderPlain('see https://example.com').includes('<a href="https://example.com"'));
});

test('a post can say its one line', () => {
	const line = plainOf('## Title\n\nA **bold** word and ![a shot](attachment:x)');
	assert.equal(line, 'Title A bold word and [a shot]');
	assert.ok(plainOf('x'.repeat(400)).length <= 160);
});
