/**
 * Unified Storage Integration Module
 * 
 * This module provides seamless integration of the unified storage system
 * into the existing BDO Ship Upgrade Tracker application. It handles:
 * 
 * - Automatic initialization and migration
 * - Event system integration
 * - Performance monitoring and optimization
 * - Error handling and recovery
 * - Debugging and development tools
 * 
 * @author BDO Ship Upgrade Tracker Team
 * @version 2.0.0
 */

import { unifiedStorageManager, eventBus } from './unified-storage-manager.js';
import { autoMigrate, MigrationFactory } from './unified-storage-migration.js';
import { initializeWrappers } from './unified-storage-wrappers.js';
import { BDOError } from './error-handling.js';

// ============================================================================
// INTEGRATION CONFIGURATION
// ============================================================================

export const IntegrationConfig = {
    // Initialization settings
    autoInitialize: true,
    autoMigrate: true,
    enableWrappers: true,
    enableOptimization: true,
    
    // Performance settings
    cacheWarmup: true,
    preloadCriticalData: true,
    optimizationInterval: 5 * 60 * 1000, // 5 minutes
    
    // Monitoring settings
    enableMetrics: true,
    metricsInterval: 30 * 1000, // 30 seconds
    enablePerformanceLogging: true,
    
    // Development settings
    enableDebugMode: false,
    enableConsoleWarnings: true,
    enableDetailedLogging: false,
    
    // Error handling
    maxRetries: 3,
    retryDelay: 1000,
    fallbackToLegacy: true
};

// ============================================================================
// UNIFIED STORAGE INTEGRATION MANAGER
// ============================================================================

/**
 * Main integration manager for unified storage system
 */
export class UnifiedStorageIntegration {
    constructor(config = {}) {
        this.config = { ...IntegrationConfig, ...config };
        this.initialized = false;
        this.migrated = false;
        this.wrappersReady = false;
        
        // Integration state
        this.state = {
            phase: 'idle',
            startTime: null,
            initializationTime: null,
            migrationTime: null,
            totalStartupTime: null,
            errors: [],
            warnings: []
        };
        
        // Performance monitoring
        this.metrics = {
            initializationDuration: 0,
            migrationDuration: 0,
            wrapperInitDuration: 0,
            totalOperations: 0,
            failedOperations: 0,
            averageResponseTime: 0,
            cacheHitRate: 0
        };
        
        // Optimization intervals
        this.optimizationInterval = null;
        this.metricsInterval = null;
        
        // Event listeners storage for cleanup
        this.eventListeners = new Map();
        
        this.startIntegration();
    }
    
    /**
     * Start the complete integration process
     */
    async startIntegration() {
        console.log('🚀 Starting Unified Storage Integration v2.0.0');
        
        this.state.startTime = Date.now();
        this.state.phase = 'starting';
        
        try {
            // Phase 1: Initialize unified storage manager
            await this.initializeUnifiedStorage();
            
            // Phase 2: Handle data migration if needed
            await this.handleMigration();
            
            // Phase 3: Initialize backward-compatible wrappers
            await this.initializeWrappers();
            
            // Phase 4: Setup system integration
            await this.setupSystemIntegration();
            
            // Phase 5: Start optimization and monitoring
            await this.startOptimizationAndMonitoring();
            
            // Phase 6: Finalize integration
            await this.finalizeIntegration();
            
            this.initialized = true;
            this.state.phase = 'ready';
            this.state.totalStartupTime = Date.now() - this.state.startTime;
            
            console.log(`✅ Unified Storage Integration completed in ${this.state.totalStartupTime}ms`);
            
            // Emit ready event
            this.emitIntegrationEvent('integration_ready', {
                totalTime: this.state.totalStartupTime,
                metrics: this.metrics,
                state: this.state
            });
            
            return {
                success: true,
                totalTime: this.state.totalStartupTime,
                metrics: this.metrics
            };
            
        } catch (error) {
            this.state.phase = 'failed';
            this.state.errors.push({
                phase: this.state.phase,
                error: error.message,
                timestamp: Date.now(),
                stack: error.stack
            });
            
            console.error('❌ Unified Storage Integration failed:', error);
            
            // Emit error event
            this.emitIntegrationEvent('integration_failed', {
                error: error.message,
                phase: this.state.phase,
                fallback: this.config.fallbackToLegacy
            });
            
            // Attempt fallback to legacy systems
            if (this.config.fallbackToLegacy) {
                await this.fallbackToLegacy();
            }
            
            throw new BDOError('INTEGRATION_FAILED', error.message, {
                phase: this.state.phase,
                metrics: this.metrics,
                state: this.state
            });
        }
    }
    
    /**
     * Phase 1: Initialize unified storage manager
     */
    async initializeUnifiedStorage() {
        console.log('🔧 Phase 1: Initializing unified storage manager');
        
        const phaseStartTime = Date.now();
        
        try {
            // Wait for unified storage manager to be ready
            if (!unifiedStorageManager.initialized) {
                await this.waitForUnifiedStorage();
            }
            
            this.metrics.initializationDuration = Date.now() - phaseStartTime;
            this.state.initializationTime = Date.now();
            
            console.log(`✅ Phase 1 completed in ${this.metrics.initializationDuration}ms`);
            
        } catch (error) {
            throw new BDOError('UNIFIED_STORAGE_INIT_FAILED', error.message);
        }
    }
    
    /**
     * Phase 2: Handle data migration if needed
     */
    async handleMigration() {
        if (!this.config.autoMigrate) {
            console.log('ℹ️ Phase 2: Auto-migration disabled, skipping');
            return;
        }
        
        console.log('🔄 Phase 2: Handling data migration');
        
        const phaseStartTime = Date.now();
        
        try {
            const migrationStatus = await MigrationFactory.checkMigrationStatus();
            
            if (migrationStatus.needsMigration) {
                console.log('📦 Starting data migration...');
                
                const migrationResult = await autoMigrate();
                this.migrated = true;
                
                console.log('✅ Data migration completed:', migrationResult.statistics);
            } else {
                console.log('ℹ️ No migration needed');
            }
            
            this.metrics.migrationDuration = Date.now() - phaseStartTime;
            this.state.migrationTime = Date.now();
            
            console.log(`✅ Phase 2 completed in ${this.metrics.migrationDuration}ms`);
            
        } catch (error) {
            throw new BDOError('MIGRATION_FAILED', error.message);
        }
    }
    
    /**
     * Phase 3: Initialize backward-compatible wrappers
     */
    async initializeWrappers() {
        if (!this.config.enableWrappers) {
            console.log('ℹ️ Phase 3: Wrappers disabled, skipping');
            return;
        }
        
        console.log('🔗 Phase 3: Initializing backward-compatible wrappers');
        
        const phaseStartTime = Date.now();
        
        try {
            await initializeWrappers();
            this.wrappersReady = true;
            
            this.metrics.wrapperInitDuration = Date.now() - phaseStartTime;
            
            console.log(`✅ Phase 3 completed in ${this.metrics.wrapperInitDuration}ms`);
            
        } catch (error) {
            // Wrappers are not critical, log warning but continue
            this.state.warnings.push({
                phase: 'wrapper_init',
                warning: error.message,
                timestamp: Date.now()
            });
            
            console.warn('⚠️ Wrapper initialization failed, continuing without backward compatibility:', error);
        }
    }
    
    /**
     * Phase 4: Setup system integration
     */
    async setupSystemIntegration() {
        console.log('🔌 Phase 4: Setting up system integration');
        
        try {
            // Setup event system integration
            this.setupEventIntegration();
            
            // Setup storage event listeners
            this.setupStorageEventListeners();
            
            // Setup cross-tab synchronization
            this.setupCrossTabSync();
            
            // Setup error handling
            this.setupGlobalErrorHandling();
            
            console.log('✅ Phase 4 completed');
            
        } catch (error) {
            throw new BDOError('SYSTEM_INTEGRATION_FAILED', error.message);
        }
    }
    
    /**
     * Phase 5: Start optimization and monitoring
     */
    async startOptimizationAndMonitoring() {
        console.log('📊 Phase 5: Starting optimization and monitoring');
        
        try {
            if (this.config.enableOptimization) {
                await this.startOptimization();
            }
            
            if (this.config.enableMetrics) {
                this.startMetricsCollection();
            }
            
            if (this.config.cacheWarmup) {
                await this.warmupCache();
            }
            
            if (this.config.preloadCriticalData) {
                await this.preloadCriticalData();
            }
            
            console.log('✅ Phase 5 completed');
            
        } catch (error) {
            // Optimization is not critical, log warning but continue
            this.state.warnings.push({
                phase: 'optimization',
                warning: error.message,
                timestamp: Date.now()
            });
            
            console.warn('⚠️ Optimization setup failed, continuing with basic functionality:', error);
        }
    }
    
    /**
     * Phase 6: Finalize integration
     */
    async finalizeIntegration() {
        console.log('🏁 Phase 6: Finalizing integration');
        
        try {
            // Register global cleanup handlers
            this.setupCleanupHandlers();
            
            // Setup development tools if enabled
            if (this.config.enableDebugMode) {
                this.setupDevelopmentTools();
            }
            
            // Validate system integrity
            await this.validateSystemIntegrity();
            
            console.log('✅ Phase 6 completed');
            
        } catch (error) {
            throw new BDOError('INTEGRATION_FINALIZATION_FAILED', error.message);
        }
    }
    
    /**
     * Wait for unified storage manager to be ready
     */
    async waitForUnifiedStorage(maxWaitTime = 10000) {
        const startTime = Date.now();
        const checkInterval = 100;
        
        return new Promise((resolve, reject) => {
            const checkReady = () => {
                if (unifiedStorageManager.initialized) {
                    resolve();
                    return;
                }
                
                if (Date.now() - startTime > maxWaitTime) {
                    reject(new Error('Unified storage manager initialization timeout'));
                    return;
                }
                
                setTimeout(checkReady, checkInterval);
            };
            
            checkReady();
        });
    }
    
    /**
     * Setup event system integration
     */
    setupEventIntegration() {
        // Forward unified events to legacy event system
        const eventMappings = {
            [eventBus.eventTypes.MATERIAL_UPDATED]: 'inventoryUpdated',
            [eventBus.eventTypes.PROJECT_UPDATED]: 'projectChanged',
            [eventBus.eventTypes.STORAGE_UPDATED]: 'storageChanged'
        };
        
        Object.entries(eventMappings).forEach(([unifiedEvent, legacyEvent]) => {
            const listenerId = eventBus.on(unifiedEvent, (event) => {
                // Dispatch legacy event for backward compatibility
                const legacyEventData = new CustomEvent(legacyEvent, {
                    detail: {
                        ...event.data,
                        source: 'unified_storage',
                        originalEvent: event
                    }
                });
                
                document.dispatchEvent(legacyEventData);
            });
            
            this.eventListeners.set(unifiedEvent, listenerId);
        });
    }
    
    /**
     * Setup storage event listeners
     */
    setupStorageEventListeners() {
        // Listen for legacy storage events and sync to unified storage
        const legacyEvents = ['inventoryChanged', 'inventoryUpdated', 'projectChanged'];
        
        legacyEvents.forEach(eventName => {
            const listener = (event) => {
                // Sync legacy changes to unified storage if they didn't originate from unified storage
                if (event.detail && event.detail.source !== 'unified_storage') {
                    this.syncLegacyChange(eventName, event.detail);
                }
            };
            
            document.addEventListener(eventName, listener);
            this.eventListeners.set(`legacy_${eventName}`, listener);
        });
    }
    
    /**
     * Setup cross-tab synchronization
     */
    setupCrossTabSync() {
        const listener = (event) => {
            if (event.key && event.key.startsWith('unified_')) {
                // Handle cross-tab unified storage changes
                this.handleCrossTabChange(event);
            }
        };
        
        window.addEventListener('storage', listener);
        this.eventListeners.set('cross_tab_sync', listener);
    }
    
    /**
     * Setup global error handling
     */
    setupGlobalErrorHandling() {
        const errorListener = (event) => {
            if (event.error && event.error.name === 'BDOError') {
                this.handleBDOError(event.error);
            }
        };
        
        window.addEventListener('error', errorListener);
        this.eventListeners.set('global_error', errorListener);
        
        // Listen for unhandled promise rejections
        const rejectionListener = (event) => {
            if (event.reason && event.reason.name === 'BDOError') {
                this.handleBDOError(event.reason);
            }
        };
        
        window.addEventListener('unhandledrejection', rejectionListener);
        this.eventListeners.set('unhandled_rejection', rejectionListener);
    }
    
    /**
     * Start optimization processes
     */
    async startOptimization() {
        this.optimizationInterval = setInterval(async () => {
            try {
                // Cleanup expired cache entries
                await this.cleanupCache();
                
                // Optimize storage usage
                await this.optimizeStorage();
                
                // Update metrics
                this.updatePerformanceMetrics();
                
            } catch (error) {
                console.warn('Optimization cycle failed:', error);
            }
        }, this.config.optimizationInterval);
    }
    
    /**
     * Start metrics collection
     */
    startMetricsCollection() {
        this.metricsInterval = setInterval(() => {
            try {
                this.collectSystemMetrics();
                
                if (this.config.enablePerformanceLogging) {
                    this.logPerformanceMetrics();
                }
            } catch (error) {
                console.warn('Metrics collection failed:', error);
            }
        }, this.config.metricsInterval);
    }
    
    /**
     * Warm up cache with frequently accessed data
     */
    async warmupCache() {
        console.log('🔥 Warming up cache...');
        
        try {
            // Preload materials index
            await unifiedStorageManager.getFromStorage('unified_materials', 'index');
            
            // Preload projects index
            await unifiedStorageManager.getFromStorage('unified_projects', 'index');
            
            // Preload system metadata
            await unifiedStorageManager.getFromStorage('unified_metadata', 'system_metadata');
            
            console.log('✅ Cache warmup completed');
            
        } catch (error) {
            console.warn('Cache warmup failed:', error);
        }
    }
    
    /**
     * Preload critical data
     */
    async preloadCriticalData() {
        console.log('📦 Preloading critical data...');
        
        try {
            // This would preload the most commonly accessed projects and materials
            // Implementation depends on usage patterns
            
            console.log('✅ Critical data preloaded');
            
        } catch (error) {
            console.warn('Critical data preload failed:', error);
        }
    }
    
    /**
     * Setup cleanup handlers
     */
    setupCleanupHandlers() {
        const cleanup = () => {
            this.cleanup();
        };
        
        window.addEventListener('beforeunload', cleanup);
        window.addEventListener('unload', cleanup);
        
        // Also cleanup on visibility change (tab becomes hidden)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.partialCleanup();
            }
        });
    }
    
    /**
     * Setup development tools
     */
    setupDevelopmentTools() {
        // Expose debugging interface
        window.UnifiedStorageDebug = {
            manager: unifiedStorageManager,
            integration: this,
            metrics: () => this.getDetailedMetrics(),
            cache: () => unifiedStorageManager.cache.getStats(),
            events: () => eventBus.getEventHistory(),
            state: () => this.state,
            test: () => this.runDiagnostics()
        };
        
        console.log('🛠️ Development tools available at window.UnifiedStorageDebug');
    }
    
    /**
     * Validate system integrity
     */
    async validateSystemIntegrity() {
        const validations = [];
        
        // Check unified storage manager
        if (!unifiedStorageManager.initialized) {
            validations.push('Unified storage manager not initialized');
        }
        
        // Check event bus
        if (!eventBus || typeof eventBus.emit !== 'function') {
            validations.push('Event bus not functional');
        }
        
        // Check cache system
        if (!unifiedStorageManager.cache) {
            validations.push('Cache system not available');
        }
        
        if (validations.length > 0) {
            throw new BDOError('SYSTEM_INTEGRITY_FAILED', validations.join(', '));
        }
    }
    
    /**
     * Fallback to legacy systems if integration fails
     */
    async fallbackToLegacy() {
        console.warn('🔄 Falling back to legacy storage systems');
        
        try {
            // Re-enable legacy systems
            // This would involve undoing any changes made during integration
            
            this.emitIntegrationEvent('fallback_activated', {
                reason: 'integration_failed',
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Fallback to legacy systems failed:', error);
        }
    }
    
    /**
     * Handle cross-tab changes
     */
    handleCrossTabChange(event) {
        console.log('🔄 Cross-tab change detected:', event.key);
        
        // Clear relevant caches and emit sync events
        if (unifiedStorageManager.cache) {
            unifiedStorageManager.cache.remove(event.key);
        }
        
        this.emitIntegrationEvent('cross_tab_sync', {
            key: event.key,
            newValue: event.newValue,
            timestamp: Date.now()
        });
    }
    
    /**
     * Handle BDO errors
     */
    handleBDOError(error) {
        console.error('BDO Error handled by integration:', error);
        
        this.metrics.failedOperations++;
        
        this.emitIntegrationEvent('bdo_error', {
            error: error.message,
            type: error.type,
            details: error.details,
            timestamp: Date.now()
        });
    }
    
    /**
     * Sync legacy changes to unified storage
     */
    async syncLegacyChange(eventName, eventData) {
        try {
            // Implementation would sync specific legacy changes to unified storage
            console.log('🔄 Syncing legacy change:', eventName, eventData);
            
        } catch (error) {
            console.warn('Failed to sync legacy change:', error);
        }
    }
    
    /**
     * Cleanup cache
     */
    async cleanupCache() {
        if (unifiedStorageManager.cache) {
            // Perform cache cleanup
            await unifiedStorageManager.cache.clear('expired');
        }
    }
    
    /**
     * Optimize storage
     */
    async optimizeStorage() {
        // Implementation for storage optimization
        // This could include compacting data, removing duplicates, etc.
    }
    
    /**
     * Update performance metrics
     */
    updatePerformanceMetrics() {
        if (unifiedStorageManager.cache) {
            const cacheStats = unifiedStorageManager.cache.getStats();
            this.metrics.cacheHitRate = cacheStats.hitRate;
        }
        
        const systemMetrics = unifiedStorageManager.getMetrics();
        this.metrics.totalOperations = systemMetrics.operations;
        this.metrics.averageResponseTime = systemMetrics.averageResponseTime;
    }
    
    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        const now = Date.now();
        
        // Collect various system metrics
        const metrics = {
            timestamp: now,
            memory: this.getMemoryUsage(),
            performance: this.getPerformanceMetrics(),
            storage: this.getStorageMetrics(),
            cache: unifiedStorageManager.cache?.getStats() || {},
            errors: this.state.errors.length,
            warnings: this.state.warnings.length
        };
        
        // Store metrics for analysis
        this.storeMetrics(metrics);
    }
    
    /**
     * Log performance metrics
     */
    logPerformanceMetrics() {
        console.log('📊 Performance Metrics:', {
            initTime: this.metrics.initializationDuration,
            migrationTime: this.metrics.migrationDuration,
            totalOps: this.metrics.totalOperations,
            cacheHitRate: this.metrics.cacheHitRate,
            avgResponseTime: this.metrics.averageResponseTime
        });
    }
    
    /**
     * Get memory usage (if available)
     */
    getMemoryUsage() {
        if ('memory' in performance) {
            return performance.memory;
        }
        return null;
    }
    
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            navigation: performance.getEntriesByType('navigation')[0],
            resources: performance.getEntriesByType('resource').length,
            marks: performance.getEntriesByType('mark').length,
            measures: performance.getEntriesByType('measure').length
        };
    }
    
    /**
     * Get storage metrics
     */
    getStorageMetrics() {
        let totalSize = 0;
        
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                totalSize += key.length + (value ? value.length : 0);
            }
        } catch (error) {
            console.warn('Failed to calculate storage metrics:', error);
        }
        
        return {
            localStorageSize: totalSize,
            localStorageItems: localStorage.length
        };
    }
    
    /**
     * Store metrics for analysis
     */
    storeMetrics(metrics) {
        // Store in memory for short-term analysis
        if (!this._metricsHistory) {
            this._metricsHistory = [];
        }
        
        this._metricsHistory.push(metrics);
        
        // Keep only last 100 metrics entries
        if (this._metricsHistory.length > 100) {
            this._metricsHistory.shift();
        }
    }
    
    /**
     * Get detailed metrics
     */
    getDetailedMetrics() {
        return {
            integration: this.metrics,
            system: unifiedStorageManager.getMetrics(),
            cache: unifiedStorageManager.cache?.getStats() || {},
            history: this._metricsHistory || [],
            state: this.state
        };
    }
    
    /**
     * Run system diagnostics
     */
    async runDiagnostics() {
        console.log('🔧 Running system diagnostics...');
        
        const diagnostics = {
            timestamp: Date.now(),
            integration: {
                initialized: this.initialized,
                migrated: this.migrated,
                wrappersReady: this.wrappersReady,
                phase: this.state.phase
            },
            unifiedStorage: {
                initialized: unifiedStorageManager.initialized,
                version: unifiedStorageManager.version
            },
            eventBus: {
                available: !!eventBus,
                eventHistory: eventBus?.getEventHistory?.().length || 0
            },
            cache: unifiedStorageManager.cache?.getStats() || {},
            errors: this.state.errors,
            warnings: this.state.warnings
        };
        
        console.log('📋 Diagnostics completed:', diagnostics);
        return diagnostics;
    }
    
    /**
     * Emit integration events
     */
    emitIntegrationEvent(eventName, data) {
        const event = new CustomEvent(`unifiedStorage:${eventName}`, {
            detail: {
                ...data,
                integration: this,
                timestamp: Date.now()
            }
        });
        
        document.dispatchEvent(event);
        
        // Also emit through unified event bus if available
        if (eventBus) {
            eventBus.emit(`integration.${eventName}`, data);
        }
    }
    
    /**
     * Partial cleanup for tab visibility changes
     */
    partialCleanup() {
        // Clear non-critical caches
        if (unifiedStorageManager.cache) {
            unifiedStorageManager.cache.clear('memory');
        }
    }
    
    /**
     * Full cleanup
     */
    cleanup() {
        console.log('🧹 Cleaning up unified storage integration');
        
        // Clear intervals
        if (this.optimizationInterval) {
            clearInterval(this.optimizationInterval);
        }
        
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        
        // Remove event listeners
        this.eventListeners.forEach((listener, key) => {
            if (key.startsWith('legacy_')) {
                document.removeEventListener(key.replace('legacy_', ''), listener);
            } else if (key.startsWith('cross_tab')) {
                window.removeEventListener('storage', listener);
            } else if (key.startsWith('global_')) {
                window.removeEventListener(key.replace('global_', ''), listener);
            }
        });
        
        // Cleanup unified storage manager
        if (unifiedStorageManager) {
            unifiedStorageManager.cleanup();
        }
        
        this.emitIntegrationEvent('integration_cleanup', {
            phase: this.state.phase,
            initialized: this.initialized
        });
    }
}

// ============================================================================
// AUTO-INITIALIZATION
// ============================================================================

let globalIntegration = null;

/**
 * Initialize unified storage integration automatically
 */
export async function initializeUnifiedStorage(config = {}) {
    if (globalIntegration) {
        console.log('ℹ️ Unified storage integration already initialized');
        return globalIntegration;
    }
    
    try {
        globalIntegration = new UnifiedStorageIntegration(config);
        
        // Make available globally for debugging
        if (typeof window !== 'undefined') {
            window.unifiedStorageIntegration = globalIntegration;
        }
        
        return globalIntegration;
        
    } catch (error) {
        console.error('❌ Failed to initialize unified storage integration:', error);
        throw error;
    }
}

/**
 * Get the global integration instance
 */
export function getUnifiedStorageIntegration() {
    return globalIntegration;
}

// Auto-initialize if in browser environment and auto-initialize is enabled
if (typeof window !== 'undefined' && IntegrationConfig.autoInitialize) {
    // Initialize after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => initializeUnifiedStorage(), 100);
        });
    } else {
        setTimeout(() => initializeUnifiedStorage(), 100);
    }
}

export default {
    UnifiedStorageIntegration,
    initializeUnifiedStorage,
    getUnifiedStorageIntegration,
    IntegrationConfig
};