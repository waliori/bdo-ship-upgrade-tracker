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
     * Enhanced inventory update event for UI refresh with completion context
     */
    _triggerInventoryUpdate(materialName, quantity, context) {
        // Prepare enhanced event detail
        const eventDetail = {
            materialName,
            quantity,
            context,
            timestamp: Date.now(),
            source: 'global-inventory',
            version: '2.0'
        };
        
        // Add completion-specific context if this is a completion event
        if (context && typeof context === 'object' && context.recipeName) {
            eventDetail.completion = {
                recipeName: context.recipeName,
                completionContext: context.completionContext,
                transactionId: context.id,
                cascadeCount: context.cascadeCompletions ? context.cascadeCompletions.length : 0,
                affectedProjects: context.affectedProjects ? context.affectedProjects.length : 0,
                materialsConsumed: context.materialsConsumed ? Object.keys(context.materialsConsumed).length : 0,
                inventoryUpdates: context.inventoryUpdates ? context.inventoryUpdates.length : 0,
                dependencyUpdates: context.dependencyUpdates ? context.dependencyUpdates.length : 0
            };
        }
        
        // Dispatch the main inventory updated event
        const inventoryEvent = new CustomEvent('inventoryUpdated', { detail: eventDetail });
        document.dispatchEvent(inventoryEvent);
        
        // Dispatch specific completion events for better handling
        if (materialName === 'recipe-completed' && context && context.recipeName) {
            const completionEvent = new CustomEvent('recipeCompleted', {
                detail: {
                    recipeName: context.recipeName,
                    transaction: context,
                    context: context.completionContext,
                    source: 'global-inventory',
                    timestamp: Date.now()
                }
            });
            document.dispatchEvent(completionEvent);
        }
        
        // Dispatch project-specific events for project management UI
        if (materialName === 'project-added' || materialName === 'project-removed') {
            const projectEvent = new CustomEvent('projectChanged', {
                detail: {
                    action: materialName,
                    projectName: quantity, // quantity is used as projectName in these contexts
                    context,
                    source: 'global-inventory',
                    timestamp: Date.now()
                }
            });
            document.dispatchEvent(projectEvent);
        }
        
        // Dispatch bulk update events for performance optimization
        if (materialName === 'bulk' && typeof quantity === 'number') {
            const bulkEvent = new CustomEvent('inventoryBulkUpdated', {
                detail: {
                    itemCount: quantity,
                    context,
                    source: 'global-inventory',
                    timestamp: Date.now()
                }
            });
            document.dispatchEvent(bulkEvent);
        }
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
            status: 'active',
            
            // Enhanced completion tracking
            completionStatus: {
                isCompleted: false,
                completionPercent: 0,
                totalDependencies: 0,
                satisfiedDependencies: 0,
                missingDependencies: [],
                lastValidated: Date.now()
            },
            
            // Dependency tracking
            dependencyStatus: {},
            
            // Progress tracking
            progressHistory: [],
            
            // Metadata
            metadata: {
                addedBy: 'user',
                addedVia: 'manual',
                version: '2.0'
            }
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
     * Update project completion status with comprehensive tracking
     */
    async updateProjectCompletionStatus(projectName) {
        console.log(`📊 Updating completion status for project: ${projectName}`);
        
        try {
            const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
            const projectIndex = projects.findIndex(p => p.name === projectName);
            
            if (projectIndex === -1) {
                console.warn(`Project not found: ${projectName}`);
                return null;
            }
            
            const project = projects[projectIndex];
            const oldStatus = { ...project.completionStatus };
            
            // Validate all dependencies
            const validation = await this.validateAllDependencies(projectName);
            
            // Update completion status
            project.completionStatus = {
                isCompleted: validation.allSatisfied,
                completionPercent: validation.completionPercent,
                totalDependencies: validation.satisfied.length + validation.missing.length,
                satisfiedDependencies: validation.satisfied.length,
                missingDependencies: validation.missing.map(dep => ({
                    name: dep.name,
                    type: dep.type,
                    status: dep.status,
                    shortage: dep.shortage || null
                })),
                lastValidated: Date.now()
            };
            
            // Update individual dependency statuses
            [...validation.satisfied, ...validation.missing].forEach(dep => {
                project.dependencyStatus[dep.name] = {
                    status: dep.status,
                    type: dep.type,
                    lastChecked: Date.now(),
                    ...(dep.stored !== undefined && { stored: dep.stored, needed: dep.needed })
                };
            });
            
            // Add to progress history if status changed
            if (oldStatus.completionPercent !== project.completionStatus.completionPercent) {
                project.progressHistory.push({
                    timestamp: Date.now(),
                    oldPercent: oldStatus.completionPercent,
                    newPercent: project.completionStatus.completionPercent,
                    change: project.completionStatus.completionPercent - oldStatus.completionPercent,
                    trigger: 'status_update'
                });
                
                // Keep only last 50 history entries
                if (project.progressHistory.length > 50) {
                    project.progressHistory = project.progressHistory.slice(-50);
                }
            }
            
            // Update project metadata
            project.lastUpdated = Date.now();
            
            // Save updated project
            projects[projectIndex] = project;
            this.setStorageItem(this.storageKeys.activeProjects, projects);
            
            console.log(`✅ Project completion status updated: ${projectName} (${project.completionStatus.completionPercent}%)`);
            
            return project.completionStatus;
            
        } catch (error) {
            console.error(`❌ Failed to update completion status for ${projectName}:`, error);
            return null;
        }
    }
    
    /**
     * Get comprehensive project status including completion details
     */
    getProjectStatus(projectName) {
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const project = projects.find(p => p.name === projectName);
        
        if (!project) {
            return {
                exists: false,
                isCompleted: false,
                completionPercent: 0,
                status: 'not_found'
            };
        }
        
        return {
            exists: true,
            isCompleted: project.status === 'completed' || project.completionStatus?.isCompleted === true,
            completionPercent: project.completionStatus?.completionPercent || 0,
            status: project.status,
            completionStatus: project.completionStatus,
            dependencyStatus: project.dependencyStatus,
            progressHistory: project.progressHistory,
            lastUpdated: project.lastUpdated,
            addedAt: project.addedAt
        };
    }
    
    /**
     * Update all active projects' completion status
     */
    async refreshAllProjectStatuses() {
        console.log('🔄 Refreshing all project completion statuses');
        
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const updatePromises = projects.map(project => 
            this.updateProjectCompletionStatus(project.name)
        );
        
        try {
            const results = await Promise.all(updatePromises);
            const successCount = results.filter(r => r !== null).length;
            
            console.log(`✅ Refreshed ${successCount}/${projects.length} project statuses`);
            
            // Trigger global refresh event
            this._triggerInventoryUpdate('all-projects-refreshed', successCount, 'status-refresh');
            
            return { success: successCount, total: projects.length };
            
        } catch (error) {
            console.error('❌ Failed to refresh project statuses:', error);
            return { success: 0, total: projects.length, error: error.message };
        }
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
    
    // ============================================================================
    // UNIFIED COMPLETION SYSTEM
    // ============================================================================
    
    /**
     * Unified completion system - completes a recipe/project with full dependency tracking
     * This is the central completion orchestrator that ensures consistency across all systems
     */
    async completeRecipe(recipeName, completionContext = 'manual', options = {}) {
        console.log(`🎯 Starting unified completion for: ${recipeName} (context: ${completionContext})`);
        
        try {
            // 1. VALIDATION PHASE
            const validationResult = await this.validateRecipeForCompletion(recipeName, options);
            if (!validationResult.canComplete) {
                throw new Error(`Cannot complete ${recipeName}: ${validationResult.reason}`);
            }
            
            // 2. CREATE COMPLETION TRANSACTION
            const transaction = this.createCompletionTransaction(recipeName, completionContext, options);
            
            // 3. EXECUTE COMPLETION STEPS
            await this.executeCompletionTransaction(transaction);
            
            // 4. COMMIT TRANSACTION
            await this.commitCompletionTransaction(transaction);
            
            console.log(`✅ Recipe completion successful:`, transaction);
            return transaction;
            
        } catch (error) {
            console.error(`❌ Recipe completion failed for ${recipeName}:`, error);
            throw error;
        }
    }
    
    /**
     * Validate if a recipe can be completed
     */
    async validateRecipeForCompletion(recipeName, options = {}) {
        const recipe = craftNavigator.allCrafts[recipeName];
        if (!recipe) {
            return {
                canComplete: false,
                reason: `Recipe not found: ${recipeName}`,
                missingDependencies: [],
                validationDetails: {}
            };
        }
        
        // Check if already completed (unless forcing)
        if (!options.forceComplete && this.isRecipeCompleted(recipeName)) {
            return {
                canComplete: false,
                reason: `Recipe already completed: ${recipeName}`,
                missingDependencies: [],
                validationDetails: { alreadyCompleted: true }
            };
        }
        
        // Validate all dependencies
        const dependencyValidation = await this.validateAllDependencies(recipeName, options);
        
        return {
            canComplete: dependencyValidation.allSatisfied || options.skipDependencyCheck,
            reason: dependencyValidation.allSatisfied ? 'All dependencies satisfied' : 
                   `Missing dependencies: ${dependencyValidation.missing.map(dep => dep.name).join(', ')}`,
            missingDependencies: dependencyValidation.missing,
            validationDetails: {
                satisfied: dependencyValidation.satisfied,
                missing: dependencyValidation.missing,
                materialShortages: dependencyValidation.materialShortages,
                completionPercent: dependencyValidation.completionPercent
            }
        };
    }
    
    /**
     * Validate all dependencies for a recipe
     */
    async validateAllDependencies(recipeName, options = {}) {
        console.log(`🔍 Validating dependencies for recipe: ${recipeName}`);
        const recipe = craftNavigator.allCrafts[recipeName];
        const satisfied = [];
        const missing = [];
        const materialShortages = [];
        
        if (!recipe.requirements) {
            console.log(`✅ No requirements found for ${recipeName}, marking as satisfied`);
            return {
                allSatisfied: true,
                satisfied: [],
                missing: [],
                materialShortages: [],
                completionPercent: 100
            };
        }
        
        console.log(`🔍 Checking ${Object.keys(recipe.requirements).length} requirements for ${recipeName}`);
        
        for (const [depName, reqData] of Object.entries(recipe.requirements)) {
            console.log(`🔍 Checking dependency: ${depName} (isClickable: ${reqData.isClickable})`);
            
            if (reqData.isClickable) {
                // This is a sub-recipe dependency
                const isSubRecipeComplete = this.isRecipeCompleted(depName);
                console.log(`📋 Recipe dependency ${depName}: completed = ${isSubRecipeComplete}`);
                
                if (isSubRecipeComplete) {
                    satisfied.push({
                        name: depName,
                        type: 'recipe',
                        status: 'completed'
                    });
                } else {
                    missing.push({
                        name: depName,
                        type: 'recipe',
                        status: 'incomplete',
                        canAutoComplete: await this.canAutoCompleteRecipe(depName)
                    });
                }
            } else {
                // This is a material dependency
                const stored = this.getMaterialQuantity(depName);
                const needed = reqData.quantity;
                console.log(`📦 Material dependency ${depName}: stored = ${stored}, needed = ${needed}`);
                
                if (stored >= needed) {
                    satisfied.push({
                        name: depName,
                        type: 'material',
                        stored: stored,
                        needed: needed,
                        status: 'sufficient'
                    });
                } else {
                    const shortage = {
                        name: depName,
                        type: 'material',
                        stored: stored,
                        needed: needed,
                        shortage: needed - stored,
                        status: 'insufficient'
                    };
                    
                    missing.push(shortage);
                    materialShortages.push(shortage);
                }
            }
        }
        
        const totalDeps = satisfied.length + missing.length;
        const completionPercent = totalDeps > 0 ? (satisfied.length / totalDeps) * 100 : 100;
        
        console.log(`📊 Validation result for ${recipeName}: ${satisfied.length} satisfied, ${missing.length} missing (${completionPercent}% complete)`);
        if (missing.length > 0) {
            console.log(`❌ Missing dependencies:`, missing.map(dep => `${dep.name} (${dep.type})`));
        }
        
        return {
            allSatisfied: missing.length === 0,
            satisfied,
            missing,
            materialShortages,
            completionPercent
        };
    }
    
    /**
     * Check if a recipe is completed
     */
    isRecipeCompleted(recipeName) {
        // Check if recipe exists as completed project
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const project = projects.find(p => p.name === recipeName);
        
        if (project && project.status === 'completed') {
            return true;
        }
        
        // Check if recipe exists in inventory (quantity > 0)
        const inventoryQuantity = this.getMaterialQuantity(recipeName);
        if (inventoryQuantity > 0) {
            return true;
        }
        
        // Check completed recipes storage
        const completedRecipes = this.getStorageItem('bdo-craft-completed-recipes', {});
        return completedRecipes[recipeName] && completedRecipes[recipeName].isCompleted;
    }
    
    /**
     * Check if a recipe can be auto-completed
     */
    async canAutoCompleteRecipe(recipeName) {
        const validation = await this.validateRecipeForCompletion(recipeName, { skipDependencyCheck: false });
        return validation.canComplete;
    }
    
    /**
     * Create completion transaction
     */
    createCompletionTransaction(recipeName, completionContext, options) {
        return {
            id: `completion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            recipeName,
            completionContext,
            options,
            timestamp: Date.now(),
            status: 'created',
            
            // Tracking arrays
            affectedProjects: [],
            inventoryUpdates: [],
            dependencyUpdates: [],
            cascadeCompletions: [],
            rollbackData: [],
            
            // Results
            materialsConsumed: {},
            projectsCompleted: [],
            dependenciesResolved: [],
            
            // Metadata
            validationResults: null,
            executionSteps: [],
            errors: []
        };
    }
    
    /**
     * Execute completion transaction
     */
    async executeCompletionTransaction(transaction) {
        console.log(`🔄 Executing completion transaction: ${transaction.id}`);
        
        try {
            transaction.status = 'executing';
            
            // Step 1: Store rollback data
            await this.storeRollbackData(transaction);
            
            // Step 2: Complete in inventory layer
            await this.completeInInventoryLayer(transaction);
            
            // Step 3: Complete in project layer
            await this.completeInProjectLayer(transaction);
            
            // Step 4: Consume required materials
            await this.consumeRequiredMaterials(transaction);
            
            // Step 5: Update dependency chains
            await this.updateDependencyChains(transaction);
            
            // Step 6: Handle completion cascades
            await this.handleCompletionCascades(transaction);
            
            // Step 7: Update parent project requirements
            await this.updateParentProjectRequirements(transaction);
            
            transaction.status = 'executed';
            console.log(`✅ Transaction execution completed: ${transaction.id}`);
            
        } catch (error) {
            transaction.status = 'failed';
            transaction.errors.push({
                step: 'execution',
                error: error.message,
                timestamp: Date.now()
            });
            
            // Attempt rollback
            await this.rollbackTransaction(transaction);
            throw error;
        }
    }
    
    /**
     * Store rollback data before making changes
     */
    async storeRollbackData(transaction) {
        const rollbackData = {
            timestamp: Date.now(),
            recipeName: transaction.recipeName,
            
            // Store current states
            inventoryState: {},
            projectState: null,
            dependencyState: {},
            completedRecipesState: {}
        };
        
        // Store current inventory quantities for all materials in the recipe
        const recipe = craftNavigator.allCrafts[transaction.recipeName];
        if (recipe && recipe.requirements) {
            Object.keys(recipe.requirements).forEach(materialName => {
                rollbackData.inventoryState[materialName] = this.getMaterialQuantity(materialName);
            });
        }
        
        // Store current project state
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const currentProject = projects.find(p => p.name === transaction.recipeName);
        if (currentProject) {
            rollbackData.projectState = JSON.parse(JSON.stringify(currentProject));
        }
        
        // Store completed recipes state
        const completedRecipes = this.getStorageItem('bdo-craft-completed-recipes', {});
        rollbackData.completedRecipesState = JSON.parse(JSON.stringify(completedRecipes));
        
        transaction.rollbackData.push(rollbackData);
        transaction.executionSteps.push('rollback_data_stored');
    }
    
    /**
     * Complete recipe in inventory layer
     */
    async completeInInventoryLayer(transaction) {
        console.log(`📦 Completing in inventory layer: ${transaction.recipeName}`);
        
        // Add the completed recipe to inventory
        const currentQuantity = this.getMaterialQuantity(transaction.recipeName);
        const newQuantity = currentQuantity + 1;
        
        this.setMaterialQuantity(transaction.recipeName, newQuantity, 'global');
        
        // CRITICAL: Also update the app storage system for synchronization
        try {
            if (typeof setGlobalTotal === 'function') {
                setGlobalTotal(transaction.recipeName, newQuantity);
                console.log(`🔄 Synced app storage: ${transaction.recipeName} = ${newQuantity}`);
            } else if (window.setGlobalTotal) {
                window.setGlobalTotal(transaction.recipeName, newQuantity);
                console.log(`🔄 Synced app storage (via window): ${transaction.recipeName} = ${newQuantity}`);
            }
        } catch (error) {
            console.warn(`⚠️ Failed to sync app storage for ${transaction.recipeName}:`, error);
        }
        
        transaction.inventoryUpdates.push({
            item: transaction.recipeName,
            oldQuantity: currentQuantity,
            newQuantity: newQuantity,
            change: +1,
            action: 'recipe_completion',
            timestamp: Date.now()
        });
        
        // Mark in completed recipes storage
        const completedRecipes = this.getStorageItem('bdo-craft-completed-recipes', {});
        completedRecipes[transaction.recipeName] = {
            isCompleted: true,
            completedAt: Date.now(),
            completionContext: transaction.completionContext,
            transactionId: transaction.id
        };
        this.setStorageItem('bdo-craft-completed-recipes', completedRecipes);
        
        transaction.executionSteps.push('inventory_layer_completed');
    }
    
    /**
     * Complete recipe in project layer
     */
    async completeInProjectLayer(transaction) {
        console.log(`📋 Completing in project layer: ${transaction.recipeName}`);
        
        // Update project status
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const projectIndex = projects.findIndex(p => p.name === transaction.recipeName);
        
        if (projectIndex !== -1) {
            const project = projects[projectIndex];
            const oldStatus = project.status;
            
            project.status = 'completed';
            project.completedAt = Date.now();
            project.completionMethod = transaction.completionContext;
            project.completionTransactionId = transaction.id;
            
            this.setStorageItem(this.storageKeys.activeProjects, projects);
            
            transaction.affectedProjects.push({
                name: transaction.recipeName,
                oldStatus: oldStatus,
                newStatus: 'completed',
                action: 'status_update'
            });
            
            transaction.projectsCompleted.push(transaction.recipeName);
        }
        
        // Update craft navigator state
        if (typeof craftNavigator.markProjectComplete === 'function') {
            craftNavigator.markProjectComplete(transaction.recipeName);
        }
        
        // CRITICAL FIX: Remove completed recipe from active projects
        if (typeof craftNavigator.removeFromActiveProjects === 'function') {
            const wasRemoved = craftNavigator.removeFromActiveProjects(transaction.recipeName);
            if (wasRemoved) {
                console.log(`✅ Removed completed recipe from active projects: ${transaction.recipeName}`);
                transaction.affectedProjects.push({
                    name: transaction.recipeName,
                    oldStatus: 'active',
                    newStatus: 'removed',
                    action: 'project_removal'
                });
            }
        } else {
            console.warn('⚠️ craftNavigator.removeFromActiveProjects not available');
        }
        
        // CRITICAL FIX: Remove auto-dependency projects that are no longer needed
        await this.cleanupCompletedAutoDependencies(transaction);
        
        transaction.executionSteps.push('project_layer_completed');
    }
    
    /**
     * Consume required materials for the recipe
     */
    async consumeRequiredMaterials(transaction) {
        console.log(`🔨 Consuming materials for: ${transaction.recipeName}`);
        
        const recipe = craftNavigator.allCrafts[transaction.recipeName];
        if (!recipe || !recipe.requirements) {
            transaction.executionSteps.push('no_materials_to_consume');
            return;
        }
        
        Object.entries(recipe.requirements).forEach(([materialName, reqData]) => {
            if (!reqData.isClickable) {
                // This is a consumable material
                const currentQuantity = this.getMaterialQuantity(materialName);
                const consumeAmount = reqData.quantity;
                const newQuantity = Math.max(0, currentQuantity - consumeAmount);
                
                this.setMaterialQuantity(materialName, newQuantity, 'global');
                
                // CRITICAL: Also update app storage system for material consumption
                try {
                    if (typeof setGlobalTotal === 'function') {
                        setGlobalTotal(materialName, newQuantity);
                        console.log(`🔄 Synced app storage (consumed): ${materialName} = ${newQuantity}`);
                    } else if (window.setGlobalTotal) {
                        window.setGlobalTotal(materialName, newQuantity);
                        console.log(`🔄 Synced app storage (consumed via window): ${materialName} = ${newQuantity}`);
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to sync app storage for consumed ${materialName}:`, error);
                }
                
                transaction.inventoryUpdates.push({
                    item: materialName,
                    oldQuantity: currentQuantity,
                    newQuantity: newQuantity,
                    change: -consumeAmount,
                    action: 'material_consumption',
                    consumedFor: transaction.recipeName,
                    timestamp: Date.now()
                });
                
                transaction.materialsConsumed[materialName] = consumeAmount;
            }
        });
        
        transaction.executionSteps.push('materials_consumed');
    }
    
    /**
     * Update dependency chains after completion
     */
    async updateDependencyChains(transaction) {
        console.log(`🔗 Updating dependency chains for: ${transaction.recipeName}`);
        
        // Find all projects that depend on this recipe
        const dependentProjects = this.findProjectsUsingMaterial(transaction.recipeName);
        
        for (const projectName of dependentProjects) {
            // Update the project's dependency status
            const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
            const project = projects.find(p => p.name === projectName);
            
            if (project) {
                if (!project.dependencyStatus) {
                    project.dependencyStatus = {};
                }
                
                const oldStatus = project.dependencyStatus[transaction.recipeName];
                project.dependencyStatus[transaction.recipeName] = {
                    status: 'completed',
                    completedAt: Date.now(),
                    completionTransactionId: transaction.id
                };
                
                transaction.dependencyUpdates.push({
                    parentProject: projectName,
                    dependency: transaction.recipeName,
                    oldStatus: oldStatus,
                    newStatus: 'completed',
                    timestamp: Date.now()
                });
                
                transaction.dependenciesResolved.push(`${projectName} -> ${transaction.recipeName}`);
            }
        }
        
        // Update global dependencies storage
        const dependencies = this.getStorageItem(this.storageKeys.projectDependencies, {});
        Object.keys(dependencies).forEach(projectName => {
            const projectDeps = dependencies[projectName];
            if (projectDeps.dependencies) {
                projectDeps.dependencies.forEach(dep => {
                    if (dep.material === transaction.recipeName) {
                        dep.status = 'completed';
                        dep.completedAt = Date.now();
                        dep.completionTransactionId = transaction.id;
                    }
                });
            }
        });
        
        this.setStorageItem(this.storageKeys.projectDependencies, dependencies);
        
        transaction.executionSteps.push('dependency_chains_updated');
    }
    
    /**
     * Handle completion cascades (auto-complete parent projects if all deps satisfied)
     */
    async handleCompletionCascades(transaction) {
        console.log(`⚡ Handling completion cascades for: ${transaction.recipeName}`);
        
        if (transaction.options.skipCascades) {
            transaction.executionSteps.push('cascades_skipped');
            return;
        }
        
        const dependentProjects = this.findProjectsUsingMaterial(transaction.recipeName);
        
        for (const projectName of dependentProjects) {
            try {
                // Check if this project can now be completed
                const validation = await this.validateRecipeForCompletion(projectName, {
                    skipDependencyCheck: false
                });
                
                if (validation.canComplete && transaction.options.autoCascade !== false) {
                    console.log(`🔄 Auto-cascading completion to: ${projectName}`);
                    
                    // Recursively complete the parent project
                    const cascadeTransaction = await this.completeRecipe(projectName, 'auto_cascade', {
                        parentTransaction: transaction.id,
                        skipCascades: false // Allow further cascades
                    });
                    
                    transaction.cascadeCompletions.push({
                        projectName: projectName,
                        transactionId: cascadeTransaction.id,
                        trigger: transaction.recipeName,
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                console.warn(`Failed to cascade completion to ${projectName}:`, error);
                transaction.errors.push({
                    step: 'cascade_completion',
                    target: projectName,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
        
        transaction.executionSteps.push('completion_cascades_handled');
    }
    
    /**
     * Update parent project requirements after completion
     */
    async updateParentProjectRequirements(transaction) {
        console.log(`📊 Updating parent project requirements for: ${transaction.recipeName}`);
        
        const dependentProjects = this.findProjectsUsingMaterial(transaction.recipeName);
        
        for (const projectName of dependentProjects) {
            try {
                // Recalculate project completion status
                const validation = await this.validateAllDependencies(projectName);
                
                // Update project metadata
                const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
                const project = projects.find(p => p.name === projectName);
                
                if (project) {
                    project.completionPercent = validation.completionPercent;
                    project.lastDependencyUpdate = Date.now();
                    project.dependencyStats = {
                        satisfied: validation.satisfied.length,
                        missing: validation.missing.length,
                        total: validation.satisfied.length + validation.missing.length
                    };
                    
                    this.setStorageItem(this.storageKeys.activeProjects, projects);
                }
            } catch (error) {
                console.warn(`Failed to update requirements for ${projectName}:`, error);
                transaction.errors.push({
                    step: 'update_parent_requirements',
                    target: projectName,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
        
        transaction.executionSteps.push('parent_requirements_updated');
    }
    
    /**
     * Find all projects that use a specific material
     */
    findProjectsUsingMaterial(materialName) {
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const dependentProjects = [];
        
        projects.forEach(project => {
            if (project.requirements && project.requirements[materialName]) {
                dependentProjects.push(project.name);
            }
        });
        
        return dependentProjects;
    }
    
    /**
     * Clean up auto-dependency projects that are no longer needed after completion
     * This includes recursive cleanup of the entire dependency tree
     */
    async cleanupCompletedAutoDependencies(transaction) {
        console.log(`🧹 Cleaning up auto-dependencies for: ${transaction.recipeName}`);
        
        try {
            // Perform recursive cleanup until no more dependencies can be removed
            let cleanupRounds = 0;
            let totalCleaned = 0;
            
            while (cleanupRounds < 10) { // Prevent infinite loops
                cleanupRounds++;
                console.log(`🔄 Cleanup round ${cleanupRounds}`);
                
                const cleanedInThisRound = await this.performSingleCleanupRound(transaction);
                totalCleaned += cleanedInThisRound;
                
                if (cleanedInThisRound === 0) {
                    console.log(`✅ No more dependencies to clean up. Total cleaned: ${totalCleaned}`);
                    break;
                }
                
                console.log(`🧹 Cleaned ${cleanedInThisRound} dependencies in round ${cleanupRounds}`);
            }
            
            if (cleanupRounds >= 10) {
                console.warn('⚠️ Cleanup stopped after 10 rounds to prevent infinite loop');
            }
            
        } catch (error) {
            console.warn('⚠️ Failed to cleanup auto-dependencies:', error);
            transaction.errors.push({
                step: 'auto_dependency_cleanup',
                error: error.message,
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Perform a single round of dependency cleanup
     */
    async performSingleCleanupRound(transaction) {
        const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        const autoDependenciesToCheck = [];
        
        // Find all auto-dependencies that might need cleanup
        projects.forEach(project => {
            if (project.isAutoDependency && project.name !== transaction.recipeName) {
                // Check if this auto-dependency is still needed by any active project
                const isStillNeeded = this.isAutoDependencyStillNeeded(project.name, projects);
                if (!isStillNeeded) {
                    autoDependenciesToCheck.push(project.name);
                }
            }
        });
        
        let cleanedCount = 0;
        
        // Remove auto-dependencies that are completed and no longer needed
        for (const autoDependencyName of autoDependenciesToCheck) {
            const inventoryQuantity = this.getMaterialQuantity(autoDependencyName);
            
            // Remove if the auto-dependency has inventory (completed) OR if it's not needed regardless of completion status
            const shouldRemove = inventoryQuantity > 0 || this.shouldRemoveUnneededDependency(autoDependencyName, projects);
            
            if (shouldRemove && typeof craftNavigator.removeFromActiveProjects === 'function') {
                const wasRemoved = craftNavigator.removeFromActiveProjects(autoDependencyName);
                if (wasRemoved) {
                    console.log(`✅ Cleaned up auto-dependency: ${autoDependencyName} (quantity: ${inventoryQuantity})`);
                    transaction.affectedProjects.push({
                        name: autoDependencyName,
                        oldStatus: 'auto_dependency',
                        newStatus: 'cleaned_up',
                        action: 'auto_dependency_cleanup'
                    });
                    cleanedCount++;
                }
            }
        }
        
        return cleanedCount;
    }
    
    /**
     * Check if an unneeded dependency should be removed even if not completed
     */
    shouldRemoveUnneededDependency(dependencyName, projects) {
        // Remove auto-dependencies that are no longer needed by any active project
        // This handles cases where a parent recipe was completed/removed, making its dependencies orphaned
        
        const stillNeededByActiveProjects = projects.some(project => {
            if (project.status === 'completed' || project.name === dependencyName) {
                return false; // Don't count completed projects or self-reference
            }
            
            // Check if this active project requires the dependency
            if (project.requirements && project.requirements[dependencyName]) {
                return true;
            }
            
            return false;
        });
        
        // Also check if it's needed by any recipes that are still in the global requirements
        const globalReqs = craftNavigator.calculateGlobalRequirements();
        const isInGlobalRequirements = globalReqs[dependencyName] && globalReqs[dependencyName].totalNeeded > 0;
        
        // Remove if it's not needed by any active projects AND not in global requirements
        return !stillNeededByActiveProjects && !isInGlobalRequirements;
    }
    
    /**
     * Check if an auto-dependency is still needed by any active project
     */
    isAutoDependencyStillNeeded(autoDependencyName, projects = null) {
        if (!projects) {
            projects = this.getStorageItem(this.storageKeys.activeProjects, []);
        }
        
        // Check if any non-completed project still requires this auto-dependency
        for (const project of projects) {
            if (project.status !== 'completed' && 
                project.name !== autoDependencyName && 
                project.requirements && 
                project.requirements[autoDependencyName]) {
                
                // Check if the requirement is not satisfied yet
                const storedQuantity = this.getMaterialQuantity(autoDependencyName);
                const requiredQuantity = project.requirements[autoDependencyName].quantity || 1;
                
                if (storedQuantity < requiredQuantity) {
                    return true; // Still needed
                }
            }
        }
        
        return false; // No longer needed
    }
    
    /**
     * Commit completion transaction
     */
    async commitCompletionTransaction(transaction) {
        console.log(`💾 Committing completion transaction: ${transaction.id}`);
        
        transaction.status = 'committed';
        transaction.committedAt = Date.now();
        
        // Store transaction history
        const transactionHistory = this.getStorageItem('bdo-craft-transaction-history', []);
        transactionHistory.push({
            id: transaction.id,
            recipeName: transaction.recipeName,
            completionContext: transaction.completionContext,
            timestamp: transaction.timestamp,
            committedAt: transaction.committedAt,
            affectedProjects: transaction.affectedProjects.length,
            inventoryUpdates: transaction.inventoryUpdates.length,
            cascadeCompletions: transaction.cascadeCompletions.length,
            errors: transaction.errors.length
        });
        
        // Keep only last 100 transactions
        if (transactionHistory.length > 100) {
            transactionHistory.splice(0, transactionHistory.length - 100);
        }
        
        this.setStorageItem('bdo-craft-transaction-history', transactionHistory);
        
        // Clear navigation cache to force recalculation
        if (craftNavigator && craftNavigator.crossCraftCache) {
            craftNavigator.crossCraftCache.clear();
            console.log('🔄 Cleared craft navigator cache');
        }
        
        // Force recalculation of global requirements
        try {
            const newRequirements = craftNavigator.calculateGlobalRequirements();
            console.log(`🔄 Recalculated global requirements: ${Object.keys(newRequirements).length} materials needed`);
        } catch (error) {
            console.warn('Failed to recalculate global requirements:', error);
        }
        
        // Update all affected parent projects
        for (const affectedProject of transaction.affectedProjects) {
            try {
                await this.updateProjectCompletionStatus(affectedProject.name);
            } catch (error) {
                console.warn(`Failed to update status for ${affectedProject.name}:`, error);
            }
        }
        
        // Refresh all project statuses for safety
        setTimeout(() => {
            this.refreshAllProjectStatuses();
        }, 100);
        
        // Trigger global refresh event
        this._triggerInventoryUpdate('recipe-completed', transaction.recipeName, transaction);
        
        console.log(`✅ Transaction committed successfully: ${transaction.id}`);
    }
    
    /**
     * Rollback transaction in case of failure
     */
    async rollbackTransaction(transaction) {
        console.warn(`🔄 Rolling back transaction: ${transaction.id}`);
        
        try {
            if (transaction.rollbackData.length === 0) {
                console.warn('No rollback data available for transaction:', transaction.id);
                return;
            }
            
            const rollbackData = transaction.rollbackData[transaction.rollbackData.length - 1];
            
            // Restore inventory states
            Object.entries(rollbackData.inventoryState).forEach(([materialName, quantity]) => {
                this.setMaterialQuantity(materialName, quantity, 'global');
            });
            
            // Restore project state
            if (rollbackData.projectState) {
                const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
                const projectIndex = projects.findIndex(p => p.name === transaction.recipeName);
                if (projectIndex !== -1) {
                    projects[projectIndex] = rollbackData.projectState;
                    this.setStorageItem(this.storageKeys.activeProjects, projects);
                }
            }
            
            // Restore completed recipes state
            this.setStorageItem('bdo-craft-completed-recipes', rollbackData.completedRecipesState);
            
            transaction.status = 'rolled_back';
            console.log(`✅ Transaction rolled back successfully: ${transaction.id}`);
            
        } catch (error) {
            console.error(`❌ Rollback failed for transaction ${transaction.id}:`, error);
            transaction.status = 'rollback_failed';
            transaction.errors.push({
                step: 'rollback',
                error: error.message,
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Get completion status for a recipe
     */
    getRecipeCompletionStatus(recipeName) {
        const isCompleted = this.isRecipeCompleted(recipeName);
        const inventoryQuantity = this.getMaterialQuantity(recipeName);
        
        const completedRecipes = this.getStorageItem('bdo-craft-completed-recipes', {});
        const completionData = completedRecipes[recipeName];
        
        return {
            isCompleted,
            inventoryQuantity,
            completionData: completionData || null,
            canComplete: false, // Will be set by validation
            lastCompletedAt: completionData ? completionData.completedAt : null,
            completionContext: completionData ? completionData.completionContext : null
        };
    }
    
    /**
     * Get all completed recipes
     */
    getCompletedRecipes() {
        return this.getStorageItem('bdo-craft-completed-recipes', {});
    }
    
    /**
     * Get completion transaction history
     */
    getCompletionHistory() {
        return this.getStorageItem('bdo-craft-transaction-history', []);
    }
    
    /**
     * Clear completed recipe (undo completion)
     */
    async uncompleteRecipe(recipeName, reason = 'manual_undo') {
        console.log(`🔄 Uncompleting recipe: ${recipeName} (reason: ${reason})`);
        
        try {
            // Remove from completed recipes
            const completedRecipes = this.getStorageItem('bdo-craft-completed-recipes', {});
            delete completedRecipes[recipeName];
            this.setStorageItem('bdo-craft-completed-recipes', completedRecipes);
            
            // Reduce inventory quantity by 1
            const currentQuantity = this.getMaterialQuantity(recipeName);
            if (currentQuantity > 0) {
                this.setMaterialQuantity(recipeName, currentQuantity - 1, 'global');
            }
            
            // Update project status
            const projects = this.getStorageItem(this.storageKeys.activeProjects, []);
            const project = projects.find(p => p.name === recipeName);
            if (project && project.status === 'completed') {
                project.status = 'active';
                delete project.completedAt;
                delete project.completionMethod;
                delete project.completionTransactionId;
                project.uncompletedAt = Date.now();
                project.uncompletionReason = reason;
                
                this.setStorageItem(this.storageKeys.activeProjects, projects);
            }
            
            // Update craft navigator state
            if (typeof craftNavigator.markProjectUncompleted === 'function') {
                craftNavigator.markProjectUncompleted(recipeName);
            }
            
            // Clear cache and force recalculation
            if (craftNavigator && craftNavigator.crossCraftCache) {
                craftNavigator.crossCraftCache.clear();
            }
            
            // Trigger refresh
            this._triggerInventoryUpdate('recipe-uncompleted', recipeName, {
                reason,
                timestamp: Date.now()
            });
            
            console.log(`✅ Recipe uncompleted successfully: ${recipeName}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to uncomplete recipe ${recipeName}:`, error);
            throw error;
        }
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

// Export unified completion system functions
export function completeRecipe(recipeName, completionContext = 'manual', options = {}) {
    return globalInventory.completeRecipe(recipeName, completionContext, options);
}

export function validateRecipeForCompletion(recipeName, options = {}) {
    return globalInventory.validateRecipeForCompletion(recipeName, options);
}

export function isRecipeCompleted(recipeName) {
    return globalInventory.isRecipeCompleted(recipeName);
}

export function getRecipeCompletionStatus(recipeName) {
    return globalInventory.getRecipeCompletionStatus(recipeName);
}

export function uncompleteRecipe(recipeName, reason = 'manual_undo') {
    return globalInventory.uncompleteRecipe(recipeName, reason);
}

export function getCompletedRecipes() {
    return globalInventory.getCompletedRecipes();
}

export function getCompletionHistory() {
    return globalInventory.getCompletionHistory();
}