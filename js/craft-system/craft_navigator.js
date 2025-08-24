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
        
        // Initialize completion tracking state
        this.initializeCompletionState();
        
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
     * Enhanced add to active projects with localStorage and auto-dependency management
     */
    addToActiveProjects(craftName, projectData = {}, options = {}) {
        const { 
            skipDuplicateCheck = false, 
            skipAutoDependencies = false,
            isAutoDependency = false
        } = options;
        
        if (!this.allCrafts[craftName]) {
            throw new Error(`Cannot add unknown craft to projects: ${craftName}`);
        }
        
        // Check if already in active projects (prevent duplicates)
        if (!skipDuplicateCheck && this.activeCrafts.has(craftName)) {
            console.log(`Project ${craftName} is already active`);
            return null; // Already exists
        }
        
        this.activeCrafts.add(craftName);
        
        // Create enhanced project entry
        const project = {
            name: craftName,
            type: this.metadata[craftName]?.type,
            addedAt: Date.now(),
            requirements: this.allCrafts[craftName].requirements || {},
            metadata: this.metadata[craftName],
            isAutoDependency: isAutoDependency,
            ...projectData
        };
        
        // Auto-add recipe dependencies with 0 quantities
        if (!skipAutoDependencies) {
            this.autoAddRecipeDependencies(craftName);
        }
        
        // Update cross-craft dependencies
        this.updateCrossCraftDependencies(craftName);
        
        // Save to localStorage
        this.saveNavigationState();
        
        // Trigger event
        this.triggerNavigationEvent('project-added', {
            project: craftName,
            data: project,
            isAutoDependency: isAutoDependency
        });
        
        return project;
    }
    
    /**
     * Check if a recipe is part of a linear crafting chain (A → B → C)
     * In linear chains, we should not auto-add intermediate steps as separate projects
     */
    isPartOfLinearCraftingChain(dependencyName, parentName) {
        // Check if the dependency is a direct linear progression to the parent
        // A linear chain means: dependency makes parent, and nothing else significant
        
        const parentCraft = this.allCrafts[parentName];
        const dependencyCraft = this.allCrafts[dependencyName];
        
        if (!parentCraft || !dependencyCraft) return false;
        
        // Check if this is a typical ship progression chain
        const shipProgressions = [
            ['Bartali Sailboat', 'Epheria Sailboat', 'Epheria Caravel', 'Carrack (Advance)'],
            ['Bartali Sailboat', 'Epheria Frigate', 'Epheria Galleass', 'Carrack (Volante)'],
            ['Bartali Sailboat', 'Epheria Frigate', 'Epheria Galleass', 'Carrack (Valor)']
        ];
        
        // Check if both recipes are in the same progression chain
        for (const chain of shipProgressions) {
            const parentIndex = chain.indexOf(parentName);
            const dependencyIndex = chain.indexOf(dependencyName);
            
            if (parentIndex !== -1 && dependencyIndex !== -1) {
                // If dependency comes right before parent in chain, it's part of linear progression
                if (dependencyIndex === parentIndex - 1) {
                    console.log(`🔗 Detected linear progression: ${dependencyName} → ${parentName}`);
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Auto-add recipe dependencies that have 0 quantities
     */
    autoAddRecipeDependencies(craftName) {
        const craft = this.allCrafts[craftName];
        if (!craft || !craft.requirements) return;
        
        const recipeDependencies = [];
        
        Object.entries(craft.requirements).forEach(([materialName, reqData]) => {
            // Check if this material is itself a recipe (exists in allCrafts)
            if (this.allCrafts[materialName]) {
                try {
                    // Try to access globalInventory directly (it should be available)
                    // Import globalInventory to check quantities
                    import('./global_inventory.js').then(({ globalInventory }) => {
                        const storedQuantity = globalInventory.getMaterialQuantity(materialName, 'global');
                        
                        // If stored quantity is 0 AND not already in active projects, auto-add as dependency project
                        if (storedQuantity === 0 && !this.activeCrafts.has(materialName)) {
                            // Check if this dependency is part of a linear crafting chain
                            const isPartOfCraftingChain = this.isPartOfLinearCraftingChain(materialName, craftName);
                            
                            if (!isPartOfCraftingChain) {
                                console.log(`Auto-adding recipe dependency: ${materialName} (0 quantity, not already active, not part of chain)`);
                                this.addToActiveProjects(materialName, {
                                    addedReason: `Auto-dependency for ${craftName}`,
                                    parentProject: craftName
                                }, {
                                    skipDuplicateCheck: false, // Still check for duplicates
                                    skipAutoDependencies: false, // Allow recursive dependencies
                                    isAutoDependency: true
                                });
                                recipeDependencies.push(materialName);
                            } else {
                                console.log(`🔗 Skipping auto-add of ${materialName} - part of linear crafting chain from ${craftName}`);
                            }
                        } else if (this.activeCrafts.has(materialName)) {
                            console.log(`🔄 Skipping auto-add of ${materialName} - already in active projects`);
                        }
                    }).catch(err => {
                        console.warn('Could not load globalInventory for dependency check:', err);
                        
                        // Fallback: assume 0 quantity and auto-add (better to over-add than miss dependencies)
                        // But still check if already in active projects to avoid duplicates
                        if (!this.activeCrafts.has(materialName)) {
                            console.log(`Auto-adding recipe dependency: ${materialName} (fallback - assuming 0 quantity, not already active)`);
                            this.addToActiveProjects(materialName, {
                                addedReason: `Auto-dependency for ${craftName} (fallback)`,
                                parentProject: craftName
                            }, {
                                skipDuplicateCheck: false,
                                skipAutoDependencies: false,
                                isAutoDependency: true
                            });
                            recipeDependencies.push(materialName);
                        } else {
                            console.log(`🔄 Skipping fallback auto-add of ${materialName} - already in active projects`);
                        }
                    });
                } catch (error) {
                    console.warn('Error in autoAddRecipeDependencies:', error);
                }
            }
        });
        
        return recipeDependencies;
    }
    
    /**
     * Check if a craft can be added to projects (for button state management)
     */
    canAddToProjects(craftName, options = {}) {
        if (!this.allCrafts[craftName]) {
            return { canAdd: false, reason: 'Unknown craft' };
        }
        
        // Check if already in active projects
        if (this.activeCrafts.has(craftName)) {
            return { canAdd: false, reason: 'Already in projects' };
        }
        
        // All recipes can be added as projects - no restrictions!
        // The auto-dependency addition happens when adding, not as a restriction
        return { canAdd: true };
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
     * Enhanced global requirements calculation with localStorage caching and completion tracking
     */
    calculateGlobalRequirements() {
        // Get completed projects to exclude from calculations
        const completedProjects = this.getCompletedProjects();
        const activeCraftsArray = Array.from(this.activeCrafts).filter(craftName => 
            !completedProjects.includes(craftName)
        );
        
        const cacheKey = `global-reqs-${activeCraftsArray.sort().join('-')}-completed-${completedProjects.length}`;
        const cached = this.crossCraftCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < 30000) { // 30 second cache
            return cached.requirements;
        }
        
        console.log(`🔄 Calculating global requirements for ${activeCraftsArray.length} active projects (excluding ${completedProjects.length} completed)`);
        
        const globalReqs = {};
        
        for (const craftName of activeCraftsArray) {
            const craft = this.allCrafts[craftName];
            if (!craft) continue;
            
            // Check if this specific craft is completed
            if (this.isProjectCompleted(craftName)) {
                console.log(`⏭️ Skipping completed project: ${craftName}`);
                continue;
            }
            
            // Recursively calculate all requirements with enhanced tracking
            this._addRequirementsToGlobal(craft.requirements, globalReqs, 1, craftName, completedProjects);
        }
        
        // Cache the result
        this.crossCraftCache.set(cacheKey, {
            requirements: globalReqs,
            timestamp: Date.now()
        });
        
        return globalReqs;
    }
    
    /**
     * Enhanced helper function to recursively add requirements with completion tracking
     */
    _addRequirementsToGlobal(requirements, globalReqs, multiplier, sourceCraft = null, completedProjects = []) {
        for (const [reqName, reqData] of Object.entries(requirements)) {
            
            // Handle ship alternatives specially
            if (reqData.type === 'ship_alternatives') {
                // For alternatives, only add the recommended option to global requirements
                const recommendedAlternative = reqData.alternatives.find(alt => alt.isRecommended);
                if (recommendedAlternative) {
                    const altName = recommendedAlternative.name;
                    
                    // Skip if this alternative recipe is completed
                    if (completedProjects.includes(altName) || this.isProjectCompleted(altName)) {
                        console.log(`⏭️ Skipping completed alternative: ${altName}`);
                        continue;
                    }
                    
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
                            sourceCraft,
                            completedProjects
                        );
                    }
                }
            } else {
                // Handle regular requirements
                const quantity = reqData.quantity * multiplier;
                
                // If this is a recipe (isClickable) and it's completed, skip adding its requirements
                if (reqData.isClickable && (completedProjects.includes(reqName) || this.isProjectCompleted(reqName))) {
                    console.log(`⏭️ Skipping completed recipe: ${reqName}`);
                    continue;
                }
                
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
                
                // If this requirement is also a craft and not completed AND not already an active project, 
                // recursively add its requirements
                const isActiveProject = this.activeCrafts.has(reqName);
                const shouldRecurse = this.allCrafts[reqName] && !this.isProjectCompleted(reqName) && !isActiveProject;
                
                if (shouldRecurse) {
                    console.log(`🔄 Recursing into ${reqName} requirements (not an active project)`);
                    this._addRequirementsToGlobal(
                        this.allCrafts[reqName].requirements,
                        globalReqs,
                        quantity,
                        sourceCraft,
                        completedProjects
                    );
                } else if (isActiveProject) {
                    console.log(`⏭️ Skipping recursion into ${reqName} - already an active project, its requirements are tracked separately`);
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
    
    // ============================================================================
    // COMPLETION TRACKING METHODS
    // ============================================================================
    
    /**
     * Mark a project as completed in the navigator state
     */
    markProjectComplete(craftName) {
        console.log(`🎯 CraftNavigator: Marking project complete: ${craftName}`);
        
        try {
            // Update local active crafts state (keep it in the set for reference)
            // but mark it as completed in our internal state
            if (!this.completedProjects) {
                this.completedProjects = new Set();
            }
            
            this.completedProjects.add(craftName);
            
            // Update localStorage state
            const navigationState = this.getStorageItem(this.storageKeys.navigationState, {});
            if (!navigationState.completedProjects) {
                navigationState.completedProjects = [];
            }
            
            if (!navigationState.completedProjects.includes(craftName)) {
                navigationState.completedProjects.push(craftName);
            }
            
            navigationState.lastCompletionUpdate = Date.now();
            this.setStorageItem(this.storageKeys.navigationState, navigationState);
            
            console.log(`✅ CraftNavigator: Project marked as completed: ${craftName}`);
            return true;
            
        } catch (error) {
            console.error(`❌ CraftNavigator: Failed to mark project complete: ${craftName}`, error);
            return false;
        }
    }
    
    /**
     * Check if a project is completed in navigator state
     */
    isProjectCompleted(craftName) {
        if (this.completedProjects && this.completedProjects.has(craftName)) {
            return true;
        }
        
        // Check localStorage state
        const navigationState = this.getStorageItem(this.storageKeys.navigationState, {});
        return navigationState.completedProjects && navigationState.completedProjects.includes(craftName);
    }
    
    /**
     * Mark a project as uncompleted (remove from completed state)
     */
    markProjectUncompleted(craftName) {
        console.log(`🔄 CraftNavigator: Marking project uncompleted: ${craftName}`);
        
        try {
            // Update local state
            if (this.completedProjects) {
                this.completedProjects.delete(craftName);
            }
            
            // Update localStorage state
            const navigationState = this.getStorageItem(this.storageKeys.navigationState, {});
            if (navigationState.completedProjects) {
                navigationState.completedProjects = navigationState.completedProjects.filter(name => name !== craftName);
                navigationState.lastCompletionUpdate = Date.now();
                this.setStorageItem(this.storageKeys.navigationState, navigationState);
            }
            
            console.log(`✅ CraftNavigator: Project marked as uncompleted: ${craftName}`);
            return true;
            
        } catch (error) {
            console.error(`❌ CraftNavigator: Failed to mark project uncompleted: ${craftName}`, error);
            return false;
        }
    }
    
    /**
     * Get all completed projects
     */
    getCompletedProjects() {
        const navigationState = this.getStorageItem(this.storageKeys.navigationState, {});
        return navigationState.completedProjects || [];
    }
    
    /**
     * Enhanced localStorage get with JSON parsing (for completion tracking)
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
     * Enhanced localStorage set with JSON stringification (for completion tracking)
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
     * Initialize completion state from localStorage
     */
    initializeCompletionState() {
        try {
            const navigationState = this.getStorageItem(this.storageKeys.navigationState, {});
            if (navigationState.completedProjects) {
                this.completedProjects = new Set(navigationState.completedProjects);
                console.log(`📦 CraftNavigator: Loaded ${navigationState.completedProjects.length} completed projects from storage`);
            } else {
                this.completedProjects = new Set();
            }
        } catch (error) {
            console.warn('Failed to initialize completion state:', error);
            this.completedProjects = new Set();
        }
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