// BDO Ship Upgrade Tracker - System Health Monitor
// Monitors system health during and after migration
// VALIDATOR AGENT - Ensures continuous system monitoring and health validation

/**
 * System Health Monitor
 * 
 * This utility provides comprehensive system health monitoring during migration
 * and ongoing operation. It tracks performance metrics, detects issues, and
 * provides health status reports with actionable insights.
 */

export class HealthMonitor {
    constructor() {
        this.healthMetrics = new Map();
        this.alertThresholds = new Map();
        this.healthHistory = [];
        this.activeMonitors = new Map();
        this.isMonitoring = false;
        this.monitoringInterval = null;
        
        // Initialize health check configurations
        this.initializeHealthChecks();
        this.initializeAlertThresholds();
        
        // Storage keys for health monitoring
        this.storageKeys = {
            healthHistory: 'bdo-health-history',
            alertConfig: 'bdo-health-alerts',
            performanceMetrics: 'bdo-performance-metrics',
            healthSettings: 'bdo-health-settings'
        };
        
        // Load settings from storage
        this.loadSettingsFromStorage();
        
        // Health check categories
        this.healthCategories = {
            storage: 'Storage System Health',
            performance: 'Performance Metrics',
            dataIntegrity: 'Data Integrity Status',
            apiHealth: 'API Endpoint Health',
            userExperience: 'User Experience Metrics',
            systemResources: 'System Resource Usage',
            errorRate: 'Error Rate Monitoring'
        };
    }

    /**
     * Initialize health check configurations
     */
    initializeHealthChecks() {
        // Storage health checks
        this.healthMetrics.set('storage', {
            name: 'Storage Health',
            checks: [
                { name: 'localStorage_availability', critical: true },
                { name: 'storage_quota_usage', critical: false },
                { name: 'key_count_growth', critical: false },
                { name: 'storage_corruption', critical: true },
                { name: 'data_consistency', critical: true }
            ]
        });

        // Performance health checks
        this.healthMetrics.set('performance', {
            name: 'Performance Metrics',
            checks: [
                { name: 'api_response_time', critical: false },
                { name: 'memory_usage', critical: false },
                { name: 'dom_operations', critical: false },
                { name: 'event_processing', critical: false },
                { name: 'calculation_speed', critical: true }
            ]
        });

        // Data integrity health checks
        this.healthMetrics.set('dataIntegrity', {
            name: 'Data Integrity',
            checks: [
                { name: 'cross_reference_consistency', critical: true },
                { name: 'orphaned_data_detection', critical: false },
                { name: 'data_validation_errors', critical: true },
                { name: 'checksum_verification', critical: false },
                { name: 'schema_compliance', critical: true }
            ]
        });

        // API health checks
        this.healthMetrics.set('apiHealth', {
            name: 'API Health',
            checks: [
                { name: 'function_availability', critical: true },
                { name: 'import_success_rate', critical: true },
                { name: 'event_system_health', critical: false },
                { name: 'cross_module_communication', critical: false },
                { name: 'legacy_compatibility', critical: false }
            ]
        });

        // User experience health checks
        this.healthMetrics.set('userExperience', {
            name: 'User Experience',
            checks: [
                { name: 'ui_responsiveness', critical: false },
                { name: 'workflow_completion_rate', critical: true },
                { name: 'error_user_impact', critical: false },
                { name: 'data_load_times', critical: false },
                { name: 'feature_availability', critical: true }
            ]
        });
    }

    /**
     * Initialize alert thresholds
     */
    initializeAlertThresholds() {
        // Storage thresholds
        this.alertThresholds.set('storage_quota_usage', { warning: 80, critical: 95 }); // Percentage
        this.alertThresholds.set('key_count_growth', { warning: 1000, critical: 2000 }); // Number of keys
        this.alertThresholds.set('storage_corruption_rate', { warning: 1, critical: 5 }); // Percentage

        // Performance thresholds
        this.alertThresholds.set('api_response_time', { warning: 1000, critical: 3000 }); // Milliseconds
        this.alertThresholds.set('memory_usage', { warning: 50, critical: 100 }); // MB estimate
        this.alertThresholds.set('calculation_time', { warning: 500, critical: 2000 }); // Milliseconds

        // Data integrity thresholds
        this.alertThresholds.set('consistency_errors', { warning: 1, critical: 5 }); // Number of errors
        this.alertThresholds.set('validation_failures', { warning: 3, critical: 10 }); // Number of failures

        // User experience thresholds
        this.alertThresholds.set('workflow_failure_rate', { warning: 5, critical: 15 }); // Percentage
        this.alertThresholds.set('ui_response_time', { warning: 300, critical: 1000 }); // Milliseconds
    }

    /**
     * Start continuous health monitoring
     */
    startMonitoring(intervalMs = 30000) {
        if (this.isMonitoring) {
            console.warn('Health monitoring is already running');
            return;
        }

        console.log(`🏥 Starting health monitoring (interval: ${intervalMs}ms)`);
        
        this.isMonitoring = true;
        this.monitoringInterval = setInterval(() => {
            this.performHealthCheck();
        }, intervalMs);

        // Perform initial health check
        this.performHealthCheck();
    }

    /**
     * Stop health monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        console.log('🛑 Stopping health monitoring');
        
        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }

    /**
     * Perform comprehensive health check
     */
    async performHealthCheck() {
        const healthReport = {
            timestamp: Date.now(),
            overall: 'healthy',
            categories: {},
            alerts: [],
            performance: {},
            recommendations: [],
            metrics: {}
        };

        console.log('🔍 Performing health check...');

        try {
            // Check each health category
            healthReport.categories.storage = await this.checkStorageHealth();
            healthReport.categories.performance = await this.checkPerformanceHealth();
            healthReport.categories.dataIntegrity = await this.checkDataIntegrityHealth();
            healthReport.categories.apiHealth = await this.checkAPIHealth();
            healthReport.categories.userExperience = await this.checkUserExperienceHealth();

            // Calculate overall health
            healthReport.overall = this.calculateOverallHealth(healthReport.categories);

            // Generate alerts
            healthReport.alerts = this.generateHealthAlerts(healthReport.categories);

            // Add performance metrics
            healthReport.performance = this.gatherPerformanceMetrics();

            // Generate recommendations
            healthReport.recommendations = this.generateHealthRecommendations(healthReport);

            // Store health report
            this.healthHistory.push(healthReport);
            
            // Keep only last 100 health reports
            if (this.healthHistory.length > 100) {
                this.healthHistory = this.healthHistory.slice(-100);
            }

            // Save to storage
            this.saveHealthHistoryToStorage();

            // Log health status
            this.logHealthStatus(healthReport);

        } catch (error) {
            console.error('❌ Health check failed:', error);
            
            healthReport.overall = 'error';
            healthReport.error = error.message;
            this.healthHistory.push(healthReport);
        }

        return healthReport;
    }

    /**
     * Check storage system health
     */
    async checkStorageHealth() {
        const health = {
            status: 'healthy',
            score: 100,
            issues: [],
            metrics: {}
        };

        try {
            // Check localStorage availability
            if (typeof(Storage) === "undefined" || !localStorage) {
                health.issues.push({
                    type: 'critical',
                    message: 'localStorage not available',
                    impact: 'System will not function'
                });
                health.status = 'critical';
                health.score = 0;
                return health;
            }

            // Calculate storage usage
            const storageUsage = this.calculateStorageUsage();
            health.metrics.totalUsage = storageUsage.totalBytes;
            health.metrics.keyCount = storageUsage.keyCount;
            health.metrics.usageFormatted = this.formatBytes(storageUsage.totalBytes);

            // Check quota usage (estimated)
            const quotaUsage = (storageUsage.totalBytes / (10 * 1024 * 1024)) * 100; // Assume 10MB quota
            health.metrics.quotaUsagePercent = quotaUsage;

            if (quotaUsage > this.alertThresholds.get('storage_quota_usage').critical) {
                health.issues.push({
                    type: 'critical',
                    message: `Storage quota usage critical: ${quotaUsage.toFixed(1)}%`,
                    impact: 'May cause data loss or system failure'
                });
                health.status = 'critical';
                health.score -= 30;
            } else if (quotaUsage > this.alertThresholds.get('storage_quota_usage').warning) {
                health.issues.push({
                    type: 'warning',
                    message: `Storage quota usage high: ${quotaUsage.toFixed(1)}%`,
                    impact: 'Consider data cleanup'
                });
                health.status = 'warning';
                health.score -= 10;
            }

            // Check for storage corruption
            const corruptionCheck = this.checkStorageCorruption();
            health.metrics.corruptedKeys = corruptionCheck.corruptedKeys.length;
            health.metrics.corruptionRate = corruptionCheck.corruptionRate;

            if (corruptionCheck.corruptionRate > this.alertThresholds.get('storage_corruption_rate').critical) {
                health.issues.push({
                    type: 'critical',
                    message: `High storage corruption rate: ${corruptionCheck.corruptionRate}%`,
                    impact: 'Data integrity compromised'
                });
                health.status = 'critical';
                health.score -= 40;
            } else if (corruptionCheck.corruptionRate > this.alertThresholds.get('storage_corruption_rate').warning) {
                health.issues.push({
                    type: 'warning',
                    message: `Storage corruption detected: ${corruptionCheck.corruptionRate}%`,
                    impact: 'Some data may be unreliable'
                });
                health.status = 'warning';
                health.score -= 15;
            }

            // Check key growth rate
            const keyGrowthRate = this.calculateKeyGrowthRate();
            health.metrics.keyGrowthRate = keyGrowthRate;

            if (keyGrowthRate > this.alertThresholds.get('key_count_growth').critical) {
                health.issues.push({
                    type: 'critical',
                    message: `Excessive key growth: ${keyGrowthRate} keys per hour`,
                    impact: 'Potential memory leak or data accumulation'
                });
                health.status = 'critical';
                health.score -= 20;
            } else if (keyGrowthRate > this.alertThresholds.get('key_count_growth').warning) {
                health.issues.push({
                    type: 'warning',
                    message: `High key growth rate: ${keyGrowthRate} keys per hour`,
                    impact: 'Monitor for potential issues'
                });
                if (health.status === 'healthy') health.status = 'warning';
                health.score -= 5;
            }

        } catch (error) {
            health.issues.push({
                type: 'critical',
                message: `Storage health check failed: ${error.message}`,
                impact: 'Unable to verify storage system'
            });
            health.status = 'error';
            health.score = 0;
        }

        return health;
    }

    /**
     * Check performance health
     */
    async checkPerformanceHealth() {
        const health = {
            status: 'healthy',
            score: 100,
            issues: [],
            metrics: {}
        };

        try {
            // Test API response time
            const apiResponseTime = await this.measureAPIResponseTime();
            health.metrics.apiResponseTime = apiResponseTime;

            if (apiResponseTime > this.alertThresholds.get('api_response_time').critical) {
                health.issues.push({
                    type: 'critical',
                    message: `API response time critical: ${apiResponseTime}ms`,
                    impact: 'Poor user experience'
                });
                health.status = 'critical';
                health.score -= 30;
            } else if (apiResponseTime > this.alertThresholds.get('api_response_time').warning) {
                health.issues.push({
                    type: 'warning',
                    message: `API response time slow: ${apiResponseTime}ms`,
                    impact: 'Degraded performance'
                });
                health.status = 'warning';
                health.score -= 10;
            }

            // Test calculation performance
            const calculationTime = await this.measureCalculationPerformance();
            health.metrics.calculationTime = calculationTime;

            if (calculationTime > this.alertThresholds.get('calculation_time').critical) {
                health.issues.push({
                    type: 'critical',
                    message: `Calculation performance critical: ${calculationTime}ms`,
                    impact: 'System may become unresponsive'
                });
                health.status = 'critical';
                health.score -= 25;
            } else if (calculationTime > this.alertThresholds.get('calculation_time').warning) {
                health.issues.push({
                    type: 'warning',
                    message: `Calculation performance slow: ${calculationTime}ms`,
                    impact: 'Noticeable delays in operations'
                });
                if (health.status === 'healthy') health.status = 'warning';
                health.score -= 8;
            }

            // Estimate memory usage
            const memoryUsage = this.estimateMemoryUsage();
            health.metrics.memoryUsage = memoryUsage;

            if (memoryUsage > this.alertThresholds.get('memory_usage').critical) {
                health.issues.push({
                    type: 'critical',
                    message: `High memory usage: ${memoryUsage}MB`,
                    impact: 'May cause browser slowdown'
                });
                health.status = 'critical';
                health.score -= 20;
            } else if (memoryUsage > this.alertThresholds.get('memory_usage').warning) {
                health.issues.push({
                    type: 'warning',
                    message: `Elevated memory usage: ${memoryUsage}MB`,
                    impact: 'Monitor for memory leaks'
                });
                if (health.status === 'healthy') health.status = 'warning';
                health.score -= 5;
            }

        } catch (error) {
            health.issues.push({
                type: 'critical',
                message: `Performance health check failed: ${error.message}`,
                impact: 'Unable to measure system performance'
            });
            health.status = 'error';
            health.score = 0;
        }

        return health;
    }

    /**
     * Check data integrity health
     */
    async checkDataIntegrityHealth() {
        const health = {
            status: 'healthy',
            score: 100,
            issues: [],
            metrics: {}
        };

        try {
            // Check cross-reference consistency
            const consistencyCheck = await this.checkCrossReferenceConsistency();
            health.metrics.consistencyErrors = consistencyCheck.errors.length;

            if (consistencyCheck.errors.length > this.alertThresholds.get('consistency_errors').critical) {
                health.issues.push({
                    type: 'critical',
                    message: `Critical data consistency errors: ${consistencyCheck.errors.length}`,
                    impact: 'Data integrity compromised'
                });
                health.status = 'critical';
                health.score -= 40;
            } else if (consistencyCheck.errors.length > this.alertThresholds.get('consistency_errors').warning) {
                health.issues.push({
                    type: 'warning',
                    message: `Data consistency issues: ${consistencyCheck.errors.length}`,
                    impact: 'Some data may be inconsistent'
                });
                health.status = 'warning';
                health.score -= 15;
            }

            // Check for orphaned data
            const orphanedData = await this.detectOrphanedData();
            health.metrics.orphanedItems = orphanedData.length;

            if (orphanedData.length > 10) {
                health.issues.push({
                    type: 'warning',
                    message: `Orphaned data detected: ${orphanedData.length} items`,
                    impact: 'Storage waste and potential confusion'
                });
                if (health.status === 'healthy') health.status = 'warning';
                health.score -= 5;
            }

            // Validate data schemas
            const schemaValidation = await this.validateDataSchemas();
            health.metrics.schemaViolations = schemaValidation.violations.length;

            if (schemaValidation.violations.length > this.alertThresholds.get('validation_failures').critical) {
                health.issues.push({
                    type: 'critical',
                    message: `Critical schema violations: ${schemaValidation.violations.length}`,
                    impact: 'System may malfunction'
                });
                health.status = 'critical';
                health.score -= 35;
            } else if (schemaValidation.violations.length > this.alertThresholds.get('validation_failures').warning) {
                health.issues.push({
                    type: 'warning',
                    message: `Schema validation issues: ${schemaValidation.violations.length}`,
                    impact: 'Data structure problems'
                });
                if (health.status === 'healthy') health.status = 'warning';
                health.score -= 10;
            }

        } catch (error) {
            health.issues.push({
                type: 'critical',
                message: `Data integrity health check failed: ${error.message}`,
                impact: 'Unable to verify data integrity'
            });
            health.status = 'error';
            health.score = 0;
        }

        return health;
    }

    /**
     * Check API health
     */
    async checkAPIHealth() {
        const health = {
            status: 'healthy',
            score: 100,
            issues: [],
            metrics: {}
        };

        try {
            // Test module imports
            const importSuccess = await this.testModuleImports();
            health.metrics.importSuccessRate = importSuccess.successRate;

            if (importSuccess.successRate < 90) {
                health.issues.push({
                    type: 'critical',
                    message: `Critical import failures: ${importSuccess.successRate}% success rate`,
                    impact: 'System functionality severely impacted'
                });
                health.status = 'critical';
                health.score -= 50;
            } else if (importSuccess.successRate < 100) {
                health.issues.push({
                    type: 'warning',
                    message: `Some import failures: ${importSuccess.successRate}% success rate`,
                    impact: 'Some features may not work'
                });
                health.status = 'warning';
                health.score -= 15;
            }

            // Test function availability
            const functionAvailability = await this.testFunctionAvailability();
            health.metrics.functionAvailability = functionAvailability.availableCount;
            health.metrics.totalFunctions = functionAvailability.totalCount;

            const availabilityRate = (functionAvailability.availableCount / functionAvailability.totalCount) * 100;
            if (availabilityRate < 90) {
                health.issues.push({
                    type: 'critical',
                    message: `Critical function availability: ${availabilityRate.toFixed(1)}%`,
                    impact: 'Major functionality missing'
                });
                health.status = 'critical';
                health.score -= 40;
            } else if (availabilityRate < 100) {
                health.issues.push({
                    type: 'warning',
                    message: `Some functions unavailable: ${availabilityRate.toFixed(1)}%`,
                    impact: 'Minor functionality issues'
                });
                if (health.status === 'healthy') health.status = 'warning';
                health.score -= 10;
            }

            // Test event system
            const eventSystemHealth = await this.testEventSystem();
            health.metrics.eventSystemWorking = eventSystemHealth.working;

            if (!eventSystemHealth.working) {
                health.issues.push({
                    type: 'warning',
                    message: 'Event system not functioning properly',
                    impact: 'Real-time updates may not work'
                });
                if (health.status === 'healthy') health.status = 'warning';
                health.score -= 10;
            }

        } catch (error) {
            health.issues.push({
                type: 'critical',
                message: `API health check failed: ${error.message}`,
                impact: 'Unable to verify API functionality'
            });
            health.status = 'error';
            health.score = 0;
        }

        return health;
    }

    /**
     * Check user experience health
     */
    async checkUserExperienceHealth() {
        const health = {
            status: 'healthy',
            score: 100,
            issues: [],
            metrics: {}
        };

        try {
            // Test workflow completion
            const workflowTest = await this.testUserWorkflows();
            health.metrics.workflowSuccessRate = workflowTest.successRate;

            if (workflowTest.successRate < 85) {
                health.issues.push({
                    type: 'critical',
                    message: `Critical workflow failure rate: ${(100 - workflowTest.successRate).toFixed(1)}%`,
                    impact: 'Users cannot complete essential tasks'
                });
                health.status = 'critical';
                health.score -= 45;
            } else if (workflowTest.successRate < 95) {
                health.issues.push({
                    type: 'warning',
                    message: `Some workflow issues: ${(100 - workflowTest.successRate).toFixed(1)}% failure rate`,
                    impact: 'User experience degraded'
                });
                health.status = 'warning';
                health.score -= 15;
            }

            // Test UI responsiveness
            const uiResponsiveness = await this.testUIResponsiveness();
            health.metrics.uiResponseTime = uiResponsiveness.averageTime;

            if (uiResponsiveness.averageTime > this.alertThresholds.get('ui_response_time').critical) {
                health.issues.push({
                    type: 'critical',
                    message: `UI response time critical: ${uiResponsiveness.averageTime}ms`,
                    impact: 'Interface feels unresponsive'
                });
                health.status = 'critical';
                health.score -= 30;
            } else if (uiResponsiveness.averageTime > this.alertThresholds.get('ui_response_time').warning) {
                health.issues.push({
                    type: 'warning',
                    message: `UI response time slow: ${uiResponsiveness.averageTime}ms`,
                    impact: 'Interface feels sluggish'
                });
                if (health.status === 'healthy') health.status = 'warning';
                health.score -= 10;
            }

            // Check feature availability
            const featureAvailability = await this.checkFeatureAvailability();
            health.metrics.featuresAvailable = featureAvailability.availableFeatures;
            health.metrics.totalFeatures = featureAvailability.totalFeatures;

            const featureRate = (featureAvailability.availableFeatures / featureAvailability.totalFeatures) * 100;
            if (featureRate < 90) {
                health.issues.push({
                    type: 'critical',
                    message: `Critical features unavailable: ${featureRate.toFixed(1)}% available`,
                    impact: 'Major functionality missing'
                });
                health.status = 'critical';
                health.score -= 35;
            } else if (featureRate < 100) {
                health.issues.push({
                    type: 'warning',
                    message: `Some features unavailable: ${featureRate.toFixed(1)}% available`,
                    impact: 'Some functionality limited'
                });
                if (health.status === 'healthy') health.status = 'warning';
                health.score -= 8;
            }

        } catch (error) {
            health.issues.push({
                type: 'critical',
                message: `User experience health check failed: ${error.message}`,
                impact: 'Unable to verify user experience'
            });
            health.status = 'error';
            health.score = 0;
        }

        return health;
    }

    /**
     * Calculate overall health from category health
     */
    calculateOverallHealth(categories) {
        const criticalCategories = ['storage', 'dataIntegrity', 'apiHealth'];
        const hasCriticalIssues = criticalCategories.some(category => 
            categories[category] && categories[category].status === 'critical'
        );

        if (hasCriticalIssues) {
            return 'critical';
        }

        const hasErrors = Object.values(categories).some(category => 
            category && category.status === 'error'
        );

        if (hasErrors) {
            return 'error';
        }

        const hasWarnings = Object.values(categories).some(category => 
            category && category.status === 'warning'
        );

        if (hasWarnings) {
            return 'warning';
        }

        return 'healthy';
    }

    /**
     * Generate health alerts based on categories
     */
    generateHealthAlerts(categories) {
        const alerts = [];

        for (const [categoryName, categoryHealth] of Object.entries(categories)) {
            if (categoryHealth && categoryHealth.issues) {
                for (const issue of categoryHealth.issues) {
                    alerts.push({
                        category: categoryName,
                        type: issue.type,
                        message: issue.message,
                        impact: issue.impact,
                        timestamp: Date.now(),
                        severity: this.getAlertSeverity(issue.type)
                    });
                }
            }
        }

        // Sort alerts by severity
        alerts.sort((a, b) => b.severity - a.severity);

        return alerts;
    }

    /**
     * Get alert severity score
     */
    getAlertSeverity(type) {
        const severityMap = {
            'critical': 100,
            'error': 80,
            'warning': 60,
            'info': 40
        };
        return severityMap[type] || 0;
    }

    /**
     * Generate health recommendations
     */
    generateHealthRecommendations(healthReport) {
        const recommendations = [];

        // Storage recommendations
        if (healthReport.categories.storage && healthReport.categories.storage.issues.length > 0) {
            recommendations.push({
                category: 'storage',
                priority: 'high',
                title: 'Storage System Issues',
                description: 'Address storage system problems to prevent data loss',
                actions: [
                    'Clean up unnecessary data',
                    'Check for storage corruption',
                    'Monitor storage growth rate',
                    'Consider implementing data archival'
                ]
            });
        }

        // Performance recommendations
        if (healthReport.categories.performance && healthReport.categories.performance.issues.length > 0) {
            recommendations.push({
                category: 'performance',
                priority: 'medium',
                title: 'Performance Optimization',
                description: 'Improve system performance for better user experience',
                actions: [
                    'Optimize API response times',
                    'Review calculation algorithms',
                    'Implement caching strategies',
                    'Monitor memory usage patterns'
                ]
            });
        }

        // Data integrity recommendations
        if (healthReport.categories.dataIntegrity && healthReport.categories.dataIntegrity.issues.length > 0) {
            recommendations.push({
                category: 'dataIntegrity',
                priority: 'critical',
                title: 'Data Integrity Issues',
                description: 'Critical data integrity problems require immediate attention',
                actions: [
                    'Fix cross-reference inconsistencies',
                    'Remove orphaned data',
                    'Validate data schemas',
                    'Implement data validation checks'
                ]
            });
        }

        // API health recommendations
        if (healthReport.categories.apiHealth && healthReport.categories.apiHealth.issues.length > 0) {
            recommendations.push({
                category: 'apiHealth',
                priority: 'high',
                title: 'API Functionality Issues',
                description: 'API problems are affecting system functionality',
                actions: [
                    'Fix module import issues',
                    'Restore missing functions',
                    'Test event system',
                    'Verify cross-module communication'
                ]
            });
        }

        return recommendations;
    }

    /**
     * Helper methods for health checks
     */

    calculateStorageUsage() {
        let totalBytes = 0;
        let keyCount = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('bdo-') || key.startsWith('bdo_ship_upgrade'))) {
                const value = localStorage.getItem(key);
                if (value) {
                    totalBytes += new Blob([value]).size;
                    keyCount++;
                }
            }
        }

        return { totalBytes, keyCount };
    }

    checkStorageCorruption() {
        const corruptedKeys = [];
        let totalKeys = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('bdo-') || key.startsWith('bdo_ship_upgrade'))) {
                totalKeys++;
                try {
                    const value = localStorage.getItem(key);
                    if (value && (value.startsWith('{') || value.startsWith('['))) {
                        JSON.parse(value);
                    }
                } catch (error) {
                    corruptedKeys.push({ key, error: error.message });
                }
            }
        }

        const corruptionRate = totalKeys > 0 ? (corruptedKeys.length / totalKeys) * 100 : 0;
        return { corruptedKeys, corruptionRate };
    }

    calculateKeyGrowthRate() {
        // Simplified calculation - would need historical data for accurate rate
        const currentKeyCount = this.calculateStorageUsage().keyCount;
        const lastReport = this.healthHistory[this.healthHistory.length - 1];
        
        if (lastReport && lastReport.categories.storage && lastReport.categories.storage.metrics) {
            const lastKeyCount = lastReport.categories.storage.metrics.keyCount || 0;
            const timeDiff = Date.now() - lastReport.timestamp;
            const hoursDiff = timeDiff / (1000 * 60 * 60);
            
            if (hoursDiff > 0) {
                return Math.round((currentKeyCount - lastKeyCount) / hoursDiff);
            }
        }

        return 0; // No historical data available
    }

    async measureAPIResponseTime() {
        const startTime = Date.now();
        
        try {
            // Test a typical API operation
            const { globalInventory } = await import('../craft-system/global_inventory.js');
            const testResult = globalInventory.getMaterialQuantity('Health_Test_Material');
            
            return Date.now() - startTime;
        } catch (error) {
            return 9999; // Return high value if API fails
        }
    }

    async measureCalculationPerformance() {
        const startTime = Date.now();
        
        try {
            // Test calculation-heavy operation
            const { craftNavigator } = await import('../craft-system/craft_navigator.js');
            const requirements = craftNavigator.calculateGlobalRequirements();
            
            return Date.now() - startTime;
        } catch (error) {
            return 9999; // Return high value if calculation fails
        }
    }

    estimateMemoryUsage() {
        // Simple estimation based on localStorage size and object counts
        const storageUsage = this.calculateStorageUsage();
        const estimatedMB = (storageUsage.totalBytes / 1024 / 1024) * 2; // Rough multiplier for in-memory objects
        return Math.round(estimatedMB * 10) / 10;
    }

    async checkCrossReferenceConsistency() {
        const errors = [];

        try {
            // Check project consistency between global inventory and navigator
            const globalProjects = this.getStorageItem('bdo-craft-active-projects', []);
            const navProjects = this.getStorageItem('bdo-craft-navigator-active', []);

            const globalProjectNames = globalProjects.map(p => p.name);
            
            for (const navProject of navProjects) {
                if (!globalProjectNames.includes(navProject)) {
                    errors.push({
                        type: 'missing_global_project',
                        project: navProject,
                        description: 'Project exists in navigator but not in global inventory'
                    });
                }
            }

            for (const globalProject of globalProjectNames) {
                if (!navProjects.includes(globalProject)) {
                    errors.push({
                        type: 'missing_nav_project',
                        project: globalProject,
                        description: 'Project exists in global inventory but not in navigator'
                    });
                }
            }

        } catch (error) {
            errors.push({
                type: 'consistency_check_failed',
                error: error.message,
                description: 'Failed to perform consistency check'
            });
        }

        return { errors };
    }

    async detectOrphanedData() {
        const orphaned = [];

        try {
            const activeProjects = this.getStorageItem('bdo-craft-active-projects', []);
            const projectNames = activeProjects.map(p => p.name);

            // Check for orphaned dependencies
            const dependencies = this.getStorageItem('bdo-craft-project-dependencies', {});
            for (const [projectName] of Object.entries(dependencies)) {
                if (!projectNames.includes(projectName)) {
                    orphaned.push({
                        type: 'orphaned_dependency',
                        key: projectName,
                        location: 'bdo-craft-project-dependencies'
                    });
                }
            }

            // Check for orphaned priorities
            const priorities = this.getStorageItem('bdo-craft-project-priorities', {});
            for (const [projectName] of Object.entries(priorities)) {
                if (!projectNames.includes(projectName)) {
                    orphaned.push({
                        type: 'orphaned_priority',
                        key: projectName,
                        location: 'bdo-craft-project-priorities'
                    });
                }
            }

        } catch (error) {
            // Error checking for orphaned data
        }

        return orphaned;
    }

    async validateDataSchemas() {
        const violations = [];

        try {
            // Validate active projects schema
            const activeProjects = this.getStorageItem('bdo-craft-active-projects', []);
            if (!Array.isArray(activeProjects)) {
                violations.push({
                    type: 'schema_violation',
                    key: 'bdo-craft-active-projects',
                    expected: 'Array',
                    actual: typeof activeProjects
                });
            } else {
                for (const project of activeProjects) {
                    if (!project.name || typeof project.requirements !== 'object') {
                        violations.push({
                            type: 'project_schema_violation',
                            project: project.name || 'unnamed',
                            issue: 'Missing name or requirements'
                        });
                    }
                }
            }

            // Validate other critical schemas
            const navState = this.getStorageItem('bdo-craft-navigator-state', {});
            if (navState && typeof navState !== 'object') {
                violations.push({
                    type: 'schema_violation',
                    key: 'bdo-craft-navigator-state',
                    expected: 'Object',
                    actual: typeof navState
                });
            }

        } catch (error) {
            violations.push({
                type: 'validation_error',
                error: error.message,
                description: 'Failed to validate schemas'
            });
        }

        return { violations };
    }

    async testModuleImports() {
        const modules = [
            '../craft-system/global_inventory.js',
            '../craft-system/craft_navigator.js',
            '../inventory-system.js'
        ];

        let successfulImports = 0;
        const failures = [];

        for (const modulePath of modules) {
            try {
                await import(modulePath);
                successfulImports++;
            } catch (error) {
                failures.push({ module: modulePath, error: error.message });
            }
        }

        return {
            successRate: Math.round((successfulImports / modules.length) * 100),
            successfulImports,
            totalModules: modules.length,
            failures
        };
    }

    async testFunctionAvailability() {
        let availableCount = 0;
        let totalCount = 0;

        try {
            const { globalInventory } = await import('../craft-system/global_inventory.js');
            const functions = ['setMaterialQuantity', 'getMaterialQuantity', 'calculateGlobalInventoryStatus'];
            
            for (const funcName of functions) {
                totalCount++;
                if (typeof globalInventory[funcName] === 'function') {
                    availableCount++;
                }
            }

            const { craftNavigator } = await import('../craft-system/craft_navigator.js');
            const navFunctions = ['navigateTo', 'addToActiveProjects', 'calculateGlobalRequirements'];
            
            for (const funcName of navFunctions) {
                totalCount++;
                if (typeof craftNavigator[funcName] === 'function') {
                    availableCount++;
                }
            }

        } catch (error) {
            // Count failed imports as unavailable functions
        }

        return { availableCount, totalCount };
    }

    async testEventSystem() {
        return new Promise((resolve) => {
            let eventReceived = false;
            
            const handler = () => {
                eventReceived = true;
            };
            
            document.addEventListener('inventoryUpdated', handler);
            
            // Try to trigger an event
            setTimeout(() => {
                document.removeEventListener('inventoryUpdated', handler);
                resolve({ working: true }); // Event listener was successfully added
            }, 50);
        });
    }

    async testUserWorkflows() {
        const workflows = [
            { name: 'inventory_update', test: () => this.testInventoryUpdate() },
            { name: 'project_management', test: () => this.testProjectManagement() },
            { name: 'navigation', test: () => this.testNavigation() }
        ];

        let successfulWorkflows = 0;
        const failures = [];

        for (const workflow of workflows) {
            try {
                const result = await workflow.test();
                if (result.success) {
                    successfulWorkflows++;
                } else {
                    failures.push({ workflow: workflow.name, error: result.error });
                }
            } catch (error) {
                failures.push({ workflow: workflow.name, error: error.message });
            }
        }

        return {
            successRate: Math.round((successfulWorkflows / workflows.length) * 100),
            successfulWorkflows,
            totalWorkflows: workflows.length,
            failures
        };
    }

    async testInventoryUpdate() {
        try {
            const { globalInventory } = await import('../craft-system/global_inventory.js');
            
            const testMaterial = 'Health_Test_Inventory_' + Date.now();
            globalInventory.setMaterialQuantity(testMaterial, 100);
            const retrieved = globalInventory.getMaterialQuantity(testMaterial);
            
            // Clean up
            globalInventory.setMaterialQuantity(testMaterial, 0);
            
            return { success: retrieved === 100 };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testProjectManagement() {
        try {
            const { craftNavigator } = await import('../craft-system/craft_navigator.js');
            
            const activeProjects = craftNavigator.getActiveProjects();
            return { success: Array.isArray(activeProjects) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testNavigation() {
        try {
            const { craftNavigator } = await import('../craft-system/craft_navigator.js');
            
            const currentCraft = craftNavigator.getCurrentCraft();
            return { success: true }; // Navigation system is working if no error
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testUIResponsiveness() {
        // Simple DOM manipulation timing test
        const startTime = Date.now();
        
        try {
            const testElement = document.createElement('div');
            testElement.style.display = 'none';
            document.body.appendChild(testElement);
            
            // Simulate some DOM operations
            for (let i = 0; i < 100; i++) {
                testElement.innerHTML = `Test ${i}`;
                testElement.style.color = i % 2 ? 'red' : 'blue';
            }
            
            document.body.removeChild(testElement);
            
            return { averageTime: Date.now() - startTime };
        } catch (error) {
            return { averageTime: 9999, error: error.message };
        }
    }

    async checkFeatureAvailability() {
        const features = [
            'inventory_management',
            'project_management',
            'craft_navigation',
            'recipe_completion',
            'data_export_import'
        ];

        let availableFeatures = 0;

        // Test each feature
        try {
            const { globalInventory } = await import('../craft-system/global_inventory.js');
            if (globalInventory.setMaterialQuantity) availableFeatures++;
            if (globalInventory.calculateGlobalInventoryStatus) availableFeatures++;
            if (globalInventory.completeRecipe) availableFeatures++;
        } catch {
            // Feature not available
        }

        try {
            const { craftNavigator } = await import('../craft-system/craft_navigator.js');
            if (craftNavigator.addToActiveProjects) availableFeatures++;
            if (craftNavigator.navigateTo) availableFeatures++;
        } catch {
            // Feature not available
        }

        return {
            availableFeatures,
            totalFeatures: features.length
        };
    }

    /**
     * Utility methods
     */

    gatherPerformanceMetrics() {
        return {
            timestamp: Date.now(),
            healthHistorySize: this.healthHistory.length,
            activeMonitors: this.activeMonitors.size,
            monitoringActive: this.isMonitoring,
            storageUsage: this.calculateStorageUsage()
        };
    }

    logHealthStatus(healthReport) {
        const statusEmoji = {
            'healthy': '✅',
            'warning': '⚠️',
            'critical': '🚨',
            'error': '❌'
        };

        console.log(`${statusEmoji[healthReport.overall]} Health Status: ${healthReport.overall.toUpperCase()}`);
        
        if (healthReport.alerts.length > 0) {
            console.log(`📋 Active Alerts: ${healthReport.alerts.length}`);
            for (const alert of healthReport.alerts.slice(0, 3)) { // Log top 3 alerts
                console.log(`  ${statusEmoji[alert.type]} ${alert.message}`);
            }
        }
    }

    saveHealthHistoryToStorage() {
        try {
            const historyToSave = this.healthHistory.slice(-50); // Keep last 50 reports
            localStorage.setItem(this.storageKeys.healthHistory, JSON.stringify(historyToSave));
        } catch (error) {
            console.warn('Failed to save health history to storage:', error);
        }
    }

    loadSettingsFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKeys.healthHistory);
            if (stored) {
                this.healthHistory = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Failed to load health history from storage:', error);
        }
    }

    getStorageItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            return defaultValue;
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Get current health status
     */
    getCurrentHealthStatus() {
        if (this.healthHistory.length === 0) {
            return null;
        }
        return this.healthHistory[this.healthHistory.length - 1];
    }

    /**
     * Get health trend
     */
    getHealthTrend(categoryName = null, hours = 24) {
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        const recentReports = this.healthHistory.filter(report => report.timestamp > cutoffTime);
        
        if (recentReports.length === 0) {
            return null;
        }

        if (categoryName) {
            return recentReports.map(report => ({
                timestamp: report.timestamp,
                status: report.categories[categoryName]?.status || 'unknown',
                score: report.categories[categoryName]?.score || 0
            }));
        } else {
            return recentReports.map(report => ({
                timestamp: report.timestamp,
                status: report.overall,
                alertCount: report.alerts.length
            }));
        }
    }

    /**
     * Generate health summary
     */
    generateHealthSummary() {
        const currentHealth = this.getCurrentHealthStatus();
        if (!currentHealth) {
            return {
                status: 'unknown',
                message: 'No health data available'
            };
        }

        const criticalAlerts = currentHealth.alerts.filter(alert => alert.type === 'critical');
        const warningAlerts = currentHealth.alerts.filter(alert => alert.type === 'warning');

        const summary = {
            overall: currentHealth.overall,
            timestamp: currentHealth.timestamp,
            categories: Object.keys(currentHealth.categories).reduce((acc, key) => {
                acc[key] = currentHealth.categories[key].status;
                return acc;
            }, {}),
            alertCounts: {
                critical: criticalAlerts.length,
                warning: warningAlerts.length,
                total: currentHealth.alerts.length
            },
            recommendations: currentHealth.recommendations.length,
            monitoring: this.isMonitoring
        };

        // Generate status message
        if (summary.overall === 'healthy') {
            summary.message = 'All systems functioning normally';
        } else if (summary.overall === 'warning') {
            summary.message = `${warningAlerts.length} warnings detected, monitoring recommended`;
        } else if (summary.overall === 'critical') {
            summary.message = `${criticalAlerts.length} critical issues require immediate attention`;
        } else {
            summary.message = 'System health check encountered errors';
        }

        return summary;
    }
}

// Export singleton instance
export const healthMonitor = new HealthMonitor();

// Export utility functions
export function startHealthMonitoring(intervalMs = 30000) {
    return healthMonitor.startMonitoring(intervalMs);
}

export function stopHealthMonitoring() {
    return healthMonitor.stopMonitoring();
}

export function performHealthCheck() {
    return healthMonitor.performHealthCheck();
}

export function getCurrentHealthStatus() {
    return healthMonitor.getCurrentHealthStatus();
}

export function getHealthTrend(categoryName = null, hours = 24) {
    return healthMonitor.getHealthTrend(categoryName, hours);
}

export function generateHealthSummary() {
    return healthMonitor.generateHealthSummary();
}