/**
 * Unified Storage System - Main Index
 * 
 * This is the main entry point for the Unified Storage System for BDO Ship Upgrade Tracker.
 * Import this module to get access to all unified storage functionality.
 * 
 * Features:
 * - Single source of truth for all application data
 * - Advanced caching and performance optimization
 * - Event-driven architecture for real-time updates
 * - Comprehensive data migration from legacy systems
 * - Backward-compatible API wrappers
 * - Thread-safe operations with atomic updates
 * - Automatic optimization and monitoring
 * 
 * @author BDO Ship Upgrade Tracker Team
 * @version 2.0.0
 */

// Core unified storage system
export {
    UnifiedStorageManager,
    unifiedStorageManager,
    UnifiedEventBus,
    UnifiedCacheManager,
    DataModels,
    eventBus,
    cacheManager
} from './unified-storage-manager.js';

// Data migration utilities
export {
    UnifiedStorageMigration,
    MigrationFactory,
    MigrationConfig,
    autoMigrate
} from './unified-storage-migration.js';

// Backward-compatible API wrappers
export {
    InventoryManagerWrapper,
    GlobalInventoryManagerWrapper,
    AppStorageWrapper,
    initializeWrappers,
    getWrapperInstances,
    // Compatibility functions
    getItem,
    setItemQuantity,
    getFilteredItems,
    setMaterialQuantity,
    getMaterialQuantity,
    calculateGlobalInventoryStatus,
    getAppData,
    setAppData
} from './unified-storage-wrappers.js';

// System integration
export {
    UnifiedStorageIntegration,
    IntegrationConfig,
    initializeUnifiedStorage,
    getUnifiedStorageIntegration
} from './unified-storage-integration.js';

// ============================================================================
// QUICK START API
// ============================================================================

/**
 * Quick start configuration for common use cases
 */
export const QuickStart = {
    /**
     * Initialize with automatic migration and full compatibility
     */
    async full() {
        const { initializeUnifiedStorage } = await import('./unified-storage-integration.js');
        return await initializeUnifiedStorage({
            autoMigrate: true,
            enableWrappers: true,
            enableOptimization: true,
            enableMetrics: true
        });
    },
    
    /**
     * Initialize with minimal features (performance focused)
     */
    async minimal() {
        const { initializeUnifiedStorage } = await import('./unified-storage-integration.js');
        return await initializeUnifiedStorage({
            autoMigrate: true,
            enableWrappers: false,
            enableOptimization: false,
            enableMetrics: false
        });
    },
    
    /**
     * Initialize for development with debugging tools
     */
    async development() {
        const { initializeUnifiedStorage } = await import('./unified-storage-integration.js');
        return await initializeUnifiedStorage({
            autoMigrate: true,
            enableWrappers: true,
            enableOptimization: true,
            enableMetrics: true,
            enableDebugMode: true,
            enableDetailedLogging: true
        });
    },
    
    /**
     * Initialize without migration (unified storage only)
     */
    async cleanStart() {
        const { initializeUnifiedStorage } = await import('./unified-storage-integration.js');
        return await initializeUnifiedStorage({
            autoMigrate: false,
            enableWrappers: false,
            enableOptimization: true,
            enableMetrics: true
        });
    }
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * System status and health check utilities
 */
export const SystemUtils = {
    /**
     * Check if unified storage is ready
     */
    isReady() {
        try {
            const { unifiedStorageManager } = require('./unified-storage-manager.js');
            return unifiedStorageManager && unifiedStorageManager.initialized;
        } catch {
            return false;
        }
    },
    
    /**
     * Get system health status
     */
    async getHealthStatus() {
        try {
            const { getUnifiedStorageIntegration } = await import('./unified-storage-integration.js');
            const integration = getUnifiedStorageIntegration();
            
            if (!integration) {
                return {
                    status: 'not_initialized',
                    message: 'Unified storage integration not initialized'
                };
            }
            
            if (!integration.initialized) {
                return {
                    status: 'initializing',
                    message: 'System is still initializing',
                    phase: integration.state.phase
                };
            }
            
            const diagnostics = await integration.runDiagnostics();
            
            return {
                status: 'healthy',
                message: 'System is operating normally',
                diagnostics
            };
            
        } catch (error) {
            return {
                status: 'error',
                message: error.message,
                error
            };
        }
    },
    
    /**
     * Get performance metrics
     */
    async getPerformanceMetrics() {
        try {
            const { getUnifiedStorageIntegration } = await import('./unified-storage-integration.js');
            const integration = getUnifiedStorageIntegration();
            
            if (integration && integration.initialized) {
                return integration.getDetailedMetrics();
            }
            
            return null;
        } catch (error) {
            console.warn('Failed to get performance metrics:', error);
            return null;
        }
    },
    
    /**
     * Force cleanup and reset
     */
    async forceReset() {
        console.warn('🔄 Forcing unified storage system reset');
        
        try {
            const { getUnifiedStorageIntegration } = await import('./unified-storage-integration.js');
            const integration = getUnifiedStorageIntegration();
            
            if (integration) {
                integration.cleanup();
            }
            
            // Clear all unified storage data
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('unified_')) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            return {
                success: true,
                message: 'System reset completed',
                clearedKeys: keysToRemove.length
            };
            
        } catch (error) {
            return {
                success: false,
                message: error.message,
                error
            };
        }
    }
};

// ============================================================================
// MIGRATION UTILITIES
// ============================================================================

/**
 * Migration utilities for managing data transitions
 */
export const MigrationUtils = {
    /**
     * Check migration status
     */
    async checkStatus() {
        const { MigrationFactory } = await import('./unified-storage-migration.js');
        return await MigrationFactory.checkMigrationStatus();
    },
    
    /**
     * Start manual migration
     */
    async migrate(options = {}) {
        const { MigrationFactory } = await import('./unified-storage-migration.js');
        const migration = await MigrationFactory.createMigration(options);
        return await migration.startMigration();
    },
    
    /**
     * Rollback migration
     */
    async rollback() {
        console.warn('🔄 Rolling back migration is not implemented yet');
        throw new Error('Migration rollback not implemented');
    }
};

// ============================================================================
// DEBUGGING AND DEVELOPMENT
// ============================================================================

/**
 * Debugging utilities for development
 */
export const DebugUtils = {
    /**
     * Enable debug mode
     */
    enableDebug() {
        if (typeof window !== 'undefined') {
            window.UNIFIED_STORAGE_DEBUG = true;
            console.log('🛠️ Unified Storage debug mode enabled');
        }
    },
    
    /**
     * Disable debug mode
     */
    disableDebug() {
        if (typeof window !== 'undefined') {
            window.UNIFIED_STORAGE_DEBUG = false;
            console.log('🛠️ Unified Storage debug mode disabled');
        }
    },
    
    /**
     * Get debug information
     */
    async getDebugInfo() {
        const status = await SystemUtils.getHealthStatus();
        const metrics = await SystemUtils.getPerformanceMetrics();
        const migrationStatus = await MigrationUtils.checkStatus();
        
        return {
            timestamp: Date.now(),
            version: '2.0.0',
            systemStatus: status,
            performanceMetrics: metrics,
            migrationStatus,
            browserInfo: {
                userAgent: navigator.userAgent,
                localStorage: !!window.localStorage,
                sessionStorage: !!window.sessionStorage,
                indexedDB: !!window.indexedDB
            }
        };
    },
    
    /**
     * Export debug report
     */
    async exportDebugReport() {
        const debugInfo = await this.getDebugInfo();
        
        const report = {
            generatedAt: new Date().toISOString(),
            ...debugInfo
        };
        
        // Create downloadable report
        if (typeof window !== 'undefined') {
            const blob = new Blob([JSON.stringify(report, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `unified-storage-debug-report-${Date.now()}.json`;
            link.click();
            
            URL.revokeObjectURL(url);
        }
        
        return report;
    }
};

// ============================================================================
// EVENT SYSTEM
// ============================================================================

/**
 * Event system utilities
 */
export const EventUtils = {
    /**
     * Listen to all unified storage events
     */
    onAll(callback) {
        const eventTypes = [
            'unifiedStorage:integration_ready',
            'unifiedStorage:integration_failed',
            'unifiedStorage:cross_tab_sync',
            'unifiedStorage:bdo_error'
        ];
        
        const listeners = eventTypes.map(eventType => {
            const listener = (event) => callback(eventType, event.detail);
            document.addEventListener(eventType, listener);
            return { eventType, listener };
        });
        
        // Return cleanup function
        return () => {
            listeners.forEach(({ eventType, listener }) => {
                document.removeEventListener(eventType, listener);
            });
        };
    },
    
    /**
     * Wait for system to be ready
     */
    waitForReady(timeout = 30000) {
        return new Promise((resolve, reject) => {
            if (SystemUtils.isReady()) {
                resolve();
                return;
            }
            
            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('Unified storage initialization timeout'));
            }, timeout);
            
            const listener = () => {
                cleanup();
                resolve();
            };
            
            const cleanup = () => {
                clearTimeout(timeoutId);
                document.removeEventListener('unifiedStorage:integration_ready', listener);
            };
            
            document.addEventListener('unifiedStorage:integration_ready', listener);
        });
    }
};

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Main unified storage API
 * This provides the primary interface for interacting with the unified storage system
 */
export const UnifiedStorage = {
    // Core systems
    manager: null, // Will be set after initialization
    eventBus: null, // Will be set after initialization
    cache: null, // Will be set after initialization
    
    // Quick start methods
    ...QuickStart,
    
    // Utilities
    system: SystemUtils,
    migration: MigrationUtils,
    debug: DebugUtils,
    events: EventUtils,
    
    /**
     * Initialize the system with default configuration
     */
    async initialize(config = {}) {
        return await QuickStart.full();
    },
    
    /**
     * Check if system is ready
     */
    get isReady() {
        return SystemUtils.isReady();
    },
    
    /**
     * Get current version
     */
    get version() {
        return '2.0.0';
    }
};

// Set up the UnifiedStorage object after initialization
if (typeof window !== 'undefined') {
    // Initialize after DOM is ready
    const setupUnifiedStorage = async () => {
        try {
            await EventUtils.waitForReady();
            
            const { unifiedStorageManager, eventBus, cacheManager } = await import('./unified-storage-manager.js');
            
            UnifiedStorage.manager = unifiedStorageManager;
            UnifiedStorage.eventBus = eventBus;
            UnifiedStorage.cache = cacheManager;
            
            // Make available globally
            window.UnifiedStorage = UnifiedStorage;
            
        } catch (error) {
            console.warn('Failed to setup UnifiedStorage global object:', error);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupUnifiedStorage);
    } else {
        setTimeout(setupUnifiedStorage, 100);
    }
}

// Default export
export default UnifiedStorage;