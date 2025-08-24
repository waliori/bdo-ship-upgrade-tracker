// BDO Ship Upgrade Tracker - Unified Storage Manager
// Single source of truth for all storage operations

/**
 * Unified Storage Manager - Single Source of Truth
 * 
 * This system consolidates all storage operations across the application,
 * providing consistent data access while maintaining backward compatibility.
 */

// Import necessary dependencies
let globalInventoryModule = null;
let craftNavigatorModule = null;

// Lazy import function to avoid circular dependencies
async function getGlobalInventory() {
    if (!globalInventoryModule) {
        globalInventoryModule = await import('./craft-system/global_inventory.js');
    }
    return globalInventoryModule;
}

async function getCraftNavigator() {
    if (!craftNavigatorModule) {
        craftNavigatorModule = await import('./craft-system/craft_navigator.js');
    }
    return craftNavigatorModule;
}

/**
 * Unified Data Models
 */
export class UnifiedProject {
    constructor(data = {}) {
        // Basic Info
        this.id = data.id || this.generateId();
        this.name = data.name || '';
        this.type = data.type || 'materials'; // 'ships' | 'ship_parts' | 'materials'
        
        // Requirements
        this.requirements = data.requirements || {};
        
        // Progress Tracking
        this.status = data.status || 'active'; // 'active' | 'completed' | 'paused'
        this.completionPercent = data.completionPercent || 0;
        
        // Timestamps
        this.createdAt = data.createdAt || Date.now();
        this.lastUpdated = data.lastUpdated || Date.now();
        this.completedAt = data.completedAt || null;
        
        // Legacy Compatibility
        this.legacyData = data.legacyData || {};
        
        // Metadata
        this.metadata = data.metadata || {};
    }
    
    generateId() {
        return `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    markCompleted() {
        this.status = 'completed';
        this.completedAt = Date.now();
        this.lastUpdated = Date.now();
        this.completionPercent = 100;
    }
    
    markActive() {
        this.status = 'active';
        this.completedAt = null;
        this.lastUpdated = Date.now();
    }
}

export class UnifiedMaterial {
    constructor(data = {}) {
        // Identity
        this.name = data.name || '';
        this.category = data.category || 'materials';
        this.isClickable = data.isClickable || false;
        
        // Quantities
        this.owned = data.owned || 0;
        this.needed = data.needed || 0;
        this.remaining = Math.max(0, (data.needed || 0) - (data.owned || 0));
        
        // Usage
        this.usedBy = data.usedBy || []; // Project IDs
        
        // Completion
        this.isCompleted = (this.needed > 0 && this.owned >= this.needed);
        this.completedAt = data.completedAt || null;
        
        // Metadata
        this.metadata = data.metadata || {};
    }
    
    updateQuantity(owned, needed = null) {
        this.owned = Math.max(0, owned);
        if (needed !== null) {
            this.needed = Math.max(0, needed);
        }
        this.remaining = Math.max(0, this.needed - this.owned);
        this.isCompleted = (this.needed > 0 && this.owned >= this.needed);
        
        if (this.isCompleted && !this.completedAt) {
            this.completedAt = Date.now();
        } else if (!this.isCompleted && this.completedAt) {
            this.completedAt = null;
        }
    }
}

/**
 * Custom Error Classes
 */
export class BDOStorageError extends Error {
    constructor(message, code = 'STORAGE_ERROR', details = {}) {
        super(message);
        this.name = 'BDOStorageError';
        this.code = code;
        this.details = details;
        this.timestamp = Date.now();
    }
}

export class BDOMigrationError extends BDOStorageError {
    constructor(message, details = {}) {
        super(message, 'MIGRATION_ERROR', details);
        this.name = 'BDOMigrationError';
    }
}

/**
 * Main Unified Storage Manager Class
 */
export class UnifiedStorageManager {
    constructor() {
        // Storage Configuration
        this.storagePrefix = 'bdo-unified-';
        this.storageKeys = {
            projects: 'bdo-unified-projects',
            materials: 'bdo-unified-materials', 
            settings: 'bdo-unified-settings',
            cache: 'bdo-unified-cache',
            metadata: 'bdo-unified-metadata'
        };
        
        // Multi-layer caching system
        this.memoryCache = new Map();
        this.sessionCache = new Map();
        this.cacheConfig = {
            maxMemoryItems: 1000,
            maxSessionItems: 5000,
            memoryTTL: 300000, // 5 minutes
            sessionTTL: 1800000 // 30 minutes
        };
        
        // Event system
        this.eventListeners = new Map();
        this.eventHistory = [];
        this.maxEventHistory = 100;
        
        // Transaction management
        this.transactions = new Map();
        this.operationQueue = [];
        this.isProcessingQueue = false;
        this.operationLocks = new Set();
        
        // Performance monitoring
        this.metrics = {
            operations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0,
            transactionsFailed: 0,
            transactionsSucceeded: 0,
            avgOperationTime: 0,
            lastError: null
        };
        
        // Initialization state
        this.isInitialized = false;
        this.initializationPromise = null;
        this.migrationStatus = {
            isCompleted: false,
            hasErrors: false,
            errors: []
        };
    }
    
    /**
     * Initialize the unified storage manager
     */
    async initialize(forceReinitialization = false) {
        if (this.isInitialized && !forceReinitialization) {
            return this.initializationPromise;
        }
        
        this.initializationPromise = this._performInitialization();
        await this.initializationPromise;
        this.isInitialized = true;
        
        return this.initializationPromise;
    }
    
    async _performInitialization() {
        console.log('🚀 Initializing Unified Storage Manager...');
        
        try {
            // 1. Load existing unified data (if any)
            await this._loadUnifiedData();
            
            // 2. Check migration status
            const migrationNeeded = await this._checkMigrationNeeded();
            
            // 3. Perform migration if needed
            if (migrationNeeded) {
                console.log('📦 Migration needed - starting data migration...');
                await this._performMigration();
            }
            
            // 4. Initialize caching system
            this._initializeCache();
            
            // 5. Setup event listeners
            this._setupEventListeners();
            
            // 6. Setup cross-tab synchronization
            this._setupCrossTabSync();
            
            // 7. Start performance monitoring
            this._startPerformanceMonitoring();
            
            console.log('✅ Unified Storage Manager initialized successfully');
            this._dispatchEvent('unified-storage-ready', { timestamp: Date.now() });
            
        } catch (error) {
            this.metrics.errors++;
            this.metrics.lastError = error;
            console.error('❌ Failed to initialize Unified Storage Manager:', error);
            throw new BDOStorageError('Initialization failed', 'INIT_ERROR', { originalError: error });
        }
    }
    
    /**
     * Load existing unified data from localStorage
     */
    async _loadUnifiedData() {
        try {
            const projects = this._getStorageItem(this.storageKeys.projects, {});
            const materials = this._getStorageItem(this.storageKeys.materials, {});
            const settings = this._getStorageItem(this.storageKeys.settings, {});
            const metadata = this._getStorageItem(this.storageKeys.metadata, {
                version: '1.0',
                createdAt: Date.now(),
                lastMigration: null,
                migrationVersion: null
            });
            
            // Validate and load data
            this.memoryCache.set('projects', projects);
            this.memoryCache.set('materials', materials);
            this.memoryCache.set('settings', settings);
            this.memoryCache.set('metadata', metadata);
            
            console.log(`📦 Loaded unified data: ${Object.keys(projects).length} projects, ${Object.keys(materials).length} materials`);
            
        } catch (error) {
            console.warn('⚠️ Failed to load existing unified data:', error);
            // Initialize with empty data
            this.memoryCache.set('projects', {});
            this.memoryCache.set('materials', {});
            this.memoryCache.set('settings', {});
            this.memoryCache.set('metadata', {
                version: '1.0',
                createdAt: Date.now(),
                lastMigration: null,
                migrationVersion: null
            });
        }
    }
    
    /**
     * Check if migration is needed
     */
    async _checkMigrationNeeded() {
        const metadata = this.memoryCache.get('metadata');
        const materials = this.memoryCache.get('materials');
        const projects = this.memoryCache.get('projects');
        
        // Check if we have unified data
        const hasUnifiedData = Object.keys(materials).length > 0 || Object.keys(projects).length > 0;
        
        // Check if we have legacy data
        const hasLegacyData = this._hasLegacyData();
        
        // Migration needed if we have legacy data but no unified data, or if forced
        return hasLegacyData && (!hasUnifiedData || !metadata.lastMigration);
    }
    
    /**
     * Check for legacy data in localStorage
     */
    _hasLegacyData() {
        // Check for app legacy data
        const globalInventory = localStorage.getItem('bdo_ship_upgrade-globalInventory');
        
        // Check for global inventory manager data
        const hasGlobalInventoryData = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
            .some(key => key && key.startsWith('bdo-craft-inventory-'));
        
        // Check for craft navigator data
        const hasNavigatorData = localStorage.getItem('bdo-craft-navigator-active') || 
                                localStorage.getItem('bdo-craft-active-projects');
        
        return !!(globalInventory || hasGlobalInventoryData || hasNavigatorData);
    }
    
    /**
     * Perform data migration from legacy systems
     */
    async _performMigration() {
        console.log('🔄 Starting unified storage migration...');
        
        const migrationStartTime = Date.now();
        const migrationTransaction = this._createTransaction('migration', 'system');
        
        try {
            // Import migration utility
            const { UnifiedStorageMigration } = await import('./unified-storage-migration.js');
            const migrationTool = new UnifiedStorageMigration(this);
            
            // Perform migration
            const migrationResult = await migrationTool.migrateAllSystems();
            
            if (!migrationResult.success) {
                throw new BDOMigrationError('Migration failed', migrationResult);
            }
            
            // Update metadata
            const metadata = this.memoryCache.get('metadata');
            metadata.lastMigration = Date.now();
            metadata.migrationVersion = '1.0';
            metadata.migrationDuration = Date.now() - migrationStartTime;
            metadata.migrationResult = migrationResult;
            
            this._commitToStorage('metadata', metadata);
            
            this.migrationStatus = {
                isCompleted: true,
                hasErrors: false,
                errors: [],
                result: migrationResult
            };
            
            this._commitTransaction(migrationTransaction);
            
            console.log(`✅ Migration completed successfully in ${metadata.migrationDuration}ms`);
            console.log('📊 Migration summary:', migrationResult.summary);
            
        } catch (error) {
            this.migrationStatus = {
                isCompleted: false,
                hasErrors: true,
                errors: [error]
            };
            
            this._rollbackTransaction(migrationTransaction);
            
            console.error('❌ Migration failed:', error);
            throw new BDOMigrationError('Migration process failed', { 
                originalError: error,
                migrationTransaction: migrationTransaction.id
            });
        }
    }
    
    /**
     * Initialize caching system
     */
    _initializeCache() {
        // Setup cache eviction policies
        setInterval(() => {
            this._evictExpiredCache();
        }, 60000); // Check every minute
        
        // Setup cache compression for large items
        this._setupCacheCompression();
        
        console.log('💾 Cache system initialized');
    }
    
    /**
     * Setup event listeners for cross-system communication
     */
    _setupEventListeners() {
        // Listen for legacy system events and sync them
        document.addEventListener('inventoryUpdated', (event) => {
            this._handleLegacyInventoryUpdate(event);
        });
        
        document.addEventListener('craftNavigationEvent', (event) => {
            this._handleLegacyNavigationEvent(event);
        });
        
        // Setup internal event system
        this.on('material-updated', (data) => {
            this._syncMaterialUpdate(data);
        });
        
        this.on('project-updated', (data) => {
            this._syncProjectUpdate(data);
        });
        
        console.log('📡 Event listeners initialized');
    }
    
    /**
     * Setup cross-tab synchronization
     */
    _setupCrossTabSync() {
        window.addEventListener('storage', (event) => {
            if (event.key && event.key.startsWith(this.storagePrefix)) {
                this._handleCrossTabUpdate(event);
            }
        });
        
        console.log('🔄 Cross-tab synchronization enabled');
    }
    
    /**
     * Start performance monitoring
     */
    _startPerformanceMonitoring() {
        setInterval(() => {
            this._updatePerformanceMetrics();
        }, 30000); // Update every 30 seconds
        
        console.log('📊 Performance monitoring started');
    }
    
    // =============================================================================
    // CORE STORAGE OPERATIONS
    // =============================================================================
    
    /**
     * Save material with unified storage
     */
    async saveMaterial(materialName, materialData, context = 'unified') {
        const operation = this._startOperation('saveMaterial');
        
        try {
            await this._acquireOperationLock(`material-${materialName}`);
            
            const material = new UnifiedMaterial({
                name: materialName,
                ...materialData
            });
            
            // Get current materials
            const materials = this.memoryCache.get('materials') || {};
            materials[materialName] = material;
            
            // Update cache and storage
            this.memoryCache.set('materials', materials);
            await this._commitToStorage('materials', materials);
            
            // Sync with legacy systems
            await this._syncToLegacySystems('material', materialName, material);
            
            // Trigger events
            this._dispatchEvent('material-saved', { 
                materialName, 
                material, 
                context,
                timestamp: Date.now()
            });
            
            this._releaseOperationLock(`material-${materialName}`);
            this._endOperation(operation, true);
            
            return material;
            
        } catch (error) {
            this._releaseOperationLock(`material-${materialName}`);
            this._endOperation(operation, false);
            throw new BDOStorageError(`Failed to save material: ${materialName}`, 'SAVE_MATERIAL_ERROR', {
                materialName,
                originalError: error
            });
        }
    }
    
    /**
     * Get material with caching
     */
    async getMaterial(materialName) {
        const operation = this._startOperation('getMaterial');
        
        try {
            // Check memory cache first
            const materials = this.memoryCache.get('materials') || {};
            if (materials[materialName]) {
                this.metrics.cacheHits++;
                this._endOperation(operation, true);
                return materials[materialName];
            }
            
            // Check session cache
            const sessionKey = `material-${materialName}`;
            if (this.sessionCache.has(sessionKey)) {
                const cached = this.sessionCache.get(sessionKey);
                if (Date.now() - cached.timestamp < this.cacheConfig.sessionTTL) {
                    this.metrics.cacheHits++;
                    materials[materialName] = cached.data;
                    this.memoryCache.set('materials', materials);
                    this._endOperation(operation, true);
                    return cached.data;
                }
            }
            
            this.metrics.cacheMisses++;
            
            // Create default material if not found
            const defaultMaterial = new UnifiedMaterial({ name: materialName });
            materials[materialName] = defaultMaterial;
            this.memoryCache.set('materials', materials);
            
            this._endOperation(operation, true);
            return defaultMaterial;
            
        } catch (error) {
            this._endOperation(operation, false);
            throw new BDOStorageError(`Failed to get material: ${materialName}`, 'GET_MATERIAL_ERROR', {
                materialName,
                originalError: error
            });
        }
    }
    
    /**
     * Save project with unified storage
     */
    async saveProject(projectData, context = 'unified') {
        const operation = this._startOperation('saveProject');
        
        try {
            await this._acquireOperationLock(`project-${projectData.name}`);
            
            const project = new UnifiedProject(projectData);
            
            // Get current projects
            const projects = this.memoryCache.get('projects') || {};
            projects[project.name] = project;
            
            // Update cache and storage
            this.memoryCache.set('projects', projects);
            await this._commitToStorage('projects', projects);
            
            // Sync with legacy systems
            await this._syncToLegacySystems('project', project.name, project);
            
            // Trigger events
            this._dispatchEvent('project-saved', { 
                project, 
                context,
                timestamp: Date.now()
            });
            
            this._releaseOperationLock(`project-${project.name}`);
            this._endOperation(operation, true);
            
            return project;
            
        } catch (error) {
            this._releaseOperationLock(`project-${projectData.name}`);
            this._endOperation(operation, false);
            throw new BDOStorageError(`Failed to save project: ${projectData.name}`, 'SAVE_PROJECT_ERROR', {
                projectData,
                originalError: error
            });
        }
    }
    
    /**
     * Get project with caching
     */
    async getProject(projectName) {
        const operation = this._startOperation('getProject');
        
        try {
            // Check memory cache first
            const projects = this.memoryCache.get('projects') || {};
            if (projects[projectName]) {
                this.metrics.cacheHits++;
                this._endOperation(operation, true);
                return projects[projectName];
            }
            
            this.metrics.cacheMisses++;
            this._endOperation(operation, true);
            return null;
            
        } catch (error) {
            this._endOperation(operation, false);
            throw new BDOStorageError(`Failed to get project: ${projectName}`, 'GET_PROJECT_ERROR', {
                projectName,
                originalError: error
            });
        }
    }
    
    /**
     * Update material quantity (core operation for synchronization)
     */
    async updateMaterialQuantity(materialName, quantity, context = 'unified') {
        const operation = this._startOperation('updateMaterialQuantity');
        
        try {
            await this._acquireOperationLock(`material-${materialName}`);
            
            // Get current material
            let material = await this.getMaterial(materialName);
            if (!material) {
                material = new UnifiedMaterial({ name: materialName });
            }
            
            // Update quantity
            const oldQuantity = material.owned;
            material.updateQuantity(quantity, material.needed);
            
            // Save updated material
            await this.saveMaterial(materialName, material, context);
            
            // Sync with legacy systems immediately
            await this._syncMaterialToLegacySystems(materialName, quantity);
            
            // Trigger specific quantity update events
            this._dispatchEvent('material-quantity-updated', {
                materialName,
                oldQuantity,
                newQuantity: quantity,
                material,
                context,
                timestamp: Date.now()
            });
            
            this._releaseOperationLock(`material-${materialName}`);
            this._endOperation(operation, true);
            
            return material;
            
        } catch (error) {
            this._releaseOperationLock(`material-${materialName}`);
            this._endOperation(operation, false);
            throw new BDOStorageError(`Failed to update material quantity: ${materialName}`, 'UPDATE_QUANTITY_ERROR', {
                materialName,
                quantity,
                originalError: error
            });
        }
    }
    
    // =============================================================================
    // LEGACY SYSTEM SYNCHRONIZATION
    // =============================================================================
    
    /**
     * Sync material changes to legacy systems
     */
    async _syncMaterialToLegacySystems(materialName, quantity) {
        try {
            // Sync to App Legacy Storage (globalInventory format)
            this._syncToAppLegacySystem(materialName, quantity);
            
            // Sync to Global Inventory Manager (individual keys format)
            this._syncToGlobalInventorySystem(materialName, quantity);
            
        } catch (error) {
            console.warn(`⚠️ Failed to sync ${materialName} to legacy systems:`, error);
        }
    }
    
    /**
     * Sync to App Legacy Storage system
     */
    _syncToAppLegacySystem(materialName, quantity) {
        try {
            const globalInventoryData = localStorage.getItem('bdo_ship_upgrade-globalInventory');
            const inventory = globalInventoryData ? JSON.parse(globalInventoryData) : {};
            
            if (!inventory[materialName]) {
                inventory[materialName] = { total: 0, allocations: {} };
            }
            
            inventory[materialName].total = quantity;
            localStorage.setItem('bdo_ship_upgrade-globalInventory', JSON.stringify(inventory));
            
            console.log(`🔄 Synced ${materialName}=${quantity} to App Legacy Storage`);
            
        } catch (error) {
            console.warn(`⚠️ Failed to sync to App Legacy Storage for ${materialName}:`, error);
        }
    }
    
    /**
     * Sync to Global Inventory Manager system  
     */
    _syncToGlobalInventorySystem(materialName, quantity) {
        try {
            const key = `bdo-craft-inventory-global-${materialName}`;
            localStorage.setItem(key, quantity.toString());
            
            console.log(`🔄 Synced ${materialName}=${quantity} to Global Inventory System`);
            
        } catch (error) {
            console.warn(`⚠️ Failed to sync to Global Inventory System for ${materialName}:`, error);
        }
    }
    
    /**
     * Sync generic data to legacy systems
     */
    async _syncToLegacySystems(type, identifier, data) {
        try {
            if (type === 'material') {
                await this._syncMaterialToLegacySystems(identifier, data.owned);
            } else if (type === 'project') {
                await this._syncProjectToLegacySystems(identifier, data);
            }
        } catch (error) {
            console.warn(`⚠️ Failed to sync ${type} ${identifier} to legacy systems:`, error);
        }
    }
    
    /**
     * Sync project to legacy systems
     */
    async _syncProjectToLegacySystems(projectName, project) {
        try {
            // Sync to craft navigator active projects
            const activeProjects = JSON.parse(localStorage.getItem('bdo-craft-navigator-active') || '[]');
            if (project.status === 'active' && !activeProjects.includes(projectName)) {
                activeProjects.push(projectName);
                localStorage.setItem('bdo-craft-navigator-active', JSON.stringify(activeProjects));
            } else if (project.status !== 'active' && activeProjects.includes(projectName)) {
                const filteredProjects = activeProjects.filter(name => name !== projectName);
                localStorage.setItem('bdo-craft-navigator-active', JSON.stringify(filteredProjects));
            }
            
            // Sync to global inventory active projects
            const globalActiveProjects = JSON.parse(localStorage.getItem('bdo-craft-active-projects') || '[]');
            const existingProject = globalActiveProjects.find(p => p.name === projectName);
            
            if (project.status === 'active') {
                if (existingProject) {
                    Object.assign(existingProject, {
                        status: project.status,
                        lastUpdated: project.lastUpdated,
                        completionPercent: project.completionPercent
                    });
                } else {
                    globalActiveProjects.push({
                        name: project.name,
                        type: project.type,
                        addedAt: project.createdAt,
                        lastUpdated: project.lastUpdated,
                        status: project.status,
                        requirements: project.requirements,
                        completionStatus: {
                            isCompleted: project.status === 'completed',
                            completionPercent: project.completionPercent
                        }
                    });
                }
                localStorage.setItem('bdo-craft-active-projects', JSON.stringify(globalActiveProjects));
            }
            
            console.log(`🔄 Synced project ${projectName} to legacy systems`);
            
        } catch (error) {
            console.warn(`⚠️ Failed to sync project ${projectName} to legacy systems:`, error);
        }
    }
    
    // =============================================================================
    // EVENT SYSTEM
    // =============================================================================
    
    /**
     * Event listener management
     */
    on(eventType, callback, options = {}) {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        
        const listener = {
            callback,
            id: this._generateId(),
            priority: options.priority || 0,
            once: options.once || false,
            context: options.context || 'default'
        };
        
        this.eventListeners.get(eventType).push(listener);
        
        // Sort by priority (higher first)
        this.eventListeners.get(eventType).sort((a, b) => b.priority - a.priority);
        
        return listener.id;
    }
    
    off(eventType, listenerId) {
        if (!this.eventListeners.has(eventType)) return false;
        
        const listeners = this.eventListeners.get(eventType);
        const index = listeners.findIndex(l => l.id === listenerId);
        
        if (index !== -1) {
            listeners.splice(index, 1);
            return true;
        }
        
        return false;
    }
    
    /**
     * Dispatch events with history tracking
     */
    _dispatchEvent(eventType, data = {}) {
        const event = {
            type: eventType,
            data,
            timestamp: Date.now(),
            id: this._generateId()
        };
        
        // Add to history
        this.eventHistory.unshift(event);
        if (this.eventHistory.length > this.maxEventHistory) {
            this.eventHistory = this.eventHistory.slice(0, this.maxEventHistory);
        }
        
        // Dispatch to internal listeners
        if (this.eventListeners.has(eventType)) {
            const listeners = this.eventListeners.get(eventType);
            
            for (const listener of listeners) {
                try {
                    listener.callback(data);
                    
                    if (listener.once) {
                        this.off(eventType, listener.id);
                    }
                } catch (error) {
                    console.error(`❌ Event listener error for ${eventType}:`, error);
                }
            }
        }
        
        // Dispatch to document for cross-system compatibility
        const domEvent = new CustomEvent(`unified-${eventType}`, {
            detail: { ...data, unifiedEvent: true, eventId: event.id }
        });
        document.dispatchEvent(domEvent);
        
        return event.id;
    }
    
    // =============================================================================
    // UTILITY METHODS
    // =============================================================================
    
    /**
     * Enhanced localStorage operations with error handling
     */
    _getStorageItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn(`Failed to parse localStorage item ${key}:`, error);
            return defaultValue;
        }
    }
    
    _setStorageItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Failed to save to localStorage ${key}:`, error);
            return false;
        }
    }
    
    /**
     * Commit data to persistent storage
     */
    async _commitToStorage(dataType, data) {
        const key = this.storageKeys[dataType];
        if (!key) {
            throw new BDOStorageError(`Invalid data type: ${dataType}`, 'INVALID_DATA_TYPE');
        }
        
        return this._setStorageItem(key, data);
    }
    
    /**
     * Transaction management
     */
    _createTransaction(type, context = 'default') {
        const transaction = {
            id: this._generateId(),
            type,
            context,
            startTime: Date.now(),
            operations: [],
            rollbackData: new Map(),
            status: 'created'
        };
        
        this.transactions.set(transaction.id, transaction);
        return transaction;
    }
    
    _commitTransaction(transaction) {
        transaction.status = 'committed';
        transaction.endTime = Date.now();
        transaction.duration = transaction.endTime - transaction.startTime;
        this.metrics.transactionsSucceeded++;
    }
    
    _rollbackTransaction(transaction) {
        transaction.status = 'rolled_back';
        transaction.endTime = Date.now();
        transaction.duration = transaction.endTime - transaction.startTime;
        this.metrics.transactionsFailed++;
        
        // Perform rollback operations
        for (const [key, data] of transaction.rollbackData) {
            try {
                this._setStorageItem(key, data);
            } catch (error) {
                console.error(`Failed to rollback ${key}:`, error);
            }
        }
    }
    
    /**
     * Operation tracking and locking
     */
    _startOperation(type) {
        this.metrics.operations++;
        return {
            type,
            startTime: Date.now(),
            id: this._generateId()
        };
    }
    
    _endOperation(operation, success) {
        const duration = Date.now() - operation.startTime;
        this.metrics.avgOperationTime = (this.metrics.avgOperationTime + duration) / 2;
        
        if (!success) {
            this.metrics.errors++;
        }
    }
    
    async _acquireOperationLock(lockKey) {
        while (this.operationLocks.has(lockKey)) {
            await this._sleep(10);
        }
        this.operationLocks.add(lockKey);
    }
    
    _releaseOperationLock(lockKey) {
        this.operationLocks.delete(lockKey);
    }
    
    /**
     * Cache management
     */
    _evictExpiredCache() {
        const now = Date.now();
        
        // Check session cache
        for (const [key, cached] of this.sessionCache) {
            if (now - cached.timestamp > this.cacheConfig.sessionTTL) {
                this.sessionCache.delete(key);
            }
        }
        
        // Check memory cache size
        if (this.memoryCache.size > this.cacheConfig.maxMemoryItems) {
            // Simple LRU eviction - remove oldest entries
            const entries = Array.from(this.memoryCache.entries());
            const toRemove = entries.slice(0, entries.length - this.cacheConfig.maxMemoryItems);
            
            for (const [key] of toRemove) {
                this.memoryCache.delete(key);
            }
        }
    }
    
    _setupCacheCompression() {
        // Implement compression for large cache items if needed
        // This is a placeholder for future enhancement
    }
    
    /**
     * Performance monitoring
     */
    _updatePerformanceMetrics() {
        // Calculate cache hit ratio
        const totalCacheRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
        const cacheHitRatio = totalCacheRequests > 0 ? (this.metrics.cacheHits / totalCacheRequests) * 100 : 0;
        
        this.metrics.cacheHitRatio = cacheHitRatio;
        this.metrics.memoryUsage = this.memoryCache.size;
        this.metrics.sessionUsage = this.sessionCache.size;
        this.metrics.activeTransactions = this.transactions.size;
        
        // Log metrics periodically
        console.log('📊 Unified Storage Metrics:', {
            operations: this.metrics.operations,
            cacheHitRatio: `${cacheHitRatio.toFixed(2)}%`,
            memoryUsage: this.metrics.memoryUsage,
            errors: this.metrics.errors,
            avgOperationTime: `${this.metrics.avgOperationTime.toFixed(2)}ms`
        });
    }
    
    /**
     * Cross-tab synchronization handlers
     */
    _handleCrossTabUpdate(event) {
        if (event.key === this.storageKeys.materials) {
            // Materials updated in another tab
            const materials = JSON.parse(event.newValue || '{}');
            this.memoryCache.set('materials', materials);
            this._dispatchEvent('cross-tab-sync', { type: 'materials', data: materials });
        } else if (event.key === this.storageKeys.projects) {
            // Projects updated in another tab
            const projects = JSON.parse(event.newValue || '{}');
            this.memoryCache.set('projects', projects);
            this._dispatchEvent('cross-tab-sync', { type: 'projects', data: projects });
        }
    }
    
    /**
     * Legacy event handlers
     */
    _handleLegacyInventoryUpdate(event) {
        const { materialName, quantity, context } = event.detail;
        
        // Update our unified storage to match
        if (materialName && quantity !== undefined) {
            this.updateMaterialQuantity(materialName, quantity, `legacy-${context}`);
        }
    }
    
    _handleLegacyNavigationEvent(event) {
        const { type, data } = event.detail;
        
        if (type === 'project-added') {
            // Sync project addition
            this.saveProject({
                name: data.project,
                status: 'active',
                createdAt: Date.now(),
                requirements: data.data?.requirements || {}
            }, 'legacy-navigation');
        }
    }
    
    /**
     * Utility functions
     */
    _generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // =============================================================================
    // PUBLIC API
    // =============================================================================
    
    /**
     * Get all materials
     */
    async getAllMaterials() {
        const materials = this.memoryCache.get('materials') || {};
        return materials;
    }
    
    /**
     * Get all projects
     */
    async getAllProjects() {
        const projects = this.memoryCache.get('projects') || {};
        return projects;
    }
    
    /**
     * Get storage statistics
     */
    getStorageStats() {
        const materials = this.memoryCache.get('materials') || {};
        const projects = this.memoryCache.get('projects') || {};
        
        return {
            materials: {
                total: Object.keys(materials).length,
                completed: Object.values(materials).filter(m => m.isCompleted).length,
                totalOwned: Object.values(materials).reduce((sum, m) => sum + m.owned, 0),
                totalNeeded: Object.values(materials).reduce((sum, m) => sum + m.needed, 0)
            },
            projects: {
                total: Object.keys(projects).length,
                active: Object.values(projects).filter(p => p.status === 'active').length,
                completed: Object.values(projects).filter(p => p.status === 'completed').length
            },
            performance: this.metrics,
            cache: {
                memorySize: this.memoryCache.size,
                sessionSize: this.sessionCache.size,
                hitRatio: this.metrics.cacheHitRatio
            }
        };
    }
    
    /**
     * Health check
     */
    async healthCheck() {
        const health = {
            status: 'healthy',
            initialized: this.isInitialized,
            migrationCompleted: this.migrationStatus.isCompleted,
            errors: [],
            metrics: this.metrics,
            timestamp: Date.now()
        };
        
        // Check for critical errors
        if (this.metrics.errors > 10) {
            health.status = 'degraded';
            health.errors.push('High error count detected');
        }
        
        if (this.migrationStatus.hasErrors) {
            health.status = 'error';
            health.errors.push('Migration errors detected');
        }
        
        if (!this.isInitialized) {
            health.status = 'initializing';
        }
        
        return health;
    }
    
    /**
     * Force cache refresh
     */
    async refreshCache() {
        this.memoryCache.clear();
        this.sessionCache.clear();
        await this._loadUnifiedData();
        this._dispatchEvent('cache-refreshed', { timestamp: Date.now() });
    }
    
    /**
     * Export all data
     */
    async exportData() {
        return {
            version: '1.0',
            timestamp: Date.now(),
            materials: this.memoryCache.get('materials') || {},
            projects: this.memoryCache.get('projects') || {},
            settings: this.memoryCache.get('settings') || {},
            metadata: this.memoryCache.get('metadata') || {}
        };
    }
    
    /**
     * Import data
     */
    async importData(data) {
        if (!data.version) {
            throw new BDOStorageError('Invalid import data - missing version', 'INVALID_IMPORT_DATA');
        }
        
        const transaction = this._createTransaction('import', 'user');
        
        try {
            // Store rollback data
            transaction.rollbackData.set('materials', this.memoryCache.get('materials'));
            transaction.rollbackData.set('projects', this.memoryCache.get('projects'));
            transaction.rollbackData.set('settings', this.memoryCache.get('settings'));
            
            // Import data
            this.memoryCache.set('materials', data.materials || {});
            this.memoryCache.set('projects', data.projects || {});
            this.memoryCache.set('settings', data.settings || {});
            
            // Commit to storage
            await this._commitToStorage('materials', data.materials || {});
            await this._commitToStorage('projects', data.projects || {});
            await this._commitToStorage('settings', data.settings || {});
            
            this._commitTransaction(transaction);
            this._dispatchEvent('data-imported', { importedAt: Date.now() });
            
            return true;
            
        } catch (error) {
            this._rollbackTransaction(transaction);
            throw new BDOStorageError('Failed to import data', 'IMPORT_ERROR', { originalError: error });
        }
    }
}

// Create singleton instance
export const unifiedStorageManager = new UnifiedStorageManager();

// Make available globally for debugging and cross-system access
window.unifiedStorageManager = unifiedStorageManager;

export default unifiedStorageManager;