// More than one save on one browser: an alt's ships, or a what-if.
//
// A profile is a whole separate save -- stock, builds, crew, undo --
// under its own storage key. The main one keeps the key the app has
// always used, so nobody's save moves. Switching reloads the page,
// which is the honest way to swap every module's idea of the state.
// What is shared: the chart's view and saved routes, the Market
// prices, the pace diary and the preferences -- browser things, not
// save things. Sync mirrors the main profile only.

import { esc } from './fmt.js';
import { keyFor, ACTIVE_PROFILE } from './state.js';
import { openDialog, closeDialog } from './dialogs.js';

const LIST_KEY = 'bdo-tracker/profiles';
const ACTIVE_KEY = 'bdo-tracker/profile';
export const PROFILE_MAX = 6;

function readList() {
	try {
		const raw = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
		return Array.isArray(raw) ? raw.filter(p => p && typeof p.slug === 'string' && p.slug && typeof p.name === 'string') : [];
	} catch { return []; }
}
function writeList(list) {
	try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

export const slugify = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'profile';

/** Every profile, the main one first. */
export function listProfiles() {
	return [{ slug: '', name: 'Main' }, ...readList()];
}

export function activeProfile() {
	return listProfiles().find(p => p.slug === ACTIVE_PROFILE) || { slug: ACTIVE_PROFILE, name: ACTIVE_PROFILE || 'Main' };
}

/** A new profile, empty or a copy of the one this page is on. */
export function createProfile(name, { copy = false } = {}) {
	const list = readList();
	if (list.length >= PROFILE_MAX - 1) return null;
	let slug = slugify(name);
	const taken = new Set(list.map(p => p.slug));
	for (let n = 2; taken.has(slug); n++) slug = `${slugify(name)}-${n}`;
	list.push({ slug, name: String(name).trim().slice(0, 30) || slug });
	writeList(list);
	try {
		const src = copy ? localStorage.getItem(keyFor(ACTIVE_PROFILE)) : null;
		if (src) localStorage.setItem(keyFor(slug), src);
		else localStorage.removeItem(keyFor(slug));
	} catch { /* private mode */ }
	return slug;
}

export function deleteProfile(slug) {
	if (!slug) return false;
	writeList(readList().filter(p => p.slug !== slug));
	try { localStorage.removeItem(keyFor(slug)); } catch { /* private mode */ }
	if (slug === ACTIVE_PROFILE) switchProfile('');
	return true;
}

/** Make a profile the active one. The page reloads into it. */
export function switchProfile(slug) {
	try {
		if (slug) localStorage.setItem(ACTIVE_KEY, slug);
		else localStorage.removeItem(ACTIVE_KEY);
	} catch { /* private mode */ }
	if (typeof location !== 'undefined' && location.reload) location.reload();
}

export function openProfiles({ toast }) {
	const list = listProfiles();
	const rows = list.map(p => `<div class="profile-row${p.slug === ACTIVE_PROFILE ? ' on' : ''}">
		<span class="profile-name">${esc(p.name)}${p.slug === ACTIVE_PROFILE ? ' <span class="profile-tag">this page</span>' : ''}${!p.slug ? ' <span class="profile-tag">syncs</span>' : ''}</span>
		${p.slug === ACTIVE_PROFILE ? '' : `<button class="ghost-btn" data-profile-switch="${esc(p.slug)}">Switch</button>`}
		${p.slug ? `<button class="map-x" data-profile-del="${esc(p.slug)}" aria-label="Delete ${esc(p.name)}">×</button>` : ''}
	</div>`).join('');
	const full = list.length >= PROFILE_MAX;
	const host = openDialog(`
		<h2>Profiles</h2>
		<p class="dialog-copy">A profile is a separate save on this browser — its own stock, builds, crew and undo — for an alt, or for trying a plan without touching your real numbers. Sync mirrors <b>Main</b> only. The chart's view and routes, the prices and the pace diary are shared.</p>
		<div class="profile-list">${rows}</div>
		${full ? `<p class="dialog-copy">Up to ${PROFILE_MAX} profiles.</p>` : `<div class="profile-new">
			<input class="field" type="text" maxlength="30" placeholder="New profile — a name" data-profile-name>
			<label class="inline-check"><input type="checkbox" data-profile-copy> start from a copy of this one</label>
			<button class="act" data-profile-create>Create and switch</button>
		</div>`}
		<div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`);
	host.addEventListener('click', evt => {
		const sw = evt.target.closest('[data-profile-switch]');
		if (sw) return switchProfile(sw.dataset.profileSwitch);
		const del = evt.target.closest('[data-profile-del]');
		if (del) {
			if (del.dataset.sure !== '1') {
				del.dataset.sure = '1';
				del.textContent = 'sure?';
				del.classList.add('sure');
				return;
			}
			deleteProfile(del.dataset.profileDel);
			closeDialog();
			if (toast) toast('Profile deleted');
			return;
		}
		if (evt.target.closest('[data-profile-create]')) {
			const name = host.querySelector('[data-profile-name]').value.trim();
			if (!name) return toast && toast('Give it a name');
			const slug = createProfile(name, { copy: host.querySelector('[data-profile-copy]').checked });
			if (!slug) return toast && toast(`Up to ${PROFILE_MAX} profiles`);
			switchProfile(slug);
		}
	});
}
