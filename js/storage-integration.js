// BDO Ship Upgrade Tracker - Storage Integration Layer
// Clean interface that replaces all fragmented storage operations

import storage from './unified-storage.js';

/**
 * Clean Storage Integration API
 * 
 * This module provides simple, clean functions that replace all the
 * fragmented storage operations throughout the application.
 */

// =============================================================================
// PROJECT MANAGEMENT
// =============================================================================

/**
 * Add a project to active projects
 */
export function addProject(craftName, craftData = {}) {
    const project = storage.setProject({
        name: craftName,
        type: craftData.type || 'materials',
        requirements: craftData.requirements || {},
        status: 'active'
    });
    
    console.log(`✅ Added project: ${craftName}`);
    return project;
}

/**
 * Remove project from active projects
 */
export function removeProject(craftName) {
    const removed = storage.removeProject(craftName);
    if (removed) {
        console.log(`🗑️ Removed project: ${craftName}`);
    }
    return removed;
}

/**
 * Get all active projects
 */
export function getActiveProjects() {
    return storage.getActiveProjects();
}

/**
 * Check if project is completed
 */
export function isProjectCompleted(craftName) {
    const project = storage.getProject(craftName);
    return project ? project.status === 'completed' : false;
}

/**
 * Mark project as completed
 */
export function markProjectCompleted(craftName) {
    const project = storage.getProject(craftName);
    if (project) {
        project.markCompleted();
        storage.setProject(project);
        console.log(`🎯 Completed project: ${craftName}`);
        return true;
    }
    return false;
}

// =============================================================================
// MATERIAL MANAGEMENT
// =============================================================================

/**
 * Set material quantity (replaces all setGlobalTotal, setMaterialQuantity, etc.)
 */
export function setMaterialQuantity(materialName, quantity, context = 'user') {
    const material = storage.setMaterialQuantity(materialName, quantity);
    
    console.log(`📦 Set ${materialName} = ${quantity} (${context})`);
    
    // Trigger completion checks
    triggerCompletionCheck();
    
    return material;
}

/**
 * Get material quantity (replaces getGlobalTotal, getMaterialQuantity, etc.)
 */
export function getMaterialQuantity(materialName) {
    const material = storage.getMaterial(materialName);
    return material ? material.owned : 0;
}

/**
 * Get all materials with their data
 */
export function getAllMaterials() {
    return storage.getAllMaterials();
}

/**
 * Get materials needed for active projects
 */
export function getNeededMaterials() {
    return storage.getNeededMaterials();
}

// =============================================================================
// COMPLETION SYSTEM
// =============================================================================

/**
 * Trigger completion check for all projects
 */
export function triggerCompletionCheck() {
    const updatedProjects = storage.updateProjectsProgress();
    
    if (updatedProjects > 0) {
        // Dispatch completion events for UI updates
        storage.events.dispatchEvent(new CustomEvent('completion-check', {
            detail: { 
                updatedProjects,
                timestamp: Date.now()
            }
        }));
        
        console.log(`🔄 Updated ${updatedProjects} project(s) completion status`);
    }
    
    return updatedProjects;
}

/**
 * Get completion status for all active projects
 */
export function getCompletionStatus() {
    const projects = storage.getActiveProjects();
    const completionData = {};
    
    for (const project of projects) {
        completionData[project.name] = {
            isCompleted: project.status === 'completed',
            completionPercent: project.completionPercent,
            completedAt: project.completedAt
        };
    }
    
    return completionData;
}

// =============================================================================
// GLOBAL REQUIREMENTS
// =============================================================================

/**
 * Calculate global requirements for all active projects
 */
export function calculateGlobalRequirements() {
    return storage.calculateGlobalRequirements();
}

/**
 * Get inventory status with completion information
 */
export function calculateGlobalInventoryStatus() {
    const materials = storage.getAllMaterials();
    const projects = storage.getActiveProjects();
    
    const status = {
        totalMaterials: Object.keys(materials).length,
        completedMaterials: 0,
        totalNeeded: 0,
        totalOwned: 0,
        completionPercent: 0,
        materialsByCategory: {},
        projectsStatus: {}
    };
    
    // Calculate material statistics
    for (const material of Object.values(materials)) {
        status.totalNeeded += material.needed;
        status.totalOwned += material.owned;
        
        if (material.isCompleted) {
            status.completedMaterials++;
        }
        
        // Group by category
        if (!status.materialsByCategory[material.category]) {
            status.materialsByCategory[material.category] = {
                total: 0,
                completed: 0,
                needed: 0,
                owned: 0
            };
        }
        
        const categoryData = status.materialsByCategory[material.category];
        categoryData.total++;
        categoryData.needed += material.needed;
        categoryData.owned += material.owned;
        
        if (material.isCompleted) {
            categoryData.completed++;
        }
    }
    
    // Calculate projects status
    for (const project of projects) {
        status.projectsStatus[project.name] = {
            completionPercent: project.completionPercent,
            isCompleted: project.status === 'completed',
            completedAt: project.completedAt
        };
    }
    
    // Overall completion
    status.completionPercent = status.totalMaterials > 0 ? 
        (status.completedMaterials / status.totalMaterials) * 100 : 0;
    
    return status;
}

// =============================================================================
// EVENT SYSTEM
// =============================================================================

/**
 * Listen for storage events
 */
export function addEventListener(eventType, callback) {
    storage.events.addEventListener(eventType, callback);
}

/**
 * Remove event listener
 */
export function removeEventListener(eventType, callback) {
    storage.events.removeEventListener(eventType, callback);
}

/**
 * Dispatch custom event
 */
export function dispatchEvent(eventType, detail = {}) {
    storage.events.dispatchEvent(new CustomEvent(eventType, { detail }));
}

// =============================================================================
// SETTINGS
// =============================================================================

/**
 * Set application setting
 */
export function setSetting(key, value) {
    storage.setSetting(key, value);
}

/**
 * Get application setting
 */
export function getSetting(key, defaultValue = null) {
    return storage.getSetting(key, defaultValue);
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get storage statistics
 */
export function getStorageStats() {
    return storage.getStats();
}

/**
 * Export all data
 */
export function exportData() {
    return storage.export();
}

/**
 * Import data
 */
export function importData(data) {
    return storage.import(data);
}

/**
 * Clear all data
 */
export function clearAllData() {
    return storage.clear();
}

/**
 * Get health check information
 */
export function healthCheck() {
    return storage.healthCheck();
}

/**
 * Search projects
 */
export function searchProjects(query) {
    return storage.searchProjects(query);
}

/**
 * Search materials
 */
export function searchMaterials(query) {
    return storage.searchMaterials(query);
}

// =============================================================================
// DEBUGGING UTILITIES
// =============================================================================

/**
 * Log current storage state (for debugging)
 */
export function debugLogState() {
    const stats = getStorageStats();
    console.group('🔍 Storage State');
    console.log('Projects:', stats.projects);
    console.log('Materials:', stats.materials);
    console.log('Storage:', stats.storage);
    console.groupEnd();
}

/**
 * Validate storage integrity
 */
export function validateStorageIntegrity() {
    const materials = storage.getAllMaterials();
    const projects = storage.getAllProjects();
    const issues = [];
    
    // Check for orphaned material references
    for (const [materialName, material] of Object.entries(materials)) {
        for (const projectName of material.usedBy) {
            if (!projects[projectName]) {
                issues.push(`Material ${materialName} references missing project ${projectName}`);
            }
        }
    }
    
    // Check for missing material references in projects
    for (const [projectName, project] of Object.entries(projects)) {
        if (project.requirements) {
            for (const materialName of Object.keys(project.requirements)) {
                if (!materials[materialName]) {
                    issues.push(`Project ${projectName} references missing material ${materialName}`);
                }
            }
        }
    }
    
    return {
        isValid: issues.length === 0,
        issues,
        timestamp: Date.now()
    };
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize storage integration
 */
export function initializeStorage() {
    console.log('🚀 Storage Integration initialized');
    
    // Set up automatic completion checking
    storage.events.addEventListener('material-updated', () => {
        // Trigger completion check after material updates
        setTimeout(triggerCompletionCheck, 100);
    });
    
    storage.events.addEventListener('project-updated', () => {
        // Trigger completion check after project updates
        setTimeout(triggerCompletionCheck, 100);
    });
    
    // Log initial state
    debugLogState();
    
    return storage;
}

// Auto-initialize when module loads
const initializedStorage = initializeStorage();

export default initializedStorage;