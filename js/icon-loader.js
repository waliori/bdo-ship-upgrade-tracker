// The icon mapping: item name -> icon file and BDOCodex page.
//
// This used to be a 500-line icon "system" -- element factories, hover
// effects, gradient fallbacks -- of which the app used exactly two
// things: load the mapping, look a name up in it. This is those two
// things. ui.js builds its own <img> tags and falls back to the app
// mark for anything the mapping has never heard of.

class IconLoader {
	constructor() {
		this.iconMapping = {};
		this.initialized = false;
		this.ready = null;

		// Start fetching straight away. Failure is swallowed here -- the
		// app works without icons -- and ui.js awaits init() again with
		// its own error handling.
		this.init().catch(() => {});
	}

	/**
	 * Load the mapping, once. Every caller shares the same fetch -- the
	 * constructor starts it and ui.js awaits it, which used to be two
	 * requests. A failed read clears the slot so the next call can try
	 * again instead of reporting "no icons" forever.
	 */
	init() {
		if (!this.ready) {
			this.ready = (async () => {
				const response = await fetch('./icon_mapping.json');
				if (!response.ok) throw new Error(`icon_mapping.json: ${response.status}`);
				this.iconMapping = await response.json();
				this.initialized = true;
			})().catch(error => {
				this.ready = null;
				this.initialized = false;
				throw error;
			});
		}
		return this.ready;
	}

	/**
	 * The icon file and BDOCodex URL for an item, or null.
	 *
	 * An enhanced name falls back to its base item's entry, and a few
	 * renamed part families fall back to the name the mapping still
	 * carries.
	 */
	getIconInfo(itemName) {
		const found = this.iconMapping[itemName];
		if (found) return this.normalise(found);

		if (itemName.startsWith('+10 ')) {
			const base = this.iconMapping[itemName.slice(4)];
			if (base) return this.normalise(base);
		}

		for (const variation of [
			itemName.replace('(Green)', '').trim(),
			itemName.replace('(Blue)', '').trim(),
			itemName.replace('Upgraded Plating', 'Plating').trim(),
			itemName.replace('Black Dragon', 'Dragon').trim(),
			itemName.replace('Stratus Wind', 'Wind').trim()
		]) {
			const hit = this.iconMapping[variation];
			if (hit) return this.normalise(hit);
		}

		return null;
	}

	/** Both mapping shapes: the old plain filename, the current object. */
	normalise(mapping) {
		return typeof mapping === 'string'
			? { filename: mapping, url: null }
			: { filename: mapping.icon, url: mapping.url };
	}
}

// One shared instance; the mapping is one file and needs one owner.
const iconLoader = new IconLoader();

export { iconLoader };
