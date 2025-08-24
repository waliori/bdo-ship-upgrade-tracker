# Unified Storage Manager - Complete Implementation

## Overview

The Unified Storage Manager is a comprehensive storage solution for the BDO Ship Upgrade Tracker application. It consolidates all storage operations into a single, optimized system while maintaining backward compatibility with existing code.

## 🚀 Key Features

- **Single Source of Truth**: All application data flows through one unified system
- **Advanced Caching**: Multi-layer caching with compression and optimization
- **Event-Driven Architecture**: Real-time updates across all components
- **Seamless Migration**: Automatic data migration from legacy systems
- **Backward Compatibility**: API wrappers ensure existing code continues to work
- **Thread-Safe Operations**: Atomic updates and transaction management
- **Performance Optimization**: Automatic optimization and monitoring
- **Error Recovery**: Comprehensive error handling with rollback capabilities

## 📁 Architecture

### Core Components

1. **UnifiedStorageManager** (`unified-storage-manager.js`)
   - Central storage orchestrator
   - Data validation and transformation
   - Transaction management
   - Cache coordination

2. **UnifiedEventBus** 
   - Cross-system event communication
   - Event history and replay
   - Priority-based event processing

3. **UnifiedCacheManager**
   - Multi-layer caching (memory, session, persistent)
   - Automatic compression
   - LRU eviction policies

4. **Migration System** (`unified-storage-migration.js`)
   - Automatic data migration from legacy systems
   - Rollback capabilities
   - Data integrity validation

5. **API Wrappers** (`unified-storage-wrappers.js`)
   - Backward-compatible interfaces
   - Transparent routing to unified storage
   - Event forwarding

6. **Integration Layer** (`unified-storage-integration.js`)
   - System orchestration
   - Performance monitoring
   - Error handling and recovery

## 🛠 Installation & Setup

### Automatic Initialization

The system initializes automatically when any module is imported:

```javascript
// Simple import - auto-initializes with full features
import UnifiedStorage from './js/unified-storage-index.js';

// Wait for system to be ready
await UnifiedStorage.events.waitForReady();
console.log('Unified storage is ready!');
```

### Manual Initialization

For more control over initialization:

```javascript
import { initializeUnifiedStorage } from './js/unified-storage-integration.js';

const integration = await initializeUnifiedStorage({
    autoMigrate: true,           // Migrate legacy data automatically
    enableWrappers: true,        // Enable backward compatibility
    enableOptimization: true,    // Enable performance optimization
    enableMetrics: true,         // Enable performance monitoring
    enableDebugMode: false       // Enable debug tools
});
```

### Quick Start Options

```javascript
import { QuickStart } from './js/unified-storage-index.js';

// Full features (recommended for production)
await QuickStart.full();

// Minimal setup (performance focused)
await QuickStart.minimal();

// Development setup (with debugging)
await QuickStart.development();

// Clean start (no migration)
await QuickStart.cleanStart();
```

## 📚 Usage Examples

### Basic Operations

```javascript
import { unifiedStorageManager } from './js/unified-storage-manager.js';

// Save a project
const project = {
    id: 'my_ship_project',
    name: 'Epheria Sailboat Upgrade',
    type: 'ship',
    requirements: {
        'Standardized Timber Square': { quantity: 800, type: 'materials' },
        'Iron Ingot': { quantity: 600, type: 'materials' }
    }
};

await unifiedStorageManager.saveProject(project);

// Get a project
const loadedProject = await unifiedStorageManager.getProject('my_ship_project');

// Save material data
const material = {
    id: 'iron_ingot',
    name: 'Iron Ingot',
    quantity: 150,
    category: 'materials'
};

await unifiedStorageManager.saveMaterial(material);
```

### Using Legacy APIs (Backward Compatibility)

```javascript
// These work exactly like before, but use unified storage internally
import { inventoryManager } from './js/inventory-system.js';

// Set item quantity (routes to unified storage)
inventoryManager.setItemQuantity('Iron Ingot', 250);

// Get filtered items (combines unified data)
const items = inventoryManager.getFilteredItems();

// All existing APIs continue to work unchanged
```

### Event System

```javascript
import { eventBus } from './js/unified-storage-manager.js';

// Listen for material updates
eventBus.on(eventBus.eventTypes.MATERIAL_UPDATED, (event) => {
    console.log('Material updated:', event.data.material);
});

// Listen for project completion
eventBus.on(eventBus.eventTypes.PROJECT_COMPLETED, (event) => {
    console.log('Project completed:', event.data.project);
});

// Custom events
eventBus.emit('custom.event', { data: 'example' });
```

### Cache Management

```javascript
import { cacheManager } from './js/unified-storage-manager.js';

// Get cached data with fallback
const data = await cacheManager.get('projects_index');

// Set data with options
await cacheManager.set('my_key', data, {
    layer: 'persistent',     // Store persistently
    compress: true,          // Compress large data
    ttl: 300000,            // 5 minute expiry
    priority: 'high'        // High priority for eviction
});

// Cache statistics
const stats = cacheManager.getStats();
console.log('Cache hit rate:', stats.hitRate);
```

## 🔄 Migration System

### Automatic Migration

Migration happens automatically on first load:

```javascript
// Migration runs automatically and handles:
// - InventoryManager localStorage data
// - GlobalInventoryManager project data
// - App.js storage patterns
// - CraftNavigator state data

// Check migration status
import { MigrationUtils } from './js/unified-storage-index.js';

const status = await MigrationUtils.checkStatus();
console.log('Migration needed:', status.needsMigration);
```

### Manual Migration Control

```javascript
import { MigrationFactory } from './js/unified-storage-migration.js';

// Create custom migration
const migration = await MigrationFactory.createMigration({
    batchSize: 50,           // Process 50 items at a time
    backupEnabled: true,     // Create backup before migration
    rollbackEnabled: true    // Enable rollback capability
});

// Run migration with progress tracking
const result = await migration.startMigration();
console.log('Migration completed:', result.statistics);
```

### Migration Statistics

```javascript
// After migration, get detailed statistics
const migrationResult = {
    success: true,
    migrationId: "migration_1234567890",
    statistics: {
        projectsMigrated: 15,
        materialsMigrated: 847,
        inventoryItemsMigrated: 1200,
        settingsMigrated: 8,
        dataIntegrityIssues: 0,
        duplicatesResolved: 3
    }
};
```

## 📊 Performance & Monitoring

### Performance Metrics

```javascript
import { SystemUtils } from './js/unified-storage-index.js';

// Get comprehensive performance metrics
const metrics = await SystemUtils.getPerformanceMetrics();

console.log('System performance:', {
    initializationTime: metrics.integration.initializationDuration,
    cacheHitRate: metrics.cache.hitRate,
    totalOperations: metrics.system.operations,
    averageResponseTime: metrics.system.averageResponseTime
});
```

### Health Monitoring

```javascript
// Check system health
const health = await SystemUtils.getHealthStatus();

if (health.status === 'healthy') {
    console.log('✅ System operating normally');
} else {
    console.warn('⚠️ System issues:', health.message);
}
```

### Debug Tools

```javascript
import { DebugUtils } from './js/unified-storage-index.js';

// Enable debug mode
DebugUtils.enableDebug();

// Get debug information
const debugInfo = await DebugUtils.getDebugInfo();

// Export debug report (downloads JSON file)
await DebugUtils.exportDebugReport();

// Access debug tools in browser console
console.log(window.UnifiedStorageDebug);
```

## 🔧 Configuration

### Storage Configuration

```javascript
// Configure storage namespaces
const storageConfig = {
    namespaces: {
        projects: 'unified_projects',
        materials: 'unified_materials',
        inventory: 'unified_inventory',
        metadata: 'unified_metadata'
    }
};
```

### Cache Configuration

```javascript
// Configure caching behavior
const cacheConfig = {
    maxMemoryItems: 1000,        // Maximum items in memory cache
    compressionEnabled: true,     // Enable data compression
    defaultTTL: 300000,          // Default 5-minute expiry
    cleanupInterval: 60000       // Cleanup every minute
};
```

### Event Configuration

```javascript
// Configure event processing
const eventConfig = {
    maxHistorySize: 1000,        // Event history size
    batchSize: 10,               // Events per batch
    processingDelay: 100         // Batch processing delay
};
```

## 🧪 Development & Testing

### Debug Mode

```javascript
// Enable comprehensive debugging
import UnifiedStorage from './js/unified-storage-index.js';

await UnifiedStorage.development(); // Includes debug mode

// Access debug interface
const debug = window.UnifiedStorageDebug;
console.log(debug.metrics());   // Performance metrics
console.log(debug.cache());     // Cache statistics
console.log(debug.events());    // Event history
console.log(debug.state());     // System state
```

### System Diagnostics

```javascript
// Run comprehensive system diagnostics
const diagnostics = await debug.test();

console.log('System diagnostics:', {
    integration: diagnostics.integration,
    unifiedStorage: diagnostics.unifiedStorage,
    eventBus: diagnostics.eventBus,
    cache: diagnostics.cache,
    errors: diagnostics.errors,
    warnings: diagnostics.warnings
});
```

### Testing Utilities

```javascript
// Force system reset for testing
import { SystemUtils } from './js/unified-storage-index.js';

const resetResult = await SystemUtils.forceReset();
console.log('System reset:', resetResult);
```

## 🔐 Data Models

### Project Model

```javascript
const project = {
    id: 'unique_id',
    name: 'Project Name',
    type: 'ship', // 'ship', 'ship_part', 'material'
    status: 'active', // 'active', 'completed', 'paused', 'archived'
    priority: 'normal', // 'urgent', 'high', 'normal', 'low', 'someday'
    
    metadata: {
        createdAt: 1640995200000,
        updatedAt: 1640995200000,
        version: '2.0.0'
    },
    
    requirements: {
        'Material Name': {
            quantity: 100,
            type: 'materials',
            isClickable: false
        }
    },
    
    progress: {
        completionPercent: 75,
        totalDependencies: 10,
        satisfiedDependencies: 7,
        missingDependencies: ['Material A', 'Material B'],
        lastValidated: 1640995200000
    }
};
```

### Material Model

```javascript
const material = {
    id: 'material_id',
    name: 'Material Name',
    category: 'materials', // 'ships', 'ship_parts', 'materials', 'barter_items', 'special'
    
    quantity: 150,
    allocated: 50,
    needed: 200,
    reserved: 25,
    
    metadata: {
        icon: 'path/to/icon.png',
        url: 'https://bdocodex.com/item',
        updatedAt: 1640995200000,
        version: '2.0.0'
    },
    
    usage: {
        usedBy: ['project_1', 'project_2'],
        priority: 750,
        completionPercent: 75,
        isBottleneck: false
    },
    
    alternatives: {
        canBarter: true,
        barterInfo: { /* barter details */ },
        recipes: ['recipe_1'],
        vendors: ['vendor_1']
    }
};
```

## ⚡ Performance Optimizations

### Caching Strategy

1. **Memory Cache**: Ultra-fast access for frequently used data
2. **Session Cache**: Tab-persistent storage for user session data
3. **Persistent Cache**: Long-term storage with compression

### Optimization Features

- **Lazy Loading**: Data loaded only when needed
- **Batch Operations**: Multiple operations combined for efficiency  
- **Compression**: Large datasets automatically compressed
- **Eviction Policies**: Intelligent cache eviction based on usage patterns
- **Prefetching**: Critical data preloaded for instant access

### Performance Monitoring

```javascript
// Real-time performance monitoring
setInterval(async () => {
    const metrics = await SystemUtils.getPerformanceMetrics();
    
    if (metrics.cache.hitRate < 80) {
        console.warn('⚠️ Low cache hit rate:', metrics.cache.hitRate);
    }
    
    if (metrics.system.averageResponseTime > 100) {
        console.warn('⚠️ High response time:', metrics.system.averageResponseTime);
    }
}, 30000); // Check every 30 seconds
```

## 🚨 Error Handling

### Error Types

```javascript
import { BDOError } from './js/error-handling.js';

// Specific error types for different scenarios
try {
    await unifiedStorageManager.saveProject(invalidProject);
} catch (error) {
    if (error instanceof BDOError) {
        switch (error.type) {
            case 'VALIDATION_ERROR':
                console.log('Data validation failed:', error.message);
                break;
            case 'STORAGE_SAVE_FAILED':
                console.log('Storage operation failed:', error.message);
                break;
            case 'MIGRATION_FAILED':
                console.log('Data migration failed:', error.message);
                break;
        }
    }
}
```

### Recovery Mechanisms

- **Transaction Rollback**: Failed operations are automatically rolled back
- **Retry Logic**: Transient failures are automatically retried
- **Fallback Systems**: Legacy systems can be used as fallback
- **Data Integrity Checks**: Automatic validation and repair

## 🔄 Event System

### Event Types

```javascript
// Core events
eventBus.eventTypes = {
    STORAGE_UPDATED: 'storage.updated',
    PROJECT_CREATED: 'project.created',
    PROJECT_UPDATED: 'project.updated',
    MATERIAL_UPDATED: 'material.updated',
    TRANSACTION_COMPLETED: 'transaction.completed',
    SYSTEM_READY: 'system.ready',
    CACHE_CLEARED: 'cache.cleared'
};
```

### Event Usage

```javascript
// Listen to specific events
const listenerId = eventBus.on('project.completed', (event) => {
    console.log('Project completed:', event.data);
});

// Listen once
eventBus.once('system.ready', () => {
    console.log('System is ready!');
});

// Remove listener
eventBus.off('project.completed', listenerId);

// Emit custom events
await eventBus.emit('custom.event', { data: 'value' }, {
    priority: 'urgent',
    source: 'my_module'
});
```

## 🔒 Thread Safety

### Atomic Operations

All operations are atomic and thread-safe:

```javascript
// These operations are guaranteed to be atomic
await unifiedStorageManager.saveProject(project);
await unifiedStorageManager.saveMaterial(material);

// Bulk operations are also atomic
const updates = {
    'Material A': 100,
    'Material B': 200
};
await unifiedStorageManager.bulkUpdateMaterials(updates);
```

### Transaction Management

```javascript
// Create a transaction for multiple operations
const transaction = await unifiedStorageManager.createTransaction({
    type: 'bulk_update',
    operations: [
        { type: 'storage_write', namespace: 'materials', key: 'iron', data: materialData },
        { type: 'cache_update', key: 'materials_index', data: updatedIndex }
    ]
});

// Execute transaction (all operations succeed or all fail)
const result = await unifiedStorageManager.executeTransaction(transaction);
```

## 🎯 Migration Details

### Legacy System Support

The migration system handles these legacy storage patterns:

1. **InventoryManager**: `bdo-inventory-*` keys
2. **GlobalInventoryManager**: `bdo-craft-inventory-*` keys  
3. **CraftNavigator**: `bdo-craft-navigator-*` keys
4. **App Storage**: `bdo_ship_upgrade` and related keys

### Migration Process

1. **Pre-Migration Validation**
   - Check for legacy data existence
   - Validate storage space availability
   - Detect potential conflicts

2. **Data Backup**
   - Create compressed backup of all existing data
   - Store rollback information

3. **Systematic Migration**
   - Transform data to unified format
   - Validate data integrity
   - Preserve relationships and dependencies

4. **Post-Migration Validation**
   - Verify data consistency
   - Check for duplicate entries
   - Validate project-material relationships

5. **Cleanup and Finalization**
   - Update system metadata
   - Clear migration flags
   - Optimize storage

## 🛠 Troubleshooting

### Common Issues

#### Migration Fails
```javascript
// Check storage space
const health = await SystemUtils.getHealthStatus();
if (health.status === 'error') {
    console.log('Issue:', health.message);
}

// Force reset if needed
await SystemUtils.forceReset();
```

#### Performance Issues
```javascript
// Check cache performance
const metrics = await SystemUtils.getPerformanceMetrics();
if (metrics.cache.hitRate < 70) {
    // Clear cache and restart
    await cacheManager.clear();
}
```

#### Data Inconsistency
```javascript
// Run diagnostics
const debug = window.UnifiedStorageDebug;
const diagnostics = await debug.test();

// Check for errors
if (diagnostics.errors.length > 0) {
    console.log('System errors:', diagnostics.errors);
}
```

### Debug Commands

```javascript
// Available in browser console when debug mode is enabled
UnifiedStorageDebug.metrics()      // Performance metrics
UnifiedStorageDebug.cache()        // Cache statistics  
UnifiedStorageDebug.events()       // Event history
UnifiedStorageDebug.state()        // System state
UnifiedStorageDebug.test()         // Run diagnostics
```

## 📈 Future Enhancements

### Planned Features

- **IndexedDB Support**: For larger datasets and offline capability
- **Web Worker Integration**: Background processing for heavy operations
- **Compression Algorithms**: Advanced compression for better storage efficiency
- **Conflict Resolution**: Automatic resolution of data conflicts
- **Advanced Analytics**: Detailed usage analytics and optimization suggestions

### Extensibility

The system is designed for easy extension:

```javascript
// Add custom data transformers
class CustomTransformer extends BaseTransformer {
    async extractLegacyData() {
        // Custom extraction logic
    }
    
    async transformData(legacyData) {
        // Custom transformation logic
    }
}

// Add custom event types
eventBus.eventTypes.CUSTOM_EVENT = 'custom.event';

// Add custom cache layers
cacheManager.layers.custom = new CustomCacheLayer();
```

## 📄 License

This unified storage system is part of the BDO Ship Upgrade Tracker project and follows the same licensing terms.

---

For additional support or questions, please refer to the project documentation or create an issue in the project repository.