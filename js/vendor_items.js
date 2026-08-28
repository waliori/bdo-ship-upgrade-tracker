// A dictionary of item acquisition methods organized by type
// Each item can have multiple acquisition methods with proper categorization

export const items = {
	"Falasi's Epheria Carrack Parts Upgrade Permit: Advance": {"Purchase": ["Philaberto Falasi, Port Epheria (5 bil)"]},
	"Falasi's Epheria Carrack Parts Upgrade Permit: Balance": {"Purchase": ["Philaberto Falasi, Port Epheria (5 bil)"]},
	"Falasi's Epheria Carrack Parts Upgrade Permit: Volante": {"Purchase": ["Philaberto Falasi, Port Epheria (5 bil)"]},
	"Falasi's Epheria Carrack Parts Upgrade Permit: Valor": {"Purchase": ["Philaberto Falasi, Port Epheria (5 bil)"]},
	"Cheongun's Panokseon Parts Upgrade Permit": {"Purchase": ["Gangman, Cheongsa Island Wharf (5 bil)"]},
	"Blueprint: Falasi's Cannon": {"Exchange": ["Philaberto Falasi, Port Epheria — 2x Sunset Coral Essence"]},
	"Blueprint: Falasi's Sail": {"Exchange": ["Philaberto Falasi, Port Epheria — 2x Sunset Coral Essence"]},
	"Blueprint: Falasi's Figurehead": {"Exchange": ["Philaberto Falasi, Port Epheria — 2x Sunset Coral Essence"]},
	"Blueprint: Falasi's Plating": {"Exchange": ["Philaberto Falasi, Port Epheria — 2x Sunset Coral Essence"]},
	"Blueprint: Cheongun's Cannon": {"Exchange": ["Gangman, Cheongsa Island Wharf — 4x Sunset Coral Essence"]},
	"Blueprint: Cheongun's Sail": {"Exchange": ["Gangman, Cheongsa Island Wharf — 4x Sunset Coral Essence"]},
	"Blueprint: Cheongun's Figurehead": {"Exchange": ["Gangman, Cheongsa Island Wharf — 4x Sunset Coral Essence"]},
	"Blueprint: Cheongun's Plating": {"Exchange": ["Gangman, Cheongsa Island Wharf — 4x Sunset Coral Essence"]},
	// The yellow tier all comes off one sea monster. Lyngbakr's drop table
	// is fourteen items and five of them matter here: these four, and the
	// Horn below. The rest -- Serni, Zulatia, Margoria and Coral Crystals,
	// Claws of the Waves, Red Sea Monster Meat, Blue Whale Oil, Sea
	// Monster's Bizarre Fang and the Moss-Covered Map -- are left out
	// because nothing here consumes them; a build could never ask for one.
	//
	// The Horn is the one worth knowing about. One of them buys a whole
	// part's worth of a yellow material outright, which is the same
	// 125 / 75 / 50 the recipes below ask for, and it skips the two
	// Starlight reagents entirely: crafting that 125 Sturdy Coral Support
	// instead wants 125 Lyngbakr's Bone and 250 reagents at 200 Crow
	// Coins each. Three Horns is a part. A hundred and twenty-five
	// separate crafts is the same part the long way round.
	"Lyngbakr's Horn": {"Monster Drop": ["Lyngbakr, Lyngbakr Habitat"], "Exchange": [
		"Choose one: 125x Sturdy Coral Support, 75x Raging Wave Plywood, or 50x Dormant Crimson Coral Adhesive"
	]},
	"Lyngbakr's Bone": {"Monster Drop": ["Lyngbakr (one of fourteen things it drops)"], "Exchange": ["Crow Coin Exchange — trades for 8x Tidal Black Stone"]},
	"Lyngbakr's Scale": {"Monster Drop": ["Lyngbakr (one of fourteen things it drops)"], "Exchange": ["Crow Coin Exchange — trades for 12x Tidal Black Stone"]},
	"Lyngbakr's Fluid": {"Monster Drop": ["Lyngbakr (one of fourteen things it drops)"], "Exchange": ["Crow Coin Exchange — trades for 20x Tidal Black Stone"]},
	"Sunset Coral Essence": {"Monster Drop": ["Lyngbakr (one of fourteen things it drops)"]},
	"Cron Stone": {"Purchase": ["Pearl Shop, Loyalties, or melting a costume"]},
	"Epheria Carrack: Advance (Falasi's Cannon)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Advance (Falasi's Sail)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Advance (Falasi's Figurehead)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Advance (Falasi's Plating)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Balance (Falasi's Cannon)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Balance (Falasi's Sail)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Balance (Falasi's Figurehead)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Balance (Falasi's Plating)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Volante (Falasi's Cannon)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Volante (Falasi's Sail)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Volante (Falasi's Figurehead)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Volante (Falasi's Plating)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Valor (Falasi's Cannon)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Valor (Falasi's Sail)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Valor (Falasi's Figurehead)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Epheria Carrack: Valor (Falasi's Plating)": {"Crafting": ["Ship Part Workshop Lv.2, Iliya Island 3"]},
	"Panokseon: Cheongun's Enhanced Cannon": {"Crafting": ["Cheongsa Ship Part Workshop, Cheongsa Island"]},
	"Panokseon: Cheongun's Enhanced Sail": {"Crafting": ["Cheongsa Ship Part Workshop, Cheongsa Island"]},
	"Panokseon: Cheongun's Enhanced Figurehead": {"Crafting": ["Cheongsa Ship Part Workshop, Cheongsa Island"]},
	"Panokseon: Cheongun's Enhanced Plating": {"Crafting": ["Cheongsa Ship Part Workshop, Cheongsa Island"]},
	// Craftable, but rarely the cheap way: one Lyngbakr's Horn is worth
	// a whole part's supply of any one of these.
	"Sturdy Coral Support": {"Processing": ["Manufacture"], "Exchange": ["125x for 1x Lyngbakr's Horn"]},
	"Raging Wave Plywood": {"Processing": ["Manufacture"], "Exchange": ["75x for 1x Lyngbakr's Horn"]},
	"Dormant Crimson Coral Adhesive": {"Processing": ["Simple Alchemy"], "Exchange": ["50x for 1x Lyngbakr's Horn"]},
	"Sunset Tidal Black Stone": {"Processing": ["Heating (Processing L)"]},

	"Gold Bar 1,000G": {
		"Purchase": ["Storage Keeper"]
	},

	"Bartali Sailboat": {"Purchase": ["Proix (10 mil)"]},
	"Epheria Sailboat": {"Market": ["Central Market"], "Crafting": ["Upgrade from Bartali Sailboat"]},
	"Epheria Frigate": {"Market": ["Central Market"], "Crafting": ["Upgrade from Bartali Sailboat"]},
	"Epheria Caravel": {"Crafting": ["Upgrade from Epheria Sailboat"]},
	"Epheria Galleass": {"Crafting": ["Upgrade from Epheria Frigate"]},
	"Ship Upgrade Permit: Epheria Sailboat": {"Purchase": ["Falasi (100 mil)"]},
	"Ship Upgrade Permit: Epheria Frigate": {"Purchase": ["Falasi (200 mil)"]},
	"Ship Upgrade Permit: Epheria Caravel": {"Purchase": ["Falasi (400 mil)"]},
	"Ship Upgrade Permit: Epheria Galleass": {"Purchase": ["Falasi (600 mil)"]},
	"Ultimate Armor Reform Stone": {"Market": ["Central Market"]},
	"Ultimate Weapon Reform Stone": {"Market": ["Central Market"]},
	"Black Stone": {"Market": ["Central Market"]},

	"Bartali Sailboat: Old Figurehead": {"Purchase": ["Falasi (400k)"]},
	"Bartali Sailboat: Old Plating": {"Purchase": ["Falasi (500k)"]},
	"Bartali Sailboat: Old Cannon": {"Purchase": ["Falasi (400k)"]},
	"Bartali Sailboat: Old Wind Sail": {"Purchase": ["Falasi (300k)"]},

	"Epheria: Old Figurehead": {"Purchase": ["Falasi (3.5 mil)"]},
	"Epheria: Old Plating": {"Purchase": ["Falasi (4 mil)"]},
	"Epheria: Old Cannon": {"Purchase": ["Falasi (3.5 mil)"]},
	"Epheria: Old Wind Sail": {"Purchase": ["Falasi (3 mil)"]},

	"Epheria Caravel: Brass Figurehead": {"Purchase": ["Falasi (8 mil)"]},
	"Epheria Caravel: Upgraded Plating": {"Purchase": ["Falasi (9 mil)"]},
	"Epheria Caravel: Verisha Cannon": {"Purchase": ["Falasi (8 mil)"]},
	"Epheria Caravel: White Wind Sail": {"Purchase": ["Falasi (7 mil)"]},

	"Epheria Galleass: White Horn Figurehead": {"Purchase": ["Falasi (8 mil)"]},
	"Epheria Galleass: Upgraded Plating": {"Purchase": ["Falasi (9 mil)"]},
	"Epheria Galleass: Verisha Cannon": {"Purchase": ["Falasi (8 mil)"]},
	"Epheria Galleass: White Wind Sail": {"Purchase": ["Falasi (7 mil)"]},

	// "Epheria Caravel: Black Dragon Figurehead": {"Crafting": ["Epheria Ship Parts Shop"]},
	// "Epheria Caravel: Upgraded Plating": {"Crafting": ["Epheria Ship Parts Shop"]},
	// "Epheria Caravel: Mayna Cannon": {"Crafting": ["Epheria Ship Parts Shop"]},
	// "Epheria Caravel: Stratus Wind Sail": {"Crafting": ["Epheria Ship Parts Shop"]},

	// "Epheria Galleass: Black Dragon Figurehead": {"Crafting": ["Epheria Ship Parts Shop"]},
	// "Epheria Galleass: Upgraded Plating": {"Crafting": ["Epheria Ship Parts Shop"]},
	// "Epheria Galleass: Mayna Cannon": {"Crafting": ["Epheria Ship Parts Shop"]},
	// "Epheria Galleass: Stratus Wind Sail": {"Crafting": ["Epheria Ship Parts Shop"]},

	"Sea Monster's Ooze": {
		"Monster Drop": ["Hekaru", "Ocean Stalker"]
	},
	"Graphite Ingot for Upgrade": {"Quest Reward": ["Ravinia's Wiggly-Waggly Letter (25x)"]},
	"Timber for Upgrade": {"Quest Reward": ["Ravinia's Wiggly-Waggly Letter (25x)"]},
	"Adhesive for Upgrade": {"Quest Reward": ["Ravinia's Wiggly-Waggly Letter (25x)"]},

	"Zinc Ingot": {"Market": ["Central Market"], "Processing": ["Melting Zinc Ore"]},
	"Old Tree Bark": {"Market": ["Central Market"], "Gathering": ["Worker Nodes"]},
	"Red Tree Lump": {"Market": ["Central Market"], "Gathering": ["Worker Nodes"]},
	"White Cedar Sap": {"Market": ["Central Market"], "Gathering": ["Worker Nodes"]},
	"Acacia Sap": {"Market": ["Central Market"], "Gathering": ["Worker Nodes"]},
	"Elder Tree Sap": {"Market": ["Central Market"], "Gathering": ["Worker Nodes"]},

	"Standardized Timber Square": {"Market": ["Central Market"], "Processing": ["Chopping Log"]},
	"Steel": {"Market": ["Central Market"], "Processing": ["Heating Iron"]},
	"Pine Plywood": {"Market": ["Central Market"], "Processing": ["Chopping Pine Timber"]},
	"Flax Fabric": {
		"Market": ["Central Market"],
		"Processing": ["Grinding Flax Thread"]
	},
	"Hard Pillar": {"Market": ["Central Market"], "Processing": ["Log","Plywood Hardener"]},
	"Jade Coral Ingot": {"Market": ["Central Market"], "Processing": ["Heating Jade Coral Ingot"]},
	"Pine Coated Plywood": {"Market": ["Central Market"], "Processing": ["Heating Pine Plywood"]},
	"Enhanced Flax Fabric": {"Market": ["Central Market"], "Processing": ["Processing Flax Fabric"]},

	"Blueprint: Panokseon": {"Quest Reward": ["Weekly: Pirate Trouble (2x)"]},
	"Wooden Nail Soaked in Seawater": {"Monster Drop": ["Goldmont Large Battleship", "Goldmont Medium Battleship", "Goldmont Small Battleship", "Hollow Maretta (rare)"]},
	"Finely Polished Pine Plywood": {"Monster Drop": ["Hollow Maretta (rare)"]},
	"Glue With Traces of Deep Waves": {"Monster Drop": ["Hollow Maretta (rare)"]},

	"Sangpyeong Coin": {"Quest Reward": ["Moodle Village Dailies (5-10x, 19 quests/day)"]},

	"Luminous Cobalt Ingot": {"Monster Drop": ["Hekaru", "Ocean Stalker", "Young Nineshark", "Young Candidum", "Young Black Rust"]},
	"Bright Reef Piece": {"Quest Reward": ["Daily: Ravikel's Test (8x)"], "Monster Drop": ["Sea Monsters"]},
	"Great Ocean Dark Iron": {"Monster Drop": ["Hekaru", "Ocean Stalker", "Young Nineshark", "Young Candidum", "Young Black Rust"]},
	"Cobalt Ingot": {"Monster Drop": ["Young Hekaru"]},
	"Brilliant Rock Salt Ingot": {"Monster Drop": ["Black Rust", "Candidum"]},
	"Seaweed Stalk": {"Quest Reward": ["Daily: Precious Coral Piece (6x)"], "Monster Drop": ["Suspicious Cargo Ship"]},
	"Enhanced Island Tree Coated Plywood": {"Quest Reward": ["Daily: For the Serendian Soldiers (10x)"], "Monster Drop": ["Sea Monsters"]},
	"Pure Pearl Crystal": {"Quest Reward": ["Daily: Ravikel's Test (2x)"], "Monster Drop": ["Sea Monsters"]},
	"Cox Pirates' Artifact (Parley Expert)": {"Quest Reward": ["Daily: For the Serendian Soldiers (1x)"]},
	"Cox Pirates' Artifact (Combat)": {"Quest Reward": ["Weekly: Old Moon Guild's Black Rust Hunter (6x)", "Daily: Do You Have What it Takes? (3x)", "Weekly: Monster Increase Report (2x)"], "Monster Drop": ["Cox Pirates' Shadow Ghost"], "Exchange": ["Cox Pirates Extermination Seal (200x)"]},
	"Deep Sea Memory Filled Glue": {"Quest Reward": ["Daily: Ravikel's Test (8x)"], "Monster Drop": ["Young Ocean Stalker"]},
	"Brilliant Pearl Shard": {"Monster Drop": ["Candidum", "Nineshark"]},
	"Ruddy Manganese Nodule": {"Quest Reward": ["Weekly: Old Moon Guild's Candidum Hunter (4x)", "Daily: For the Young Otter Merchants (2x)"], "Monster Drop": ["Suspicious Cargo Ship"]},
	"Tear of the Ocean": {"Quest Reward": ["Weekly: Old Moon Guild's Nineshark Hunter (2x)", "Daily: Old Moon Guild's Black Rust Hunter (1x)", "Daily: Old Moon Guild's Young Sea Monster Hunter (1x)"]},
	"Tide-Dyed Standardized Timber Square": {"Quest Reward": ["Daily: Our Guild is not a Charity Group (5x)"], "Monster Drop": ["Cox Pirates' Shadow Ghost"]},
	"Deep Tide-Dyed Standardized Timber Square": {"Quest Reward": ["Daily: Win-win Situation (4x)"], "Monster Drop": ["Cox Pirates' Shadow Ghost"]},
	"Moon Vein Flax Fabric": {
		"Quest Reward": ["Daily: Old Moon Guild's Nineshark Hunter (3x)", "Daily: Old Moon Guild's Young Sea Monster Hunter (3x)"],
		"Processing": ["Drying Khan's Tendon (10x)"]
	},
	"Moon Scale Plywood": {"Quest Reward": ["Daily: Old Moon Guild's Candidum Hunter (10x)", "Daily: Old Moon Guild's Young Sea Monster Hunter (10x)"], "Processing": ["Drying Khan's Scale (10x)"]},
	"Tidal Black Stone": {"Monster Drop": ["Great Ocean Sea Creatures (1-50x)"], "Quest Reward": ["Ravinia's Wiggly-Waggly Letter (10x)"]},

	// ===== Epheria Carrack Chiro's parts (blue) and their materials =====
	"Epheria Carrack: Toro Cannon": {"Purchase": ["Crow Coin Shop (10,000 Crow Coins)"]},
	"Epheria Carrack: Toro Sail": {"Purchase": ["Crow Coin Shop (10,000 Crow Coins)"]},
	"Epheria Carrack: Toro Figurehead": {"Purchase": ["Crow Coin Shop (10,000 Crow Coins)"]},
	"Epheria Carrack: Toro Plating": {"Purchase": ["Crow Coin Shop (10,000 Crow Coins)"]},
	"Violent Wave Plywood": {"Purchase": ["Crow Coin Shop (350 Crow Coins)"], "Processing": ["Manufacture (Beginner 1)"]},
	"Delicately Polished Support": {"Purchase": ["Crow Coin Shop (350 Crow Coins)"], "Processing": ["Manufacture (Beginner 1)"]},
	"Wave Residue Adhesive": {"Purchase": ["Crow Coin Shop (350 Crow Coins)"], "Processing": ["Simple Alchemy (Beginner 1)"]},
	"Blueprint: Chiro's Cannon": {"Gathering": ["Worker Node: Al-Nahad Island (chance drop)"]},
	"Blueprint: Chiro's Sail": {"Gathering": ["Worker Node: Racid Island (chance drop)"]},
	"Blueprint: Chiro's Figurehead": {"Gathering": ["Worker Node: Tinberra Island (chance drop)"]},
	"Blueprint: Chiro's Black Plating": {"Gathering": ["Worker Node: Lerao Island (chance drop)"]},

	// Panokseon gear. The four Byukgye blueprints all come off one node, and
	// the parts are assembled at the Byukgye Ship Part Workshop, Moodle Village.
	"Blueprint: Byukgye's Enhanced Cannon": {"Gathering": ["Worker Node: Dallae Pier Quarry"]},
	"Blueprint: Byukgye's Enhanced Sail": {"Gathering": ["Worker Node: Dallae Pier Quarry"]},
	"Blueprint: Byukgye's Enhanced Figurehead": {"Gathering": ["Worker Node: Dallae Pier Quarry"]},
	"Blueprint: Byukgye's Enhanced Plating": {"Gathering": ["Worker Node: Dallae Pier Quarry"]},
	"Panokseon Enhancement Parts Upgrade Permit": {"Purchase": ["Chulong, Moodle Village Shipyard"]},
	"Panokseon: Byukgye's Enhanced Cannon": {"Crafting": ["Byukgye Ship Part Workshop (Moodle Village)"]},
	"Panokseon: Byukgye's Enhanced Sail": {"Crafting": ["Byukgye Ship Part Workshop (Moodle Village)"]},
	"Panokseon: Byukgye's Enhanced Figurehead": {"Crafting": ["Byukgye Ship Part Workshop (Moodle Village)"]},
	"Panokseon: Byukgye's Enhanced Plating": {"Crafting": ["Byukgye Ship Part Workshop (Moodle Village)"]},
	"Epheria Carrack Parts Upgrade Permit: Advance": {"Purchase": ["Falasi (1 bil)"]},
	"Epheria Carrack Parts Upgrade Permit: Balance": {"Purchase": ["Falasi (1 bil)"]},
	"Epheria Carrack Parts Upgrade Permit: Volante": {"Purchase": ["Falasi (1 bil)"]},
	"Epheria Carrack Parts Upgrade Permit: Valor": {"Purchase": ["Falasi (1 bil)"]},
	"Epheria Carrack: Advance (Chiro's Cannon)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Advance (Chiro's Sail)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Advance (Chiro's Figurehead)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Advance (Chiro's Black Plating)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Balance (Chiro's Cannon)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Balance (Chiro's Sail)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Balance (Chiro's Figurehead)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Balance (Chiro's Black Plating)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Volante (Chiro's Cannon)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Volante (Chiro's Sail)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Volante (Chiro's Figurehead)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Volante (Chiro's Black Plating)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Valor (Chiro's Cannon)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Valor (Chiro's Sail)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Valor (Chiro's Figurehead)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},
	"Epheria Carrack: Valor (Chiro's Black Plating)": {"Crafting": ["Chiro's Ship Part Workshop (Iliya Island)"]},

	// Sub-materials for Chiro part materials
	"Violent Sea Monster's Scale": {"Monster Drop": ["Great Ocean Sea Monsters"]},
	"Violent Sea Monster's Bone": {"Monster Drop": ["Great Ocean Sea Monsters"]},
	"Violent Sea Monster's Ooze": {"Monster Drop": ["Great Ocean Sea Monsters"]},
	"Saltwater Crocodile's Scale": {"Monster Drop": ["Saltwater Crocodile (Great Ocean)"]},
	"Starlight Hardener": {"Purchase": ["Crow Coin Shop (200 Crow Coins)"]},
	"Starlight Emulsifier": {"Purchase": ["Crow Coin Shop (200 Crow Coins)"]},
};
