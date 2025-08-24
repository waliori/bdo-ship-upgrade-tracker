// BDO Ship Upgrade Tracker - Migration Rollback Manager
// Provides rollback procedures and recovery mechanisms for failed migrations
// VALIDATOR AGENT - Ensures safe recovery from migration failures

/**
 * Rollback and Recovery Manager
 * 
 * This utility provides comprehensive rollback and recovery mechanisms for the 
 * storage unification migration. It ensures safe recovery from migration failures
 * and provides multiple recovery strategies.
 */

export class RollbackManager {
    constructor() {
        this.rollbackPoints = new Map();
        this.recoveryLog = [];
        this.rollbackStrategies = new Map();
        this.emergencyBackups = new Map();
        
        // Initialize rollback strategies
        this.initializeRollbackStrategies();
        
        // Storage keys for rollback management
        this.storageKeys = {
            rollbackPoints: 'bdo-rollback-points',
            recoveryLog: 'bdo-recovery-log',
            emergencyBackups: 'bdo-emergency-backups',
            rollbackMetadata: 'bdo-rollback-metadata'
        };
        
        // Load existing rollback points from localStorage
        this.loadRollbackPointsFromStorage();
    }

    /**
     * Initialize different rollback strategies
     */
    initializeRollbackStrategies() {
        // Strategy 1: Complete System Rollback
        this.rollbackStrategies.set('complete', {
            name: 'Complete System Rollback',
            description: 'Rolls back entire system to previous state',
            priority: 1,
            execute: this.executeCompleteRollback.bind(this)
        });

        // Strategy 2: Selective Component Rollback
        this.rollbackStrategies.set('selective', {
            name: 'Selective Component Rollback',
            description: 'Rolls back only specific components that failed',
            priority: 2,
            execute: this.executeSelectiveRollback.bind(this)
        });

        // Strategy 3: Data-Only Rollback
        this.rollbackStrategies.set('dataonly', {
            name: 'Data-Only Rollback',
            description: 'Rolls back only data structures, preserves user preferences',
            priority: 3,
            execute: this.executeDataOnlyRollback.bind(this)
        });

        // Strategy 4: Emergency Recovery
        this.rollbackStrategies.set('emergency', {
            name: 'Emergency Recovery',
            description: 'Last resort recovery using emergency backups',
            priority: 4,
            execute: this.executeEmergencyRecovery.bind(this)
        });
    }

    /**
     * Create a comprehensive rollback point
     */
    createRollbackPoint(pointName, metadata = {}) {
        console.log(`🔄 Creating rollback point: ${pointName}`);
        
        const rollbackPoint = {
            name: pointName,
            timestamp: Date.now(),
            metadata: {
                ...metadata,
                version: '1.0',
                creator: 'rollback-manager'
            },
            
            // Complete system snapshot
            systemSnapshot: {
                localStorage: this.captureLocalStorageSnapshot(),
                systemState: this.captureSystemState(),
                componentStates: this.captureComponentStates(),
                userPreferences: this.captureUserPreferences()
            },
            
            // Validation data at point of creation
            validationSnapshot: {
                dataIntegrity: this.captureDataIntegritySnapshot(),
                systemHealth: this.captureSystemHealthSnapshot(),
                workflowStatus: this.captureWorkflowStatusSnapshot()
            },
            
            // Recovery metadata
            recoveryMetadata: {
                criticalKeys: this.identifyCriticalStorageKeys(),
                dependencies: this.mapDataDependencies(),
                checksums: this.calculateDataChecksums(),
                backupSize: 0 // Will be calculated
            }
        };

        // Calculate backup size
        rollbackPoint.recoveryMetadata.backupSize = this.calculateBackupSize(rollbackPoint);

        // Store rollback point
        this.rollbackPoints.set(pointName, rollbackPoint);
        this.saveRollbackPointsToStorage();

        // Create emergency backup
        this.createEmergencyBackup(pointName, rollbackPoint);

        console.log(`✅ Rollback point created: ${pointName} (${this.formatBytes(rollbackPoint.recoveryMetadata.backupSize)})`);
        
        return rollbackPoint;
    }

    /**
     * Capture complete localStorage snapshot
     */
    captureLocalStorageSnapshot() {
        const snapshot = {};
        const allKeys = [];
        
        // Get all localStorage keys
        for (let i = 0; i < localStorage.length; i++) {
            allKeys.push(localStorage.key(i));
        }

        // Filter for BDO-related keys
        const relevantKeys = allKeys.filter(key => 
            key.startsWith('bdo-') || key.startsWith('bdo_ship_upgrade')
        );

        // Capture each key's data
        for (const key of relevantKeys) {
            try {
                const value = localStorage.getItem(key);
                snapshot[key] = {
                    raw: value,
                    parsed: JSON.parse(value),
                    size: new Blob([value]).size,
                    checksum: this.calculateChecksum(value),
                    timestamp: Date.now()
                };
            } catch (error) {
                // Store raw value if JSON parsing fails
                snapshot[key] = {
                    raw: value,
                    parsed: null,
                    parseError: error.message,
                    size: new Blob([value || '']).size,
                    checksum: this.calculateChecksum(value || ''),
                    timestamp: Date.now()
                };
            }
        }

        return snapshot;
    }

    /**
     * Capture system state information
     */
    captureSystemState() {
        return {
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            localStorage: {
                available: typeof(Storage) !== "undefined",
                usage: this.calculateStorageUsage(),
                keyCount: localStorage.length
            },
            windowSize: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            url: window.location.href,
            title: document.title
        };
    }

    /**
     * Capture component states
     */
    captureComponentStates() {
        const states = {};

        // Global Inventory state
        states.globalInventory = {
            activeProjectsCount: this.getStorageItem('bdo-craft-active-projects', []).length,
            inventoryKeysCount: this.getInventoryKeysCount(),
            lastUpdate: this.getStorageItem('bdo-craft-active-projects', [])
                .reduce((latest, project) => Math.max(latest, project.lastUpdated || 0), 0)
        };

        // Craft Navigator state
        states.craftNavigator = {
            currentCraft: this.getStorageItem('bdo-craft-navigator-state', {}).currentCraft,
            activeCraftsCount: this.getStorageItem('bdo-craft-navigator-active', []).length,
            navigationHistoryCount: this.getStorageItem('bdo-craft-nav-history', []).length
        };

        // Inventory System state
        states.inventorySystem = {
            hasSettings: !!localStorage.getItem('bdo-inventory-settings'),
            settingsSize: this.getStorageItemSize('bdo-inventory-settings')
        };

        // UI state
        states.craftUI = {
            hasPreferences: !!localStorage.getItem('bdo-craft-ui-preferences'),
            hasViewState: !!localStorage.getItem('bdo-craft-ui-view-state')
        };

        return states;
    }

    /**
     * Capture user preferences
     */
    captureUserPreferences() {
        const preferences = {};

        // Inventory UI preferences
        const inventorySettings = this.getStorageItem('bdo-inventory-settings');
        if (inventorySettings) {
            preferences.inventorySettings = inventorySettings;
        }

        // Craft UI preferences
        const craftUIPrefs = this.getStorageItem('bdo-craft-ui-preferences');
        if (craftUIPrefs) {
            preferences.craftUIPreferences = craftUIPrefs;
        }

        // Tour and guide preferences
        preferences.tourCompleted = localStorage.getItem('bdo_ship_upgrade-tour_completed');
        preferences.autoTourEnabled = localStorage.getItem('bdo_ship_upgrade-auto_tour_enabled');
        preferences.floatingMinimized = localStorage.getItem('bdo_ship_upgrade-floating-minimized');

        return preferences;
    }

    /**
     * Capture data integrity snapshot
     */
    captureDataIntegritySnapshot() {
        // This would integrate with the migration validator if available
        try {
            // Try to import and use migration validator
            import('./migration-validator.js').then(({ migrationValidator }) => {
                return migrationValidator.validateDataIntegrity();
            }).catch(() => {
                // Fallback basic validation
                return this.basicDataIntegrityCheck();
            });
        } catch (error) {
            return this.basicDataIntegrityCheck();
        }
    }

    /**
     * Basic data integrity check as fallback
     */
    basicDataIntegrityCheck() {
        const integrity = {
            passed: true,
            issues: [],
            keyCount: 0,
            corruptedKeys: []
        };

        try {
            const allKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                allKeys.push(localStorage.key(i));
            }

            const relevantKeys = allKeys.filter(key => 
                key.startsWith('bdo-') || key.startsWith('bdo_ship_upgrade')
            );

            integrity.keyCount = relevantKeys.length;

            // Check for JSON corruption
            for (const key of relevantKeys) {
                try {
                    const value = localStorage.getItem(key);
                    if (value && value.startsWith('{') || value.startsWith('[')) {
                        JSON.parse(value);
                    }
                } catch (error) {
                    integrity.corruptedKeys.push(key);
                    integrity.passed = false;
                }
            }

        } catch (error) {
            integrity.issues.push(`Basic integrity check failed: ${error.message}`);
            integrity.passed = false;
        }

        return integrity;
    }

    /**
     * Capture system health snapshot
     */
    captureSystemHealthSnapshot() {
        return {
            timestamp: Date.now(),
            storageUsage: this.calculateStorageUsage(),
            keyDistribution: this.analyzeKeyDistribution(),
            memoryUsage: this.estimateMemoryUsage()
        };
    }

    /**
     * Capture workflow status snapshot
     */
    captureWorkflowStatusSnapshot() {
        return {
            timestamp: Date.now(),
            activeProjectsPresent: !!localStorage.getItem('bdo-craft-active-projects'),
            inventoryDataPresent: this.getInventoryKeysCount() > 0,
            navigationStatePresent: !!localStorage.getItem('bdo-craft-navigator-state'),
            userPreferencesPresent: !!localStorage.getItem('bdo-inventory-settings')
        };
    }

    /**
     * Execute complete system rollback
     */
    async executeCompleteRollback(rollbackPointName, options = {}) {
        console.log(`🔄 Executing complete system rollback to: ${rollbackPointName}`);
        
        const rollbackPoint = this.rollbackPoints.get(rollbackPointName);
        if (!rollbackPoint) {
            throw new Error(`Rollback point not found: ${rollbackPointName}`);
        }

        const rollbackOperation = {
            id: `rollback-${Date.now()}`,
            type: 'complete',
            rollbackPoint: rollbackPointName,
            timestamp: Date.now(),
            steps: [],
            errors: [],
            success: false
        };

        try {
            // Step 1: Create emergency checkpoint before rollback
            if (!options.skipEmergencyCheckpoint) {
                rollbackOperation.steps.push(await this.createEmergencyCheckpointBeforeRollback(rollbackOperation.id));
            }

            // Step 2: Clear current localStorage data
            rollbackOperation.steps.push(await this.clearCurrentData(rollbackPoint));

            // Step 3: Restore complete localStorage snapshot
            rollbackOperation.steps.push(await this.restoreLocalStorageSnapshot(rollbackPoint.systemSnapshot.localStorage));

            // Step 4: Verify restoration
            rollbackOperation.steps.push(await this.verifyRollbackSuccess(rollbackPoint));

            // Step 5: Update rollback log
            rollbackOperation.success = true;
            this.logRollbackOperation(rollbackOperation);

            console.log(`✅ Complete system rollback successful: ${rollbackPointName}`);
            return rollbackOperation;

        } catch (error) {
            rollbackOperation.errors.push({
                step: 'complete_rollback',
                error: error.message,
                timestamp: Date.now()
            });

            // Attempt emergency recovery
            if (!options.skipEmergencyRecovery) {
                console.warn('⚠️ Complete rollback failed, attempting emergency recovery');
                return await this.executeEmergencyRecovery(rollbackPointName, { ...options, triggeredBy: 'failed_complete_rollback' });
            }

            this.logRollbackOperation(rollbackOperation);
            throw error;
        }
    }

    /**
     * Execute selective component rollback
     */
    async executeSelectiveRollback(rollbackPointName, components = [], options = {}) {
        console.log(`🔄 Executing selective rollback to: ${rollbackPointName}, components: ${components.join(', ')}`);
        
        const rollbackPoint = this.rollbackPoints.get(rollbackPointName);
        if (!rollbackPoint) {
            throw new Error(`Rollback point not found: ${rollbackPointName}`);
        }

        const rollbackOperation = {
            id: `selective-rollback-${Date.now()}`,
            type: 'selective',
            rollbackPoint: rollbackPointName,
            components,
            timestamp: Date.now(),
            steps: [],
            errors: [],
            success: false
        };

        try {
            // Map components to storage keys
            const componentKeyMappings = {
                globalInventory: [
                    'bdo-craft-active-projects',
                    'bdo-craft-project-priorities',
                    'bdo-craft-project-dependencies',
                    'bdo-craft-cross-materials',
                    'bdo-craft-inventory-session'
                ],
                craftNavigator: [
                    'bdo-craft-navigator-active',
                    'bdo-craft-navigator-state',
                    'bdo-craft-cross-map',
                    'bdo-craft-nav-history'
                ],
                inventorySystem: [
                    'bdo-inventory-settings',
                    'bdo-inventory-preferences'
                ],
                craftUI: [
                    'bdo-craft-ui-active-projects',
                    'bdo-craft-ui-view-state',
                    'bdo-craft-ui-preferences',
                    'bdo-craft-ui-project-filters',
                    'bdo-craft-ui-nav-session'
                ]
            };

            // Collect all keys to rollback
            const keysToRollback = new Set();
            for (const component of components) {
                const keys = componentKeyMappings[component];
                if (keys) {
                    keys.forEach(key => keysToRollback.add(key));
                } else {
                    rollbackOperation.errors.push({
                        step: 'component_mapping',
                        error: `Unknown component: ${component}`,
                        timestamp: Date.now()
                    });
                }
            }

            // Add inventory data keys if globalInventory is being rolled back
            if (components.includes('globalInventory')) {
                const inventoryKeys = Object.keys(rollbackPoint.systemSnapshot.localStorage)
                    .filter(key => key.startsWith('bdo-craft-inventory-global-'));
                inventoryKeys.forEach(key => keysToRollback.add(key));
            }

            // Rollback each key
            for (const key of keysToRollback) {
                try {
                    const backupData = rollbackPoint.systemSnapshot.localStorage[key];
                    if (backupData) {
                        localStorage.setItem(key, backupData.raw);
                        rollbackOperation.steps.push({
                            step: 'restore_key',
                            key,
                            success: true,
                            timestamp: Date.now()
                        });
                    } else {
                        // Key didn't exist in backup, remove it
                        localStorage.removeItem(key);
                        rollbackOperation.steps.push({
                            step: 'remove_key',
                            key,
                            success: true,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    rollbackOperation.errors.push({
                        step: 'restore_key',
                        key,
                        error: error.message,
                        timestamp: Date.now()
                    });
                }
            }

            rollbackOperation.success = rollbackOperation.errors.length === 0;
            this.logRollbackOperation(rollbackOperation);

            console.log(`✅ Selective rollback completed: ${components.length} components, ${rollbackOperation.errors.length} errors`);
            return rollbackOperation;

        } catch (error) {
            rollbackOperation.errors.push({
                step: 'selective_rollback',
                error: error.message,
                timestamp: Date.now()
            });

            this.logRollbackOperation(rollbackOperation);
            throw error;
        }
    }

    /**
     * Execute data-only rollback
     */
    async executeDataOnlyRollback(rollbackPointName, options = {}) {
        console.log(`🔄 Executing data-only rollback to: ${rollbackPointName}`);
        
        const rollbackPoint = this.rollbackPoints.get(rollbackPointName);
        if (!rollbackPoint) {
            throw new Error(`Rollback point not found: ${rollbackPointName}`);
        }

        const rollbackOperation = {
            id: `dataonly-rollback-${Date.now()}`,
            type: 'dataonly',
            rollbackPoint: rollbackPointName,
            timestamp: Date.now(),
            steps: [],
            errors: [],
            success: false
        };

        try {
            // Define data keys (non-preference keys)
            const dataKeys = Object.keys(rollbackPoint.systemSnapshot.localStorage)
                .filter(key => !this.isUserPreferenceKey(key));

            // Rollback only data keys
            for (const key of dataKeys) {
                try {
                    const backupData = rollbackPoint.systemSnapshot.localStorage[key];
                    if (backupData) {
                        localStorage.setItem(key, backupData.raw);
                    } else {
                        localStorage.removeItem(key);
                    }
                    
                    rollbackOperation.steps.push({
                        step: 'restore_data_key',
                        key,
                        success: true,
                        timestamp: Date.now()
                    });
                } catch (error) {
                    rollbackOperation.errors.push({
                        step: 'restore_data_key',
                        key,
                        error: error.message,
                        timestamp: Date.now()
                    });
                }
            }

            rollbackOperation.success = rollbackOperation.errors.length === 0;
            this.logRollbackOperation(rollbackOperation);

            console.log(`✅ Data-only rollback completed: ${dataKeys.length} keys restored, ${rollbackOperation.errors.length} errors`);
            return rollbackOperation;

        } catch (error) {
            rollbackOperation.errors.push({
                step: 'dataonly_rollback',
                error: error.message,
                timestamp: Date.now()
            });

            this.logRollbackOperation(rollbackOperation);
            throw error;
        }
    }

    /**
     * Execute emergency recovery
     */
    async executeEmergencyRecovery(identifier, options = {}) {
        console.log(`🚨 Executing emergency recovery: ${identifier}`);
        
        const recoveryOperation = {
            id: `emergency-${Date.now()}`,
            type: 'emergency',
            trigger: identifier,
            timestamp: Date.now(),
            steps: [],
            errors: [],
            success: false
        };

        try {
            // Try multiple recovery strategies in order of preference
            const strategies = [
                { name: 'latest_emergency_backup', action: () => this.recoverFromEmergencyBackup() },
                { name: 'latest_rollback_point', action: () => this.recoverFromLatestRollbackPoint() },
                { name: 'factory_reset', action: () => this.performFactoryReset() }
            ];

            for (const strategy of strategies) {
                try {
                    console.log(`🔄 Attempting emergency strategy: ${strategy.name}`);
                    const result = await strategy.action();
                    
                    recoveryOperation.steps.push({
                        strategy: strategy.name,
                        success: true,
                        result,
                        timestamp: Date.now()
                    });
                    
                    recoveryOperation.success = true;
                    break;

                } catch (error) {
                    recoveryOperation.errors.push({
                        strategy: strategy.name,
                        error: error.message,
                        timestamp: Date.now()
                    });
                    
                    console.warn(`⚠️ Emergency strategy failed: ${strategy.name} - ${error.message}`);
                }
            }

            this.logRollbackOperation(recoveryOperation);

            if (recoveryOperation.success) {
                console.log(`✅ Emergency recovery successful using strategy: ${recoveryOperation.steps[recoveryOperation.steps.length - 1].strategy}`);
            } else {
                console.error(`❌ All emergency recovery strategies failed`);
                throw new Error('All emergency recovery strategies exhausted');
            }

            return recoveryOperation;

        } catch (error) {
            recoveryOperation.errors.push({
                step: 'emergency_recovery',
                error: error.message,
                timestamp: Date.now()
            });

            this.logRollbackOperation(recoveryOperation);
            throw error;
        }
    }

    /**
     * Create emergency backup
     */
    createEmergencyBackup(name, rollbackPoint) {
        try {
            const backup = {
                name,
                timestamp: Date.now(),
                critical: {
                    activeProjects: rollbackPoint.systemSnapshot.localStorage['bdo-craft-active-projects'],
                    inventoryGlobal: rollbackPoint.systemSnapshot.localStorage['bdo-craft-inventory-global'],
                    navigatorState: rollbackPoint.systemSnapshot.localStorage['bdo-craft-navigator-state']
                },
                checksum: this.calculateChecksum(JSON.stringify(rollbackPoint))
            };

            this.emergencyBackups.set(name, backup);
            
            // Store in localStorage with compression
            localStorage.setItem('bdo-emergency-backups', JSON.stringify(Array.from(this.emergencyBackups.entries())));

            return backup;
        } catch (error) {
            console.error('Failed to create emergency backup:', error);
            return null;
        }
    }

    /**
     * Recover from emergency backup
     */
    async recoverFromEmergencyBackup() {
        const backups = Array.from(this.emergencyBackups.values());
        if (backups.length === 0) {
            throw new Error('No emergency backups available');
        }

        // Use latest backup
        const latestBackup = backups.sort((a, b) => b.timestamp - a.timestamp)[0];
        
        // Restore critical data
        for (const [key, data] of Object.entries(latestBackup.critical)) {
            if (data) {
                localStorage.setItem(key, data.raw);
            }
        }

        return {
            backup: latestBackup.name,
            restored: Object.keys(latestBackup.critical).length,
            timestamp: Date.now()
        };
    }

    /**
     * Recover from latest rollback point
     */
    async recoverFromLatestRollbackPoint() {
        if (this.rollbackPoints.size === 0) {
            throw new Error('No rollback points available');
        }

        const points = Array.from(this.rollbackPoints.values());
        const latestPoint = points.sort((a, b) => b.timestamp - a.timestamp)[0];

        return await this.executeCompleteRollback(latestPoint.name, { skipEmergencyCheckpoint: true });
    }

    /**
     * Perform factory reset
     */
    async performFactoryReset() {
        console.log('🏭 Performing factory reset - clearing all BDO data');
        
        const clearedKeys = [];
        
        // Get all BDO-related keys
        const allKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            allKeys.push(localStorage.key(i));
        }

        const bdoKeys = allKeys.filter(key => 
            key.startsWith('bdo-') || key.startsWith('bdo_ship_upgrade')
        );

        // Clear all BDO keys
        for (const key of bdoKeys) {
            localStorage.removeItem(key);
            clearedKeys.push(key);
        }

        return {
            action: 'factory_reset',
            clearedKeys: clearedKeys.length,
            timestamp: Date.now()
        };
    }

    /**
     * Verify rollback success
     */
    async verifyRollbackSuccess(rollbackPoint) {
        const verification = {
            success: true,
            issues: [],
            timestamp: Date.now()
        };

        try {
            // Check critical keys exist
            const criticalKeys = rollbackPoint.recoveryMetadata.criticalKeys;
            for (const key of criticalKeys) {
                if (!localStorage.getItem(key)) {
                    verification.issues.push(`Critical key missing after rollback: ${key}`);
                    verification.success = false;
                }
            }

            // Verify checksums
            for (const [key, data] of Object.entries(rollbackPoint.systemSnapshot.localStorage)) {
                const currentValue = localStorage.getItem(key);
                if (currentValue) {
                    const currentChecksum = this.calculateChecksum(currentValue);
                    if (currentChecksum !== data.checksum) {
                        verification.issues.push(`Checksum mismatch after rollback: ${key}`);
                        verification.success = false;
                    }
                }
            }

        } catch (error) {
            verification.issues.push(`Verification failed: ${error.message}`);
            verification.success = false;
        }

        return verification;
    }

    /**
     * Clear current data before rollback
     */
    async clearCurrentData(rollbackPoint) {
        const clearing = {
            clearedKeys: [],
            errors: [],
            timestamp: Date.now()
        };

        try {
            // Get all current BDO keys
            const allKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                allKeys.push(localStorage.key(i));
            }

            const bdoKeys = allKeys.filter(key => 
                key.startsWith('bdo-') || key.startsWith('bdo_ship_upgrade')
            );

            // Clear each key
            for (const key of bdoKeys) {
                try {
                    localStorage.removeItem(key);
                    clearing.clearedKeys.push(key);
                } catch (error) {
                    clearing.errors.push({
                        key,
                        error: error.message,
                        timestamp: Date.now()
                    });
                }
            }

        } catch (error) {
            clearing.errors.push({
                step: 'clear_current_data',
                error: error.message,
                timestamp: Date.now()
            });
        }

        return clearing;
    }

    /**
     * Restore localStorage snapshot
     */
    async restoreLocalStorageSnapshot(snapshot) {
        const restoration = {
            restoredKeys: [],
            errors: [],
            timestamp: Date.now()
        };

        try {
            for (const [key, data] of Object.entries(snapshot)) {
                try {
                    localStorage.setItem(key, data.raw);
                    restoration.restoredKeys.push(key);
                } catch (error) {
                    restoration.errors.push({
                        key,
                        error: error.message,
                        timestamp: Date.now()
                    });
                }
            }

        } catch (error) {
            restoration.errors.push({
                step: 'restore_snapshot',
                error: error.message,
                timestamp: Date.now()
            });
        }

        return restoration;
    }

    /**
     * Create emergency checkpoint before rollback
     */
    async createEmergencyCheckpointBeforeRollback(rollbackId) {
        try {
            const checkpoint = this.createRollbackPoint(`emergency-before-rollback-${rollbackId}`, {
                type: 'emergency',
                triggeredBy: rollbackId,
                description: 'Automatic emergency checkpoint before rollback operation'
            });

            return {
                step: 'emergency_checkpoint',
                success: true,
                checkpointName: checkpoint.name,
                timestamp: Date.now()
            };

        } catch (error) {
            return {
                step: 'emergency_checkpoint',
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Identify critical storage keys
     */
    identifyCriticalStorageKeys() {
        return [
            'bdo-craft-active-projects',
            'bdo-craft-inventory-global',
            'bdo-craft-navigator-state',
            'bdo-craft-navigator-active',
            'bdo_ship_upgrade-materials',
            'bdo_ship_upgrade-total'
        ];
    }

    /**
     * Map data dependencies
     */
    mapDataDependencies() {
        return {
            'bdo-craft-active-projects': ['bdo-craft-project-priorities', 'bdo-craft-project-dependencies'],
            'bdo-craft-navigator-active': ['bdo-craft-navigator-state', 'bdo-craft-cross-map'],
            'bdo-craft-inventory-global': ['bdo-craft-cross-materials'],
            'bdo-inventory-settings': ['bdo-inventory-preferences']
        };
    }

    /**
     * Calculate data checksums
     */
    calculateDataChecksums() {
        const checksums = {};
        
        const allKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            allKeys.push(localStorage.key(i));
        }

        const relevantKeys = allKeys.filter(key => 
            key.startsWith('bdo-') || key.startsWith('bdo_ship_upgrade')
        );

        for (const key of relevantKeys) {
            const value = localStorage.getItem(key);
            if (value) {
                checksums[key] = this.calculateChecksum(value);
            }
        }

        return checksums;
    }

    /**
     * Check if key is user preference
     */
    isUserPreferenceKey(key) {
        const preferencePatterns = [
            'settings',
            'preferences', 
            'tour_completed',
            'auto_tour_enabled',
            'floating-minimized',
            'ui-preferences',
            'view-state'
        ];

        return preferencePatterns.some(pattern => key.includes(pattern));
    }

    /**
     * Log rollback operation
     */
    logRollbackOperation(operation) {
        this.recoveryLog.push(operation);
        
        // Keep only last 50 operations
        if (this.recoveryLog.length > 50) {
            this.recoveryLog = this.recoveryLog.slice(-50);
        }

        // Save to localStorage
        try {
            localStorage.setItem(this.storageKeys.recoveryLog, JSON.stringify(this.recoveryLog));
        } catch (error) {
            console.warn('Failed to save recovery log:', error);
        }
    }

    /**
     * Load rollback points from storage
     */
    loadRollbackPointsFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKeys.rollbackPoints);
            if (stored) {
                const points = JSON.parse(stored);
                this.rollbackPoints = new Map(points);
                console.log(`📦 Loaded ${this.rollbackPoints.size} rollback points from storage`);
            }
        } catch (error) {
            console.warn('Failed to load rollback points from storage:', error);
        }

        // Load emergency backups
        try {
            const stored = localStorage.getItem(this.storageKeys.emergencyBackups);
            if (stored) {
                const backups = JSON.parse(stored);
                this.emergencyBackups = new Map(backups);
                console.log(`📦 Loaded ${this.emergencyBackups.size} emergency backups from storage`);
            }
        } catch (error) {
            console.warn('Failed to load emergency backups from storage:', error);
        }
    }

    /**
     * Save rollback points to storage
     */
    saveRollbackPointsToStorage() {
        try {
            localStorage.setItem(this.storageKeys.rollbackPoints, JSON.stringify(Array.from(this.rollbackPoints.entries())));
        } catch (error) {
            console.warn('Failed to save rollback points to storage:', error);
        }
    }

    /**
     * Get rollback point information
     */
    getRollbackPointInfo(pointName) {
        const point = this.rollbackPoints.get(pointName);
        if (!point) {
            return null;
        }

        return {
            name: point.name,
            timestamp: point.timestamp,
            size: point.recoveryMetadata.backupSize,
            criticalKeys: point.recoveryMetadata.criticalKeys.length,
            totalKeys: Object.keys(point.systemSnapshot.localStorage).length,
            metadata: point.metadata
        };
    }

    /**
     * List available rollback points
     */
    listRollbackPoints() {
        return Array.from(this.rollbackPoints.keys()).map(name => this.getRollbackPointInfo(name));
    }

    /**
     * Delete rollback point
     */
    deleteRollbackPoint(pointName) {
        const deleted = this.rollbackPoints.delete(pointName);
        if (deleted) {
            this.emergencyBackups.delete(pointName);
            this.saveRollbackPointsToStorage();
        }
        return deleted;
    }

    /**
     * Helper functions
     */
    calculateChecksum(data) {
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }

    calculateBackupSize(rollbackPoint) {
        let size = 0;
        for (const [key, data] of Object.entries(rollbackPoint.systemSnapshot.localStorage)) {
            size += data.size;
        }
        return size;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    calculateStorageUsage() {
        let size = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                size += localStorage[key].length + key.length;
            }
        }
        return size;
    }

    getStorageItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            return defaultValue;
        }
    }

    getStorageItemSize(key) {
        const item = localStorage.getItem(key);
        return item ? new Blob([item]).size : 0;
    }

    getInventoryKeysCount() {
        let count = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('bdo-craft-inventory-global-')) {
                count++;
            }
        }
        return count;
    }

    analyzeKeyDistribution() {
        const distribution = {
            'bdo-craft-': 0,
            'bdo-inventory-': 0,
            'bdo_ship_upgrade': 0,
            'other': 0
        };

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('bdo-craft-')) {
                distribution['bdo-craft-']++;
            } else if (key.startsWith('bdo-inventory-')) {
                distribution['bdo-inventory-']++;
            } else if (key.startsWith('bdo_ship_upgrade')) {
                distribution['bdo_ship_upgrade']++;
            } else {
                distribution['other']++;
            }
        }

        return distribution;
    }

    estimateMemoryUsage() {
        // Simple estimation
        return {
            rollbackPoints: this.rollbackPoints.size,
            emergencyBackups: this.emergencyBackups.size,
            recoveryLogEntries: this.recoveryLog.length,
            estimatedMB: Math.round((this.calculateStorageUsage() / 1024 / 1024) * 100) / 100
        };
    }
}

// Export singleton instance
export const rollbackManager = new RollbackManager();

// Export utility functions
export function createRollbackPoint(name, metadata = {}) {
    return rollbackManager.createRollbackPoint(name, metadata);
}

export function executeCompleteRollback(pointName, options = {}) {
    return rollbackManager.executeCompleteRollback(pointName, options);
}

export function executeSelectiveRollback(pointName, components, options = {}) {
    return rollbackManager.executeSelectiveRollback(pointName, components, options);
}

export function executeEmergencyRecovery(identifier, options = {}) {
    return rollbackManager.executeEmergencyRecovery(identifier, options);
}

export function listRollbackPoints() {
    return rollbackManager.listRollbackPoints();
}

export function getRollbackPointInfo(pointName) {
    return rollbackManager.getRollbackPointInfo(pointName);
}