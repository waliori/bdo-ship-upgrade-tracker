// Under a finger every control grows an invisible halo. A label round a field
// must not: the halo covers the field, and the tap never reaches it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the touch halo leaves a label round a field alone', async () => {
	const css = await readFile(new URL('../css/tracker-sea.css', import.meta.url), 'utf8');
	const rule = css.split('\n').find(l => l.includes('summary, label,') && l.trimEnd().endsWith('::after {'));
	assert.ok(rule, 'the halo rule is where it was');
	assert.match(rule, /label:has\(select, textarea, input:not\(\[type="checkbox"\], \[type="radio"\]\)\)/);
});
