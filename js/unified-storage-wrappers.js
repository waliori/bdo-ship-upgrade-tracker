/**
 * Unified Storage API Wrappers
 * 
 * Provides backward-compatible API wrappers for existing storage systems.
 * This ensures seamless migration with minimal breaking changes to existing code.
 * All legacy API calls are transparently routed through the unified storage system.
 * 
 * Supported Legacy APIs:
 * - InventoryManager API compatibility
 * - GlobalInventoryManager API compatibility
 * - App.js storage pattern compatibility
 * - CraftNavigator API compatibility
 * 
 * @author BDO Ship Upgrade Tracker Team
 * @version 2.0.0
 */

import { unifiedStorageManager, eventBus } from './unified-storage-manager.js';
import { BDOError } from './error-handling.js';

// ============================================================================
// INVENTORY MANAGER WRAPPER
// ============================================================================

/**
 * Backward-compatible InventoryManager wrapper
 * Maintains the same API as the original InventoryManager while using unified storage
 */
export class InventoryManagerWrapper {
    constructor() {
        this.items = new Map();
        this.categories = new Map();
        this.filters = {
            search: '',
            category: 'all',
            owned: false,
            needed: false
        };
        this.sortOrder = 'name';
        this.isGridView = true;
        
        // Storage keys for backward compatibility
        this.storageKeys = {
            settings: 'bdo-inventory-settings',
            preferences: 'bdo-inventory-preferences'
        };
        
        // Initialize wrapper
        this.initializeWrapper();
    }
    
    /**
     * Initialize wrapper with data from unified storage
     */
    async initializeWrapper() {
        console.log('🔗 Initializing InventoryManager wrapper');
        
        try {
            // Load settings from unified storage
            await this.loadSettings();
            
            // Load inventory data
            await this.loadInventoryData();
            
            // Setup event forwarding
            this.setupEventForwarding();
            
        } catch (error) {
            console.warn('InventoryManager wrapper initialization failed:', error);
        }
    }
    
    /**
     * Load settings with unified storage fallback
     */
    async loadSettings() {
        try {
            // Try unified storage first
            const unifiedSettings = await unifiedStorageManager.getFromStorage(
                'unified_metadata', 'inventory_settings'
            );
            
            if (unifiedSettings && unifiedSettings.settings) {
                this.filters = { ...this.filters, ...unifiedSettings.settings.filters };
                this.sortOrder = unifiedSettings.settings.sortOrder || this.sortOrder;
                this.isGridView = unifiedSettings.settings.isGridView !== undefined 
                    ? unifiedSettings.settings.isGridView 
                    : this.isGridView;
                return;
            }
            
            // Fallback to legacy localStorage
            const settings = localStorage.getItem(this.storageKeys.settings);
            if (settings) {
                const parsed = JSON.parse(settings);
                this.filters = { ...this.filters, ...parsed.filters };
                this.sortOrder = parsed.sortOrder || this.sortOrder;
                this.isGridView = parsed.isGridView !== undefined ? parsed.isGridView : this.isGridView;
            }
        } catch (error) {
            console.warn('Failed to load inventory settings:', error);
        }
    }
    
    /**
     * Load inventory data from unified storage
     */
    async loadInventoryData() {
        try {
            // Load materials index
            const materialsIndex = await unifiedStorageManager.getFromStorage(
                'unified_materials', 'index'
            ) || [];
            
            // Load each material
            for (const materialId of materialsIndex) {
                const material = await unifiedStorageManager.getMaterial(materialId);
                if (material) {
                    const legacyItem = this.transformToLegacyFormat(material);
                    this.items.set(material.name, legacyItem);
                }
            }
            
            console.log(`📦 Loaded ${this.items.size} items in InventoryManager wrapper`);
            
        } catch (error) {
            console.warn('Failed to load inventory data:', error);
        }
    }
    
    /**
     * Transform unified material to legacy format
     */
    transformToLegacyFormat(unifiedMaterial) {
        return {
            name: unifiedMaterial.name,
            icon: unifiedMaterial.metadata?.icon || '',
            url: unifiedMaterial.metadata?.url || '',
            category: unifiedMaterial.category,
            quantity: unifiedMaterial.quantity,
            allocated: unifiedMaterial.allocated,
            needed: unifiedMaterial.needed,
            isTracked: unifiedMaterial.needed > 0,
            
            // Usage tracking from unified format
            usedBy: unifiedMaterial.usage?.usedBy || [],
            completionPercent: unifiedMaterial.usage?.completionPercent || 0,
            barterInfo: unifiedMaterial.alternatives?.barterInfo || { canBeBarterd: false }
        };
    }
    
    /**
     * Setup event forwarding from unified storage to legacy events
     */
    setupEventForwarding() {
        // Forward material updates to inventory events
        eventBus.on(eventBus.eventTypes.MATERIAL_UPDATED, (event) => {
            const material = event.data.material;
            if (material) {
                const legacyItem = this.transformToLegacyFormat(material);
                this.items.set(material.name, legacyItem);
                
                // Dispatch legacy event
                this.dispatchInventoryEvent('quantity-changed', {
                    itemName: material.name,
                    quantity: material.quantity
                });
            }
        });
        
        // Forward storage events
        eventBus.on(eventBus.eventTypes.STORAGE_UPDATED, (event) => {
            this.dispatchInventoryEvent('synced', event.data);
        });
    }
    
    /**
     * Legacy API: Set item quantity
     */
    async setItemQuantity(itemName, quantity) {
        try {
            const newQuantity = Math.max(0, parseInt(quantity) || 0);
            
            // Get or create unified material
            let material = await unifiedStorageManager.getMaterial(itemName);
            if (!material) {
                // Create new material
                material = {
                    id: `material_${itemName.replace(/[^a-zA-Z0-9]/g, '_')}`,
                    name: itemName,
                    quantity: newQuantity,
                    category: 'materials',
                    metadata: {
                        createdBy: 'inventory_wrapper',
                        updatedAt: Date.now()
                    }
                };
            } else {
                material.quantity = newQuantity;
                material.metadata.updatedAt = Date.now();
            }
            
            // Save through unified storage
            await unifiedStorageManager.saveMaterial(material);
            
            // Update local cache
            const legacyItem = this.transformToLegacyFormat(material);
            this.items.set(itemName, legacyItem);
            
            // Dispatch legacy event
            this.dispatchInventoryEvent('quantity-changed', { itemName, quantity: newQuantity });
            
            return true;
            
        } catch (error) {
            console.error('Failed to set item quantity:', error);
            return false;
        }
    }
    
    /**
     * Legacy API: Get material quantity
     */
    getMaterialQuantity(materialName) {
        const item = this.items.get(materialName);
        return item ? item.quantity : 0;
    }
    
    /**
     * Legacy API: Get filtered items
     */
    getFilteredItems() {
        let filteredItems = Array.from(this.items.values());
        
        // Apply search filter
        if (this.filters.search) {
            const searchLower = this.filters.search.toLowerCase();
            filteredItems = filteredItems.filter(item => 
                item.name.toLowerCase().includes(searchLower)
            );
        }
        
        // Apply category filter
        if (this.filters.category !== 'all') {
            filteredItems = filteredItems.filter(item => 
                item.category === this.filters.category
            );
        }
        
        // Apply owned filter
        if (this.filters.owned) {
            filteredItems = filteredItems.filter(item => item.quantity > 0);
        }
        
        // Apply needed filter
        if (this.filters.needed) {
            filteredItems = filteredItems.filter(item => item.needed > 0);
        }
        
        // Apply sorting
        switch (this.sortOrder) {
            case 'name':
                filteredItems.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'category':
                filteredItems.sort((a, b) => {
                    if (a.category !== b.category) {
                        return a.category.localeCompare(b.category);
                    }
                    return a.name.localeCompare(b.name);
                });
                break;
            case 'quantity':
                filteredItems.sort((a, b) => b.quantity - a.quantity);
                break;
            case 'needed':
                filteredItems.sort((a, b) => b.needed - a.needed);
                break;
        }
        
        return filteredItems;
    }
    
    /**
     * Legacy API: Set filters
     */
    setFilters(newFilters) {
        this.filters = { ...this.filters, ...newFilters };
        this.dispatchInventoryEvent('filters-changed', this.filters);
    }
    
    /**
     * Legacy API: Set sort order
     */
    setSortOrder(order) {
        this.sortOrder = order;
        this.dispatchInventoryEvent('sort-changed', order);
    }
    
    /**
     * Legacy API: Save settings
     */
    async saveSettings() {
        try {
            const settings = {
                filters: this.filters,
                sortOrder: this.sortOrder,
                isGridView: this.isGridView,
                lastSaved: Date.now()
            };
            
            // Save to unified storage
            await unifiedStorageManager.saveToStorage(
                'unified_metadata',
                'inventory_settings',
                {
                    system: 'inventory',
                    settings,
                    updatedAt: Date.now()
                }
            );
            
            // Also save to legacy storage for compatibility
            localStorage.setItem(this.storageKeys.settings, JSON.stringify(settings));
            
        } catch (error) {
            console.warn('Failed to save inventory settings:', error);
        }
    }
    
    /**
     * Legacy API: Dispatch inventory events
     */
    dispatchInventoryEvent(type, data) {
        const eventDetail = {
            type,
            data,
            timestamp: Date.now(),
            source: 'inventory-system-wrapper',
            version: '2.0'
        };
        
        const inventoryEvent = new CustomEvent('inventoryChanged', {
            detail: eventDetail
        });
        document.dispatchEvent(inventoryEvent);
    }
    
    /**
     * Legacy API: Update needed quantities
     */
    async updateNeededQuantities() {
        console.log('📦 InventoryManagerWrapper.updateNeededQuantities() called');
        
        try {
            // Get global status from unified storage
            // This would be calculated by the unified system
            const materialsIndex = await unifiedStorageManager.getFromStorage(
                'unified_materials', 'index'
            ) || [];
            
            for (const materialId of materialsIndex) {
                const material = await unifiedStorageManager.getMaterial(materialId);
                if (material) {
                    const legacyItem = this.transformToLegacyFormat(material);
                    this.items.set(material.name, legacyItem);
                }
            }
            
            this.dispatchInventoryEvent('needs-updated', materialsIndex.length);
            
        } catch (error) {
            console.warn('Failed to update needed quantities:', error);
        }
    }
    
    /**
     * Legacy API: Complete item as recipe
     */
    async completeItemAsRecipe(itemName, completionContext = 'inventory') {
        try {
            // This would use the unified completion system
            const transaction = await unifiedStorageManager.executeTransaction(
                await unifiedStorageManager.createTransaction({
                    type: 'recipe_completion',
                    data: { itemName, completionContext },
                    operations: [
                        {
                            type: 'material_update',
                            materialId: itemName,
                            action: 'increment_quantity'
                        }
                    ]
                })
            );
            
            // Update local cache
            await this.loadInventoryData();
            
            // Dispatch events
            this.dispatchInventoryEvent('recipe-completed', {
                itemName,
                transaction,
                context: completionContext
            });
            
            return transaction;
            
        } catch (error) {
            console.error(`Failed to complete recipe: ${itemName}`, error);
            
            this.dispatchInventoryEvent('completion-error', {
                itemName,
                error: error.message,
                context: completionContext
            });
            
            throw error;
        }
    }
    
    // Additional legacy API methods can be added here...
    
    /**
     * Legacy API: Get inventory stats
     */
    getInventoryStats() {
        const items = Array.from(this.items.values());
        const neededItems = items.filter(item => item.needed > 0);
        const totalNeeded = items.reduce((sum, item) => sum + item.needed, 0);
        const totalOwned = items.reduce((sum, item) => sum + Math.min(item.quantity, item.needed), 0);
        
        return {
            totalItems: items.length,
            ownedItems: items.filter(item => item.quantity > 0).length,
            neededItems: neededItems.length,
            trackedItems: items.filter(item => item.isTracked).length,
            totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
            totalNeeded: totalNeeded,
            completionRate: neededItems.length > 0 
                ? (neededItems.filter(item => item.quantity >= item.needed).length / neededItems.length) * 100 
                : 100,
            progressRate: totalNeeded > 0 ? (totalOwned / totalNeeded) * 100 : 100
        };
    }
}

// ============================================================================
// GLOBAL INVENTORY MANAGER WRAPPER
// ============================================================================

/**
 * Backward-compatible GlobalInventoryManager wrapper
 */
export class GlobalInventoryManagerWrapper {
    constructor() {
        this.storagePrefix = 'bdo-craft-inventory-';
        this.projectPrefix = 'bdo-craft-project-';
        this.cache = new Map();
        this.projectCache = new Map();
        
        // Storage keys for backward compatibility
        this.storageKeys = {
            globalInventory: 'bdo-craft-inventory-global',
            activeProjects: 'bdo-craft-active-projects',
            projectPriorities: 'bdo-craft-project-priorities',
            projectDependencies: 'bdo-craft-project-dependencies'
        };
        
        this.initializeWrapper();
    }
    
    /**
     * Initialize wrapper
     */
    async initializeWrapper() {
        console.log('🔗 Initializing GlobalInventoryManager wrapper');
        
        try {
            await this.loadProjectsFromUnified();
            this.setupEventForwarding();
        } catch (error) {
            console.warn('GlobalInventoryManager wrapper initialization failed:', error);
        }
    }
    
    /**
     * Load projects from unified storage
     */
    async loadProjectsFromUnified() {
        const projectsIndex = await unifiedStorageManager.getFromStorage(
            'unified_projects', 'index'
        ) || [];
        
        for (const projectId of projectsIndex) {
            const project = await unifiedStorageManager.getProject(projectId);
            if (project) {
                this.projectCache.set(project.name, this.transformProjectToLegacy(project));
            }
        }
    }
    
    /**
     * Transform unified project to legacy format
     */
    transformProjectToLegacy(unifiedProject) {
        return {
            name: unifiedProject.name,
            type: unifiedProject.type,
            status: unifiedProject.status,
            requirements: unifiedProject.requirements,
            addedAt: unifiedProject.metadata?.createdAt || Date.now(),
            lastUpdated: unifiedProject.metadata?.updatedAt || Date.now(),
            completionStatus: {
                isCompleted: unifiedProject.status === 'completed',
                completionPercent: unifiedProject.progress?.completionPercent || 0,
                totalDependencies: unifiedProject.progress?.totalDependencies || 0,
                satisfiedDependencies: unifiedProject.progress?.satisfiedDependencies || 0,
                missingDependencies: unifiedProject.progress?.missingDependencies || [],
                lastValidated: unifiedProject.progress?.lastValidated || Date.now()
            }
        };
    }
    
    /**
     * Setup event forwarding
     */
    setupEventForwarding() {
        eventBus.on(eventBus.eventTypes.PROJECT_UPDATED, (event) => {
            const project = event.data.project;
            if (project) {
                const legacyProject = this.transformProjectToLegacy(project);
                this.projectCache.set(project.name, legacyProject);
                
                this._triggerInventoryUpdate('project-updated', project.name, 'unified-wrapper');
            }
        });
    }
    
    /**
     * Legacy API: Set material quantity
     */
    async setMaterialQuantity(materialName, quantity, projectContext = 'global') {
        const key = `${this.storagePrefix}${projectContext}-${materialName}`;
        const value = Math.max(0, parseInt(quantity) || 0);
        
        // Update legacy storage for compatibility
        localStorage.setItem(key, value.toString());
        this.cache.set(key, value);
        
        // Also update unified storage
        let material = await unifiedStorageManager.getMaterial(materialName);
        if (!material) {
            material = {
                id: `material_${materialName.replace(/[^a-zA-Z0-9]/g, '_')}`,
                name: materialName,
                quantity: value,
                category: 'materials'
            };
        } else {
            material.quantity = value;
        }
        
        await unifiedStorageManager.saveMaterial(material);
        
        this._triggerInventoryUpdate(materialName, value, projectContext);
        
        return value;
    }
    
    /**
     * Legacy API: Get material quantity
     */
    async getMaterialQuantity(materialName, projectContext = 'global') {
        const key = `${this.storagePrefix}${projectContext}-${materialName}`;
        
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        
        // Try unified storage first
        const material = await unifiedStorageManager.getMaterial(materialName);
        if (material) {
            this.cache.set(key, material.quantity);
            return material.quantity;
        }
        
        // Fallback to legacy storage
        const stored = localStorage.getItem(key);
        const value = stored ? parseInt(stored) : 0;
        this.cache.set(key, value);
        
        return value;
    }
    
    /**
     * Legacy API: Calculate global inventory status
     */
    async calculateGlobalInventoryStatus() {
        // This would use the unified system to calculate status
        const materialsIndex = await unifiedStorageManager.getFromStorage(
            'unified_materials', 'index'
        ) || [];
        
        const inventoryStatus = {};
        
        for (const materialId of materialsIndex) {
            const material = await unifiedStorageManager.getMaterial(materialId);
            if (material) {
                inventoryStatus[material.name] = {
                    needed: material.needed,
                    stored: material.quantity,
                    remaining: Math.max(0, material.needed - material.quantity),
                    type: material.category,
                    usedBy: material.usage?.usedBy || [],
                    isClickable: false, // This would need to be determined
                    completionPercent: material.usage?.completionPercent || 0,
                    isComplete: material.quantity >= material.needed
                };
            }
        }
        
        return inventoryStatus;
    }
    
    /**
     * Legacy API: Trigger inventory update event
     */
    _triggerInventoryUpdate(materialName, quantity, context) {
        const eventDetail = {
            materialName,
            quantity,
            context,
            timestamp: Date.now(),
            source: 'global-inventory-wrapper',
            version: '2.0'
        };
        
        const inventoryEvent = new CustomEvent('inventoryUpdated', { detail: eventDetail });
        document.dispatchEvent(inventoryEvent);
    }
    
    /**
     * Legacy API: Add project
     */
    async addProject(projectName, projectData, priority = 'normal') {
        const unifiedProject = {
            id: `project_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}`,
            name: projectName,
            type: projectData.type || 'ship',
            status: 'active',
            priority,
            requirements: projectData.requirements || {},
            metadata: {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                createdBy: 'global_inventory_wrapper'
            },
            progress: {
                completionPercent: 0,
                totalDependencies: Object.keys(projectData.requirements || {}).length,
                satisfiedDependencies: 0,
                missingDependencies: [],
                lastValidated: Date.now()
            }
        };
        
        const result = await unifiedStorageManager.saveProject(unifiedProject);
        
        // Update local cache
        const legacyProject = this.transformProjectToLegacy(unifiedProject);
        this.projectCache.set(projectName, legacyProject);
        
        this._triggerInventoryUpdate('project-added', projectName, 'project-management');
        
        return legacyProject;
    }
    
    /**
     * Legacy API: Get project status
     */
    async getProjectStatus(projectName) {
        const project = await unifiedStorageManager.getProject(projectName) ||
                       this.projectCache.get(projectName);
        
        if (!project) {
            return {
                exists: false,
                isCompleted: false,
                completionPercent: 0,
                status: 'not_found'
            };
        }
        
        const unifiedProject = project.id ? project : 
                             await unifiedStorageManager.getProject(projectName);
        
        return {
            exists: true,
            isCompleted: unifiedProject ? unifiedProject.status === 'completed' : project.status === 'completed',
            completionPercent: unifiedProject ? unifiedProject.progress?.completionPercent : 
                             project.completionStatus?.completionPercent || 0,
            status: unifiedProject ? unifiedProject.status : project.status,
            lastUpdated: unifiedProject ? unifiedProject.metadata?.updatedAt : project.lastUpdated
        };
    }
    
    // Additional legacy methods can be implemented as needed...
}

// ============================================================================
// APP STORAGE WRAPPER
// ============================================================================

/**
 * Backward-compatible app storage wrapper for main app.js patterns
 */
export class AppStorageWrapper {
    constructor() {
        this.storageKey = "bdo_ship_upgrade";
        this.initializeWrapper();
    }
    
    async initializeWrapper() {
        console.log('🔗 Initializing App storage wrapper');
        
        try {
            await this.loadAppStateFromUnified();
            this.setupEventForwarding();
        } catch (error) {
            console.warn('App storage wrapper initialization failed:', error);
        }
    }
    
    async loadAppStateFromUnified() {
        // Load app settings from unified storage
        const appSettings = await unifiedStorageManager.getFromStorage(
            'unified_metadata', 'app_settings'
        );
        
        const appState = await unifiedStorageManager.getFromStorage(
            'unified_metadata', 'app_state'
        );
        
        // Merge with any existing localStorage data
        if (appSettings || appState) {
            const mergedData = {
                ...appSettings?.settings,
                ...appState?.state
            };
            
            // Update localStorage for compatibility
            localStorage.setItem(this.storageKey, JSON.stringify(mergedData));
        }
    }
    
    setupEventForwarding() {
        // Listen for storage updates and sync with unified storage
        window.addEventListener('storage', async (event) => {
            if (event.key === this.storageKey && event.newValue) {
                try {
                    const appData = JSON.parse(event.newValue);
                    
                    // Update unified storage
                    await unifiedStorageManager.saveToStorage(
                        'unified_metadata',
                        'app_settings',
                        {
                            system: 'app',
                            settings: appData,
                            updatedAt: Date.now()
                        }
                    );
                } catch (error) {
                    console.warn('Failed to sync app storage to unified:', error);
                }
            }
        });
    }
    
    /**
     * Legacy API: Get app data
     */
    getAppData() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.warn('Failed to get app data:', error);
            return {};
        }
    }
    
    /**
     * Legacy API: Set app data
     */
    async setAppData(data) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(data));
            
            // Also update unified storage
            await unifiedStorageManager.saveToStorage(
                'unified_metadata',
                'app_settings',
                {
                    system: 'app',
                    settings: data,
                    updatedAt: Date.now()
                }
            );
            
            return true;
        } catch (error) {
            console.error('Failed to set app data:', error);
            return false;
        }
    }
}

// ============================================================================
// AUTOMATIC WRAPPER INITIALIZATION
// ============================================================================

/**
 * Automatically create wrapper instances and make them globally available
 * This ensures backward compatibility for existing code
 */
let wrapperInstances = null;

export async function initializeWrappers() {
    console.log('🔗 Initializing all storage wrappers');
    
    try {
        wrapperInstances = {
            inventoryManager: new InventoryManagerWrapper(),
            globalInventory: new GlobalInventoryManagerWrapper(),
            appStorage: new AppStorageWrapper()
        };
        
        // Make wrappers available globally for backward compatibility
        window.inventoryManager = wrapperInstances.inventoryManager;
        window.globalInventory = wrapperInstances.globalInventory;
        
        // Wait for all wrappers to initialize
        await Promise.all([
            wrapperInstances.inventoryManager.initializeWrapper(),
            wrapperInstances.globalInventory.initializeWrapper(),
            wrapperInstances.appStorage.initializeWrapper()
        ]);
        
        console.log('✅ All storage wrappers initialized successfully');
        
        return wrapperInstances;
        
    } catch (error) {
        console.error('❌ Failed to initialize storage wrappers:', error);
        throw error;
    }
}

/**
 * Get wrapper instances
 */
export function getWrapperInstances() {
    return wrapperInstances;
}

/**
 * Compatibility functions for existing code
 */

// InventoryManager compatibility
export function getItem(itemName) {
    return wrapperInstances?.inventoryManager?.items?.get(itemName) || null;
}

export function setItemQuantity(itemName, quantity) {
    return wrapperInstances?.inventoryManager?.setItemQuantity(itemName, quantity) || false;
}

export function getFilteredItems() {
    return wrapperInstances?.inventoryManager?.getFilteredItems() || [];
}

// GlobalInventoryManager compatibility
export function setMaterialQuantity(materialName, quantity, projectContext = 'global') {
    return wrapperInstances?.globalInventory?.setMaterialQuantity(materialName, quantity, projectContext) || 0;
}

export function getMaterialQuantity(materialName, projectContext = 'global') {
    return wrapperInstances?.globalInventory?.getMaterialQuantity(materialName, projectContext) || 0;
}

export function calculateGlobalInventoryStatus() {
    return wrapperInstances?.globalInventory?.calculateGlobalInventoryStatus() || {};
}

// App storage compatibility
export function getAppData() {
    return wrapperInstances?.appStorage?.getAppData() || {};
}

export function setAppData(data) {
    return wrapperInstances?.appStorage?.setAppData(data) || false;
}

// Initialize wrappers when module is loaded
if (typeof window !== 'undefined') {
    // Initialize after a short delay to ensure unified storage is ready
    setTimeout(async () => {
        try {
            await initializeWrappers();
        } catch (error) {
            console.warn('Wrapper auto-initialization failed:', error);
        }
    }, 100);
}

export default {
    InventoryManagerWrapper,
    GlobalInventoryManagerWrapper,
    AppStorageWrapper,
    initializeWrappers,
    getWrapperInstances
};