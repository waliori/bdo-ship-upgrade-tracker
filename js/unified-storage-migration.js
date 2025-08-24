// BDO Ship Upgrade Tracker - Unified Storage Migration
// Migrates data from all legacy storage systems to unified format

import { UnifiedProject, UnifiedMaterial, BDOMigrationError } from './unified-storage-manager.js';

/**
 * Unified Storage Migration System
 * 
 * Handles migration of data from multiple legacy storage systems:
 * 1. App Legacy Storage (bdo_ship_upgrade-* keys)
 * 2. Global Inventory Manager (bdo-craft-* keys) 
 * 3. Craft Navigator (bdo-craft-navigator-* keys)
 * 4. Inventory System (bdo-inventory-* keys)
 * 5. Craft Navigation UI (bdo-craft-ui-* keys)
 */
export class UnifiedStorageMigration {
    constructor(unifiedStorageManager) {
        this.storageManager = unifiedStorageManager;
        this.migrationReport = {
            success: false,
            startTime: null,
            endTime: null,
            duration: 0,
            systems: {},
            summary: {
                totalMaterialsMigrated: 0,
                totalProjectsMigrated: 0,
                errors: [],
                warnings: []
            },
            validation: {
                preValidation: {},
                postValidation: {},
                integritySummary: {}
            }
        };
        
        // System migration order (dependencies matter)
        this.migrationOrder = [
            'appLegacyStorage',
            'globalInventoryManager', 
            'craftNavigator',
            'inventorySystem',
            'craftNavigationUI'
        ];
    }
    
    /**
     * Main migration orchestrator
     */
    async migrateAllSystems() {
        console.log('🔄 Starting comprehensive storage migration...');
        
        this.migrationReport.startTime = Date.now();
        
        try {
            // 1. Pre-migration validation
            await this._performPreValidation();
            
            // 2. Create backup of current state
            await this._createBackup();
            
            // 3. Migrate each system in order
            for (const systemName of this.migrationOrder) {
                await this._migrateSystem(systemName);
            }
            
            // 4. Post-migration validation
            await this._performPostValidation();
            
            // 5. Data integrity checks
            await this._performIntegrityCheck();
            
            // 6. Generate final report
            this._finalizeMigrationReport(true);
            
            console.log('✅ Migration completed successfully');
            return this.migrationReport;
            
        } catch (error) {
            this._finalizeMigrationReport(false, error);
            console.error('❌ Migration failed:', error);
            throw new BDOMigrationError('Migration process failed', {
                report: this.migrationReport,
                originalError: error
            });
        }
    }
    
    /**
     * Pre-migration validation
     */
    async _performPreValidation() {
        console.log('🔍 Performing pre-migration validation...');
        
        const validation = {
            legacyDataFound: false,
            systemsDetected: [],
            dataIntegrity: {},
            conflicts: []
        };
        
        // Check for each legacy system
        for (const systemName of this.migrationOrder) {
            const detector = this._getSystemDetector(systemName);
            const detected = await detector();
            
            if (detected.found) {
                validation.legacyDataFound = true;
                validation.systemsDetected.push({
                    system: systemName,
                    ...detected
                });
            }
        }
        
        this.migrationReport.validation.preValidation = validation;
        
        if (!validation.legacyDataFound) {
            throw new BDOMigrationError('No legacy data found to migrate');
        }
        
        console.log(`✅ Pre-validation complete: ${validation.systemsDetected.length} systems detected`);
    }
    
    /**
     * Create backup of current state
     */
    async _createBackup() {
        console.log('💾 Creating migration backup...');
        
        const backup = {
            timestamp: Date.now(),
            localStorage: {},
            unified: {
                materials: await this.storageManager.getAllMaterials(),
                projects: await this.storageManager.getAllProjects()
            }
        };
        
        // Backup all localStorage data
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('bdo') || key.includes('ship_upgrade'))) {
                backup.localStorage[key] = localStorage.getItem(key);
            }
        }
        
        // Store backup
        this.storageManager._setStorageItem('bdo-unified-migration-backup', backup);
        
        console.log(`💾 Backup created with ${Object.keys(backup.localStorage).length} localStorage entries`);
    }
    
    /**
     * Migrate individual system
     */
    async _migrateSystem(systemName) {
        console.log(`🔄 Migrating ${systemName}...`);
        
        const systemResult = {
            name: systemName,
            startTime: Date.now(),
            success: false,
            materialsMigrated: 0,
            projectsMigrated: 0,
            errors: [],
            warnings: [],
            details: {}
        };
        
        try {
            const migrator = this._getSystemMigrator(systemName);
            const result = await migrator();
            
            systemResult.success = true;
            systemResult.materialsMigrated = result.materialsMigrated || 0;
            systemResult.projectsMigrated = result.projectsMigrated || 0;
            systemResult.details = result.details || {};
            
            // Update summary
            this.migrationReport.summary.totalMaterialsMigrated += systemResult.materialsMigrated;
            this.migrationReport.summary.totalProjectsMigrated += systemResult.projectsMigrated;
            
            console.log(`✅ ${systemName} migrated: ${systemResult.materialsMigrated} materials, ${systemResult.projectsMigrated} projects`);
            
        } catch (error) {
            systemResult.success = false;
            systemResult.errors.push(error.message || error);
            this.migrationReport.summary.errors.push(`${systemName}: ${error.message || error}`);
            
            console.error(`❌ Failed to migrate ${systemName}:`, error);
        }
        
        systemResult.endTime = Date.now();
        systemResult.duration = systemResult.endTime - systemResult.startTime;
        this.migrationReport.systems[systemName] = systemResult;
    }
    
    // =============================================================================
    // SYSTEM DETECTORS
    // =============================================================================
    
    _getSystemDetector(systemName) {
        switch (systemName) {
            case 'appLegacyStorage':
                return this._detectAppLegacyStorage.bind(this);
            case 'globalInventoryManager':
                return this._detectGlobalInventoryManager.bind(this);
            case 'craftNavigator':
                return this._detectCraftNavigator.bind(this);
            case 'inventorySystem':
                return this._detectInventorySystem.bind(this);
            case 'craftNavigationUI':
                return this._detectCraftNavigationUI.bind(this);
            default:
                throw new BDOMigrationError(`Unknown system: ${systemName}`);
        }
    }
    
    async _detectAppLegacyStorage() {
        const globalInventory = localStorage.getItem('bdo_ship_upgrade-globalInventory');
        
        if (!globalInventory) {
            return { found: false };
        }
        
        try {
            const data = JSON.parse(globalInventory);
            const materialCount = Object.keys(data).length;
            
            return {
                found: true,
                materials: materialCount,
                size: new Blob([globalInventory]).size,
                hasData: materialCount > 0
            };
        } catch (error) {
            return {
                found: true,
                corrupted: true,
                error: error.message
            };
        }
    }
    
    async _detectGlobalInventoryManager() {
        const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
            .filter(key => key && key.startsWith('bdo-craft-'));
        
        if (keys.length === 0) {
            return { found: false };
        }
        
        const materialKeys = keys.filter(key => key.startsWith('bdo-craft-inventory-'));
        const projectKeys = keys.filter(key => key === 'bdo-craft-active-projects');
        
        return {
            found: true,
            totalKeys: keys.length,
            materialKeys: materialKeys.length,
            hasActiveProjects: projectKeys.length > 0,
            detectedKeys: keys
        };
    }
    
    async _detectCraftNavigator() {
        const activeProjects = localStorage.getItem('bdo-craft-navigator-active');
        const navigationState = localStorage.getItem('bdo-craft-navigator-state');
        
        const found = !!(activeProjects || navigationState);
        
        if (!found) {
            return { found: false };
        }
        
        let projectCount = 0;
        try {
            if (activeProjects) {
                const projects = JSON.parse(activeProjects);
                projectCount = Array.isArray(projects) ? projects.length : 0;
            }
        } catch (error) {
            // Ignore parsing errors for detection
        }
        
        return {
            found: true,
            activeProjects: !!activeProjects,
            navigationState: !!navigationState,
            projectCount
        };
    }
    
    async _detectInventorySystem() {
        const settings = localStorage.getItem('bdo-inventory-settings');
        const preferences = localStorage.getItem('bdo-inventory-preferences');
        
        const found = !!(settings || preferences);
        
        return {
            found,
            hasSettings: !!settings,
            hasPreferences: !!preferences
        };
    }
    
    async _detectCraftNavigationUI() {
        const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
            .filter(key => key && key.startsWith('bdo-craft-ui-'));
        
        return {
            found: keys.length > 0,
            totalKeys: keys.length,
            detectedKeys: keys
        };
    }
    
    // =============================================================================
    // SYSTEM MIGRATORS
    // =============================================================================
    
    _getSystemMigrator(systemName) {
        switch (systemName) {
            case 'appLegacyStorage':
                return this._migrateAppLegacyStorage.bind(this);
            case 'globalInventoryManager':
                return this._migrateGlobalInventoryManager.bind(this);
            case 'craftNavigator':
                return this._migrateCraftNavigator.bind(this);
            case 'inventorySystem':
                return this._migrateInventorySystem.bind(this);
            case 'craftNavigationUI':
                return this._migrateCraftNavigationUI.bind(this);
            default:
                throw new BDOMigrationError(`Unknown system: ${systemName}`);
        }
    }
    
    async _migrateAppLegacyStorage() {
        console.log('📦 Migrating App Legacy Storage...');
        
        const globalInventoryData = localStorage.getItem('bdo_ship_upgrade-globalInventory');
        if (!globalInventoryData) {
            return { materialsMigrated: 0, projectsMigrated: 0 };
        }
        
        let materialsMigrated = 0;
        
        try {
            const globalInventory = JSON.parse(globalInventoryData);
            
            for (const [materialName, inventoryData] of Object.entries(globalInventory)) {
                // Create unified material from legacy data
                const material = new UnifiedMaterial({
                    name: materialName,
                    owned: inventoryData.total || 0,
                    needed: 0, // Will be calculated later from projects
                    category: this._categorizeMaterial(materialName),
                    metadata: {
                        migratedFrom: 'appLegacyStorage',
                        originalData: inventoryData,
                        migrationTimestamp: Date.now()
                    }
                });
                
                // Save to unified storage
                await this.storageManager.saveMaterial(materialName, material, 'migration-app-legacy');
                materialsMigrated++;
            }
            
            console.log(`✅ App Legacy Storage migrated: ${materialsMigrated} materials`);
            
        } catch (error) {
            throw new BDOMigrationError('Failed to migrate App Legacy Storage', {
                originalError: error,
                data: globalInventoryData
            });
        }
        
        return {
            materialsMigrated,
            projectsMigrated: 0,
            details: {
                source: 'bdo_ship_upgrade-globalInventory',
                format: 'nested_json'
            }
        };
    }
    
    async _migrateGlobalInventoryManager() {
        console.log('📦 Migrating Global Inventory Manager...');
        
        let materialsMigrated = 0;
        let projectsMigrated = 0;
        
        // Migrate individual material quantities
        const materialKeys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
            .filter(key => key && key.startsWith('bdo-craft-inventory-global-'));
        
        for (const key of materialKeys) {
            const materialName = key.replace('bdo-craft-inventory-global-', '');
            const quantityStr = localStorage.getItem(key);
            
            if (quantityStr !== null) {
                try {
                    const quantity = parseInt(quantityStr) || 0;
                    
                    // Get existing material or create new one
                    let material = await this.storageManager.getMaterial(materialName);
                    if (!material || material.owned === 0) {
                        material = new UnifiedMaterial({
                            name: materialName,
                            owned: quantity,
                            needed: material?.needed || 0,
                            category: this._categorizeMaterial(materialName),
                            metadata: {
                                migratedFrom: 'globalInventoryManager',
                                migrationTimestamp: Date.now()
                            }
                        });
                    } else {
                        // Update existing material (merge data)
                        material.owned = Math.max(material.owned, quantity);
                        material.metadata.globalInventoryQuantity = quantity;
                    }
                    
                    await this.storageManager.saveMaterial(materialName, material, 'migration-global-inventory');
                    materialsMigrated++;
                    
                } catch (error) {
                    console.warn(`⚠️ Failed to migrate material ${materialName}:`, error);
                }
            }
        }
        
        // Migrate active projects
        const activeProjectsData = localStorage.getItem('bdo-craft-active-projects');
        if (activeProjectsData) {
            try {
                const activeProjects = JSON.parse(activeProjectsData);
                
                if (Array.isArray(activeProjects)) {
                    for (const projectData of activeProjects) {
                        const project = new UnifiedProject({
                            name: projectData.name,
                            type: projectData.type || 'materials',
                            status: projectData.status || 'active',
                            requirements: projectData.requirements || {},
                            completionPercent: projectData.completionStatus?.completionPercent || 0,
                            createdAt: projectData.addedAt || Date.now(),
                            lastUpdated: projectData.lastUpdated || Date.now(),
                            metadata: {
                                migratedFrom: 'globalInventoryManager',
                                originalData: projectData,
                                migrationTimestamp: Date.now()
                            }
                        });
                        
                        // Mark as completed if needed
                        if (projectData.status === 'completed' || projectData.completionStatus?.isCompleted) {
                            project.markCompleted();
                        }
                        
                        await this.storageManager.saveProject(project, 'migration-global-inventory');
                        projectsMigrated++;
                        
                        // Update material requirements
                        if (project.requirements) {
                            await this._updateMaterialRequirements(project.requirements, project.name);
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ Failed to migrate active projects:', error);
            }
        }
        
        console.log(`✅ Global Inventory Manager migrated: ${materialsMigrated} materials, ${projectsMigrated} projects`);
        
        return {
            materialsMigrated,
            projectsMigrated,
            details: {
                materialKeys: materialKeys.length,
                hasActiveProjects: !!activeProjectsData,
                format: 'individual_keys'
            }
        };
    }
    
    async _migrateCraftNavigator() {
        console.log('📦 Migrating Craft Navigator...');
        
        let projectsMigrated = 0;
        
        // Migrate active projects list
        const activeProjectsData = localStorage.getItem('bdo-craft-navigator-active');
        if (activeProjectsData) {
            try {
                const activeProjects = JSON.parse(activeProjectsData);
                
                if (Array.isArray(activeProjects)) {
                    for (const projectName of activeProjects) {
                        // Check if project already exists
                        let existingProject = await this.storageManager.getProject(projectName);
                        
                        if (!existingProject) {
                            // Create new project
                            const project = new UnifiedProject({
                                name: projectName,
                                type: this._categorizeProject(projectName),
                                status: 'active',
                                requirements: {}, // Will be populated from craft data if available
                                createdAt: Date.now(),
                                metadata: {
                                    migratedFrom: 'craftNavigator',
                                    migrationTimestamp: Date.now()
                                }
                            });
                            
                            await this.storageManager.saveProject(project, 'migration-craft-navigator');
                            projectsMigrated++;
                        } else {
                            // Update metadata to include navigation source
                            if (!existingProject.metadata.sources) {
                                existingProject.metadata.sources = [];
                            }
                            existingProject.metadata.sources.push('craftNavigator');
                            await this.storageManager.saveProject(existingProject, 'migration-craft-navigator');
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ Failed to migrate craft navigator active projects:', error);
            }
        }
        
        // Migrate navigation state
        const navigationState = localStorage.getItem('bdo-craft-navigator-state');
        if (navigationState) {
            try {
                const navState = JSON.parse(navigationState);
                
                // Store navigation state in unified settings
                const settings = await this.storageManager.memoryCache.get('settings') || {};
                settings.craftNavigation = {
                    ...navState,
                    migratedFrom: 'craftNavigator',
                    migrationTimestamp: Date.now()
                };
                
                this.storageManager.memoryCache.set('settings', settings);
                await this.storageManager._commitToStorage('settings', settings);
                
            } catch (error) {
                console.warn('⚠️ Failed to migrate navigation state:', error);
            }
        }
        
        console.log(`✅ Craft Navigator migrated: ${projectsMigrated} projects`);
        
        return {
            materialsMigrated: 0,
            projectsMigrated,
            details: {
                hasActiveProjects: !!activeProjectsData,
                hasNavigationState: !!navigationState
            }
        };
    }
    
    async _migrateInventorySystem() {
        console.log('📦 Migrating Inventory System...');
        
        let settingsMigrated = 0;
        
        // Migrate settings
        const settingsData = localStorage.getItem('bdo-inventory-settings');
        if (settingsData) {
            try {
                const inventorySettings = JSON.parse(settingsData);
                
                const settings = await this.storageManager.memoryCache.get('settings') || {};
                settings.inventory = {
                    ...inventorySettings,
                    migratedFrom: 'inventorySystem',
                    migrationTimestamp: Date.now()
                };
                
                this.storageManager.memoryCache.set('settings', settings);
                await this.storageManager._commitToStorage('settings', settings);
                settingsMigrated++;
                
            } catch (error) {
                console.warn('⚠️ Failed to migrate inventory settings:', error);
            }
        }
        
        // Migrate preferences
        const preferencesData = localStorage.getItem('bdo-inventory-preferences');
        if (preferencesData) {
            try {
                const inventoryPreferences = JSON.parse(preferencesData);
                
                const settings = await this.storageManager.memoryCache.get('settings') || {};
                if (!settings.inventory) settings.inventory = {};
                settings.inventory.preferences = {
                    ...inventoryPreferences,
                    migratedFrom: 'inventorySystem',
                    migrationTimestamp: Date.now()
                };
                
                this.storageManager.memoryCache.set('settings', settings);
                await this.storageManager._commitToStorage('settings', settings);
                settingsMigrated++;
                
            } catch (error) {
                console.warn('⚠️ Failed to migrate inventory preferences:', error);
            }
        }
        
        console.log(`✅ Inventory System migrated: ${settingsMigrated} settings`);
        
        return {
            materialsMigrated: 0,
            projectsMigrated: 0,
            details: {
                settingsMigrated,
                hasSettings: !!settingsData,
                hasPreferences: !!preferencesData
            }
        };
    }
    
    async _migrateCraftNavigationUI() {
        console.log('📦 Migrating Craft Navigation UI...');
        
        let settingsMigrated = 0;
        
        const uiKeys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
            .filter(key => key && key.startsWith('bdo-craft-ui-'));
        
        const uiData = {};
        
        for (const key of uiKeys) {
            const data = localStorage.getItem(key);
            if (data) {
                try {
                    uiData[key] = JSON.parse(data);
                    settingsMigrated++;
                } catch (error) {
                    console.warn(`⚠️ Failed to parse UI data for ${key}:`, error);
                }
            }
        }
        
        if (settingsMigrated > 0) {
            const settings = await this.storageManager.memoryCache.get('settings') || {};
            settings.craftNavigationUI = {
                ...uiData,
                migratedFrom: 'craftNavigationUI',
                migrationTimestamp: Date.now()
            };
            
            this.storageManager.memoryCache.set('settings', settings);
            await this.storageManager._commitToStorage('settings', settings);
        }
        
        console.log(`✅ Craft Navigation UI migrated: ${settingsMigrated} settings`);
        
        return {
            materialsMigrated: 0,
            projectsMigrated: 0,
            details: {
                settingsMigrated,
                uiKeysFound: uiKeys.length
            }
        };
    }
    
    // =============================================================================
    // UTILITY METHODS
    // =============================================================================
    
    /**
     * Update material requirements from project data
     */
    async _updateMaterialRequirements(requirements, projectName) {
        for (const [materialName, reqData] of Object.entries(requirements)) {
            try {
                let material = await this.storageManager.getMaterial(materialName);
                if (!material) {
                    material = new UnifiedMaterial({
                        name: materialName,
                        owned: 0,
                        needed: reqData.quantity || 0,
                        category: this._categorizeMaterial(materialName)
                    });
                } else {
                    // Update needed quantity
                    material.needed = Math.max(material.needed, reqData.quantity || 0);
                    material.updateQuantity(material.owned, material.needed);
                }
                
                // Add to usedBy list
                if (!material.usedBy.includes(projectName)) {
                    material.usedBy.push(projectName);
                }
                
                await this.storageManager.saveMaterial(materialName, material, 'migration-requirements');
                
            } catch (error) {
                console.warn(`⚠️ Failed to update requirements for ${materialName}:`, error);
            }
        }
    }
    
    /**
     * Categorize material based on name patterns
     */
    _categorizeMaterial(materialName) {
        // Ships
        if (materialName.includes('ship_') || materialName.includes('Caravel') || 
            materialName.includes('Carrack') || materialName.includes('Galleass')) {
            return 'ships';
        }
        
        // Ship parts
        if (materialName.includes(': ') || materialName.includes('Ship Upgrade Permit') ||
            materialName.includes('Cannon') || materialName.includes('Sail')) {
            return 'ship_parts';
        }
        
        // Barter items
        if (materialName.includes('Coin') || materialName.includes('00800')) {
            return 'barter_items';
        }
        
        // Special items
        if (materialName.includes('Gold Bar') || materialName.includes('Black Stone') ||
            materialName.includes('Reform Stone') || materialName.includes('Blueprint:')) {
            return 'special';
        }
        
        // Default to materials
        return 'materials';
    }
    
    /**
     * Categorize project based on name patterns
     */
    _categorizeProject(projectName) {
        return this._categorizeMaterial(projectName);
    }
    
    /**
     * Perform post-migration validation
     */
    async _performPostValidation() {
        console.log('🔍 Performing post-migration validation...');
        
        const materials = await this.storageManager.getAllMaterials();
        const projects = await this.storageManager.getAllProjects();
        
        const validation = {
            materialsCount: Object.keys(materials).length,
            projectsCount: Object.keys(projects).length,
            completedProjects: Object.values(projects).filter(p => p.status === 'completed').length,
            materialsWithQuantities: Object.values(materials).filter(m => m.owned > 0).length,
            materialsWithRequirements: Object.values(materials).filter(m => m.needed > 0).length
        };
        
        this.migrationReport.validation.postValidation = validation;
        
        console.log(`✅ Post-validation complete: ${validation.materialsCount} materials, ${validation.projectsCount} projects`);
    }
    
    /**
     * Perform data integrity check
     */
    async _performIntegrityCheck() {
        console.log('🔍 Performing data integrity check...');
        
        const integrity = {
            duplicates: [],
            orphanedData: [],
            missingReferences: [],
            dataConsistency: {
                passed: true,
                issues: []
            }
        };
        
        const materials = await this.storageManager.getAllMaterials();
        const projects = await this.storageManager.getAllProjects();
        
        // Check for duplicate materials
        const materialNames = Object.keys(materials);
        const uniqueNames = new Set(materialNames);
        if (materialNames.length !== uniqueNames.size) {
            integrity.duplicates.push('Duplicate material names detected');
            integrity.dataConsistency.passed = false;
        }
        
        // Check for orphaned material requirements
        for (const [materialName, material] of Object.entries(materials)) {
            if (material.usedBy && material.usedBy.length > 0) {
                for (const projectName of material.usedBy) {
                    if (!projects[projectName]) {
                        integrity.orphanedData.push(`Material ${materialName} references missing project ${projectName}`);
                        integrity.dataConsistency.passed = false;
                    }
                }
            }
        }
        
        // Check for missing material references in projects
        for (const [projectName, project] of Object.entries(projects)) {
            if (project.requirements) {
                for (const materialName of Object.keys(project.requirements)) {
                    if (!materials[materialName]) {
                        integrity.missingReferences.push(`Project ${projectName} references missing material ${materialName}`);
                        integrity.dataConsistency.passed = false;
                    }
                }
            }
        }
        
        this.migrationReport.validation.integritySummary = integrity;
        
        if (integrity.dataConsistency.passed) {
            console.log('✅ Data integrity check passed');
        } else {
            console.warn('⚠️ Data integrity issues found:', integrity.dataConsistency.issues);
        }
    }
    
    /**
     * Finalize migration report
     */
    _finalizeMigrationReport(success, error = null) {
        this.migrationReport.endTime = Date.now();
        this.migrationReport.duration = this.migrationReport.endTime - this.migrationReport.startTime;
        this.migrationReport.success = success;
        
        if (error) {
            this.migrationReport.summary.errors.push(error.message || error);
        }
        
        // Create summary
        const systemCount = Object.keys(this.migrationReport.systems).length;
        const successfulSystems = Object.values(this.migrationReport.systems).filter(s => s.success).length;
        
        this.migrationReport.summary.systemsProcessed = systemCount;
        this.migrationReport.summary.successfulSystems = successfulSystems;
        this.migrationReport.summary.failedSystems = systemCount - successfulSystems;
        this.migrationReport.summary.durationMs = this.migrationReport.duration;
        this.migrationReport.summary.durationFormatted = this._formatDuration(this.migrationReport.duration);
        
        console.log(`📊 Migration summary: ${successfulSystems}/${systemCount} systems migrated successfully`);
    }
    
    /**
     * Format duration for human reading
     */
    _formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
        return `${(ms / 60000).toFixed(2)}m`;
    }
}

export default UnifiedStorageMigration;