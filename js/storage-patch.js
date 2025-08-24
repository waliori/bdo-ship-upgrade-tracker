// BDO Ship Upgrade Tracker - Storage System Replacement Patch
// Seamlessly replaces all fragmented storage operations

import { quickStart } from './init-unified-storage.js';
import * as StorageAPI from './storage-integration.js';

/**
 * Storage Patch - Clean Integration
 * 
 * This patch replaces all the fragmented storage operations throughout
 * the application with clean, unified calls.
 */

// Initialize unified storage immediately
let storageInitialized = false;
let storageInstance = null;

// Initialize storage
async function initStorage() {
    if (!storageInitialized) {
        try {
            storageInstance = await quickStart();
            storageInitialized = true;
            console.log('✅ Unified Storage Patch applied successfully');
        } catch (error) {
            console.error('❌ Failed to apply storage patch:', error);
            throw error;
        }
    }
    return storageInstance;
}

// =============================================================================
// REPLACEMENT FUNCTIONS FOR APP.JS
// =============================================================================

/**
 * Replace all localStorage operations with unified storage
 */
export function setStorage(key, value) {
    // Map legacy keys to unified storage
    const keyMappings = {
        'globalInventory': 'materials',
        'selectedShip': 'selectedShip',
        'waterRipples': 'waterRipples',
        'floatingDashboard': 'floatingDashboard',
        'tourCompleted': 'tourCompleted'
    };
    
    const mappedKey = keyMappings[key] || key;
    
    if (mappedKey === 'materials' && typeof value === 'string') {
        // Handle globalInventory format
        try {
            const inventory = JSON.parse(value);
            for (const [materialName, data] of Object.entries(inventory)) {
                if (typeof data === 'object' && data.total !== undefined) {
                    StorageAPI.setMaterialQuantity(materialName, data.total, 'legacy-app');
                }
            }
        } catch (error) {
            console.warn('Failed to parse legacy inventory data:', error);
        }
    } else {
        // Handle other settings
        StorageAPI.setSetting(mappedKey, typeof value === 'string' ? value : JSON.stringify(value));
    }
}

export function getStorage(key) {
    const keyMappings = {
        'globalInventory': 'materials',
        'selectedShip': 'selectedShip', 
        'waterRipples': 'waterRipples',
        'floatingDashboard': 'floatingDashboard',
        'tourCompleted': 'tourCompleted'
    };
    
    const mappedKey = keyMappings[key] || key;
    
    if (mappedKey === 'materials') {
        // Return globalInventory format for compatibility
        const materials = StorageAPI.getAllMaterials();
        const legacyFormat = {};
        
        for (const [materialName, material] of Object.entries(materials)) {
            legacyFormat[materialName] = {
                total: material.owned,
                allocations: {}
            };
        }
        
        return JSON.stringify(legacyFormat);
    } else {
        // Handle other settings
        return StorageAPI.getSetting(mappedKey, null);
    }
}

export function checkStorage(key) {
    return getStorage(key) !== null;
}

// =============================================================================
// MATERIAL MANAGEMENT REPLACEMENTS
// =============================================================================

export function getGlobalInventory(materialName) {
    const material = StorageAPI.getMaterialQuantity(materialName);
    return {
        total: material,
        allocations: {}
    };
}

export function setGlobalInventory(materialName, inventoryData) {
    if (typeof inventoryData === 'object' && inventoryData.total !== undefined) {
        StorageAPI.setMaterialQuantity(materialName, inventoryData.total, 'legacy-global-inventory');
    }
}

export function getGlobalTotal(materialName) {
    return StorageAPI.getMaterialQuantity(materialName);
}

export function setGlobalTotal(materialName, total) {
    StorageAPI.setMaterialQuantity(materialName, Math.max(0, total), 'legacy-global-total');
}

// =============================================================================
// PROJECT MANAGEMENT REPLACEMENTS
// =============================================================================

export function addToActiveProjects(craftName, craftData = {}) {
    return StorageAPI.addProject(craftName, craftData);
}

export function removeFromActiveProjects(craftName) {
    return StorageAPI.removeProject(craftName);
}

export function getActiveProjects() {
    return StorageAPI.getActiveProjects();
}

export function isProjectCompleted(craftName) {
    return StorageAPI.isProjectCompleted(craftName);
}

export function markProjectCompleted(craftName) {
    return StorageAPI.markProjectCompleted(craftName);
}

// =============================================================================
// CALCULATION REPLACEMENTS
// =============================================================================

export function calculateGlobalRequirements() {
    return StorageAPI.calculateGlobalRequirements();
}

export function calculateGlobalInventoryStatus() {
    return StorageAPI.calculateGlobalInventoryStatus();
}

// =============================================================================
// EVENT SYSTEM REPLACEMENTS
// =============================================================================

export function addEventListener(eventType, callback) {
    StorageAPI.addEventListener(eventType, callback);
}

export function removeEventListener(eventType, callback) {
    StorageAPI.removeEventListener(eventType, callback);
}

export function dispatchEvent(eventType, detail) {
    StorageAPI.dispatchEvent(eventType, detail);
}

// =============================================================================
// INITIALIZATION AND GLOBAL SETUP
// =============================================================================

/**
 * Apply the storage patch to the global scope
 */
export async function applyStoragePatch() {
    console.log('🔧 Applying unified storage patch...');
    
    // Initialize storage first
    await initStorage();
    
    // Replace global functions
    window.setStorage = setStorage;
    window.getStorage = getStorage;
    window.checkStorage = checkStorage;
    
    window.getGlobalInventory = getGlobalInventory;
    window.setGlobalInventory = setGlobalInventory;
    window.getGlobalTotal = getGlobalTotal;
    window.setGlobalTotal = setGlobalTotal;
    
    window.addToActiveProjects = addToActiveProjects;
    window.removeFromActiveProjects = removeFromActiveProjects;
    window.getActiveProjects = getActiveProjects;
    window.isProjectCompleted = isProjectCompleted;
    window.markProjectCompleted = markProjectCompleted;
    
    window.calculateGlobalRequirements = calculateGlobalRequirements;
    window.calculateGlobalInventoryStatus = calculateGlobalInventoryStatus;
    
    // Expose storage API for advanced usage
    window.StorageAPI = StorageAPI;
    window.UnifiedStorage = storageInstance;
    
    console.log('✅ Storage patch applied - all legacy functions replaced');
    
    return storageInstance;
}

// =============================================================================
// AUTO-APPLY PATCH
// =============================================================================

// Auto-apply patch when this module loads
if (typeof window !== 'undefined') {
    // Wait for DOM to be ready, then apply patch
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyStoragePatch);
    } else {
        // DOM is already ready
        applyStoragePatch();
    }
}

export default applyStoragePatch;