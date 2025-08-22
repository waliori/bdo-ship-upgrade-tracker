#!/usr/bin/env node

/**
 * Generate accurate barter_requirements.js from shipbarter.js and tradein.js
 * 
 * Usage: node generate_barter_requirements.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to extract level from barter item name
function extractBarterLevel(itemName) {
    const match = itemName.match(/\[Level (\d+)\]/);
    return match ? parseInt(match[1]) : null;
}

// Helper function to get clean barter material name (without level prefix)
function getCleanBarterName(itemName) {
    return itemName.replace(/^\[Level \d+\]\s*/, '');
}

// Helper function to parse barter count (handles ranges like "3-5")
function parseBarterCount(countString) {
    if (countString.includes('-')) {
        const parts = countString.split('-');
        const min = parseInt(parts[0]) || 1;
        const max = parseInt(parts[1]) || min;
        return { min: min, max: max, isRange: true, display: countString };
    }
    const value = parseInt(countString) || 1;
    return { min: value, max: value, isRange: false, display: countString };
}

async function main() {
    console.log('🔄 Reading source files...');
    
    // Import the barter data
    let shipbarters, barters;
    
    try {
        const shipbarterModule = await import('./js/shipbarter.js');
        shipbarters = shipbarterModule.shipbarters;
        console.log('✅ Loaded shipbarter.js:', Object.keys(shipbarters).length, 'ship materials');
    } catch (error) {
        console.error('❌ Failed to load shipbarter.js:', error.message);
        process.exit(1);
    }
    
    try {
        const tradeinModule = await import('./js/tradein.js');
        barters = tradeinModule.barters;
        console.log('✅ Loaded tradein.js:', Object.keys(barters).length, 'trade materials');
    } catch (error) {
        console.error('❌ Failed to load tradein.js:', error.message);
        process.exit(1);
    }
    
    console.log('🔄 Processing barter data...');
    
    // Collect all ship materials that can be obtained through barter
    const allMaterials = new Set();
    
    // Add ship materials
    Object.keys(shipbarters).forEach(material => allMaterials.add(material));
    
    // Add trade materials
    Object.keys(barters).forEach(material => allMaterials.add(material));
    
    console.log('📊 Found', allMaterials.size, 'unique materials');
    
    // Generate barter requirements for each material
    const barterRequirements = {};
    
    for (const materialName of Array.from(allMaterials).sort()) {
        console.log('🔍 Processing:', materialName);
        
        const materialData = {
            exchanges: []
        };
        
        // Check ship barters
        if (shipbarters[materialName]) {
            for (const barter of shipbarters[materialName]) {
                const outputCount = parseBarterCount(barter.count);
                
                // Convert inputs to our format
                const inputs = [];
                for (const inputItem of barter.input) {
                    // Handle special cases (non-barter items)
                    if (!inputItem.startsWith('[Level ')) {
                        inputs.push({
                            level: 0,
                            material: inputItem,
                            needed: 1
                        });
                    } else {
                        const level = extractBarterLevel(inputItem);
                        const cleanName = getCleanBarterName(inputItem);
                        inputs.push({
                            level: level,
                            material: cleanName,
                            needed: 1
                        });
                    }
                }
                
                const exchange = {
                    type: "ship",
                    inputs: inputs
                };
                
                // Add individual output if different from material default
                if (shipbarters[materialName].length > 1) {
                    exchange.output = barter.count;
                }
                
                materialData.exchanges.push(exchange);
            }
        }
        
        // Check trade barters
        if (barters[materialName]) {
            for (const barter of barters[materialName]) {
                const outputCount = parseBarterCount(barter.count);
                
                // Convert inputs to our format
                const inputs = [];
                for (const inputItem of barter.input) {
                    // Handle special cases
                    if (inputItem === "any level 2 barter good." || inputItem === "any level 3 barter good.") {
                        const level = inputItem.includes("level 2") ? 2 : 3;
                        inputs.push({
                            level: level,
                            material: inputItem,
                            needed: 1
                        });
                    } else if (!inputItem.startsWith('[Level ')) {
                        inputs.push({
                            level: 0,
                            material: inputItem,
                            needed: 1
                        });
                    } else {
                        const level = extractBarterLevel(inputItem);
                        const cleanName = getCleanBarterName(inputItem);
                        inputs.push({
                            level: level,
                            material: cleanName,
                            needed: 1
                        });
                    }
                }
                
                const exchange = {
                    type: "trade",
                    inputs: inputs
                };
                
                // Add individual output if different from material default
                if (barters[materialName].length > 1) {
                    exchange.output = barter.count;
                }
                
                materialData.exchanges.push(exchange);
            }
        }
        
        // Determine the material's overall output
        // If all exchanges have the same output, use that as the material output
        const outputs = [];
        if (shipbarters[materialName]) {
            shipbarters[materialName].forEach(barter => outputs.push(barter.count));
        }
        if (barters[materialName]) {
            barters[materialName].forEach(barter => outputs.push(barter.count));
        }
        
        // Use the most common output, or combine if they're different
        const uniqueOutputs = [...new Set(outputs)];
        if (uniqueOutputs.length === 1) {
            materialData.output = uniqueOutputs[0];
        } else if (uniqueOutputs.length > 1) {
            // Multiple different outputs, use a combined range or leave it to individual exchanges
            materialData.output = uniqueOutputs.join(' or ');
        }
        
        // Add output range info for ranges
        if (materialData.output && materialData.output.includes('-')) {
            const outputCount = parseBarterCount(materialData.output);
            materialData.outputRange = { min: outputCount.min, max: outputCount.max };
        }
        
        barterRequirements[materialName] = materialData;
    }
    
    console.log('📝 Generating JavaScript file...');
    
    // Generate the JavaScript file content
    const jsContent = `// Complete barter requirements for all ship materials
// Auto-generated from shipbarter.js and tradein.js
// Generated on: ${new Date().toISOString()}

export const barterRequirements = ${JSON.stringify(barterRequirements, null, 4)};

// Helper function to calculate barter requirements for a given quantity needed
export function calculateBarterNeeds(shipMaterial, quantityNeeded) {
    const barterData = barterRequirements[shipMaterial];
    if (!barterData) return null;
    
    const results = [];
    
    for (const exchange of barterData.exchanges) {
        const output = exchange.output || barterData.output;
        let outputMin, outputMax;
        
        if (output && output.includes('-')) {
            [outputMin, outputMax] = output.split('-').map(n => parseInt(n));
        } else {
            outputMin = outputMax = parseInt(output) || 1;
        }
        
        // Calculate operations needed
        const minOperations = Math.ceil(quantityNeeded / outputMax); // Best case
        const maxOperations = Math.ceil(quantityNeeded / outputMin); // Worst case
        
        // Calculate material requirements
        const materialReqs = {};
        for (const input of exchange.inputs) {
            if (input.level > 0) { // Skip non-barter items
                const key = input.level + '_' + input.material;
                materialReqs[key] = {
                    level: input.level,
                    material: input.material,
                    minNeeded: minOperations * input.needed,
                    maxNeeded: maxOperations * input.needed,
                    hasRange: minOperations !== maxOperations
                };
            }
        }
        
        results.push({
            type: exchange.type,
            output: output,
            materials: materialReqs
        });
    }
    
    return results;
}`;
    
    // Write the file
    const outputPath = path.join(__dirname, 'js', 'barter_requirements_generated.js');
    fs.writeFileSync(outputPath, jsContent);
    
    console.log('✅ Generated barter_requirements_generated.js');
    console.log('📊 Statistics:');
    console.log('   - Total materials:', Object.keys(barterRequirements).length);
    
    // Count exchanges by type
    let shipExchanges = 0;
    let tradeExchanges = 0;
    Object.values(barterRequirements).forEach(material => {
        material.exchanges.forEach(exchange => {
            if (exchange.type === 'ship') shipExchanges++;
            if (exchange.type === 'trade') tradeExchanges++;
        });
    });
    
    console.log('   - Ship exchanges:', shipExchanges);
    console.log('   - Trade exchanges:', tradeExchanges);
    console.log('   - Total exchanges:', shipExchanges + tradeExchanges);
    
    // Show materials with multiple exchange options
    const multipleExchanges = Object.entries(barterRequirements)
        .filter(([name, data]) => data.exchanges.length > 1)
        .map(([name, data]) => `${name} (${data.exchanges.length} options)`);
    
    if (multipleExchanges.length > 0) {
        console.log('   - Materials with multiple exchange options:');
        multipleExchanges.forEach(item => console.log('     *', item));
    }
    
    console.log('');
    console.log('🎉 Done! You can now replace js/barter_requirements.js with js/barter_requirements_generated.js');
    console.log('');
    console.log('To use the generated file:');
    console.log('  mv js/barter_requirements_generated.js js/barter_requirements.js');
}

// Run the script
main().catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
});