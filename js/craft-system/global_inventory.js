// Global Inventory System - Unified Inventory Management
// Auto-generated on: 2025-08-21T18:54:40.673Z

/**
 * Global inventory management for the multi-craft navigation system
 * Handles storage, retrieval, and aggregation across all active projects
 */

import { craftNavigator } from './craft_navigator.js';
import { barterRequirements } from '../barter_requirements.js';

export class GlobalInventoryManager {
    constructor() {
        this.storagePrefix = 'bdo-craft-inventory-';
        this.projectPrefix = 'bdo-craft-project-';
        this.dependencyPrefix = 'bdo-craft-dependency-';
        this.cache = new Map(); // In-memory cache for performance
        this.projectCache = new Map(); // Project data cache
        this.dependencyCache = new Map(); // Dependency graph cache
        
        // Storage keys for multi-craft system
        this.storageKeys = {
            globalInventory: 'bdo-craft-inventory-global',
            activeProjects: 'bdo-craft-active-projects',
            projectPriorities: 'bdo-craft-project-priorities',
            projectDependencies: 'bdo-craft-project-dependencies',
            crossCraftMaterials: 'bdo-craft-cross-materials',
            inventorySession: 'bdo-craft-inventory-session'
        };
        
        // Initialize from localStorage on startup
        this.initializeFromStorage();
        
        // Listen for storage events from other tabs
        this.setupStorageEventListener();
    }
    
    /**
     * Initialize cache from localStorage on startup
     */
    initializeFromStorage() {
        try {
            // Load active projects
            const activeProjects = this.getStorageItem(this.storageKeys.activeProjects, []);
            activeProjects.forEach(project => {
                this.projectCache.set(project.name, project);
            });
            
            // Load dependency graph
            const dependencies = this.getStorageItem(this.storageKeys.projectDependencies, {});
            Object.entries(dependencies).forEach(([key, value]) => {
                this.dependencyCache.set(key, value);
            });
            
            console.log('📦 GlobalInventoryManager initialized from localStorage');
        } catch (error) {
            console.warn('Failed to initialize from localStorage:', error);
        }
    }
    
    /**
     * Setup storage event listener for cross-tab synchronization
     */
    setupStorageEventListener() {
        window.addEventListener('storage', (event) => {
            if (event.key && event.key.startsWith('bdo-craft-')) {
                // Clear relevant caches and trigger update
                if (event.key.includes('inventory')) {
                    this.cache.clear();
                } else if (event.key.includes('project')) {
                    this.projectCache.clear();
                } else if (event.key.includes('dependency')) {
                    this.dependencyCache.clear();
                }
                
                this._triggerInventoryUpdate('storage-sync', 0, 'cross-tab');
            }
        });
    }
    
    /**
     * Enhanced localStorage get with JSON parsing
     */
    getStorageItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn(`Failed to parse localStorage item ${key}:`, error);
            return defaultValue;
        }
    }
    
    /**
     * Enhanced localStorage set with JSON stringification
     */
    setStorageItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Failed to save to localStorage ${key}:`, error);
            return false;
        }
    }
    
    /**
     * Set quantity for a specific material with enhanced project context
     */
    setMaterialQuantity(materialName, quantity, projectContext = 'global') {
        const key = `${this.storagePrefix}${projectContext}-${materialName}`;
        const value = Math.max(0, parseInt(quantity) || 0);
        
        localStorage.setItem(key, value.toString());
        this.cache.set(key, value);
        
        // Update cross-craft materials tracking
        this.updateCrossCraftMaterialUsage(materialName, value, projectContext);
        
        // Trigger inventory update event
        this._triggerInventoryUpdate(materialName, value, projectContext);
        
        return value;
    }
    
    /**
     * Get quantity for a specific material
     */
    getMaterialQuantity(materialName, projectContext = 'global') {
        const key = `${this.storagePrefix}${projectContext}-${materialName}`;
        
        // Check cache first
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        
        // Get from localStorage
        const stored = localStorage.getItem(key);
        const value = stored ? parseInt(stored) : 0;
        
        // Cache the result
        this.cache.set(key, value);
        
        return value;
    }
    
    /**
     * Update cross-craft material usage tracking
     */
    updateCrossCraftMaterialUsage(materialName, quantity, projectContext) {
        const crossMaterials = this.getStorageItem(this.storageKeys.crossCraftMaterials, {});
        
        if (!crossMaterials[materialName]) {
            crossMaterials[materialName] = {
                totalStored: 0,
                usedByProjects: {},
                lastUpdated: Date.now()
            };
        }
        
        crossMaterials[materialName].usedByProjects[projectContext] = quantity;
        crossMaterials[materialName].totalStored = Object.values(crossMaterials[materialName].usedByProjects)
            .reduce((sum, qty) => sum + qty, 0);
        crossMaterials[materialName].lastUpdated = Date.now();
        
        this.setStorageItem(this.storageKeys.crossCraftMaterials, crossMaterials);
    }
    
    /**
     * Calculate enhanced global inventory status with cross-craft tracking
     */
    calculateGlobalInventoryStatus() {
        const globalReqs = craftNavigator.calculateGlobalRequirements();
        const inventoryStatus = {};
        const projectPriorities = this.getProjectPriorities();
        const crossMaterials = this.getStorageItem(this.storageKeys.crossCraftMaterials, {});
        
        for (const [materialName, reqData] of Object.entries(globalReqs)) {
            const stored = this.getMaterialQuantity(materialName, 'global');
            const needed = reqData.totalNeeded;
            const remaining = Math.max(0, needed - stored);
            
            // Enhanced status with cross-craft information
            inventoryStatus[materialName] = {
                needed: needed,
                stored: stored,
                remaining: remaining,
                type: reqData.type,
                baseName: reqData.baseName,
                usedBy: Array.from(reqData.usedBy),
                isClickable: reqData.isClickable,
                completionPercent: needed > 0 ? Math.min(100, (stored / needed) * 100) : 100,
                isComplete: remaining === 0,
                barterInfo: this._getBarterInfo(materialName),
                
                // Enhanced cross-craft tracking
                crossCraftUsage: crossMaterials[materialName] || null,
                priorityProjects: this.getMaterialPriorityProjects(materialName, projectPriorities),
                dependencyChain: this.getDependencyChain(materialName),
                bottleneckScore: this.calculateBottleneckScore(materialName, reqData),
                alternativeSources: this.getAlternativeSources(materialName)
            };
        }
        
        return inventoryStatus;
    }
    
    /**
     * Get barter information for a material
     */
    _getBarterInfo(materialName) {
        if (barterRequirements && barterRequirements[materialName]) {
            return {
                canBeBarterd: true,
                exchanges: barterRequirements[materialName].exchanges,
                output: barterRequirements[materialName].output
            };
        }
        return { canBeBarterd: false };
    }
    
    /**
     * Calculate material requirements for a specific craft
     */
    calculateCraftInventoryStatus(craftName) {
        const craft = craftNavigator.allCrafts[craftName];
        if (!craft) {
            throw new Error(`Craft not found: ${craftName}`);
        }
        
        const inventoryStatus = {};
        
        for (const [materialName, reqData] of Object.entries(craft.requirements)) {
            const stored = this.getMaterialQuantity(materialName, 'global');
            const needed = reqData.quantity;
            const remaining = Math.max(0, needed - stored);
            
            inventoryStatus[materialName] = {
                needed: needed,
                stored: stored,
                remaining: remaining,
                type: reqData.type,
                baseName: reqData.baseName,
                isClickable: reqData.isClickable,
                completionPercent: needed > 0 ? Math.min(100, (stored / needed) * 100) : 100,
                isComplete: remaining === 0,
                barterInfo: this._getBarterInfo(materialName)
            };
        }
        
        return inventoryStatus;
    }
    
    /**
     * Get inventory summary statistics
     */
    getInventorySummary() {
        const globalStatus = this.calculateGlobalInventoryStatus();
        const summary = {
            totalMaterials: Object.keys(globalStatus).length,
            completedMaterials: 0,
            totalStoredValue: 0,
            totalNeededValue: 0,
            materialsByType: {
                ships: 0,
                ship_parts: 0,
                materials: 0
            },
            completedByType: {
                ships: 0,
                ship_parts: 0,
                materials: 0
            }
        };
        
        for (const [materialName, status] of Object.entries(globalStatus)) {
            if (status.isComplete) {
                summary.completedMaterials++;
                summary.completedByType[status.type]++;
            }
            
            summary.totalStoredValue += status.stored;
            summary.totalNeededValue += status.needed;
            summary.materialsByType[status.type]++;
        }
        
        summary.overallCompletionPercent = summary.totalMaterials > 0 
            ? (summary.completedMaterials / summary.totalMaterials) * 100 
            : 100;
            
        return summary;
    }
    
    /**
     * Import/Export inventory data
     */
    exportInventoryData() {
        const data = {};
        const prefix = this.storagePrefix;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const cleanKey = key.substring(prefix.length);
                data[cleanKey] = localStorage.getItem(key);
            }
        }
        
        return {
            version: '1.0',
            timestamp: new Date().toISOString(),
            activeProjects: Array.from(craftNavigator.activeCrafts),
            inventory: data
        };
    }
    
    /**
     * Import inventory data
     */
    importInventoryData(importData) {
        if (!importData.version || !importData.inventory) {
            throw new Error('Invalid import data format');
        }
        
        // Clear cache
        this.cache.clear();
        
        // Import inventory
        const prefix = this.storagePrefix;
        for (const [key, value] of Object.entries(importData.inventory)) {
            localStorage.setItem(prefix + key, value);
        }
        
        // Import active projects if available
        if (importData.activeProjects) {
            craftNavigator.activeCrafts.clear();
            importData.activeProjects.forEach(project => {
                craftNavigator.addToActiveProjects(project);
            });
        }
        
        // Trigger full refresh
        this._triggerInventoryUpdate('*', 0, 'import');
        
        return true;
    }
    
    /**
     * Clear all inventory data
     */
    clearInventoryData() {
        const prefix = this.storagePrefix;
        const keysToRemove = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        this.cache.clear();
        
        this._triggerInventoryUpdate('*', 0, 'clear');
        
        return keysToRemove.length;
    }
    
    /**
     * Trigger inventory update event for UI refresh
     */
    _triggerInventoryUpdate(materialName, quantity, context) {
        const event = new CustomEvent('inventoryUpdated', {
            detail: {
                materialName,
                quantity,
                context,
                timestamp: Date.now()
            }
        });
        
        document.dispatchEvent(event);
    }
    
    /**
     * Enhanced project management with localStorage persistence
     */
    addProject(projectName, projectData, priority = 'normal') {
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const priorities = this.getStorageItem(this.storageKeys.projectPriorities, {});
        
        const project = {
            name: projectName,
            ...projectData,
            addedAt: Date.now(),
            lastUpdated: Date.now(),
            status: 'active'
        };
        
        // Remove existing project with same name
        const filteredProjects = projects.filter(p => p.name !== projectName);
        filteredProjects.push(project);
        
        priorities[projectName] = {
            level: priority,
            score: this.calculatePriorityScore(priority),
            setAt: Date.now()
        };
        
        this.setStorageItem(this.storageKeys.activeProjects, filteredProjects);
        this.setStorageItem(this.storageKeys.projectPriorities, priorities);
        
        this.projectCache.set(projectName, project);
        
        // Update dependency graph
        this.updateProjectDependencies(projectName, projectData);
        
        this._triggerInventoryUpdate('project-added', projectName, 'project-management');
        
        return project;
    }
    
    /**
     * Remove project with dependency cleanup
     */
    removeProject(projectName) {
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const priorities = this.getStorageItem(this.storageKeys.projectPriorities, {});
        const dependencies = this.getStorageItem(this.storageKeys.projectDependencies, {});
        
        const filteredProjects = projects.filter(p => p.name !== projectName);
        delete priorities[projectName];
        
        // Clean up dependencies
        Object.keys(dependencies).forEach(key => {
            if (key.includes(projectName)) {
                delete dependencies[key];
            }
        });
        
        this.setStorageItem(this.storageKeys.activeProjects, filteredProjects);
        this.setStorageItem(this.storageKeys.projectPriorities, priorities);
        this.setStorageItem(this.storageKeys.projectDependencies, dependencies);
        
        this.projectCache.delete(projectName);
        this.dependencyCache.clear(); // Refresh dependency cache
        
        this._triggerInventoryUpdate('project-removed', projectName, 'project-management');
        
        return filteredProjects;
    }
    
    /**
     * Update project dependencies and detect circular dependencies
     */
    updateProjectDependencies(projectName, projectData) {
        const dependencies = this.getStorageItem(this.storageKeys.projectDependencies, {});
        const projectDeps = [];
        
        // Extract dependencies from project requirements
        if (projectData.requirements) {
            Object.entries(projectData.requirements).forEach(([materialName, reqData]) => {
                if (reqData.isClickable && craftNavigator.allCrafts[materialName]) {
                    projectDeps.push({
                        material: materialName,
                        type: reqData.type,
                        quantity: reqData.quantity,
                        isCircular: this.detectCircularDependency(projectName, materialName)
                    });
                }
            });
        }
        
        dependencies[projectName] = {
            dependencies: projectDeps,
            lastUpdated: Date.now(),
            hasCircularDeps: projectDeps.some(dep => dep.isCircular)
        };
        
        this.setStorageItem(this.storageKeys.projectDependencies, dependencies);
        this.dependencyCache.set(projectName, dependencies[projectName]);
    }
    
    /**
     * Detect circular dependencies between projects
     */
    detectCircularDependency(projectA, materialB, visited = new Set()) {
        if (visited.has(projectA)) {
            return true; // Circular dependency detected
        }
        
        visited.add(projectA);
        
        const projectBCraft = craftNavigator.allCrafts[materialB];
        if (!projectBCraft || !projectBCraft.requirements) {
            return false;
        }
        
        // Check if materialB requires projectA
        for (const [reqName] of Object.entries(projectBCraft.requirements)) {
            if (reqName === projectA) {
                return true;
            }
            
            // Recursive check
            if (this.detectCircularDependency(reqName, projectA, new Set(visited))) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Get project priorities
     */
    getProjectPriorities() {
        return this.getStorageItem(this.storageKeys.projectPriorities, {});
    }
    
    /**
     * Calculate priority score for sorting
     */
    calculatePriorityScore(priority) {
        const scores = {
            'urgent': 1000,
            'high': 800,
            'normal': 500,
            'low': 200,
            'someday': 100
        };
        return scores[priority] || 500;
    }
    
    /**
     * Get priority projects for a material
     */
    getMaterialPriorityProjects(materialName, priorities) {
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const priorityProjects = [];
        
        projects.forEach(project => {
            if (project.requirements && project.requirements[materialName]) {
                const priority = priorities[project.name];
                priorityProjects.push({
                    name: project.name,
                    priority: priority?.level || 'normal',
                    score: priority?.score || 500,
                    quantity: project.requirements[materialName].quantity
                });
            }
        });
        
        return priorityProjects.sort((a, b) => b.score - a.score);
    }
    
    /**
     * Get dependency chain for a material
     */
    getDependencyChain(materialName) {
        const dependencies = this.getStorageItem(this.storageKeys.projectDependencies, {});
        const chain = [];
        
        Object.entries(dependencies).forEach(([projectName, deps]) => {
            deps.dependencies?.forEach(dep => {
                if (dep.material === materialName) {
                    chain.push({
                        project: projectName,
                        quantity: dep.quantity,
                        type: dep.type,
                        isCircular: dep.isCircular
                    });
                }
            });
        });
        
        return chain;
    }
    
    /**
     * Calculate bottleneck score for material prioritization
     */
    calculateBottleneckScore(materialName, reqData) {
        const usageCount = reqData.usedBy ? reqData.usedBy.size : 0;
        const remainingRatio = reqData.totalNeeded > 0 ? reqData.totalNeeded / Math.max(1, reqData.totalNeeded - (reqData.totalNeeded - reqData.remaining)) : 0;
        const priorityWeight = this.getMaterialPriorityProjects(materialName, this.getProjectPriorities())
            .reduce((sum, p) => sum + p.score, 0);
        
        return (usageCount * 100) + (remainingRatio * 50) + (priorityWeight / 100);
    }
    
    /**
     * Get alternative sources for a material
     */
    getAlternativeSources(materialName) {
        const alternatives = [];
        
        // Check if material has alternatives in craft data
        Object.entries(craftNavigator.allCrafts).forEach(([craftName, craftData]) => {
            if (craftData.requirements) {
                Object.entries(craftData.requirements).forEach(([reqName, reqData]) => {
                    if (reqData.type === 'ship_alternatives' && reqData.alternatives) {
                        reqData.alternatives.forEach(alt => {
                            if (alt.name === materialName) {
                                alternatives.push({
                                    source: craftName,
                                    method: 'alternative',
                                    isRecommended: alt.isRecommended
                                });
                            }
                        });
                    }
                });
            }
        });
        
        // Check barter system
        const barterInfo = this._getBarterInfo(materialName);
        if (barterInfo.canBeBarterd) {
            alternatives.push({
                source: 'barter',
                method: 'exchange',
                exchanges: barterInfo.exchanges
            });
        }
        
        return alternatives;
    }
    
    /**
     * Bulk update materials with enhanced tracking
     */
    bulkUpdateMaterials(updates) {
        const results = {};
        const timestamp = Date.now();
        
        // Create session for bulk update
        const sessionId = `bulk-${timestamp}`;
        const session = {
            id: sessionId,
            updates: Object.keys(updates),
            startTime: timestamp,
            status: 'in-progress'
        };
        
        this.setStorageItem(this.storageKeys.inventorySession, session);
        
        for (const [materialName, quantity] of Object.entries(updates)) {
            results[materialName] = this.setMaterialQuantity(materialName, quantity);
        }
        
        // Complete session
        session.status = 'completed';
        session.endTime = Date.now();
        session.duration = session.endTime - session.startTime;
        this.setStorageItem(this.storageKeys.inventorySession, session);
        
        // Single event for all updates
        this._triggerInventoryUpdate('bulk', Object.keys(updates).length, 'bulk');
        
        return results;
    }
    
    /**
     * Get comprehensive multi-craft statistics
     */
    getMultiCraftStatistics() {
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const dependencies = this.getStorageItem(this.storageKeys.projectDependencies, {});
        const crossMaterials = this.getStorageItem(this.storageKeys.crossCraftMaterials, {});
        const globalStatus = this.calculateGlobalInventoryStatus();
        
        const stats = {
            projects: {
                total: projects.length,
                byType: {},
                withCircularDeps: 0,
                averageMaterials: 0
            },
            materials: {
                total: Object.keys(globalStatus).length,
                completed: 0,
                crossCraftShared: Object.keys(crossMaterials).length,
                bottlenecks: []
            },
            dependencies: {
                totalConnections: 0,
                circularDetected: 0,
                averageDepth: 0
            },
            performance: {
                cacheHitRate: this.cache.size > 0 ? (this.cache.size / (this.cache.size + 1)) * 100 : 0,
                storageUsage: this.calculateStorageUsage()
            }
        };
        
        // Calculate project statistics
        projects.forEach(project => {
            const type = project.type || 'unknown';
            stats.projects.byType[type] = (stats.projects.byType[type] || 0) + 1;
            
            if (project.requirements) {
                stats.projects.averageMaterials += Object.keys(project.requirements).length;
            }
            
            const projectDeps = dependencies[project.name];
            if (projectDeps?.hasCircularDeps) {
                stats.projects.withCircularDeps++;
            }
        });
        
        if (projects.length > 0) {
            stats.projects.averageMaterials = Math.round(stats.projects.averageMaterials / projects.length);
        }
        
        // Calculate material statistics
        Object.entries(globalStatus).forEach(([materialName, status]) => {
            if (status.isComplete) {
                stats.materials.completed++;
            }
            
            if (status.bottleneckScore > 500) {
                stats.materials.bottlenecks.push({
                    name: materialName,
                    score: status.bottleneckScore,
                    remaining: status.remaining
                });
            }
        });
        
        // Sort bottlenecks by score
        stats.materials.bottlenecks.sort((a, b) => b.score - a.score);
        stats.materials.bottlenecks = stats.materials.bottlenecks.slice(0, 10); // Top 10
        
        // Calculate dependency statistics
        Object.values(dependencies).forEach(dep => {
            stats.dependencies.totalConnections += dep.dependencies?.length || 0;
            if (dep.hasCircularDeps) {
                stats.dependencies.circularDetected++;
            }
        });
        
        return stats;
    }
    
    /**
     * Calculate localStorage usage for the craft system
     */
    calculateStorageUsage() {
        let totalSize = 0;
        const breakdown = {};
        
        Object.values(this.storageKeys).forEach(key => {
            const item = localStorage.getItem(key);
            if (item) {
                const size = new Blob([item]).size;
                totalSize += size;
                breakdown[key] = size;
            }
        });
        
        // Add inventory data
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.storagePrefix)) {
                const item = localStorage.getItem(key);
                const size = new Blob([item]).size;
                totalSize += size;
                breakdown.inventoryData = (breakdown.inventoryData || 0) + size;
            }
        }
        
        return {
            totalBytes: totalSize,
            totalFormatted: this.formatBytes(totalSize),
            breakdown
        };
    }
    
    /**
     * Format bytes for human reading
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Create global instance
export const globalInventory = new GlobalInventoryManager();

// Export utility functions
export function setMaterialQuantity(materialName, quantity, projectContext = 'global') {
    return globalInventory.setMaterialQuantity(materialName, quantity, projectContext);
}

export function getMaterialQuantity(materialName, projectContext = 'global') {
    return globalInventory.getMaterialQuantity(materialName, projectContext);
}

export function calculateGlobalInventoryStatus() {
    return globalInventory.calculateGlobalInventoryStatus();
}

export function getInventorySummary() {
    return globalInventory.getInventorySummary();
}