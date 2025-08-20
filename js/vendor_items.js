// A dictionary of item acquisition methods organized by type
// Each item can have multiple acquisition methods with proper categorization

export const items = {
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
	"Graphite Ingot for Upgrade": {"Quest Reward": ["Ravinia's Wiggly-Waggly Letter"]},
	"Timber for Upgrade": {"Quest Reward": ["Ravinia's Wiggly-Waggly Letter"]},
	"Adhesive for Upgrade": {"Quest Reward": ["Ravinia's Wiggly-Waggly Letter"]},

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
	"Tidal Black Stone": {"Monster Drop": ["Great Ocean Sea Creatures (1-50x)"], "Quest Reward": ["Ravinia's Wiggly-Waggly Letter (10x)"]}
};