// The " · " between facts on a line, drawn as a hairline instead of a dot.
// The strings keep their dot (the packs, the copied text, the tests read
// it); only what is on screen changes. Every text node that reaches the
// page is looked at once: each dot becomes ' <span class="sep">·</span> ',
// which the stylesheet turns into a thin rule with room either side.

const DOT = ' · ';
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'SELECT', 'INPUT', 'TITLE', 'svg', 'text']);

function split(node) {
	const p = node.parentNode;
	if (!p || SKIP.has(p.nodeName) || p.classList?.contains('sep')) return;
	const parts = node.data.split(DOT);
	if (parts.length < 2) return;
	const frag = document.createDocumentFragment();
	parts.forEach((t, k) => {
		if (k) {
			// The spaces stay outside the mark, so text read off the page
			// still says " · " (a box drops the spaces at its own edges).
			const s = document.createElement('span');
			s.className = 'sep';
			s.textContent = '·';
			frag.append(' ', s, ' ');
		}
		if (t) frag.append(t);
	});
	p.replaceChild(frag, node);
}

function walk(root) {
	if (root.nodeType === 3) return split(root);
	if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
	const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const hits = [];
	for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.includes(DOT)) hits.push(n);
	hits.forEach(split);
}

walk(document.body);
new MutationObserver(list => {
	for (const m of list) {
		if (m.type === 'characterData') split(m.target);
		else m.addedNodes.forEach(walk);
	}
}).observe(document.body, { childList: true, subtree: true, characterData: true });
