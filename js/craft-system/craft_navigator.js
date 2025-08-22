// Craft Navigation System - Core Navigation Logic
// Auto-generated on: 2025-08-21T18:54:40.673Z

/**
 * Core navigation system for multi-craft navigation
 * Provides functions to navigate between crafts and calculate dependencies
 */

// Import all craft data
import { data as ships } from './ships.js';
import { data as shipParts } from './ship_parts.js';
import { data as materials } from './materials.js';
import { data as craftMetadata } from './craft_metadata.js';
import { data as navigationLinks } from './navigation_links.js';
import { data as systemIndex } from './index.js';

export class CraftNavigator {
    constructor() {
        this.ships = ships;
        this.shipParts = shipParts;
        this.materials = materials;
        this.metadata = craftMetadata;
        this.links = navigationLinks;
        this.index = systemIndex;
        
        // Combine all crafts for easy lookup
        this.allCrafts = {
            ...ships,
            ...shipParts,
            ...materials
        };
        
        // Navigation state
        this.currentCraft = null;
        this.craftType = null;
        this.breadcrumb = [];
        this.activeCrafts = new Set(); // User's active projects
        
        // Enhanced localStorage-based state management
        this.storageKeys = {
            activeCrafts: 'bdo-craft-navigator-active',
            navigationState: 'bdo-craft-navigator-state',
            crossCraftMap: 'bdo-craft-cross-map',
            navigationHistory: 'bdo-craft-nav-history'
        };
        
        // Navigation history for better UX
        this.navigationHistory = [];
        this.maxHistorySize = 20;
        
        // Cross-craft navigation cache
        this.crossCraftCache = new Map();
        
        // Initialize from localStorage
        this.initializeFromStorage();
        
        // Setup event listeners for inventory changes
        this.setupInventoryEventListeners();
    }
    
    /**
     * Initialize navigation state from localStorage
     */
    initializeFromStorage() {
        try {
            // Load active crafts
            const activeCrafts = this.getStorageItem(this.storageKeys.activeCrafts, []);
            this.activeCrafts = new Set(activeCrafts);
            
            // Load navigation state
            const navState = this.getStorageItem(this.storageKeys.navigationState, {});
            if (navState.currentCraft && this.allCrafts[navState.currentCraft]) {
                this.currentCraft = navState.currentCraft;
                this.craftType = navState.craftType;
                this.breadcrumb = navState.breadcrumb || [];
            }
            
            // Load navigation history
            this.navigationHistory = this.getStorageItem(this.storageKeys.navigationHistory, []);
            
            // Load cross-craft mapping
            const crossCraftMap = this.getStorageItem(this.storageKeys.crossCraftMap, {});
            Object.entries(crossCraftMap).forEach(([key, value]) => {
                this.crossCraftCache.set(key, value);
            });
            
            console.log('🧞 CraftNavigator initialized from localStorage');
        } catch (error) {
            console.warn('Failed to initialize CraftNavigator from localStorage:', error);
        }
    }
    
    /**
     * Enhanced localStorage operations
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
     * Setup event listeners for inventory changes
     */
    setupInventoryEventListeners() {
        document.addEventListener('inventoryUpdated', (event) => {
            const { materialName, context } = event.detail;
            
            // Update cross-craft dependencies if material affects multiple crafts
            if (context === 'global' && this.isCrossCraftMaterial(materialName)) {
                this.updateCrossCraftDependencies(materialName);
            }
        });
    }
    
    /**
     * Enhanced navigation with localStorage persistence
     */
    navigateTo(craftName, fromCraft = null, navigationContext = {}) {
        if (!this.allCrafts[craftName]) {
            throw new Error(`Craft not found: ${craftName}`);
        }
        
        const craftType = this.metadata[craftName]?.type;
        if (!craftType) {
            throw new Error(`Craft metadata not found: ${craftName}`);
        }
        
        // Store previous state in history
        if (this.currentCraft) {
            this.addToNavigationHistory({
                craft: this.currentCraft,
                type: this.craftType,
                breadcrumb: [...this.breadcrumb],
                timestamp: Date.now(),
                context: navigationContext
            });
        }
        
        // Update navigation state
        this.currentCraft = craftName;
        this.craftType = craftType;
        
        // Update breadcrumb with enhanced logic
        if (fromCraft) {
            // Check if we're navigating deeper or switching context
            if (!this.breadcrumb.includes(fromCraft)) {
                this.breadcrumb.push(fromCraft);
            }
        } else {
            this.breadcrumb = []; // Reset if navigating from scratch
        }
        
        if (!this.breadcrumb.includes(craftName)) {
            this.breadcrumb.push(craftName);
        }
        
        // Persist navigation state
        this.saveNavigationState();
        
        // Update cross-craft mappings
        this.updateCrossCraftMapping(craftName, fromCraft);
        
        const navigationResult = {
            craft: this.allCrafts[craftName],
            metadata: this.metadata[craftName],
            links: this.links[craftName],
            breadcrumb: [...this.breadcrumb],
            type: craftType,
            
            // Enhanced navigation information
            crossCraftConnections: this.getCrossCraftConnections(craftName),
            dependencyAnalysis: this.analyzeDependencies(craftName),
            navigationSuggestions: this.getNavigationSuggestions(craftName),
            relatedProjects: this.getRelatedActiveProjects(craftName)
        };
        
        // Trigger navigation event
        this.triggerNavigationEvent('navigate', {
            to: craftName,
            from: fromCraft,
            type: craftType,
            context: navigationContext
        });
        
        return navigationResult;
    }
    
    /**
     * Get current craft information
     */
    getCurrentCraft() {
        if (!this.currentCraft) {
            return null;
        }
        
        return this.navigateTo(this.currentCraft);
    }
    
    /**
     * Go back in navigation
     */
    goBack() {
        if (this.breadcrumb.length > 1) {
            this.breadcrumb.pop(); // Remove current
            const previousCraft = this.breadcrumb[this.breadcrumb.length - 1];
            return this.navigateTo(previousCraft);
        }
        return null;
    }
    
    /**
     * Save navigation state to localStorage
     */
    saveNavigationState() {
        const navState = {
            currentCraft: this.currentCraft,
            craftType: this.craftType,
            breadcrumb: this.breadcrumb,
            lastUpdated: Date.now()
        };
        
        this.setStorageItem(this.storageKeys.navigationState, navState);
        this.setStorageItem(this.storageKeys.activeCrafts, Array.from(this.activeCrafts));
    }
    
    /**
     * Add to navigation history
     */
    addToNavigationHistory(entry) {
        this.navigationHistory.unshift(entry);
        
        // Limit history size
        if (this.navigationHistory.length > this.maxHistorySize) {
            this.navigationHistory = this.navigationHistory.slice(0, this.maxHistorySize);
        }
        
        this.setStorageItem(this.storageKeys.navigationHistory, this.navigationHistory);
    }
    
    /**
     * Enhanced add to active projects with localStorage
     */
    addToActiveProjects(craftName, projectData = {}) {
        if (!this.allCrafts[craftName]) {
            throw new Error(`Cannot add unknown craft to projects: ${craftName}`);
        }
        
        this.activeCrafts.add(craftName);
        
        // Create enhanced project entry
        const project = {
            name: craftName,
            type: this.metadata[craftName]?.type,
            addedAt: Date.now(),
            requirements: this.allCrafts[craftName].requirements || {},
            metadata: this.metadata[craftName],
            ...projectData
        };
        
        // Update cross-craft dependencies
        this.updateCrossCraftDependencies(craftName);
        
        // Save to localStorage
        this.saveNavigationState();
        
        // Trigger event
        this.triggerNavigationEvent('project-added', {
            project: craftName,
            data: project
        });
        
        return project;
    }
    
    /**
     * Enhanced remove from active projects
     */
    removeFromActiveProjects(craftName) {
        const wasActive = this.activeCrafts.has(craftName);
        this.activeCrafts.delete(craftName);
        
        if (wasActive) {
            // Clean up cross-craft dependencies
            this.cleanupCrossCraftDependencies(craftName);
            
            // Save to localStorage
            this.saveNavigationState();
            
            // Trigger event
            this.triggerNavigationEvent('project-removed', {
                project: craftName
            });
        }
        
        return wasActive;
    }
    
    /**
     * Get all active projects
     */
    getActiveProjects() {
        return Array.from(this.activeCrafts).map(craftName => ({
            name: craftName,
            type: this.metadata[craftName]?.type,
            metadata: this.metadata[craftName]
        }));
    }
    
    /**
     * Check if material is used across multiple craft types
     */
    isCrossCraftMaterial(materialName) {
        const usedInTypes = new Set();
        
        for (const [craftName, craftData] of Object.entries(this.allCrafts)) {
            if (craftData.requirements && craftData.requirements[materialName]) {
                const craftType = this.metadata[craftName]?.type;
                if (craftType) {
                    usedInTypes.add(craftType);
                }
            }
        }
        
        return usedInTypes.size > 1;
    }
    
    /**
     * Update cross-craft mapping for navigation optimization
     */
    updateCrossCraftMapping(craftName, fromCraft) {
        const craft = this.allCrafts[craftName];
        if (!craft || !craft.requirements) return;
        
        const crossMap = this.getStorageItem(this.storageKeys.crossCraftMap, {});
        
        // Map requirements to their craft types
        Object.keys(craft.requirements).forEach(reqName => {
            if (this.allCrafts[reqName]) {
                const reqType = this.metadata[reqName]?.type;
                const currentType = this.metadata[craftName]?.type;
                
                if (reqType && currentType && reqType !== currentType) {
                    const mapKey = `${currentType}->${reqType}`;
                    if (!crossMap[mapKey]) {
                        crossMap[mapKey] = {
                            connections: [],
                            frequency: 0,
                            lastUpdated: Date.now()
                        };
                    }
                    
                    crossMap[mapKey].connections.push({
                        from: craftName,
                        to: reqName,
                        timestamp: Date.now()
                    });
                    crossMap[mapKey].frequency++;
                    crossMap[mapKey].lastUpdated = Date.now();
                }
            }
        });
        
        this.setStorageItem(this.storageKeys.crossCraftMap, crossMap);
        
        // Update cache
        Object.entries(crossMap).forEach(([key, value]) => {
            this.crossCraftCache.set(key, value);
        });
    }
    
    /**
     * Get cross-craft connections for a specific craft
     */
    getCrossCraftConnections(craftName) {
        const connections = {
            incoming: [], // Crafts that require this craft
            outgoing: [], // Crafts required by this craft
            crossTypeRequirements: []
        };
        
        const currentType = this.metadata[craftName]?.type;
        if (!currentType) return connections;
        
        // Find incoming connections
        for (const [otherCraftName, otherCraftData] of Object.entries(this.allCrafts)) {
            if (otherCraftData.requirements && otherCraftData.requirements[craftName]) {
                const otherType = this.metadata[otherCraftName]?.type;
                connections.incoming.push({
                    craft: otherCraftName,
                    type: otherType,
                    quantity: otherCraftData.requirements[craftName].quantity,
                    isCrossType: otherType !== currentType
                });
            }
        }
        
        // Find outgoing connections
        const craft = this.allCrafts[craftName];
        if (craft && craft.requirements) {
            Object.entries(craft.requirements).forEach(([reqName, reqData]) => {
                if (this.allCrafts[reqName]) {
                    const reqType = this.metadata[reqName]?.type;
                    const connection = {
                        craft: reqName,
                        type: reqType,
                        quantity: reqData.quantity,
                        isCrossType: reqType !== currentType
                    };
                    
                    connections.outgoing.push(connection);
                    
                    if (connection.isCrossType) {
                        connections.crossTypeRequirements.push(connection);
                    }
                }
            });
        }
        
        return connections;
    }
    
    /**
     * Analyze dependencies with enhanced information
     */
    analyzeDependencies(craftName) {
        const craft = this.allCrafts[craftName];
        if (!craft || !craft.requirements) {
            return { depth: 0, totalMaterials: 0, crossCraftDeps: 0, circularDeps: [] };
        }
        
        const analysis = {
            depth: 0,
            totalMaterials: 0,
            crossCraftDeps: 0,
            circularDeps: [],
            materialsByType: {},
            bottlenecks: []
        };
        
        const visited = new Set();
        const path = [];
        
        this._analyzeDependenciesRecursive(craftName, analysis, visited, path, 0);
        
        return analysis;
    }
    
    /**
     * Recursive dependency analysis
     */
    _analyzeDependenciesRecursive(craftName, analysis, visited, path, depth) {
        if (path.includes(craftName)) {
            // Circular dependency detected
            const circularPath = path.slice(path.indexOf(craftName));
            circularPath.push(craftName);
            analysis.circularDeps.push(circularPath);
            return;
        }
        
        if (visited.has(craftName)) return;
        
        visited.add(craftName);
        path.push(craftName);
        analysis.depth = Math.max(analysis.depth, depth);
        
        const craft = this.allCrafts[craftName];
        if (craft && craft.requirements) {
            Object.entries(craft.requirements).forEach(([reqName, reqData]) => {
                analysis.totalMaterials++;
                
                const reqType = this.metadata[reqName]?.type || 'material';
                analysis.materialsByType[reqType] = (analysis.materialsByType[reqType] || 0) + 1;
                
                const currentType = this.metadata[craftName]?.type;
                if (reqType !== currentType) {
                    analysis.crossCraftDeps++;
                }
                
                // Check if this is a bottleneck (used by many crafts)
                const usageCount = this.getMaterialUsageCount(reqName);
                if (usageCount > 3) {
                    analysis.bottlenecks.push({
                        material: reqName,
                        usageCount,
                        type: reqType
                    });
                }
                
                // Recurse if it's a craft
                if (this.allCrafts[reqName]) {
                    this._analyzeDependenciesRecursive(reqName, analysis, visited, [...path], depth + 1);
                }
            });
        }
        
        path.pop();
    }
    
    /**
     * Get material usage count across all crafts
     */
    getMaterialUsageCount(materialName) {
        let count = 0;
        for (const [craftName, craftData] of Object.entries(this.allCrafts)) {
            if (craftData.requirements && craftData.requirements[materialName]) {
                count++;
            }
        }
        return count;
    }
    
    /**
     * Get navigation suggestions based on current context
     */
    getNavigationSuggestions(craftName) {
        const suggestions = {
            relatedCrafts: [],
            alternativePaths: [],
            optimization: []
        };
        
        const craft = this.allCrafts[craftName];
        if (!craft) return suggestions;
        
        // Find related crafts (share materials)
        if (craft.requirements) {
            Object.keys(craft.requirements).forEach(reqName => {
                // Find other crafts that use the same material
                for (const [otherCraftName, otherCraftData] of Object.entries(this.allCrafts)) {
                    if (otherCraftName !== craftName && 
                        otherCraftData.requirements && 
                        otherCraftData.requirements[reqName]) {
                        
                        suggestions.relatedCrafts.push({
                            craft: otherCraftName,
                            sharedMaterial: reqName,
                            type: this.metadata[otherCraftName]?.type
                        });
                    }
                }
            });
        }
        
        // Remove duplicates
        const uniqueRelated = [];
        const seen = new Set();
        suggestions.relatedCrafts.forEach(item => {
            if (!seen.has(item.craft)) {
                seen.add(item.craft);
                uniqueRelated.push(item);
            }
        });
        suggestions.relatedCrafts = uniqueRelated.slice(0, 5); // Limit suggestions
        
        return suggestions;
    }
    
    /**
     * Get related active projects
     */
    getRelatedActiveProjects(craftName) {
        const related = [];
        const craft = this.allCrafts[craftName];
        
        if (!craft || !craft.requirements) return related;
        
        // Check which active projects share materials with this craft
        for (const activeCraftName of this.activeCrafts) {
            if (activeCraftName === craftName) continue;
            
            const activeCraft = this.allCrafts[activeCraftName];
            if (!activeCraft || !activeCraft.requirements) continue;
            
            const sharedMaterials = [];
            Object.keys(craft.requirements).forEach(materialName => {
                if (activeCraft.requirements[materialName]) {
                    sharedMaterials.push(materialName);
                }
            });
            
            if (sharedMaterials.length > 0) {
                related.push({
                    project: activeCraftName,
                    type: this.metadata[activeCraftName]?.type,
                    sharedMaterials,
                    sharedCount: sharedMaterials.length
                });
            }
        }
        
        return related.sort((a, b) => b.sharedCount - a.sharedCount);
    }
    
    /**
     * Update cross-craft dependencies in cache
     */
    updateCrossCraftDependencies(craftName) {
        const connections = this.getCrossCraftConnections(craftName);
        this.crossCraftCache.set(`deps-${craftName}`, {
            connections,
            lastUpdated: Date.now()
        });
    }
    
    /**
     * Clean up cross-craft dependencies when project is removed
     */
    cleanupCrossCraftDependencies(craftName) {
        this.crossCraftCache.delete(`deps-${craftName}`);
        
        // Update localStorage
        const crossMap = this.getStorageItem(this.storageKeys.crossCraftMap, {});
        Object.keys(crossMap).forEach(key => {
            crossMap[key].connections = crossMap[key].connections.filter(
                conn => conn.from !== craftName && conn.to !== craftName
            );
        });
        
        this.setStorageItem(this.storageKeys.crossCraftMap, crossMap);
    }
    
    /**
     * Trigger navigation events for UI updates
     */
    triggerNavigationEvent(type, data) {
        const event = new CustomEvent('craftNavigationEvent', {
            detail: {
                type,
                data,
                timestamp: Date.now(),
                navigator: {
                    currentCraft: this.currentCraft,
                    craftType: this.craftType,
                    activeProjectsCount: this.activeCrafts.size
                }
            }
        });
        
        document.dispatchEvent(event);
    }
    
    /**
     * Enhanced global requirements calculation with localStorage caching
     */
    calculateGlobalRequirements() {
        const cacheKey = `global-reqs-${Array.from(this.activeCrafts).sort().join('-')}`;
        const cached = this.crossCraftCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < 30000) { // 30 second cache
            return cached.requirements;
        }
        
        const globalReqs = {};
        
        for (const craftName of this.activeCrafts) {
            const craft = this.allCrafts[craftName];
            if (!craft) continue;
            
            // Recursively calculate all requirements with enhanced tracking
            this._addRequirementsToGlobal(craft.requirements, globalReqs, 1, craftName);
        }
        
        // Cache the result
        this.crossCraftCache.set(cacheKey, {
            requirements: globalReqs,
            timestamp: Date.now()
        });
        
        return globalReqs;
    }
    
    /**
     * Enhanced helper function to recursively add requirements
     */
    _addRequirementsToGlobal(requirements, globalReqs, multiplier, sourceCraft = null) {
        for (const [reqName, reqData] of Object.entries(requirements)) {
            
            // Handle ship alternatives specially
            if (reqData.type === 'ship_alternatives') {
                // For alternatives, only add the recommended option to global requirements
                const recommendedAlternative = reqData.alternatives.find(alt => alt.isRecommended);
                if (recommendedAlternative) {
                    const altName = recommendedAlternative.name;
                    const quantity = recommendedAlternative.quantity * multiplier;
                    
                    if (!globalReqs[altName]) {
                        globalReqs[altName] = {
                            totalNeeded: 0,
                            type: recommendedAlternative.type,
                            baseName: recommendedAlternative.baseName,
                            usedBy: new Set(),
                            isClickable: recommendedAlternative.isClickable,
                            hasAlternatives: true,
                            alternatives: reqData.alternatives
                        };
                    }
                    
                    globalReqs[altName].totalNeeded += quantity;
                    globalReqs[altName].usedBy.add(sourceCraft || this.currentCraft);
                    
                    // Recursively add requirements for the recommended alternative
                    if (this.allCrafts[altName]) {
                        this._addRequirementsToGlobal(
                            this.allCrafts[altName].requirements,
                            globalReqs,
                            quantity,
                            sourceCraft
                        );
                    }
                }
            } else {
                // Handle regular requirements
                const quantity = reqData.quantity * multiplier;
                
                if (!globalReqs[reqName]) {
                    globalReqs[reqName] = {
                        totalNeeded: 0,
                        type: reqData.type,
                        baseName: reqData.baseName,
                        usedBy: new Set(),
                        isClickable: reqData.isClickable
                    };
                }
                
                globalReqs[reqName].totalNeeded += quantity;
                globalReqs[reqName].usedBy.add(sourceCraft || this.currentCraft);
                
                // If this requirement is also a craft, recursively add its requirements
                if (this.allCrafts[reqName]) {
                    this._addRequirementsToGlobal(
                        this.allCrafts[reqName].requirements,
                        globalReqs,
                        quantity,
                        sourceCraft
                    );
                }
            }
        }
    }
    
    /**
     * Get craft by type
     */
    getCraftsByType(type) {
        switch(type) {
            case 'ships':
                return this.ships;
            case 'ship_parts':
                return this.shipParts;
            case 'materials':
                return this.materials;
            default:
                return {};
        }
    }
    
    /**
     * Search for crafts by name
     */
    searchCrafts(query, type = null) {
        const searchIn = type ? this.getCraftsByType(type) : this.allCrafts;
        const results = [];
        
        const lowerQuery = query.toLowerCase();
        
        for (const [craftName, craftData] of Object.entries(searchIn)) {
            if (craftName.toLowerCase().includes(lowerQuery)) {
                results.push({
                    name: craftName,
                    data: craftData,
                    metadata: this.metadata[craftName],
                    type: this.metadata[craftName]?.type
                });
            }
        }
        
        return results.sort((a, b) => {
            // Sort by name match quality
            const aExact = a.name.toLowerCase() === lowerQuery;
            const bExact = b.name.toLowerCase() === lowerQuery;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            // Then by name length (shorter = better match)
            return a.name.length - b.name.length;
        });
    }
    
    /**
     * Get system statistics
     */
    getSystemStats() {
        return {
            ...this.index.stats,
            activeProjects: this.activeCrafts.size,
            currentCraft: this.currentCraft,
            currentType: this.craftType,
            breadcrumbLength: this.breadcrumb.length
        };
    }
}

// Create a default navigator instance
export const craftNavigator = new CraftNavigator();

// Export utility functions
export function navigateTo(craftName, fromCraft = null) {
    return craftNavigator.navigateTo(craftName, fromCraft);
}

export function getCurrentCraft() {
    return craftNavigator.getCurrentCraft();
}

export function addToActiveProjects(craftName) {
    return craftNavigator.addToActiveProjects(craftName);
}

export function calculateGlobalRequirements() {
    return craftNavigator.calculateGlobalRequirements();
}

export function searchCrafts(query, type = null) {
    return craftNavigator.searchCrafts(query, type);
}