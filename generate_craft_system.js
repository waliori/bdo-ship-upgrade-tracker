#!/usr/bin/env node

/**
 * Generate Multi-Craft Navigation System
 * 
 * This script processes the current recipes.js and creates a structured
 * craft system with ships, ship_parts, materials, and pre-calculated metadata
 * 
 * Usage: node generate_craft_system.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper functions
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function writeJsonFile(filePath, data, description) {
    const content = `// ${description}
// Auto-generated on: ${new Date().toISOString()}

export const data = ${JSON.stringify(data, null, 4)};
`;
    fs.writeFileSync(filePath, content);
    console.log(`✅ Generated ${path.basename(filePath)}`);
}

// Classification functions
function isShip(itemName) {
    const shipNames = [
        "Epheria Sailboat", "Improved Epheria Sailboat", "Epheria Caravel",
        "Carrack (Advance)", "Carrack (Balance)", "Epheria Frigate", 
        "Improved Epheria Frigate", "Epheria Galleass", "Carrack (Volante)", 
        "Carrack (Valor)", "Panokseon", "Bartali Sailboat"
    ];
    // Remove +10 prefix for checking
    const baseName = itemName.startsWith('+10 ') ? itemName.substring(4) : itemName;
    return shipNames.includes(baseName);
}

function isShipPart(itemName) {
    const baseName = itemName.replace(/^\+\d+\s*/, ''); // Remove +10, +9, etc.
    return (
        baseName.includes(': ') && 
        (baseName.includes('Figurehead') || 
         baseName.includes('Plating') || 
         baseName.includes('Cannon') || 
         baseName.includes('Sail') ||
         baseName.includes('Helm'))
    );
}

function isMaterial(itemName) {
    return !isShip(itemName) && !isShipPart(itemName);
}

function getCraftType(itemName) {
    if (isShip(itemName)) return 'ships';
    if (isShipPart(itemName)) return 'ship_parts';
    return 'materials';
}

function getBaseName(itemName) {
    // Remove enhancement levels (+10, +9, etc.)
    return itemName.replace(/^\+\d+\s*/, '');
}

async function main() {
    console.log('🔄 Reading current recipes.js...');
    
    // Import the current recipes
    let recipes;
    try {
        const recipesModule = await import('./js/recipes.js');
        recipes = recipesModule.recipes;
        console.log('✅ Loaded recipes.js:', Object.keys(recipes).length, 'recipes');
    } catch (error) {
        console.error('❌ Failed to load recipes.js:', error.message);
        process.exit(1);
    }
    
    console.log('🔄 Creating directory structure...');
    const craftSystemDir = path.join(__dirname, 'js', 'craft-system');
    const generatorsDir = path.join(__dirname, 'js', 'generators');
    ensureDir(craftSystemDir);
    ensureDir(generatorsDir);
    
    console.log('🔄 Categorizing crafts...');
    
    const ships = {};
    const shipParts = {};
    const materials = {};
    const craftMetadata = {};
    const navigationLinks = {};
    
    // Define alternative ship requirements based on upgrade tree
    const shipAlternatives = {
        'Epheria Caravel': {
            // Can use either Epheria Sailboat OR Improved Epheria Sailboat  
            'Epheria Sailboat': ['Epheria Sailboat', 'Improved Epheria Sailboat']
        },
        'Epheria Galleass': {
            // Can use either Epheria Frigate OR Improved Epheria Frigate
            'Epheria Frigate': ['Epheria Frigate', 'Improved Epheria Frigate']
        }
    };
    
    // Categorize all recipes
    for (const [craftName, requirements] of Object.entries(recipes)) {
        const craftType = getCraftType(craftName);
        const baseName = getBaseName(craftName);
        
        // Convert requirements to structured format
        const structuredRequirements = {};
        for (const [reqName, quantity] of Object.entries(requirements)) {
            const reqType = getCraftType(reqName);
            const reqBaseName = getBaseName(reqName);
            
            structuredRequirements[reqName] = {
                quantity: quantity,
                type: reqType,
                baseName: reqBaseName,
                isClickable: reqType !== 'materials' || (reqName in recipes) // Materials are clickable only if they have recipes
            };
        }
        
        // Store in appropriate category
        if (craftType === 'ships') {
            ships[craftName] = {
                requirements: structuredRequirements,
                baseName: baseName
            };
        } else if (craftType === 'ship_parts') {
            shipParts[craftName] = {
                requirements: structuredRequirements,
                baseName: baseName
            };
        } else {
            materials[craftName] = {
                requirements: structuredRequirements,
                baseName: baseName
            };
        }
        
        // Generate metadata
        const totalRequirements = Object.keys(requirements).length;
        const materialRequirements = Object.keys(requirements).filter(req => getCraftType(req) === 'materials').length;
        const shipRequirements = Object.keys(requirements).filter(req => getCraftType(req) === 'ships').length;
        const partRequirements = Object.keys(requirements).filter(req => getCraftType(req) === 'ship_parts').length;
        
        craftMetadata[craftName] = {
            type: craftType,
            baseName: baseName,
            totalRequirements: totalRequirements,
            breakdown: {
                materials: materialRequirements,
                ships: shipRequirements,
                ship_parts: partRequirements
            },
            complexity: totalRequirements > 10 ? 'high' : totalRequirements > 5 ? 'medium' : 'low'
        };
    }
    
    console.log('🔄 Processing ship alternatives...');
    
    // Add alternative ship requirements
    for (const [shipName, alternatives] of Object.entries(shipAlternatives)) {
        if (ships[shipName]) {
            for (const [originalReq, alternativeOptions] of Object.entries(alternatives)) {
                if (ships[shipName].requirements[originalReq]) {
                    // Convert single requirement to alternatives array
                    const originalData = ships[shipName].requirements[originalReq];
                    
                    // Create alternatives structure
                    ships[shipName].requirements[originalReq] = {
                        quantity: originalData.quantity,
                        type: 'ship_alternatives',
                        alternatives: alternativeOptions.map(altShip => ({
                            name: altShip,
                            quantity: originalData.quantity,
                            type: 'ships',
                            baseName: altShip,
                            isClickable: true,
                            isRecommended: altShip === originalReq // Mark original as recommended
                        }))
                    };
                    
                    console.log(`✅ Added alternatives for ${shipName}: ${alternativeOptions.join(' OR ')}`);
                }
            }
        }
    }
    
    console.log('🔄 Generating cross-references...');
    
    // Generate navigation links (what uses this item)
    for (const [craftName, requirements] of Object.entries(recipes)) {
        for (const reqName of Object.keys(requirements)) {
            if (!navigationLinks[reqName]) {
                navigationLinks[reqName] = {
                    usedIn: [],
                    type: getCraftType(reqName),
                    baseName: getBaseName(reqName)
                };
            }
            navigationLinks[reqName].usedIn.push({
                craftName: craftName,
                craftType: getCraftType(craftName),
                quantity: requirements[reqName]
            });
        }
    }
    
    // Add cross-references for alternative ship requirements  
    for (const [shipName, shipData] of Object.entries(ships)) {
        for (const [reqName, reqData] of Object.entries(shipData.requirements)) {
            if (reqData.type === 'ship_alternatives') {
                // Add cross-references for each alternative
                reqData.alternatives.forEach(alternative => {
                    if (!navigationLinks[alternative.name]) {
                        navigationLinks[alternative.name] = {
                            usedIn: [],
                            type: 'ships',
                            baseName: alternative.baseName
                        };
                    }
                    navigationLinks[alternative.name].usedIn.push({
                        craftName: shipName,
                        craftType: 'ships',
                        quantity: alternative.quantity,
                        isAlternative: true,
                        isRecommended: alternative.isRecommended
                    });
                });
            }
        }
    }
    
    console.log('🔄 Writing craft system files...');
    
    // Write categorized files
    writeJsonFile(
        path.join(craftSystemDir, 'ships.js'),
        ships,
        'Ship crafting recipes'
    );
    
    writeJsonFile(
        path.join(craftSystemDir, 'ship_parts.js'),
        shipParts,
        'Ship part crafting recipes'
    );
    
    writeJsonFile(
        path.join(craftSystemDir, 'materials.js'),
        materials,
        'Material crafting recipes'
    );
    
    writeJsonFile(
        path.join(craftSystemDir, 'craft_metadata.js'),
        craftMetadata,
        'Pre-calculated metadata for all crafts'
    );
    
    writeJsonFile(
        path.join(craftSystemDir, 'navigation_links.js'),
        navigationLinks,
        'Cross-references showing what uses each item'
    );
    
    // Generate craft system index
    const craftSystemIndex = {
        ships: Object.keys(ships),
        ship_parts: Object.keys(shipParts),
        materials: Object.keys(materials),
        stats: {
            totalShips: Object.keys(ships).length,
            totalShipParts: Object.keys(shipParts).length,
            totalMaterials: Object.keys(materials).length,
            totalCrafts: Object.keys(recipes).length
        },
        generated: new Date().toISOString()
    };
    
    writeJsonFile(
        path.join(craftSystemDir, 'index.js'),
        craftSystemIndex,
        'Craft system index and statistics'
    );
    
    console.log('📊 Statistics:');
    console.log('   - Ships:', Object.keys(ships).length);
    console.log('   - Ship Parts:', Object.keys(shipParts).length);  
    console.log('   - Materials:', Object.keys(materials).length);
    console.log('   - Total Crafts:', Object.keys(recipes).length);
    
    // Show examples of each category
    console.log('   - Example Ships:', Object.keys(ships).slice(0, 3).join(', '));
    console.log('   - Example Ship Parts:', Object.keys(shipParts).slice(0, 3).join(', '));
    console.log('   - Example Materials:', Object.keys(materials).slice(0, 3).join(', '));
    
    console.log('');
    console.log('🎉 Craft system generation complete!');
    console.log('');
    console.log('Generated files:');
    console.log('  - js/craft-system/ships.js');
    console.log('  - js/craft-system/ship_parts.js');
    console.log('  - js/craft-system/materials.js');
    console.log('  - js/craft-system/craft_metadata.js');
    console.log('  - js/craft-system/navigation_links.js');
    console.log('  - js/craft-system/index.js');
}

// Run the script
main().catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
});