// BDO Ship Upgrade Tracker - Migration Validation Framework
// Validates data integrity during storage unification migration
// VALIDATOR AGENT - Ensures migration preserves data integrity without breaking existing workflows

/**
 * Migration Validation Framework
 * 
 * This utility provides comprehensive validation for the storage unification migration.
 * It validates current data structures, detects corruption scenarios, and ensures
 * system functionality during and after migration.
 */

export class MigrationValidator {
    constructor() {
        this.storageKeys = this.getAllStorageKeys();
        this.validationResults = new Map();
        this.errorLog = [];
        this.warningLog = [];
        this.migrationCheckpoints = new Map();
        
        // Core data structure schemas for validation
        this.schemas = {
            globalInventory: {
                required: ['storagePrefix', 'projectPrefix', 'dependencyPrefix'],
                storageKeys: [
                    'bdo-craft-inventory-global',
                    'bdo-craft-active-projects', 
                    'bdo-craft-project-priorities',
                    'bdo-craft-project-dependencies',
                    'bdo-craft-cross-materials',
                    'bdo-craft-inventory-session'
                ]
            },
            craftNavigator: {
                required: ['ships', 'shipParts', 'materials', 'allCrafts', 'activeCrafts'],
                storageKeys: [
                    'bdo-craft-navigator-active',
                    'bdo-craft-navigator-state', 
                    'bdo-craft-cross-map',
                    'bdo-craft-nav-history'
                ]
            },
            inventorySystem: {
                required: ['items', 'categories', 'filters'],
                storageKeys: [
                    'bdo-inventory-settings',
                    'bdo-inventory-preferences'
                ]
            },
            craftUI: {
                required: ['activeProjects', 'currentView', 'filters'],
                storageKeys: [
                    'bdo-craft-ui-active-projects',
                    'bdo-craft-ui-view-state',
                    'bdo-craft-ui-preferences', 
                    'bdo-craft-ui-project-filters',
                    'bdo-craft-ui-nav-session'
                ]
            },
            legacyApp: {
                required: ['currentShip', 'materials'],
                storageKeys: [
                    'bdo_ship_upgrade',
                    'bdo_ship_upgrade-materials',
                    'bdo_ship_upgrade-total',
                    'bdo_ship_upgrade-tour_completed',
                    'bdo_ship_upgrade-auto_tour_enabled',
                    'bdo_ship_upgrade-floating-minimized'
                ]
            }
        };
    }

    /**
     * Get all localStorage keys used by the system
     */
    getAllStorageKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            keys.push(localStorage.key(i));
        }
        return keys.filter(key => 
            key.startsWith('bdo-') || key.startsWith('bdo_ship_upgrade')
        );
    }

    /**
     * Create migration checkpoint - captures full system state
     */
    createCheckpoint(checkpointName) {
        console.log(`📸 Creating migration checkpoint: ${checkpointName}`);
        
        const checkpoint = {
            name: checkpointName,
            timestamp: Date.now(),
            storageSnapshot: {},
            dataIntegrity: {},
            systemHealth: {},
            userWorkflows: {},
            errors: [],
            warnings: []
        };

        // Capture all localStorage data
        for (const key of this.storageKeys) {
            try {
                const value = localStorage.getItem(key);
                if (value) {
                    checkpoint.storageSnapshot[key] = {
                        raw: value,
                        parsed: JSON.parse(value),
                        size: new Blob([value]).size,
                        checksum: this.calculateChecksum(value)
                    };
                }
            } catch (error) {
                checkpoint.errors.push({
                    type: 'storage_capture',
                    key,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }

        // Validate data integrity
        checkpoint.dataIntegrity = this.validateDataIntegrity();
        
        // Check system health
        checkpoint.systemHealth = this.validateSystemHealth();
        
        // Validate user workflows
        checkpoint.userWorkflows = this.validateUserWorkflows();
        
        this.migrationCheckpoints.set(checkpointName, checkpoint);
        
        console.log(`✅ Checkpoint created: ${checkpointName} (${Object.keys(checkpoint.storageSnapshot).length} keys captured)`);
        return checkpoint;
    }

    /**
     * Validate data integrity across all storage layers
     */
    validateDataIntegrity() {
        console.log('🔍 Validating data integrity across all storage layers');
        
        const integrity = {
            passed: true,
            issues: [],
            crossReferences: {},
            orphanedData: [],
            duplicateData: [],
            corruptedData: [],
            missingDependencies: [],
            validationScore: 0
        };

        // 1. Validate Global Inventory System
        const globalInventoryIntegrity = this.validateGlobalInventoryIntegrity();
        if (!globalInventoryIntegrity.passed) {
            integrity.passed = false;
            integrity.issues.push(...globalInventoryIntegrity.issues);
        }

        // 2. Validate Craft Navigation System  
        const craftNavIntegrity = this.validateCraftNavigatorIntegrity();
        if (!craftNavIntegrity.passed) {
            integrity.passed = false;
            integrity.issues.push(...craftNavIntegrity.issues);
        }

        // 3. Validate Cross-System References
        const crossRefIntegrity = this.validateCrossSystemReferences();
        integrity.crossReferences = crossRefIntegrity;
        if (!crossRefIntegrity.passed) {
            integrity.passed = false;
            integrity.issues.push(...crossRefIntegrity.issues);
        }

        // 4. Detect Orphaned Data
        integrity.orphanedData = this.detectOrphanedData();

        // 5. Detect Data Corruption
        integrity.corruptedData = this.detectDataCorruption();

        // 6. Validate Dependencies
        integrity.missingDependencies = this.validateDependencies();

        // Calculate validation score (0-100)
        const totalChecks = 20; // Adjust based on actual number of validation checks
        const failedChecks = integrity.issues.length + integrity.orphanedData.length + 
                            integrity.corruptedData.length + integrity.missingDependencies.length;
        integrity.validationScore = Math.max(0, ((totalChecks - failedChecks) / totalChecks) * 100);

        return integrity;
    }

    /**
     * Validate Global Inventory System integrity
     */
    validateGlobalInventoryIntegrity() {
        const validation = {
            passed: true,
            issues: []
        };

        try {
            // Check if all required storage keys exist
            const requiredKeys = this.schemas.globalInventory.storageKeys;
            for (const key of requiredKeys) {
                const data = localStorage.getItem(key);
                if (!data) {
                    validation.issues.push({
                        type: 'missing_storage_key',
                        component: 'globalInventory',
                        key,
                        severity: 'error'
                    });
                    validation.passed = false;
                }
            }

            // Validate active projects structure
            const activeProjects = this.getStorageItem('bdo-craft-active-projects', []);
            if (Array.isArray(activeProjects)) {
                for (const project of activeProjects) {
                    if (!project.name || !project.requirements) {
                        validation.issues.push({
                            type: 'invalid_project_structure',
                            component: 'globalInventory',
                            project: project.name || 'unnamed',
                            severity: 'error'
                        });
                        validation.passed = false;
                    }
                }
            }

            // Validate inventory consistency
            const inventoryConsistency = this.validateInventoryConsistency();
            if (!inventoryConsistency.passed) {
                validation.issues.push(...inventoryConsistency.issues);
                validation.passed = false;
            }

        } catch (error) {
            validation.issues.push({
                type: 'validation_exception',
                component: 'globalInventory',
                error: error.message,
                severity: 'error'
            });
            validation.passed = false;
        }

        return validation;
    }

    /**
     * Validate Craft Navigator System integrity
     */
    validateCraftNavigatorIntegrity() {
        const validation = {
            passed: true,
            issues: []
        };

        try {
            // Check navigation state consistency
            const navState = this.getStorageItem('bdo-craft-navigator-state', {});
            const activeCrafts = this.getStorageItem('bdo-craft-navigator-active', []);

            // Validate current craft exists in active crafts
            if (navState.currentCraft && !activeCrafts.includes(navState.currentCraft)) {
                validation.issues.push({
                    type: 'invalid_current_craft',
                    component: 'craftNavigator',
                    craft: navState.currentCraft,
                    severity: 'warning'
                });
            }

            // Validate breadcrumb integrity
            if (navState.breadcrumb && Array.isArray(navState.breadcrumb)) {
                for (const craftName of navState.breadcrumb) {
                    // Validate craft exists (would need import to check)
                    // This is a placeholder for actual craft existence validation
                }
            }

            // Validate cross-craft mapping
            const crossCraftMap = this.getStorageItem('bdo-craft-cross-map', {});
            for (const [mapKey, mapData] of Object.entries(crossCraftMap)) {
                if (!mapData.connections || !Array.isArray(mapData.connections)) {
                    validation.issues.push({
                        type: 'invalid_cross_craft_mapping',
                        component: 'craftNavigator',
                        mapKey,
                        severity: 'warning'
                    });
                }
            }

        } catch (error) {
            validation.issues.push({
                type: 'validation_exception',
                component: 'craftNavigator',
                error: error.message,
                severity: 'error'
            });
            validation.passed = false;
        }

        return validation;
    }

    /**
     * Validate cross-system references
     */
    validateCrossSystemReferences() {
        const validation = {
            passed: true,
            issues: [],
            references: {}
        };

        try {
            // 1. Global Inventory <-> Craft Navigator consistency
            const globalActiveProjects = this.getStorageItem('bdo-craft-active-projects', []);
            const navActiveProjects = this.getStorageItem('bdo-craft-navigator-active', []);

            // Check for mismatches
            const globalProjectNames = globalActiveProjects.map(p => p.name);
            const missingInNav = globalProjectNames.filter(name => !navActiveProjects.includes(name));
            const missingInGlobal = navActiveProjects.filter(name => !globalProjectNames.includes(name));

            if (missingInNav.length > 0) {
                validation.issues.push({
                    type: 'missing_nav_projects',
                    component: 'cross_reference',
                    projects: missingInNav,
                    severity: 'error'
                });
                validation.passed = false;
            }

            if (missingInGlobal.length > 0) {
                validation.issues.push({
                    type: 'missing_global_projects',
                    component: 'cross_reference',
                    projects: missingInGlobal,
                    severity: 'error'
                });
                validation.passed = false;
            }

            validation.references.projectSync = {
                globalProjects: globalProjectNames.length,
                navProjects: navActiveProjects.length,
                missingInNav: missingInNav.length,
                missingInGlobal: missingInGlobal.length
            };

            // 2. Inventory quantities consistency
            const inventoryConsistency = this.validateInventoryQuantityConsistency();
            validation.references.inventorySync = inventoryConsistency;
            if (!inventoryConsistency.passed) {
                validation.issues.push(...inventoryConsistency.issues);
                validation.passed = false;
            }

        } catch (error) {
            validation.issues.push({
                type: 'validation_exception',
                component: 'cross_reference',
                error: error.message,
                severity: 'error'
            });
            validation.passed = false;
        }

        return validation;
    }

    /**
     * Validate inventory quantity consistency across systems
     */
    validateInventoryQuantityConsistency() {
        const validation = {
            passed: true,
            issues: [],
            mismatches: []
        };

        try {
            // Get all inventory keys from global inventory system
            const inventoryKeys = this.storageKeys.filter(key => 
                key.startsWith('bdo-craft-inventory-global-')
            );

            // Check legacy system consistency
            const legacyMaterials = this.getStorageItem('bdo_ship_upgrade-materials', {});
            
            for (const key of inventoryKeys) {
                const materialName = key.replace('bdo-craft-inventory-global-', '');
                const globalQuantity = parseInt(localStorage.getItem(key) || '0');
                const legacyQuantity = legacyMaterials[materialName] || 0;

                if (globalQuantity !== legacyQuantity) {
                    validation.mismatches.push({
                        material: materialName,
                        globalQuantity,
                        legacyQuantity,
                        difference: Math.abs(globalQuantity - legacyQuantity)
                    });
                }
            }

            if (validation.mismatches.length > 0) {
                validation.issues.push({
                    type: 'inventory_quantity_mismatch',
                    component: 'inventory_consistency',
                    count: validation.mismatches.length,
                    severity: 'error'
                });
                validation.passed = false;
            }

        } catch (error) {
            validation.issues.push({
                type: 'validation_exception',
                component: 'inventory_consistency',
                error: error.message,
                severity: 'error'
            });
            validation.passed = false;
        }

        return validation;
    }

    /**
     * Detect orphaned data that's no longer referenced
     */
    detectOrphanedData() {
        const orphaned = [];

        try {
            // Look for data that might be orphaned after migration
            const activeProjects = this.getStorageItem('bdo-craft-active-projects', []);
            const projectNames = activeProjects.map(p => p.name);

            // Check for orphaned project dependencies
            const dependencies = this.getStorageItem('bdo-craft-project-dependencies', {});
            for (const [projectName, deps] of Object.entries(dependencies)) {
                if (!projectNames.includes(projectName)) {
                    orphaned.push({
                        type: 'orphaned_dependency',
                        data: projectName,
                        location: 'bdo-craft-project-dependencies',
                        reason: 'Project no longer in active projects'
                    });
                }
            }

            // Check for orphaned cross-craft materials
            const crossMaterials = this.getStorageItem('bdo-craft-cross-materials', {});
            for (const [materialName, data] of Object.entries(crossMaterials)) {
                if (data.usedByProjects) {
                    const referencedProjects = Object.keys(data.usedByProjects);
                    const orphanedProjects = referencedProjects.filter(name => 
                        !projectNames.includes(name)
                    );
                    
                    if (orphanedProjects.length > 0) {
                        orphaned.push({
                            type: 'orphaned_cross_material',
                            data: materialName,
                            location: 'bdo-craft-cross-materials',
                            reason: `Referenced by non-existent projects: ${orphanedProjects.join(', ')}`
                        });
                    }
                }
            }

        } catch (error) {
            this.errorLog.push({
                type: 'orphaned_data_detection',
                error: error.message,
                timestamp: Date.now()
            });
        }

        return orphaned;
    }

    /**
     * Detect data corruption
     */
    detectDataCorruption() {
        const corrupted = [];

        try {
            // Check for malformed JSON in localStorage
            for (const key of this.storageKeys) {
                try {
                    const value = localStorage.getItem(key);
                    if (value) {
                        JSON.parse(value);
                    }
                } catch (error) {
                    corrupted.push({
                        type: 'malformed_json',
                        key,
                        error: error.message,
                        value: localStorage.getItem(key)?.substring(0, 100) + '...'
                    });
                }
            }

            // Check for invalid data structures
            const activeProjects = this.getStorageItem('bdo-craft-active-projects', []);
            if (!Array.isArray(activeProjects)) {
                corrupted.push({
                    type: 'invalid_data_structure',
                    key: 'bdo-craft-active-projects',
                    expected: 'Array',
                    actual: typeof activeProjects
                });
            }

            // Check for negative quantities
            const inventoryKeys = this.storageKeys.filter(key => 
                key.startsWith('bdo-craft-inventory-global-')
            );
            
            for (const key of inventoryKeys) {
                const quantity = parseInt(localStorage.getItem(key) || '0');
                if (quantity < 0) {
                    corrupted.push({
                        type: 'negative_quantity',
                        key,
                        value: quantity,
                        material: key.replace('bdo-craft-inventory-global-', '')
                    });
                }
            }

        } catch (error) {
            this.errorLog.push({
                type: 'corruption_detection',
                error: error.message,
                timestamp: Date.now()
            });
        }

        return corrupted;
    }

    /**
     * Validate system dependencies
     */
    validateDependencies() {
        const missing = [];

        try {
            // Check if required storage keys exist
            for (const [componentName, schema] of Object.entries(this.schemas)) {
                for (const storageKey of schema.storageKeys) {
                    if (!localStorage.getItem(storageKey)) {
                        missing.push({
                            type: 'missing_storage_dependency',
                            component: componentName,
                            dependency: storageKey,
                            severity: 'error'
                        });
                    }
                }
            }

            // Check for circular dependencies in project requirements
            const activeProjects = this.getStorageItem('bdo-craft-active-projects', []);
            const circularDeps = this.detectCircularDependencies(activeProjects);
            
            for (const circular of circularDeps) {
                missing.push({
                    type: 'circular_dependency',
                    component: 'project_dependencies',
                    dependency: circular.path.join(' -> '),
                    severity: 'warning'
                });
            }

        } catch (error) {
            this.errorLog.push({
                type: 'dependency_validation',
                error: error.message,
                timestamp: Date.now()
            });
        }

        return missing;
    }

    /**
     * Detect circular dependencies in project requirements
     */
    detectCircularDependencies(projects) {
        const circular = [];
        const visited = new Set();
        const path = [];

        function hasCircularDep(projectName, requirements, visited, path) {
            if (path.includes(projectName)) {
                circular.push({
                    path: [...path, projectName],
                    detected: true
                });
                return true;
            }

            if (visited.has(projectName)) {
                return false;
            }

            visited.add(projectName);
            path.push(projectName);

            if (requirements) {
                for (const [reqName] of Object.entries(requirements)) {
                    // Find if this requirement is also a project
                    const reqProject = projects.find(p => p.name === reqName);
                    if (reqProject) {
                        hasCircularDep(reqName, reqProject.requirements, visited, [...path]);
                    }
                }
            }

            path.pop();
            return false;
        }

        for (const project of projects) {
            if (!visited.has(project.name)) {
                hasCircularDep(project.name, project.requirements, new Set(), []);
            }
        }

        return circular;
    }

    /**
     * Validate system health - check if all components are functional
     */
    validateSystemHealth() {
        const health = {
            overall: 'healthy',
            components: {},
            performance: {},
            resources: {}
        };

        // Check localStorage usage
        const storageUsage = this.calculateStorageUsage();
        health.resources.localStorage = {
            totalSize: storageUsage.totalSize,
            keyCount: storageUsage.keyCount,
            largestKey: storageUsage.largestKey,
            warning: storageUsage.totalSize > 5 * 1024 * 1024 // 5MB warning
        };

        // Check component health
        health.components.globalInventory = this.checkGlobalInventoryHealth();
        health.components.craftNavigator = this.checkCraftNavigatorHealth();
        health.components.inventorySystem = this.checkInventorySystemHealth();

        // Calculate overall health
        const componentHealths = Object.values(health.components);
        const unhealthyComponents = componentHealths.filter(h => h.status !== 'healthy');
        
        if (unhealthyComponents.length > 0) {
            health.overall = unhealthyComponents.some(h => h.status === 'error') ? 'error' : 'warning';
        }

        return health;
    }

    /**
     * Check Global Inventory component health
     */
    checkGlobalInventoryHealth() {
        const health = {
            status: 'healthy',
            issues: [],
            metrics: {}
        };

        try {
            const activeProjects = this.getStorageItem('bdo-craft-active-projects', []);
            const priorities = this.getStorageItem('bdo-craft-project-priorities', {});
            const dependencies = this.getStorageItem('bdo-craft-project-dependencies', {});

            health.metrics = {
                activeProjects: activeProjects.length,
                priorities: Object.keys(priorities).length,
                dependencies: Object.keys(dependencies).length,
                lastUpdate: Math.max(
                    ...activeProjects.map(p => p.lastUpdated || 0),
                    0
                )
            };

            // Check for stale data
            const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            if (health.metrics.lastUpdate < oneWeekAgo) {
                health.issues.push('Stale project data detected');
                health.status = 'warning';
            }

        } catch (error) {
            health.status = 'error';
            health.issues.push(`Health check failed: ${error.message}`);
        }

        return health;
    }

    /**
     * Check Craft Navigator component health
     */
    checkCraftNavigatorHealth() {
        const health = {
            status: 'healthy',
            issues: [],
            metrics: {}
        };

        try {
            const navState = this.getStorageItem('bdo-craft-navigator-state', {});
            const activeCrafts = this.getStorageItem('bdo-craft-navigator-active', []);
            const crossCraftMap = this.getStorageItem('bdo-craft-cross-map', {});

            health.metrics = {
                currentCraft: navState.currentCraft || 'none',
                activeCrafts: activeCrafts.length,
                crossCraftConnections: Object.keys(crossCraftMap).length,
                lastUpdate: navState.lastUpdated || 0
            };

            // Check navigation consistency
            if (navState.currentCraft && !activeCrafts.includes(navState.currentCraft)) {
                health.issues.push('Current craft not in active crafts');
                health.status = 'warning';
            }

        } catch (error) {
            health.status = 'error';
            health.issues.push(`Health check failed: ${error.message}`);
        }

        return health;
    }

    /**
     * Check Inventory System component health
     */
    checkInventorySystemHealth() {
        const health = {
            status: 'healthy',
            issues: [],
            metrics: {}
        };

        try {
            const settings = this.getStorageItem('bdo-inventory-settings', {});
            const inventoryKeys = this.storageKeys.filter(key => 
                key.startsWith('bdo-craft-inventory-global-')
            );

            health.metrics = {
                inventoryItems: inventoryKeys.length,
                hasSettings: Object.keys(settings).length > 0,
                totalQuantity: inventoryKeys.reduce((sum, key) => {
                    return sum + (parseInt(localStorage.getItem(key)) || 0);
                }, 0)
            };

            // Check for excessive inventory items
            if (health.metrics.inventoryItems > 1000) {
                health.issues.push('Large number of inventory items may impact performance');
                health.status = 'warning';
            }

        } catch (error) {
            health.status = 'error';
            health.issues.push(`Health check failed: ${error.message}`);
        }

        return health;
    }

    /**
     * Validate user workflows still function correctly
     */
    validateUserWorkflows() {
        const workflows = {
            passed: true,
            tests: []
        };

        // Test 1: Can add materials to inventory
        workflows.tests.push(this.testInventoryWorkflow());

        // Test 2: Can manage active projects
        workflows.tests.push(this.testProjectManagementWorkflow());

        // Test 3: Can navigate between crafts
        workflows.tests.push(this.testNavigationWorkflow());

        // Test 4: Can calculate requirements
        workflows.tests.push(this.testRequirementsCalculationWorkflow());

        // Check if any tests failed
        workflows.passed = workflows.tests.every(test => test.passed);

        return workflows;
    }

    /**
     * Test inventory management workflow
     */
    testInventoryWorkflow() {
        const test = {
            name: 'Inventory Management Workflow',
            passed: false,
            issues: []
        };

        try {
            // Test setting and getting material quantities
            const testMaterial = 'Test_Material_' + Date.now();
            const testQuantity = 42;

            // Simulate setting a material quantity
            localStorage.setItem(`bdo-craft-inventory-global-${testMaterial}`, testQuantity.toString());
            
            // Verify it was set correctly
            const retrievedQuantity = parseInt(localStorage.getItem(`bdo-craft-inventory-global-${testMaterial}`));
            
            if (retrievedQuantity === testQuantity) {
                test.passed = true;
            } else {
                test.issues.push('Failed to set/get material quantity');
            }

            // Clean up test data
            localStorage.removeItem(`bdo-craft-inventory-global-${testMaterial}`);

        } catch (error) {
            test.issues.push(`Test failed with error: ${error.message}`);
        }

        return test;
    }

    /**
     * Test project management workflow
     */
    testProjectManagementWorkflow() {
        const test = {
            name: 'Project Management Workflow',
            passed: false,
            issues: []
        };

        try {
            // Get current active projects
            const activeProjects = this.getStorageItem('bdo-craft-active-projects', []);
            const originalCount = activeProjects.length;

            // Test project structure validation
            let validProjects = 0;
            for (const project of activeProjects) {
                if (project.name && typeof project.requirements === 'object') {
                    validProjects++;
                }
            }

            if (validProjects === activeProjects.length) {
                test.passed = true;
            } else {
                test.issues.push(`${activeProjects.length - validProjects} projects have invalid structure`);
            }

        } catch (error) {
            test.issues.push(`Test failed with error: ${error.message}`);
        }

        return test;
    }

    /**
     * Test navigation workflow
     */
    testNavigationWorkflow() {
        const test = {
            name: 'Navigation Workflow',
            passed: false,
            issues: []
        };

        try {
            const navState = this.getStorageItem('bdo-craft-navigator-state', {});
            const activeCrafts = this.getStorageItem('bdo-craft-navigator-active', []);

            // Test navigation state consistency
            if (navState.currentCraft && activeCrafts.includes(navState.currentCraft)) {
                test.passed = true;
            } else if (!navState.currentCraft && activeCrafts.length === 0) {
                test.passed = true; // No navigation needed if no active crafts
            } else {
                test.issues.push('Navigation state inconsistency detected');
            }

        } catch (error) {
            test.issues.push(`Test failed with error: ${error.message}`);
        }

        return test;
    }

    /**
     * Test requirements calculation workflow
     */
    testRequirementsCalculationWorkflow() {
        const test = {
            name: 'Requirements Calculation Workflow',
            passed: false,
            issues: []
        };

        try {
            const activeProjects = this.getStorageItem('bdo-craft-active-projects', []);
            
            // Test that projects have requirements structure
            let projectsWithRequirements = 0;
            for (const project of activeProjects) {
                if (project.requirements && typeof project.requirements === 'object') {
                    projectsWithRequirements++;
                }
            }

            // All projects should have requirements (even if empty)
            if (projectsWithRequirements === activeProjects.length) {
                test.passed = true;
            } else {
                test.issues.push(`${activeProjects.length - projectsWithRequirements} projects missing requirements structure`);
            }

        } catch (error) {
            test.issues.push(`Test failed with error: ${error.message}`);
        }

        return test;
    }

    /**
     * Calculate localStorage usage
     */
    calculateStorageUsage() {
        let totalSize = 0;
        let largestKey = '';
        let largestSize = 0;

        for (const key of this.storageKeys) {
            const value = localStorage.getItem(key);
            if (value) {
                const size = new Blob([value]).size;
                totalSize += size;
                
                if (size > largestSize) {
                    largestSize = size;
                    largestKey = key;
                }
            }
        }

        return {
            totalSize,
            keyCount: this.storageKeys.length,
            largestKey,
            largestSize
        };
    }

    /**
     * Compare two checkpoints to detect changes
     */
    compareCheckpoints(checkpoint1Name, checkpoint2Name) {
        const cp1 = this.migrationCheckpoints.get(checkpoint1Name);
        const cp2 = this.migrationCheckpoints.get(checkpoint2Name);

        if (!cp1 || !cp2) {
            throw new Error('One or both checkpoints not found');
        }

        const comparison = {
            timespan: cp2.timestamp - cp1.timestamp,
            changes: {
                added: [],
                modified: [],
                removed: []
            },
            integrityChanges: {},
            healthChanges: {},
            workflowChanges: {}
        };

        // Compare storage snapshots
        const keys1 = Object.keys(cp1.storageSnapshot);
        const keys2 = Object.keys(cp2.storageSnapshot);

        // Find added keys
        comparison.changes.added = keys2.filter(key => !keys1.includes(key));

        // Find removed keys
        comparison.changes.removed = keys1.filter(key => !keys2.includes(key));

        // Find modified keys
        for (const key of keys1.filter(key => keys2.includes(key))) {
            if (cp1.storageSnapshot[key].checksum !== cp2.storageSnapshot[key].checksum) {
                comparison.changes.modified.push({
                    key,
                    sizeBefore: cp1.storageSnapshot[key].size,
                    sizeAfter: cp2.storageSnapshot[key].size,
                    sizeDelta: cp2.storageSnapshot[key].size - cp1.storageSnapshot[key].size
                });
            }
        }

        // Compare integrity scores
        comparison.integrityChanges = {
            scoreBefore: cp1.dataIntegrity.validationScore,
            scoreAfter: cp2.dataIntegrity.validationScore,
            scoreDelta: cp2.dataIntegrity.validationScore - cp1.dataIntegrity.validationScore,
            issuesBefore: cp1.dataIntegrity.issues.length,
            issuesAfter: cp2.dataIntegrity.issues.length
        };

        // Compare system health
        comparison.healthChanges = {
            overallBefore: cp1.systemHealth.overall,
            overallAfter: cp2.systemHealth.overall,
            improved: cp2.systemHealth.overall === 'healthy' && cp1.systemHealth.overall !== 'healthy'
        };

        return comparison;
    }

    /**
     * Calculate simple checksum for data
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

    /**
     * Helper function to safely parse localStorage items
     */
    getStorageItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            this.errorLog.push({
                type: 'storage_parse_error',
                key,
                error: error.message,
                timestamp: Date.now()
            });
            return defaultValue;
        }
    }

    /**
     * Validate inventory consistency within global inventory system
     */
    validateInventoryConsistency() {
        const validation = {
            passed: true,
            issues: []
        };

        try {
            // Check for duplicate entries
            const inventoryKeys = this.storageKeys.filter(key => 
                key.startsWith('bdo-craft-inventory-global-')
            );

            const materials = new Map();
            for (const key of inventoryKeys) {
                const material = key.replace('bdo-craft-inventory-global-', '');
                if (materials.has(material)) {
                    validation.issues.push({
                        type: 'duplicate_inventory_entry',
                        material,
                        keys: [materials.get(material), key],
                        severity: 'error'
                    });
                    validation.passed = false;
                } else {
                    materials.set(material, key);
                }
            }

            // Check for reasonable quantity values
            for (const key of inventoryKeys) {
                const quantity = parseInt(localStorage.getItem(key) || '0');
                if (quantity > 999999) { // Arbitrary large number check
                    validation.issues.push({
                        type: 'unreasonable_quantity',
                        key,
                        quantity,
                        severity: 'warning'
                    });
                }
            }

        } catch (error) {
            validation.issues.push({
                type: 'validation_exception',
                component: 'inventory_consistency',
                error: error.message,
                severity: 'error'
            });
            validation.passed = false;
        }

        return validation;
    }

    /**
     * Generate comprehensive validation report
     */
    generateValidationReport(checkpointName = null) {
        console.log('📊 Generating comprehensive validation report');

        const report = {
            timestamp: Date.now(),
            checkpoint: checkpointName,
            summary: {},
            dataIntegrity: {},
            systemHealth: {},
            userWorkflows: {},
            recommendations: [],
            errors: [...this.errorLog],
            warnings: [...this.warningLog]
        };

        // Get current validation state or from checkpoint
        if (checkpointName && this.migrationCheckpoints.has(checkpointName)) {
            const checkpoint = this.migrationCheckpoints.get(checkpointName);
            report.dataIntegrity = checkpoint.dataIntegrity;
            report.systemHealth = checkpoint.systemHealth;
            report.userWorkflows = checkpoint.userWorkflows;
        } else {
            report.dataIntegrity = this.validateDataIntegrity();
            report.systemHealth = this.validateSystemHealth();
            report.userWorkflows = this.validateUserWorkflows();
        }

        // Generate summary
        report.summary = {
            overallStatus: this.calculateOverallStatus(report),
            dataIntegrityScore: report.dataIntegrity.validationScore,
            systemHealthStatus: report.systemHealth.overall,
            workflowsPassingCount: report.userWorkflows.tests.filter(t => t.passed).length,
            totalWorkflowsCount: report.userWorkflows.tests.length,
            storageKeysCount: this.storageKeys.length,
            errorCount: report.errors.length,
            warningCount: report.warnings.length
        };

        // Generate recommendations
        report.recommendations = this.generateRecommendations(report);

        console.log(`✅ Validation report generated - Overall Status: ${report.summary.overallStatus}`);
        return report;
    }

    /**
     * Calculate overall system status
     */
    calculateOverallStatus(report) {
        const integrityPassed = report.dataIntegrity.passed;
        const healthGood = report.systemHealth.overall === 'healthy';
        const workflowsPassed = report.userWorkflows.passed;
        const hasErrors = report.errors.length > 0;

        if (hasErrors || !integrityPassed || !workflowsPassed) {
            return 'error';
        } else if (!healthGood || report.warnings.length > 0) {
            return 'warning';
        } else {
            return 'healthy';
        }
    }

    /**
     * Generate actionable recommendations
     */
    generateRecommendations(report) {
        const recommendations = [];

        // Data integrity recommendations
        if (report.dataIntegrity.validationScore < 90) {
            recommendations.push({
                type: 'data_integrity',
                priority: 'high',
                title: 'Address Data Integrity Issues',
                description: `Validation score is ${report.dataIntegrity.validationScore}%. Review and fix identified issues.`,
                actions: [
                    'Check for corrupted data entries',
                    'Validate cross-system references',
                    'Remove orphaned data entries'
                ]
            });
        }

        // System health recommendations
        if (report.systemHealth.overall !== 'healthy') {
            recommendations.push({
                type: 'system_health',
                priority: 'high',
                title: 'Improve System Health',
                description: `System health status is ${report.systemHealth.overall}. Review component health issues.`,
                actions: [
                    'Check component-specific health issues',
                    'Update stale data',
                    'Optimize storage usage'
                ]
            });
        }

        // Workflow recommendations
        const failedWorkflows = report.userWorkflows.tests.filter(t => !t.passed);
        if (failedWorkflows.length > 0) {
            recommendations.push({
                type: 'user_workflows',
                priority: 'high',
                title: 'Fix Failed User Workflows',
                description: `${failedWorkflows.length} user workflows are failing.`,
                actions: failedWorkflows.map(w => `Fix ${w.name}: ${w.issues.join(', ')}`)
            });
        }

        // Storage optimization recommendations
        const storageUsage = this.calculateStorageUsage();
        if (storageUsage.totalSize > 5 * 1024 * 1024) { // 5MB
            recommendations.push({
                type: 'storage_optimization',
                priority: 'medium',
                title: 'Optimize Storage Usage',
                description: `localStorage usage is ${Math.round(storageUsage.totalSize / 1024)}KB. Consider cleanup.`,
                actions: [
                    'Remove obsolete data',
                    'Compress large data structures',
                    'Implement data archival strategy'
                ]
            });
        }

        return recommendations;
    }
}

// Export singleton instance
export const migrationValidator = new MigrationValidator();

// Export utility functions
export function createCheckpoint(name) {
    return migrationValidator.createCheckpoint(name);
}

export function validateDataIntegrity() {
    return migrationValidator.validateDataIntegrity();
}

export function validateSystemHealth() {
    return migrationValidator.validateSystemHealth();
}

export function generateValidationReport(checkpointName = null) {
    return migrationValidator.generateValidationReport(checkpointName);
}

export function compareCheckpoints(checkpoint1, checkpoint2) {
    return migrationValidator.compareCheckpoints(checkpoint1, checkpoint2);
}