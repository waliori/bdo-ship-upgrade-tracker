# Craft System Architecture

## Overview

This document describes the new multi-craft navigation system that transforms the BDO Ship Upgrade Tracker from a ship-only calculator into a comprehensive crafting navigator supporting ships, ship parts, and materials with full cross-navigation.

## File Structure

```
js/
├── craft-system/
│   ├── ships.js              # Ship recipes with structured data
│   ├── ship_parts.js         # Ship part recipes (all enhancement levels)
│   ├── materials.js          # Material recipes (craftable materials)
│   ├── craft_metadata.js     # Pre-calculated metadata (complexity, counts)
│   ├── navigation_links.js   # Cross-references (what uses what)
│   ├── index.js             # System index and statistics
│   ├── craft_navigator.js   # Core navigation logic
│   └── global_inventory.js  # Global inventory management
├── generators/
│   └── [future: additional generators]
└── legacy/
    └── recipes.js           # Original recipes (kept for compatibility)
```

## Data Structure

### Structured Recipe Format

Each craft now has structured requirements:

```javascript
"Carrack (Valor)": {
    "requirements": {
        "Epheria Galleass": {
            "quantity": 1,
            "type": "ships",           // ships | ship_parts | materials
            "baseName": "Epheria Galleass",
            "isClickable": true        // Can navigate to this item
        },
        "+10 Epheria Galleass: Black Dragon Figurehead": {
            "quantity": 1,
            "type": "ship_parts",
            "baseName": "Epheria Galleass: Black Dragon Figurehead",
            "isClickable": true
        },
        "Moon Vein Flax Fabric": {
            "quantity": 180,
            "type": "materials",
            "baseName": "Moon Vein Flax Fabric",
            "isClickable": false       // No recipe for this material
        }
    },
    "baseName": "Carrack (Valor)"
}
```

### Navigation Links (Cross-References)

```javascript
"Epheria Galleass": {
    "usedIn": [
        {
            "craftName": "Carrack (Volante)",
            "craftType": "ships",
            "quantity": 1
        },
        {
            "craftName": "Carrack (Valor)",
            "craftType": "ships", 
            "quantity": 1
        }
    ],
    "type": "ships",
    "baseName": "Epheria Galleass"
}
```

## Core Classes

### CraftNavigator

Main navigation class providing:

- **Navigation**: `navigateTo(craftName)`, `goBack()`, breadcrumb tracking
- **Project Management**: `addToActiveProjects()`, `removeFromActiveProjects()`
- **Dependency Calculation**: `calculateGlobalRequirements()`
- **Search**: `searchCrafts(query, type)`

### GlobalInventoryManager

Handles unified inventory across all projects:

- **Storage**: `setMaterialQuantity()`, `getMaterialQuantity()`
- **Status Calculation**: `calculateGlobalInventoryStatus()`
- **Import/Export**: `exportInventoryData()`, `importInventoryData()`
- **Barter Integration**: Links with existing barter system

## Key Features

### 1. Multi-Craft Categories

- **Ships**: 11 ships (Epheria Sailboat → Carrack/Panokseon)
- **Ship Parts**: 228 ship parts (all enhancement levels +1 to +10)
- **Materials**: 4 craftable materials (upgrade materials)

### 2. Navigation System

```javascript
// Navigate to a craft
const craftInfo = craftNavigator.navigateTo('Carrack (Valor)');

// Add to active projects for global inventory
craftNavigator.addToActiveProjects('Carrack (Valor)');

// Calculate what materials are needed across all projects
const globalReqs = craftNavigator.calculateGlobalRequirements();
```

### 3. Global Inventory

```javascript
// Set material quantities
globalInventory.setMaterialQuantity('Steel', 150);

// Get inventory status across all active projects
const status = globalInventory.calculateGlobalInventoryStatus();

// Export/import for backup
const backup = globalInventory.exportInventoryData();
```

### 4. Cross-Reference Navigation

- Click on "Epheria Galleass" → Navigate to Ships section
- Click on "+10 Black Dragon Figurehead" → Navigate to Ship Parts section
- View "Used In" to see what crafts need this material

## Integration Points

### 1. Barter System Integration

The global inventory automatically integrates with the existing barter system:

```javascript
// Each material includes barter information
{
    materialName: {
        needed: 50,
        stored: 20,
        remaining: 30,
        barterInfo: {
            canBeBarterd: true,
            exchanges: [/* barter options */],
            output: "2-4"
        }
    }
}
```

### 2. UI Integration

The system provides structured data for UI components:

```javascript
// For craft listing
const craftInfo = craftNavigator.navigateTo(craftName);

// For inventory grids  
const inventoryStatus = globalInventory.calculateCraftInventoryStatus(craftName);

// For breadcrumb navigation
const breadcrumb = craftNavigator.breadcrumb;
```

### 3. Event System

The inventory system emits events for UI updates:

```javascript
document.addEventListener('inventoryUpdated', (event) => {
    const { materialName, quantity, context } = event.detail;
    // Update UI components
});
```

## Usage Patterns

### 1. Basic Navigation

```javascript
import { craftNavigator } from './js/craft-system/craft_navigator.js';

// Navigate to a craft
const valorInfo = craftNavigator.navigateTo('Carrack (Valor)');

// Show requirements with clickable links
valorInfo.craft.requirements.forEach(req => {
    if (req.isClickable) {
        // Make this a clickable link to navigate to req.name
    }
});
```

### 2. Global Inventory Management

```javascript
import { globalInventory } from './js/craft-system/global_inventory.js';

// Add project and track inventory
craftNavigator.addToActiveProjects('Carrack (Valor)');
craftNavigator.addToActiveProjects('Carrack (Volante)');

// See what materials are needed across both projects
const globalStatus = globalInventory.calculateGlobalInventoryStatus();

// Update material quantities
globalInventory.setMaterialQuantity('Steel', 500);
```

### 3. Search and Discovery

```javascript
// Search for crafts
const results = craftNavigator.searchCrafts('dragon');
// Returns: Black Dragon Figurehead variants

// Search only ships
const ships = craftNavigator.searchCrafts('carrack', 'ships');
// Returns: Carrack variants
```

## Migration Strategy

### Phase 1: Data Migration (✅ Complete)

- Generated structured data from recipes.js
- Created all craft system files
- Preserved original recipes.js for compatibility

### Phase 2: UI Integration (Next)

- Update app.js to use craft navigator
- Implement navigation UI components
- Integrate global inventory with existing storage

### Phase 3: Enhancement (Future)

- Add cooking/alchemy recipes
- Implement recipe favorites
- Add advanced filtering

## Statistics

- **Total Crafts**: 243
- **Ships**: 11 
- **Ship Parts**: 228 (includes all +1 to +10 variants)
- **Materials**: 4 (craftable materials)
- **Cross-References**: Complete linking between all crafts

## Benefits

1. **Navigation-Based UX**: Users discover dependencies naturally
2. **Global Inventory**: See total material needs across all projects
3. **Extensible Architecture**: Easy to add new craft types
4. **Pre-calculated Data**: No runtime calculations, everything is pre-computed
5. **Backward Compatibility**: Original recipes.js preserved during transition

This architecture provides the foundation for the comprehensive crafting navigation system you requested!