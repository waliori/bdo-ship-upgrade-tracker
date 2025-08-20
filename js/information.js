// Ship information generation

export const shipstats = {
	"Epheria Sailboat": {
		"Durability": "1,000,000",
		"Rations": "1,000,000",
		"Base LT": "5,000",
		"Speed": "100%",
		"Accel": "100%",
		"Turn": "110%",
		"Brake": "110%",
		"Inventory": "25 slots",
		"Cabins": "10",
		"Cannon Count": "1 per side(player)",
		"Reload": "17s"
	},
	"Improved Epheria Sailboat": {
		"Durability": "1,000,000",
		"Rations": "1,000,000",
		"Base LT": "5,000",
		"Speed": "100%",
		"Accel": "100%",
		"Turn": "110%",
		"Brake": "110%",
		"Inventory": "25 slots",
		"Cabins": "10",
		"Cannon Count": "2 per side(captain)",
		"Reload": "15s"
	},
	"Epheria Caravel": {
		"Durability": "1,000,000",
		"Rations": "1,100,000",
		"Base LT": "10,000",
		"Speed": "100%",
		"Accel": "100%",
		"Turn": "110%",
		"Brake": "110%",
		"Inventory": "30 slots",
		"Cabins": "30",
		"Cannon Count": "2 per side(captain)",
		"Reload": "15s"
	},
	"Carrack (Advance)": {
		"Durability": "1,350,000",
		"Rations": "1,300,000",
		"Base LT": "16,500",
		"Speed": "110%",
		"Accel": "100%",
		"Turn": "115%",
		"Brake": "115%",
		"Inventory": "40 slots",
		"Cabins": "100",
		"Cannon Reload": "13s"
	},
	"Carrack (Balance)": {
		"Durability": "1,300,000",
		"Rations": "1,400,000",
		"Base LT": "15,000",
		"Speed": "115%",
		"Accel": "100%",
		"Turn": "115%",
		"Brake": "115%",
		"Inventory": "35 slots",
		"Cabins": "100",
		"Cannon Reload": "12s"
	},
	"Epheria Frigate": {
		"Durability": "1,200,000",
		"Rations": "1,000,000",
		"Base LT": "4,000",
		"Speed": "110%",
		"Accel": "110%",
		"Turn": "120%",
		"Brake": "120%",
		"Inventory": "12 slots",
		"Cabins": "10",
		"Cannon Count": "2 per side(player)",
		"Reload": "17s"
	},
	"Improved Epheria Frigate": {
		"Durability": "1,200,000",
		"Rations": "1,000,000",
		"Base LT": "4,000",
		"Speed": "110%",
		"Accel": "110%",
		"Turn": "120%",
		"Brake": "120%",
		"Inventory": "12 slots",
		"Cabins": "10",
		"Cannon Count": "4 per side(captain)",
		"Reload": "15s"
	},
	"Epheria Galleass": {
		"Durability": "1,200,000",
		"Rations": "1,200,000",
		"Base LT": "8,000",
		"Speed": "110%",
		"Accel": "110%",
		"Turn": "120%",
		"Brake": "120%",
		"Inventory": "15 slots",
		"Cabins": "30",
		"Cannon Count": "4 per side(captain)",
		"Reload": "15s"
	},
	"Carrack (Volante)": {
		"Durability": "1,250,000",
		"Rations": "1,400,000",
		"Base LT": "13,500",
		"Speed": "120%",
		"Accel": "110%",
		"Turn": "125%",
		"Brake": "125%",
		"Inventory": "20 slots",
		"Cabins": "100",
		"Cannon Reload": "12s"
	},
	"Carrack (Valor)": {
		"Durability": "1,300,000",
		"Rations": "1,500,000",
		"Base LT": "13,500",
		"Speed": "115%",
		"Accel": "110%",
		"Turn": "125%",
		"Brake": "125%",
		"Inventory": "20 slots",
		"Cabins": "100",
		"Cannon Reload": "11s"
	},
	"Panokseon": {
		"Durability": "2,000,000",
		"Rations": "1,300,000",
		"Base LT": "12,500",
		"Speed": "105%",
		"Accel": "100%",
		"Turn": "110%",
		"Brake": "115%",
		"Inventory": "20 slots",
		"Cabins": "150",
		"Cannon Reload": "13s"
	},
};

export function genInfo() {

	const order = [
		["Epheria Sailboat", "Improved Epheria Sailboat", "Epheria Frigate", "Improved Epheria Frigate"],
		["Epheria Caravel", "Epheria Galleass"],
		["Carrack (Advance)", "Carrack (Balance)", "Carrack (Volante)", "Carrack (Valor)"],
		["Panokseon"]
	];

	// Create container div
	const ret = document.createElement('div');

	// Add information paragraphs
	const p1 = document.createElement('p');
	p1.textContent = "There is more than 1 way to get an Epheria Sailboat/Frigate. This page shows the upgrade route but you can also purchase it from the CM, craft it directly, or exchange [Event] Radiant Shakatu's Seal x20 for it.";
	ret.appendChild(p1);

	const p2 = document.createElement('p');
	p2.innerHTML = 'More information can be found <a href="https://docs.google.com/document/d/1basknMfrfcH6AzJD9PkzeUunqrIGTuS6SfXPf3a7pso/preview" target="_blank">at this spreadsheet</a> or <a href="https://www.blackdesertonline.com/news/view/3216" target="_blank">these patch notes</a>';
	ret.appendChild(p2);

	const p3 = document.createElement('p');
	p3.textContent = "Barter items that you can trade for ship parts unlock as you finish more trades. You can always trade t1 barter items for verdant stone coupon though.";
	ret.appendChild(p3);

	const p4 = document.createElement('p');
	p4.textContent = "Ship parts used for upgrade need to be full durability.";
	ret.appendChild(p4);

	const p5 = document.createElement('p');
	p5.textContent = "All sea monsters can drop parts for upgrading ships. There is no list of which drops are where yet. (Nov-6)";
	ret.appendChild(p5);

	const p6 = document.createElement('p');
	p6.textContent = "Old Moon Guild daily quests are mutually exclusive(pick 1). EG Nineshark and Young Sea Monster Hunter.";
	ret.appendChild(p6);

	// Add Upgrade Paths section
	const h2UpgradePaths = document.createElement('h2');
	h2UpgradePaths.textContent = "Upgrade Paths";
	ret.appendChild(h2UpgradePaths);

	ret.appendChild(document.createElement('br'));

	const canvas = document.createElement('canvas');
	canvas.id = 'shipchart';
	canvas.width = 820;
	canvas.height = 400;
	ret.appendChild(canvas);

	ret.appendChild(document.createElement('br'));

	// Add Base Ship Stats section
	const h2BaseStats = document.createElement('h2');
	h2BaseStats.textContent = "Base Ship Stats";
	ret.appendChild(h2BaseStats);

	// Generate tables for each ship group
	for (const table of order) {
		const t = document.createElement('table');

		// Create header row
		const headerRow = document.createElement('tr');
		const statHeader = document.createElement('th');
		statHeader.textContent = "Stat";
		headerRow.appendChild(statHeader);

		for (const ship of table) {
			const th = document.createElement('th');
			th.textContent = ship;
			headerRow.appendChild(th);
		}
		t.appendChild(headerRow);

		// Create data rows
		for (const key of Object.keys(shipstats[table[0]])) {
			const tr = document.createElement('tr');
			const td = document.createElement('td');
			td.textContent = key;
			tr.appendChild(td);

			for (const ship of table) {
				const td = document.createElement('td');
				td.textContent = shipstats[ship][key];
				tr.appendChild(td);
			}
			t.appendChild(tr);
		}

		ret.appendChild(t);
		ret.appendChild(document.createElement('br'));
	}

	return ret;
}