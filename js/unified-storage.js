// BDO Ship Upgrade Tracker - Clean Unified Storage System
// Single source of truth for all data operations

/**
 * Clean, elegant unified storage system
 * No legacy compatibility - fresh start
 */

// =============================================================================
// DATA MODELS
// =============================================================================

export class Project {
    constructor(data = {}) {
        this.id = data.id || this._generateId();
        this.name = data.name || '';
        this.type = data.type || 'materials'; // 'ships' | 'ship_parts' | 'materials'
        this.status = data.status || 'active'; // 'active' | 'completed' | 'paused'
        this.requirements = data.requirements || {};
        this.completionPercent = data.completionPercent || 0;
        this.createdAt = data.createdAt || Date.now();
        this.lastUpdated = data.lastUpdated || Date.now();
        this.completedAt = data.completedAt || null;
    }
    
    _generateId() {
        return `project-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
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
    
    updateProgress() {
        // Auto-calculate completion percentage based on requirements
        if (!this.requirements || Object.keys(this.requirements).length === 0) {
            this.completionPercent = 0;
            return;
        }
        
        let completedRequirements = 0;
        let totalRequirements = 0;
        
        for (const [materialName, reqData] of Object.entries(this.requirements)) {
            totalRequirements++;
            const material = storage.getMaterial(materialName);
            if (material && material.owned >= reqData.quantity) {
                completedRequirements++;
            }
        }
        
        this.completionPercent = totalRequirements > 0 ? (completedRequirements / totalRequirements) * 100 : 0;
        
        // Auto-complete if all requirements are met
        if (this.completionPercent >= 100 && this.status === 'active') {
            this.markCompleted();
        }
    }
}

export class Material {
    constructor(data = {}) {
        this.name = data.name || '';
        this.category = data.category || 'materials';
        this.owned = data.owned || 0;
        this.needed = data.needed || 0;
        this.remaining = Math.max(0, (data.needed || 0) - (data.owned || 0));
        this.usedBy = data.usedBy || [];
        this.isCompleted = (this.needed > 0 && this.owned >= this.needed);
        this.completedAt = data.completedAt || null;
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

// =============================================================================
// UNIFIED STORAGE MANAGER
// =============================================================================

class UnifiedStorage {
    constructor() {
        this.storageKey = 'bdo-unified-storage';
        this.data = {
            projects: {},
            materials: {},
            settings: {},
            metadata: {
                version: '2.0',
                createdAt: Date.now(),
                lastUpdated: Date.now()
            }
        };
        
        // Event system
        this.events = new EventTarget();
        
        // Load existing data
        this.load();
        
        // Auto-save on changes
        this.isAutoSaveEnabled = true;
        
        console.log('🚀 Clean Unified Storage initialized');
    }
    
    // =============================================================================
    // CORE OPERATIONS
    // =============================================================================
    
    /**
     * Load data from localStorage
     */
    load() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.data = {
                    ...this.data,
                    ...parsed,
                    metadata: {
                        ...this.data.metadata,
                        ...parsed.metadata,
                        lastLoaded: Date.now()
                    }
                };
                console.log(`📦 Loaded: ${Object.keys(this.data.projects).length} projects, ${Object.keys(this.data.materials).length} materials`);
            }
        } catch (error) {
            console.warn('Failed to load storage:', error);
        }
    }
    
    /**
     * Save data to localStorage
     */
    save() {
        try {
            this.data.metadata.lastUpdated = Date.now();
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
            this.events.dispatchEvent(new CustomEvent('storage-saved', {
                detail: { timestamp: Date.now() }
            }));
        } catch (error) {
            console.error('Failed to save storage:', error);
            this.events.dispatchEvent(new CustomEvent('storage-error', {
                detail: { error, operation: 'save' }
            }));
        }
    }
    
    /**
     * Auto-save if enabled
     */
    autoSave() {
        if (this.isAutoSaveEnabled) {
            this.save();
        }
    }
    
    // =============================================================================
    // PROJECT OPERATIONS
    // =============================================================================
    
    /**
     * Add or update a project
     */
    setProject(projectData) {
        const project = new Project(projectData);
        this.data.projects[project.name] = project;
        
        // Update material requirements
        this.updateMaterialRequirements(project);
        
        this.autoSave();
        this.events.dispatchEvent(new CustomEvent('project-updated', {
            detail: { project, action: 'set' }
        }));
        
        return project;
    }
    
    /**
     * Get a project
     */
    getProject(projectName) {
        return this.data.projects[projectName] || null;
    }
    
    /**
     * Get all projects
     */
    getAllProjects() {
        return { ...this.data.projects };
    }
    
    /**
     * Remove a project
     */
    removeProject(projectName) {
        const project = this.data.projects[projectName];
        if (project) {
            delete this.data.projects[projectName];
            
            // Clean up material requirements
            this.cleanupMaterialRequirements(projectName);
            
            this.autoSave();
            this.events.dispatchEvent(new CustomEvent('project-updated', {
                detail: { project, action: 'remove' }
            }));
        }
        return !!project;
    }
    
    /**
     * Get active projects
     */
    getActiveProjects() {
        return Object.values(this.data.projects).filter(p => p.status === 'active');
    }
    
    /**
     * Get completed projects
     */
    getCompletedProjects() {
        return Object.values(this.data.projects).filter(p => p.status === 'completed');
    }
    
    // =============================================================================
    // MATERIAL OPERATIONS
    // =============================================================================
    
    /**
     * Set material quantity
     */
    setMaterialQuantity(materialName, quantity, category = 'materials') {
        if (!this.data.materials[materialName]) {
            this.data.materials[materialName] = new Material({
                name: materialName,
                category
            });
        }
        
        const material = this.data.materials[materialName];
        const oldQuantity = material.owned;
        
        material.updateQuantity(quantity, material.needed);
        
        // Update all projects that use this material
        this.updateProjectsProgress();
        
        this.autoSave();
        this.events.dispatchEvent(new CustomEvent('material-updated', {
            detail: { 
                materialName, 
                material, 
                oldQuantity, 
                newQuantity: quantity,
                action: 'quantity-update'
            }
        }));
        
        return material;
    }
    
    /**
     * Get a material
     */
    getMaterial(materialName) {
        return this.data.materials[materialName] || null;
    }
    
    /**
     * Get all materials
     */
    getAllMaterials() {
        return { ...this.data.materials };
    }
    
    /**
     * Get materials by category
     */
    getMaterialsByCategory(category) {
        return Object.values(this.data.materials).filter(m => m.category === category);
    }
    
    /**
     * Get materials with quantities > 0
     */
    getMaterialsWithQuantity() {
        return Object.values(this.data.materials).filter(m => m.owned > 0);
    }
    
    /**
     * Get materials that are needed for active projects
     */
    getNeededMaterials() {
        return Object.values(this.data.materials).filter(m => m.needed > 0 && !m.isCompleted);
    }
    
    // =============================================================================
    // REQUIREMENT MANAGEMENT
    // =============================================================================
    
    /**
     * Update material requirements from project
     */
    updateMaterialRequirements(project) {
        if (!project.requirements) return;
        
        for (const [materialName, reqData] of Object.entries(project.requirements)) {
            if (!this.data.materials[materialName]) {
                this.data.materials[materialName] = new Material({
                    name: materialName,
                    category: reqData.type || 'materials'
                });
            }
            
            const material = this.data.materials[materialName];
            
            // Add this project to usedBy if not already there
            if (!material.usedBy.includes(project.name)) {
                material.usedBy.push(project.name);
            }
            
            // Calculate total needed quantity across all projects
            const totalNeeded = this.calculateTotalNeeded(materialName);
            material.updateQuantity(material.owned, totalNeeded);
        }
    }
    
    /**
     * Calculate total needed quantity for a material across all active projects
     */
    calculateTotalNeeded(materialName) {
        let totalNeeded = 0;
        
        for (const project of Object.values(this.data.projects)) {
            if (project.status === 'active' && project.requirements && project.requirements[materialName]) {
                totalNeeded += project.requirements[materialName].quantity || 0;
            }
        }
        
        return totalNeeded;
    }
    
    /**
     * Clean up material requirements when project is removed
     */
    cleanupMaterialRequirements(projectName) {
        for (const material of Object.values(this.data.materials)) {
            // Remove project from usedBy
            material.usedBy = material.usedBy.filter(name => name !== projectName);
            
            // Recalculate needed quantity
            const totalNeeded = this.calculateTotalNeeded(material.name);
            material.updateQuantity(material.owned, totalNeeded);
        }
    }
    
    /**
     * Update progress for all projects
     */
    updateProjectsProgress() {
        let updatedProjects = 0;
        
        for (const project of Object.values(this.data.projects)) {
            if (project.status === 'active') {
                const oldPercent = project.completionPercent;
                project.updateProgress();
                
                if (project.completionPercent !== oldPercent) {
                    updatedProjects++;
                    this.events.dispatchEvent(new CustomEvent('project-progress-updated', {
                        detail: { project, oldPercent, newPercent: project.completionPercent }
                    }));
                }
            }
        }
        
        return updatedProjects;
    }
    
    // =============================================================================
    // GLOBAL CALCULATIONS
    // =============================================================================
    
    /**
     * Calculate global requirements for all active projects
     */
    calculateGlobalRequirements() {
        const globalReqs = {};
        
        for (const project of Object.values(this.data.projects)) {
            if (project.status === 'active' && project.requirements) {
                this._addRequirementsToGlobal(project.requirements, globalReqs, 1, project.name);
            }
        }
        
        return globalReqs;
    }
    
    /**
     * Helper to recursively add requirements
     */
    _addRequirementsToGlobal(requirements, globalReqs, multiplier, projectName) {
        for (const [materialName, reqData] of Object.entries(requirements)) {
            if (!globalReqs[materialName]) {
                globalReqs[materialName] = {
                    totalNeeded: 0,
                    type: reqData.type || 'materials',
                    usedBy: new Set(),
                    isClickable: reqData.isClickable || false
                };
            }
            
            const quantity = (reqData.quantity || 0) * multiplier;
            globalReqs[materialName].totalNeeded += quantity;
            globalReqs[materialName].usedBy.add(projectName);
        }
    }
    
    // =============================================================================
    // SETTINGS
    // =============================================================================
    
    /**
     * Set a setting
     */
    setSetting(key, value) {
        this.data.settings[key] = value;
        this.autoSave();
        this.events.dispatchEvent(new CustomEvent('setting-updated', {
            detail: { key, value }
        }));
    }
    
    /**
     * Get a setting
     */
    getSetting(key, defaultValue = null) {
        return this.data.settings[key] ?? defaultValue;
    }
    
    /**
     * Get all settings
     */
    getAllSettings() {
        return { ...this.data.settings };
    }
    
    // =============================================================================
    // STATISTICS
    // =============================================================================
    
    /**
     * Get storage statistics
     */
    getStats() {
        const projects = Object.values(this.data.projects);
        const materials = Object.values(this.data.materials);
        
        return {
            projects: {
                total: projects.length,
                active: projects.filter(p => p.status === 'active').length,
                completed: projects.filter(p => p.status === 'completed').length,
                paused: projects.filter(p => p.status === 'paused').length
            },
            materials: {
                total: materials.length,
                withQuantity: materials.filter(m => m.owned > 0).length,
                needed: materials.filter(m => m.needed > 0).length,
                completed: materials.filter(m => m.isCompleted).length,
                totalOwned: materials.reduce((sum, m) => sum + m.owned, 0),
                totalNeeded: materials.reduce((sum, m) => sum + m.needed, 0)
            },
            storage: {
                size: JSON.stringify(this.data).length,
                lastUpdated: this.data.metadata.lastUpdated,
                version: this.data.metadata.version
            }
        };
    }
    
    // =============================================================================
    // DATA MANAGEMENT
    // =============================================================================
    
    /**
     * Export all data
     */
    export() {
        return {
            ...this.data,
            exportedAt: Date.now(),
            exportVersion: '2.0'
        };
    }
    
    /**
     * Import data
     */
    import(data) {
        if (!data.exportVersion) {
            throw new Error('Invalid export data');
        }
        
        // Backup current data
        const backup = { ...this.data };
        
        try {
            this.data = {
                projects: {},
                materials: {},
                settings: {},
                metadata: {
                    version: '2.0',
                    createdAt: Date.now(),
                    lastUpdated: Date.now(),
                    importedAt: Date.now(),
                    importedFrom: data.exportVersion
                },
                ...data
            };
            
            this.save();
            this.events.dispatchEvent(new CustomEvent('data-imported', {
                detail: { importedAt: Date.now() }
            }));
            
            return true;
            
        } catch (error) {
            // Restore backup on failure
            this.data = backup;
            throw error;
        }
    }
    
    /**
     * Clear all data
     */
    clear() {
        this.data = {
            projects: {},
            materials: {},
            settings: {},
            metadata: {
                version: '2.0',
                createdAt: Date.now(),
                lastUpdated: Date.now(),
                clearedAt: Date.now()
            }
        };
        
        this.save();
        this.events.dispatchEvent(new CustomEvent('data-cleared', {
            detail: { clearedAt: Date.now() }
        }));
    }
    
    // =============================================================================
    // UTILITY METHODS
    // =============================================================================
    
    /**
     * Search projects
     */
    searchProjects(query) {
        const lowerQuery = query.toLowerCase();
        return Object.values(this.data.projects).filter(project =>
            project.name.toLowerCase().includes(lowerQuery)
        );
    }
    
    /**
     * Search materials
     */
    searchMaterials(query) {
        const lowerQuery = query.toLowerCase();
        return Object.values(this.data.materials).filter(material =>
            material.name.toLowerCase().includes(lowerQuery)
        );
    }
    
    /**
     * Health check
     */
    healthCheck() {
        return {
            status: 'healthy',
            timestamp: Date.now(),
            data: {
                projects: Object.keys(this.data.projects).length,
                materials: Object.keys(this.data.materials).length,
                settings: Object.keys(this.data.settings).length
            },
            storage: {
                size: JSON.stringify(this.data).length,
                lastUpdated: this.data.metadata.lastUpdated
            }
        };
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const storage = new UnifiedStorage();

// Make available globally for debugging
window.bdoStorage = storage;

// Export default
export default storage;