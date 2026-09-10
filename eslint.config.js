// The linter is here for one class of mistake above all: a free
// identifier -- code moved between modules that still reads a name
// nothing imports. Style stays the codebase's own; the rules below are
// correctness, not taste.

import js from '@eslint/js';

const browserGlobals = {
	window: 'readonly', document: 'readonly', navigator: 'readonly',
	location: 'readonly', history: 'readonly', localStorage: 'readonly',
	fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
	Blob: 'readonly', Image: 'readonly', HTMLElement: 'readonly',
	requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
	performance: 'readonly',
	setTimeout: 'readonly', clearTimeout: 'readonly',
	setInterval: 'readonly', clearInterval: 'readonly',
	getComputedStyle: 'readonly', Event: 'readonly',
	console: 'readonly', caches: 'readonly', self: 'readonly',
	Response: 'readonly', AbortController: 'readonly', DOMException: 'readonly',
	AbortSignal: 'readonly', WebGLRenderingContext: 'readonly',
	indexedDB: 'readonly', CustomEvent: 'readonly',
	atob: 'readonly', btoa: 'readonly', Buffer: 'readonly',
	TextEncoder: 'readonly', TextDecoder: 'readonly',
	CompressionStream: 'readonly', DecompressionStream: 'readonly',
	Notification: 'readonly', Intl: 'readonly',
	createImageBitmap: 'readonly', FileReader: 'readonly'
};

export default [
	{
		ignores: ['node_modules/**', 'js/driver.iife.js', 'js/all_barter.json']
	},
	js.configs.recommended,
	{
		rules: {
			// The codebase swallows errors deliberately and says why in a
			// comment; an empty catch with a comment is idiom here.
			'no-empty': ['error', { allowEmptyCatch: true }],
			'no-unused-vars': ['error', {
				args: 'none',
				caughtErrors: 'none',
				varsIgnorePattern: '^_'
			}]
		}
	},
	{
		files: ['js/**/*.js', 'sw.js'],
		languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: browserGlobals }
	},
	{
		// Tests and the capture harness are node programs that also carry
		// browser code inside page.evaluate() callbacks, so they get both
		// vocabularies.
		files: ['server.js', 'server/**/*.js', 'tools/**/*.mjs', 'test/**/*.mjs', 'eslint.config.js'],
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'module',
			globals: {
				...browserGlobals,
				process: 'readonly', Buffer: 'readonly',
				AbortSignal: 'readonly'
			}
		}
	}
];
