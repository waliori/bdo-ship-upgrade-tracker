// BDO Ship Upgrade Tracker - Unified Storage Initialization
// Clean initialization that replaces all fragmented storage systems

import storage from './unified-storage.js';
import * as StorageAPI from './storage-integration.js';

/**
 * Initialize Unified Storage System
 * 
 * This replaces all the fragmented storage initialization throughout the app.
 * Call this once when the application starts.
 */
export async function initUnifiedStorage() {
    console.log('🚀 Initializing Clean Unified Storage System...');
    
    try {
        // 1. Initialize storage
        const storageInstance = StorageAPI.initializeStorage();
        
        // 2. Set up global access for existing code
        window.bdoStorage = storageInstance;
        window.StorageAPI = StorageAPI;
        
        // 3. Set up event forwarding for UI compatibility
        setupEventForwarding();
        
        // 4. Create helper functions for existing code
        setupCompatibilityHelpers();
        
        // 5. Log initialization success
        const stats = StorageAPI.getStorageStats();
        console.log('✅ Unified Storage System initialized successfully');
        console.log(`📊 Initial state: ${stats.projects.total} projects, ${stats.materials.total} materials`);
        
        // 6. Trigger initial completion check
        StorageAPI.triggerCompletionCheck();
        
        return storageInstance;
        
    } catch (error) {
        console.error('❌ Failed to initialize unified storage:', error);
        throw error;
    }
}

/**
 * Setup event forwarding for UI compatibility
 */
function setupEventForwarding() {
    // Forward storage events to document for existing UI code
    storage.events.addEventListener('material-updated', (event) => {
        document.dispatchEvent(new CustomEvent('inventoryUpdated', {
            detail: {
                materialName: event.detail.materialName,
                quantity: event.detail.newQuantity,
                context: 'unified',
                unifiedEvent: true
            }
        }));
    });
    
    storage.events.addEventListener('project-updated', (event) => {
        document.dispatchEvent(new CustomEvent('projectUpdated', {
            detail: {
                project: event.detail.project.name,
                action: event.detail.action,
                unifiedEvent: true
            }
        }));
    });
    
    storage.events.addEventListener('project-progress-updated', (event) => {
        document.dispatchEvent(new CustomEvent('recipeCompleted', {
            detail: {
                recipeName: event.detail.project.name,
                isCompleted: event.detail.project.status === 'completed',
                completionPercent: event.detail.newPercent,
                unifiedEvent: true
            }
        }));
    });
    
    console.log('📡 Event forwarding setup complete');
}

/**
 * Setup compatibility helpers for existing code
 */
function setupCompatibilityHelpers() {
    // Create global helper functions that existing code can use
    window.setGlobalTotal = (materialName, total) => {
        return StorageAPI.setMaterialQuantity(materialName, total, 'legacy-global-total');
    };
    
    window.getGlobalTotal = (materialName) => {
        return StorageAPI.getMaterialQuantity(materialName);
    };
    
    window.addToActiveProjects = (craftName, craftData) => {
        return StorageAPI.addProject(craftName, craftData);
    };
    
    window.removeFromActiveProjects = (craftName) => {
        return StorageAPI.removeProject(craftName);
    };
    
    window.getActiveProjects = () => {
        return StorageAPI.getActiveProjects();
    };
    
    window.isProjectCompleted = (craftName) => {
        return StorageAPI.isProjectCompleted(craftName);
    };
    
    window.calculateGlobalRequirements = () => {
        return StorageAPI.calculateGlobalRequirements();
    };
    
    window.calculateGlobalInventoryStatus = () => {
        return StorageAPI.calculateGlobalInventoryStatus();
    };
    
    // Debugging helpers
    window.debugStorage = () => {
        StorageAPI.debugLogState();
    };
    
    window.validateStorage = () => {
        const validation = StorageAPI.validateStorageIntegrity();
        console.log('Storage validation:', validation);
        return validation;
    };
    
    window.exportStorageData = () => {
        const data = StorageAPI.exportData();
        console.log('Exported data:', data);
        return data;
    };
    
    window.clearStorage = () => {
        if (confirm('Are you sure you want to clear all storage data? This cannot be undone.')) {
            StorageAPI.clearAllData();
            console.log('Storage cleared');
        }
    };
    
    console.log('🔧 Compatibility helpers setup complete');
}

/**
 * Migration utility to transfer data from old systems (if needed)
 */
export async function migrateFromLegacySystems() {
    console.log('🔄 Checking for legacy data to migrate...');
    
    let materialsMigrated = 0;
    let projectsMigrated = 0;
    
    try {
        // Migrate from old globalInventory format
        const oldGlobalInventory = localStorage.getItem('bdo_ship_upgrade-globalInventory');
        if (oldGlobalInventory) {
            const inventory = JSON.parse(oldGlobalInventory);
            
            for (const [materialName, data] of Object.entries(inventory)) {
                if (typeof data === 'object' && data.total !== undefined) {
                    StorageAPI.setMaterialQuantity(materialName, data.total, 'migration-legacy');
                    materialsMigrated++;
                }
            }
            
            console.log(`✅ Migrated ${materialsMigrated} materials from legacy globalInventory`);
        }
        
        // Migrate from old craft navigator active projects
        const oldActiveProjects = localStorage.getItem('bdo-craft-navigator-active');
        if (oldActiveProjects) {
            const projects = JSON.parse(oldActiveProjects);
            
            if (Array.isArray(projects)) {
                for (const projectName of projects) {
                    StorageAPI.addProject(projectName, {
                        type: 'materials',
                        requirements: {}
                    });
                    projectsMigrated++;
                }
            }
            
            console.log(`✅ Migrated ${projectsMigrated} projects from legacy craft navigator`);
        }
        
        // Clean up old storage keys after successful migration
        if (materialsMigrated > 0 || projectsMigrated > 0) {
            // Create backup first
            const backup = {
                timestamp: Date.now(),
                globalInventory: oldGlobalInventory,
                activeProjects: oldActiveProjects
            };
            localStorage.setItem('bdo-legacy-backup', JSON.stringify(backup));
            
            console.log('📦 Legacy data backed up successfully');
            console.log(`🎯 Migration complete: ${materialsMigrated} materials, ${projectsMigrated} projects`);
        }
        
    } catch (error) {
        console.warn('⚠️ Migration encountered errors:', error);
    }
    
    return { materialsMigrated, projectsMigrated };
}

/**
 * Quick start function for development
 */
export async function quickStart() {
    console.log('⚡ Quick starting unified storage...');
    
    // Initialize storage
    const storageInstance = await initUnifiedStorage();
    
    // Run migration if needed
    const migrationResult = await migrateFromLegacySystems();
    
    // Log final status
    const stats = StorageAPI.getStorageStats();
    const health = StorageAPI.healthCheck();
    
    console.group('🎯 Unified Storage Ready');
    console.log('Storage instance:', storageInstance);
    console.log('Migration result:', migrationResult);
    console.log('Statistics:', stats);
    console.log('Health:', health);
    console.groupEnd();
    
    return storageInstance;
}

// Auto-initialize if running in browser
if (typeof window !== 'undefined') {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', quickStart);
    } else {
        // DOM is already ready
        quickStart();
    }
}

export default initUnifiedStorage;