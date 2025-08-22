// BDO Ship Upgrade Tracker - Global Inventory System
// Advanced inventory management with categorization and grid-based UI

import { globalInventory } from './craft-system/global_inventory.js';

/**
 * Item Categories Configuration
 */
export const ITEM_CATEGORIES = {
    ships: {
        name: 'Ships',
        icon: '⛵',
        description: 'Actual ship types and variants',
        color: '#3b82f6',
        patterns: ['ship_', 'mount/']
    },
    ship_parts: {
        name: 'Ship Parts',
        icon: '⚙️',
        description: 'Equipment and upgrade components for ships',
        color: '#8b5cf6',
        patterns: [': ', 'Ship Upgrade Permit']
    },
    materials: {
        name: 'Materials',
        icon: '🔨',
        description: 'Raw materials and processed goods for crafting',
        color: '#10b981',
        patterns: ['Ingot', 'Plywood', 'Fabric', 'Timber', 'Sap', 'for Upgrade']
    },
    barter_items: {
        name: 'Barter Items',
        icon: '💰',
        description: 'Items used in the bartering system',
        color: '#f59e0b',
        patterns: ['00800']
    },
    special: {
        name: 'Special',
        icon: '💎',
        description: 'Currencies, enhancement stones, and special materials',
        color: '#eab308',
        patterns: ['Gold Bar', 'Black Stone', 'Reform Stone', 'Blueprint:']
    }
};

/**
 * Items to exclude from inventory (non-physical items)
 */
export const EXCLUDED_ITEMS = {
    // NPCs and Characters
    npcs: ['ic_', 'npc/'],
    
    // Quests and Activities
    quests: ['Daily:', 'Weekly:', 'quest/'],
    
    // Sea Monsters (creatures, not materials)
    monsters: [
        'Black Rust', 'Young Black Rust',
        'Candidum', 'Young Candidum', 
        'Hekaru', 'Young Hekaru',
        'Nineshark', 'Young Nineshark',
        'Ocean Stalker', 'Young Ocean Stalker',
        'Cox Pirates\' Shadow Ghost',
        'Falasi', 'Hollow Maretta', 'Proix',
        'Goldmont Small Battleship', 'Goldmont Medium Battleship', 'Goldmont Large Battleship',
        'Suspicious Cargo Ship', 'Storage Keeper'
    ],
    
    // Quest-specific items
    questItems: [
        'Ravinia\'s Wiggly-Waggly Letter'
    ],
    
    // Non-physical entities
    entities: [
        'Central Market', 'Storage Keeper'
    ]
};

/**
 * Advanced Inventory Manager Class
 */
export class InventoryManager {
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
        
        // Storage keys
        this.storageKeys = {
            settings: 'bdo-inventory-settings',
            preferences: 'bdo-inventory-preferences'
        };
        
        this.loadSettings();
        this.initializeFromIconMapping();
        this.setupEventListeners();
        this.setupAutoSave();
    }
    
    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
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
     * Reset filters to default state
     */
    resetFilters() {
        this.filters = {
            search: '',
            category: 'all',
            owned: false,
            needed: false
        };
        console.log('🔄 Filters reset to defaults');
    }
    
    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            const settings = {
                filters: this.filters,
                sortOrder: this.sortOrder,
                isGridView: this.isGridView,
                lastSaved: Date.now()
            };
            localStorage.setItem(this.storageKeys.settings, JSON.stringify(settings));
        } catch (error) {
            console.warn('Failed to save inventory settings:', error);
        }
    }
    
    /**
     * Setup auto-save for settings
     */
    setupAutoSave() {
        // Save settings when they change
        let saveTimeout;
        const debouncedSave = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => this.saveSettings(), 1000);
        };
        
        // Listen for setting changes
        document.addEventListener('inventoryChanged', (event) => {
            const { type } = event.detail;
            if (['filters-changed', 'sort-changed', 'view-changed'].includes(type)) {
                debouncedSave();
            }
        });
    }
    
    /**
     * Initialize items from icon_mapping.json
     */
    async initializeFromIconMapping() {
        try {
            console.log('🔄 Loading icon mapping data...');
            const response = await fetch('./icon_mapping.json');
            
            if (!response.ok) {
                throw new Error(`Failed to fetch icon_mapping.json: ${response.status} ${response.statusText}`);
            }
            
            const iconMapping = await response.json();
            console.log(`📦 Loaded ${Object.keys(iconMapping).length} items from icon mapping`);
            
            // Process each item and categorize it (excluding non-inventory items)
            let excludedCount = 0;
            Object.entries(iconMapping).forEach(([itemName, itemData]) => {
                // Skip non-inventory items
                if (this.shouldExcludeItem(itemName, itemData)) {
                    excludedCount++;
                    return;
                }
                
                const category = this.categorizeItem(itemName, itemData);
                const item = {
                    name: itemName,
                    icon: itemData.icon,
                    url: itemData.url,
                    category: category,
                    quantity: globalInventory.getMaterialQuantity(itemName),
                    allocated: 0,
                    needed: 0,
                    isTracked: false
                };
                
                this.items.set(itemName, item);
                
                // Update category count
                if (!this.categories.has(category)) {
                    this.categories.set(category, {
                        ...ITEM_CATEGORIES[category],
                        count: 0,
                        items: []
                    });
                }
                
                const categoryData = this.categories.get(category);
                categoryData.count++;
                categoryData.items.push(itemName);
            });
            
            console.log(`📦 Inventory initialized with ${this.items.size} items across ${this.categories.size} categories`);
            console.log(`🚫 Excluded ${excludedCount} non-inventory items (quests, NPCs, monsters)`);
            this.updateNeededQuantities();
            
        } catch (error) {
            console.error('Failed to initialize inventory from icon mapping:', error);
        }
    }
    
    /**
     * Check if an item should be excluded from inventory
     */
    shouldExcludeItem(itemName, itemData) {
        const icon = itemData.icon;
        const url = itemData.url;
        
        // Check NPCs (icon patterns)
        for (const pattern of EXCLUDED_ITEMS.npcs) {
            if (icon.includes(pattern) || url.includes(pattern)) {
                return true;
            }
        }
        
        // Check quests (name patterns)
        for (const pattern of EXCLUDED_ITEMS.quests) {
            if (itemName.includes(pattern)) {
                return true;
            }
        }
        
        // Check specific monster names
        for (const monsterName of EXCLUDED_ITEMS.monsters) {
            if (itemName === monsterName) {
                return true;
            }
        }
        
        // Check quest-specific items
        for (const questItem of EXCLUDED_ITEMS.questItems) {
            if (itemName === questItem) {
                return true;
            }
        }
        
        // Check non-physical entities
        for (const entity of EXCLUDED_ITEMS.entities) {
            if (itemName === entity) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Categorize an item based on its name and data
     */
    categorizeItem(itemName, itemData) {
        const icon = itemData.icon;
        const url = itemData.url;
        
        // Special case: Cron Castle Gold Coin should be in barter items
        if (itemName === 'Cron Castle Gold Coin') {
            return 'barter_items';
        }
        
        // Check each category's patterns
        for (const [categoryKey, categoryConfig] of Object.entries(ITEM_CATEGORIES)) {
            for (const pattern of categoryConfig.patterns) {
                if (itemName.includes(pattern) || icon.includes(pattern) || url.includes(pattern)) {
                    return categoryKey;
                }
            }
        }
        
        // Special cases for better categorization
        if (itemName.includes('Ship') && !itemName.includes(':')) {
            return 'ships';
        }
        
        // Coins (except Cron Castle which is handled above) go to barter items
        if (itemName.includes('Coin')) {
            return 'barter_items';
        }
        
        // Default to materials for unmatched items
        return 'materials';
    }
    
    /**
     * Update needed quantities from global inventory status
     */
    updateNeededQuantities() {
        console.log('📦 InventoryManager.updateNeededQuantities() called');
        try {
            const globalStatus = globalInventory.calculateGlobalInventoryStatus();
            console.log('📊 Global status calculated:', Object.keys(globalStatus).length, 'items');
            
            // First, reset all items to not needed
            this.items.forEach((item, itemName) => {
                if (item.needed > 0) {
                    console.log(`🔄 Resetting ${itemName} needed to 0`);
                    item.needed = 0;
                    item.allocated = 0;
                    item.isTracked = false;
                    item.usedBy = [];
                    item.completionPercent = 0;
                    this.items.set(itemName, item);
                }
            });
            
            // Then update with current global status
            Object.entries(globalStatus).forEach(([itemName, status]) => {
                if (this.items.has(itemName)) {
                    const item = this.items.get(itemName);
                    const oldNeeded = item.needed;
                    item.needed = status.needed || 0;
                    item.allocated = status.needed - status.remaining || 0;
                    item.isTracked = status.needed > 0;
                    
                    // Add additional project context
                    item.usedBy = status.usedBy || [];
                    item.completionPercent = status.completionPercent || 0;
                    item.barterInfo = status.barterInfo || { canBeBarterd: false };
                    
                    if (oldNeeded !== item.needed) {
                        console.log(`📝 Updated ${itemName}: needed ${oldNeeded} → ${item.needed}`);
                    }
                    
                    this.items.set(itemName, item);
                }
            });
            
            // Trigger refresh event
            this.dispatchInventoryEvent('needs-updated', Object.keys(globalStatus).length);
            
            // Directly refresh UI if it's open
            console.log('🔍 Debug UI refresh - inventoryUI available?', !!window.inventoryUI);
            console.log('🔍 Debug UI refresh - modal open?', window.inventoryUI?.isModalOpen);
            
            if (window.inventoryUI && window.inventoryUI.isModalOpen) {
                console.log('🎨 Refreshing inventory UI after needs update');
                window.inventoryUI.renderInventoryContent();
            } else {
                console.log('🔍 UI not refreshed - modal not open or UI not available');
            }
            
        } catch (error) {
            console.warn('Failed to update needed quantities:', error);
        }
    }
    
    /**
     * Get real-time project information for an item
     */
    getProjectInfo(itemName) {
        try {
            const globalStatus = globalInventory.calculateGlobalInventoryStatus();
            const status = globalStatus[itemName];
            
            if (!status) return null;
            
            return {
                isNeeded: status.needed > 0,
                totalNeeded: status.needed,
                remaining: status.remaining,
                completionPercent: status.completionPercent,
                usedByProjects: Array.from(status.usedBy || []),
                canBarter: status.barterInfo?.canBeBarterd || false,
                priority: this.calculateItemPriority(status)
            };
        } catch (error) {
            console.warn('Failed to get project info for', itemName, ':', error);
            return null;
        }
    }
    
    /**
     * Calculate item priority based on usage and completion
     */
    calculateItemPriority(status) {
        if (!status.needed || status.needed === 0) return 0;
        
        const usageWeight = (status.usedBy?.size || 0) * 2;
        const urgencyWeight = status.remaining / Math.max(1, status.needed);
        const completionWeight = 1 - (status.completionPercent / 100);
        
        return usageWeight + urgencyWeight * 3 + completionWeight * 5;
    }
    
    /**
     * Set item quantity and sync with global inventory
     */
    setItemQuantity(itemName, quantity) {
        const item = this.items.get(itemName);
        if (!item) return false;
        
        const newQuantity = Math.max(0, parseInt(quantity) || 0);
        item.quantity = newQuantity;
        this.items.set(itemName, item);
        
        // Sync with global inventory
        globalInventory.setMaterialQuantity(itemName, newQuantity);
        
        // Trigger update event
        this.dispatchInventoryEvent('quantity-changed', { itemName, quantity: newQuantity });
        
        return true;
    }
    
    /**
     * Get filtered and sorted items
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
     * Get category statistics
     */
    getCategoryStats() {
        const stats = {};
        
        this.categories.forEach((categoryData, categoryKey) => {
            const categoryItems = Array.from(this.items.values())
                .filter(item => item.category === categoryKey);
            
            stats[categoryKey] = {
                ...categoryData,
                totalItems: categoryItems.length,
                ownedItems: categoryItems.filter(item => item.quantity > 0).length,
                neededItems: categoryItems.filter(item => item.needed > 0).length,
                totalQuantity: categoryItems.reduce((sum, item) => sum + item.quantity, 0),
                totalNeeded: categoryItems.reduce((sum, item) => sum + item.needed, 0)
            };
        });
        
        return stats;
    }
    
    /**
     * Apply filters
     */
    setFilters(newFilters) {
        this.filters = { ...this.filters, ...newFilters };
        this.dispatchInventoryEvent('filters-changed', this.filters);
    }
    
    /**
     * Set sort order
     */
    setSortOrder(order) {
        this.sortOrder = order;
        this.dispatchInventoryEvent('sort-changed', order);
    }
    
    /**
     * Toggle view mode
     */
    toggleViewMode() {
        this.isGridView = !this.isGridView;
        this.dispatchInventoryEvent('view-changed', this.isGridView);
    }
    
    /**
     * Export inventory data
     */
    exportInventory() {
        const exportData = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            items: Array.from(this.items.entries()).map(([name, item]) => ({
                name,
                quantity: item.quantity,
                category: item.category
            })),
            filters: this.filters,
            sortOrder: this.sortOrder,
            isGridView: this.isGridView
        };
        
        return exportData;
    }
    
    /**
     * Import inventory data
     */
    importInventory(importData) {
        if (!importData.version || !importData.items) {
            throw new Error('Invalid import data format');
        }
        
        // Import item quantities
        importData.items.forEach(({ name, quantity }) => {
            if (this.items.has(name)) {
                this.setItemQuantity(name, quantity);
            }
        });
        
        // Import settings
        if (importData.filters) {
            this.filters = { ...this.filters, ...importData.filters };
        }
        
        if (importData.sortOrder) {
            this.sortOrder = importData.sortOrder;
        }
        
        if (typeof importData.isGridView === 'boolean') {
            this.isGridView = importData.isGridView;
        }
        
        this.dispatchInventoryEvent('imported', importData);
        
        return true;
    }
    
    /**
     * Clear all inventory quantities
     */
    clearInventory() {
        this.items.forEach((item, name) => {
            item.quantity = 0;
            this.items.set(name, item);
            globalInventory.setMaterialQuantity(name, 0);
        });
        
        this.dispatchInventoryEvent('cleared', null);
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for global inventory updates
        document.addEventListener('inventoryUpdated', (event) => {
            const { materialName, quantity } = event.detail;
            
            if (materialName === '*' || materialName === 'bulk') {
                // Full refresh needed
                this.updateNeededQuantities();
            } else if (this.items.has(materialName)) {
                const item = this.items.get(materialName);
                item.quantity = quantity;
                this.items.set(materialName, item);
            }
            
            this.dispatchInventoryEvent('synced', event.detail);
        });
        
        // Listen for storage events from other tabs
        window.addEventListener('storage', (event) => {
            if (event.key && event.key.startsWith('bdo-craft-inventory-')) {
                // Update from localStorage when changed in another tab
                const materialName = event.key.split('-').pop();
                if (this.items.has(materialName)) {
                    const newQuantity = parseInt(event.newValue) || 0;
                    const item = this.items.get(materialName);
                    item.quantity = newQuantity;
                    this.items.set(materialName, item);
                    this.dispatchInventoryEvent('storage-sync', { materialName, quantity: newQuantity });
                }
            }
        });
    }
    
    /**
     * Dispatch custom inventory events
     */
    dispatchInventoryEvent(type, data) {
        const event = new CustomEvent('inventoryChanged', {
            detail: { type, data, timestamp: Date.now() }
        });
        document.dispatchEvent(event);
    }
    
    /**
     * Get inventory statistics
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
            // Completion Rate: How many material types are 100% complete
            completionRate: neededItems.length > 0 
                ? (neededItems.filter(item => item.quantity >= item.needed).length / neededItems.length) * 100 
                : 100,
            // Progress Rate: How much of the total material gathering is complete
            progressRate: totalNeeded > 0 ? (totalOwned / totalNeeded) * 100 : 100,
            categoryStats: this.getCategoryStats()
        };
    }
    
    /**
     * Bulk update quantities
     */
    bulkUpdateQuantities(updates) {
        const results = {};
        
        Object.entries(updates).forEach(([itemName, quantity]) => {
            results[itemName] = this.setItemQuantity(itemName, quantity);
        });
        
        this.dispatchInventoryEvent('bulk-updated', results);
        
        return results;
    }
    
    /**
     * Search items with advanced filtering
     */
    searchItems(query, options = {}) {
        const searchLower = query.toLowerCase();
        const items = Array.from(this.items.values());
        
        return items.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(searchLower);
            const categoryMatch = options.includeCategory ? 
                ITEM_CATEGORIES[item.category]?.name.toLowerCase().includes(searchLower) : false;
            
            let match = nameMatch || categoryMatch;
            
            // Apply additional filters
            if (options.categoryFilter && options.categoryFilter !== 'all') {
                match = match && item.category === options.categoryFilter;
            }
            
            if (options.onlyOwned) {
                match = match && item.quantity > 0;
            }
            
            if (options.onlyNeeded) {
                match = match && item.needed > 0;
            }
            
            return match;
        });
    }
}

// Create global instance
export const inventoryManager = new InventoryManager();

// Make it available globally for cross-system updates
window.inventoryManager = inventoryManager;

// Export convenience functions
export function getItem(itemName) {
    return inventoryManager.items.get(itemName);
}

export function setItemQuantity(itemName, quantity) {
    return inventoryManager.setItemQuantity(itemName, quantity);
}

export function getFilteredItems() {
    return inventoryManager.getFilteredItems();
}

export function getCategoryStats() {
    return inventoryManager.getCategoryStats();
}

export function getInventoryStats() {
    return inventoryManager.getInventoryStats();
}