// List of supported trackable targets (ships and craftable ship parts)

export const shipGroups = [
	{
		name: "Ships",
		items: [
			"Epheria Sailboat",
			"Improved Epheria Sailboat",
			"Epheria Caravel",
			"Carrack (Advance)",
			"Carrack (Balance)",
			"Epheria Frigate",
			"Improved Epheria Frigate",
			"Epheria Galleass",
			"Carrack (Volante)",
			"Carrack (Valor)",
			"Panokseon",
		]
	},
	{
		name: "Carrack Parts (Chiro)",
		items: [
			"Epheria Carrack: Advance (Chiro's Cannon)",
			"Epheria Carrack: Advance (Chiro's Sail)",
			"Epheria Carrack: Advance (Chiro's Figurehead)",
			"Epheria Carrack: Advance (Chiro's Black Plating)",
			"Epheria Carrack: Balance (Chiro's Cannon)",
			"Epheria Carrack: Balance (Chiro's Sail)",
			"Epheria Carrack: Balance (Chiro's Figurehead)",
			"Epheria Carrack: Balance (Chiro's Black Plating)",
			"Epheria Carrack: Volante (Chiro's Cannon)",
			"Epheria Carrack: Volante (Chiro's Sail)",
			"Epheria Carrack: Volante (Chiro's Figurehead)",
			"Epheria Carrack: Volante (Chiro's Black Plating)",
			"Epheria Carrack: Valor (Chiro's Cannon)",
			"Epheria Carrack: Valor (Chiro's Sail)",
			"Epheria Carrack: Valor (Chiro's Figurehead)",
			"Epheria Carrack: Valor (Chiro's Black Plating)",
		]
	},
	{
		name: "Panokseon Parts (Byukgye)",
		items: [
			"Panokseon: Byukgye's Enhanced Cannon",
			"Panokseon: Byukgye's Enhanced Sail",
			"Panokseon: Byukgye's Enhanced Figurehead",
			"Panokseon: Byukgye's Enhanced Plating",
		]
	},
];

export const ships = shipGroups.flatMap(g => g.items);

export const shipDescriptions = {
	"Epheria Sailboat": "Entry-level ocean vessel for exploration",
	"Improved Epheria Sailboat": "Enhanced sailboat with better performance",
	"Epheria Caravel": "Versatile trading vessel with cargo capacity",
	"Carrack (Advance)": "High-speed carrack for fast travel",
	"Carrack (Balance)": "Well-rounded carrack for all activities",
	"Epheria Frigate": "Combat vessel for sea monster hunting",
	"Improved Epheria Frigate": "Enhanced frigate with superior firepower",
	"Epheria Galleass": "Large cargo ship for extensive trading",
	"Carrack (Volante)": "Speed-focused carrack for rapid traversal",
	"Carrack (Valor)": "Combat-oriented carrack with firepower",
	"Panokseon": "Traditional Korean warship",
	"Epheria Carrack: Advance (Chiro's Cannon)": "Blue cannon for Carrack (Advance) - crafted from a +10 Toro cannon at Iliya Island",
	"Epheria Carrack: Advance (Chiro's Sail)": "Blue sail for Carrack (Advance) - crafted from a +10 Toro sail at Iliya Island",
	"Epheria Carrack: Advance (Chiro's Figurehead)": "Blue figurehead for Carrack (Advance) - crafted from a +10 Toro figurehead at Iliya Island",
	"Epheria Carrack: Advance (Chiro's Black Plating)": "Blue black plating for Carrack (Advance) - crafted from a +10 Toro black plating at Iliya Island",
	"Epheria Carrack: Balance (Chiro's Cannon)": "Blue cannon for Carrack (Balance) - crafted from a +10 Toro cannon at Iliya Island",
	"Epheria Carrack: Balance (Chiro's Sail)": "Blue sail for Carrack (Balance) - crafted from a +10 Toro sail at Iliya Island",
	"Epheria Carrack: Balance (Chiro's Figurehead)": "Blue figurehead for Carrack (Balance) - crafted from a +10 Toro figurehead at Iliya Island",
	"Epheria Carrack: Balance (Chiro's Black Plating)": "Blue black plating for Carrack (Balance) - crafted from a +10 Toro black plating at Iliya Island",
	"Epheria Carrack: Volante (Chiro's Cannon)": "Blue cannon for Carrack (Volante) - crafted from a +10 Toro cannon at Iliya Island",
	"Epheria Carrack: Volante (Chiro's Sail)": "Blue sail for Carrack (Volante) - crafted from a +10 Toro sail at Iliya Island",
	"Epheria Carrack: Volante (Chiro's Figurehead)": "Blue figurehead for Carrack (Volante) - crafted from a +10 Toro figurehead at Iliya Island",
	"Epheria Carrack: Volante (Chiro's Black Plating)": "Blue black plating for Carrack (Volante) - crafted from a +10 Toro black plating at Iliya Island",
	"Epheria Carrack: Valor (Chiro's Cannon)": "Blue cannon for Carrack (Valor) - crafted from a +10 Toro cannon at Iliya Island",
	"Epheria Carrack: Valor (Chiro's Sail)": "Blue sail for Carrack (Valor) - crafted from a +10 Toro sail at Iliya Island",
	"Epheria Carrack: Valor (Chiro's Figurehead)": "Blue figurehead for Carrack (Valor) - crafted from a +10 Toro figurehead at Iliya Island",
	"Epheria Carrack: Valor (Chiro's Black Plating)": "Blue black plating for Carrack (Valor) - crafted from a +10 Toro black plating at Iliya Island",
};
