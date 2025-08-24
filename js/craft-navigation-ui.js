/**
 * Multi-Craft Navigation UI System
 * Handles the new navigation interface for ships, ship parts, and materials
 */

import { craftNavigator, addToActiveProjects, calculateGlobalRequirements } from './craft-system/craft_navigator.js';
import { globalInventory, completeRecipe, validateRecipeForCompletion, isRecipeCompleted } from './craft-system/global_inventory.js';
import { iconLoader } from './icon-loader.js';

export class CraftNavigationUI {
    constructor() {
        this.currentView = 'ships'; // ships | ship_parts | materials
        this.breadcrumb = [];
        this.activeProjects = new Set();
        this.isInitialized = false;
        
        // Enhanced localStorage integration
        this.storageKeys = {
            activeProjects: 'bdo-craft-ui-active-projects',
            viewState: 'bdo-craft-ui-view-state',
            userPreferences: 'bdo-craft-ui-preferences',
            projectFilters: 'bdo-craft-ui-project-filters',
            navigationSession: 'bdo-craft-ui-nav-session'
        };
        
        // Load state from localStorage
        this.loadActiveProjects();
        this.loadViewState();
        this.loadUserPreferences();
        
        // Active projects pagination and filtering
        this.projectsPerPage = 6;
        this.currentProjectsPage = 1;
        this.projectsFilter = '';
        this.projectsTypeFilter = 'all';
        
        // Modal projects filtering
        this.modalProjectsFilter = '';
        this.modalProjectsTypeFilter = 'all';
        
        // Modal projects pagination
        this.modalProjectsPerPage = 8;
        this.currentModalProjectsPage = 1;
        
        // View mode (grid or list)
        this.viewMode = 'grid';
        
        // Modal event listeners setup flag
        this.modalListenersSetup = false;
        
        // Real-time inventory tracking
        this.inventoryCache = new Map();
        this.lastInventoryUpdate = 0;
        
        // Setup event listeners for global system integration
        this.setupGlobalEventListeners();
    }
    
    /**
     * Check if we're currently viewing a specific material
     */
    isCurrentlyViewingMaterial(materialName) {
        // Check if material is in current craft's requirements
        if (craftNavigator.currentCraft) {
            const currentCraft = craftNavigator.allCrafts[craftNavigator.currentCraft];
            return currentCraft?.requirements?.[materialName] !== undefined;
        }
        return false;
    }
    
    /**
     * Update material displays in UI
     */
    updateMaterialDisplays(materialName, quantity) {
        // Update any visible material counters
        const materialElements = document.querySelectorAll(`[data-material="${materialName}"]`);
        materialElements.forEach(element => {
            const quantityElement = element.querySelector('.material-quantity');
            if (quantityElement) {
                quantityElement.textContent = quantity;
                quantityElement.classList.toggle('complete', quantity > 0);
            }
        });
    }
    
    /**
     * Update project completion status
     */
    updateProjectCompletionStatus() {
        // Debounce this operation
        if (this.updateCompletionTimeout) {
            clearTimeout(this.updateCompletionTimeout);
        }
        
        this.updateCompletionTimeout = setTimeout(() => {
            this.refreshProjectCompletionStatus();
        }, 500);
    }
    
    /**
     * Refresh project completion status
     */
    refreshProjectCompletionStatus() {
        const globalStatus = globalInventory.calculateGlobalInventoryStatus();
        const summary = globalInventory.getInventorySummary();
        
        // Update UI elements with completion information
        const summaryElements = document.querySelectorAll('.project-completion-summary');
        summaryElements.forEach(element => {
            element.innerHTML = `
                <div class="completion-stat">
                    <span class="stat-value">${summary.completedMaterials}</span>
                    <span class="stat-label">Completed</span>
                </div>
                <div class="completion-stat">
                    <span class="stat-value">${summary.totalMaterials}</span>
                    <span class="stat-label">Total</span>
                </div>
                <div class="completion-stat">
                    <span class="stat-value">${Math.round(summary.overallCompletionPercent)}%</span>
                    <span class="stat-label">Progress</span>
                </div>
            `;
        });
    }
    
    /**
     * Handle craft navigation
     */
    handleCraftNavigation(data) {
        if (data.to) {
            this.breadcrumb = [...(data.breadcrumb || [])];
            this.saveViewState();
        }
    }
    
    /**
     * Handle project added
     */
    handleProjectAdded(data) {
        if (data.project && !this.activeProjects.has(data.project)) {
            this.activeProjects.add(data.project);
            this.saveActiveProjects();
            this.updateActiveProjectsDisplay();
        }
    }
    
    /**
     * Handle project removed
     */
    handleProjectRemoved(data) {
        if (data.project && this.activeProjects.has(data.project)) {
            this.activeProjects.delete(data.project);
            this.saveActiveProjects();
            this.updateActiveProjectsDisplay();
        }
    }
    
    /**
     * Initialize the navigation UI system with enhanced localStorage integration
     */
    async initialize() {
        if (this.isInitialized) return;
        
        console.log('🔄 Initializing Enhanced Craft Navigation UI...');
        
        // Create the main navigation structure
        await this.createNavigationInterface();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup global inventory panel
        this.setupGlobalInventoryPanel();
        
        // Update tab counts
        this.updateTabCounts();
        
        // Initialize with ships view (or restore previous view)
        await this.navigateToView(this.currentView);
        
        // Update active projects display after HTML is ready
        this.updateActiveProjectsDisplay();
        
        // Initialize project completion tracking
        this.refreshProjectCompletionStatus();
        
        this.isInitialized = true;
        console.log('✅ Enhanced Craft Navigation UI initialized');
    }
    
    /**
     * Create the main navigation interface structure
     */
    async createNavigationInterface() {
        // Find the existing ship selection area
        const shipSelection = document.querySelector('.ship-selection');
        if (!shipSelection) {
            throw new Error('Ship selection container not found');
        }
        
        // Replace with new craft navigation structure
        shipSelection.innerHTML = `
            <div class="craft-navigation-container">
                <!-- Navigation Header with Tabs -->
                <div class="craft-navigation-header">
                    <div class="craft-nav-tabs">
                        <button class="craft-nav-tab active" data-view="ships">
                            <span class="tab-icon">🚢</span>
                            <span class="tab-label">Ships</span>
                            <span class="tab-count" id="ships-count">0</span>
                        </button>
                        <button class="craft-nav-tab" data-view="ship_parts">
                            <span class="tab-icon">⚙️</span>
                            <span class="tab-label">Ship Parts</span>
                            <span class="tab-count" id="ship-parts-count">0</span>
                        </button>
                        <button class="craft-nav-tab" data-view="materials">
                            <span class="tab-icon">🔨</span>
                            <span class="tab-label">Materials</span>
                            <span class="tab-count" id="materials-count">0</span>
                        </button>
                    </div>
                    
                    <!-- Enhanced Active Projects Panel with Global Inventory -->
                    <div class="active-projects-panel">
                        <div class="active-projects-header" id="active-projects-header">
                            <span class="projects-icon">📋</span>
                            <span class="projects-label">Active Projects</span>
                            <span class="projects-count" id="active-projects-count">0</span>
                            <button class="expand-projects-btn" title="Open Active Projects Manager">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                                </svg>
                            </button>
                        </div>
                        <!-- Global Inventory Summary -->
                        <div class="global-inventory-summary" id="global-inventory-summary">
                            <div class="inventory-summary-item">
                                <span class="summary-value" id="global-completion-percent">0%</span>
                                <span class="summary-label">Complete</span>
                            </div>
                            <div class="inventory-summary-item">
                                <span class="summary-value" id="global-material-count">0/0</span>
                                <span class="summary-label">Materials</span>
                            </div>
                            <div class="inventory-summary-item bottleneck" id="bottleneck-indicator">
                                <span class="summary-value" id="bottleneck-count">0</span>
                                <span class="summary-label">Bottlenecks</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Global Inventory Panel (New) -->
                <div class="global-inventory-panel" id="global-inventory-panel" style="display: none;">
                    <div class="inventory-panel-header">
                        <h3>🌐 Global Material Overview</h3>
                        <div class="inventory-controls">
                            <button class="inventory-filter-btn active" data-filter="all">All</button>
                            <button class="inventory-filter-btn" data-filter="bottlenecks">Bottlenecks</button>
                            <button class="inventory-filter-btn" data-filter="complete">Complete</button>
                            <button class="inventory-filter-btn" data-filter="missing">Missing</button>
                        </div>
                        <button class="close-inventory-panel" title="Close Panel">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="inventory-panel-content" id="inventory-panel-content">
                        <!-- Dynamic content will be populated here -->
                    </div>
                </div>
                
                <!-- Breadcrumb Navigation -->
                <div class="craft-breadcrumb-container" id="craft-breadcrumb" style="display: none;">
                    <div class="breadcrumb-nav">
                        <button class="breadcrumb-back" id="breadcrumb-back">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="m15 18-6-6 6-6"/>
                            </svg>
                        </button>
                        <div class="breadcrumb-path" id="breadcrumb-path">
                            <!-- Breadcrumb will be populated here -->
                        </div>
                    </div>
                </div>
                
                <!-- Current Craft Details -->
                <div class="current-craft-details" id="current-craft-details" style="display: none;">
                    <div class="craft-header">
                        <div class="craft-icon" id="current-craft-icon"></div>
                        <div class="craft-info">
                            <div class="craft-name" id="current-craft-name"></div>
                            <div class="craft-type-badge" id="current-craft-type"></div>
                            <div class="craft-actions">
                                <button class="add-to-projects-btn" id="add-to-projects-btn">
                                    <span class="btn-icon">➕</span>
                                    Add to Projects
                                </button>
                                <button class="craft-info-btn" id="craft-info-btn">
                                    <span class="btn-icon">ℹ️</span>
                                    Info
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Craft Requirements -->
                    <div class="craft-requirements" id="craft-requirements">
                        <!-- Requirements will be populated here -->
                    </div>
                </div>
                
                <!-- Craft Grid View -->
                <div class="craft-grid-container">
                    <!-- Search and Filters -->
                    <div class="craft-controls">
                        <div class="search-box">
                            <span class="search-icon">🔍</span>
                            <input type="text" id="craft-search-input" class="search-input" placeholder="Search crafts...">
                        </div>
                        <div class="view-controls">
                            <button class="view-toggle active" data-view-mode="grid" title="Grid View">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="7" height="7"/>
                                    <rect x="14" y="3" width="7" height="7"/>
                                    <rect x="3" y="14" width="7" height="7"/>
                                    <rect x="14" y="14" width="7" height="7"/>
                                </svg>
                            </button>
                            <button class="view-toggle" data-view-mode="list" title="List View">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="8" y1="6" x2="21" y2="6"/>
                                    <line x1="8" y1="12" x2="21" y2="12"/>
                                    <line x1="8" y1="18" x2="21" y2="18"/>
                                    <line x1="3" y1="6" x2="3.01" y2="6"/>
                                    <line x1="3" y1="12" x2="3.01" y2="12"/>
                                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Craft Grid -->
                    <div class="craft-grid" id="craft-grid">
                        <!-- Craft items will be populated here -->
                    </div>
                </div>
                
                <!-- Active Projects Modal -->
                <div class="modal-overlay" id="active-projects-modal" style="display: none;">
                    <div class="modal-content active-projects-modal-content">
                        <div class="modal-header">
                            <h2>Active Projects Manager</h2>
                            <button class="modal-close" id="close-projects-modal">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="projects-modal-controls">
                                <input type="text" id="modal-projects-filter" placeholder="Filter projects..." class="projects-filter-input">
                                <div class="projects-type-filter">
                                    <button class="type-filter-btn active" data-type="all">All</button>
                                    <button class="type-filter-btn" data-type="ships">Ships</button>
                                    <button class="type-filter-btn" data-type="ship_parts">Parts</button>
                                    <button class="type-filter-btn" data-type="materials">Materials</button>
                                </div>
                            </div>
                            <div class="projects-modal-list" id="modal-projects-list">
                                <div class="no-active-projects">
                                    No active projects yet. Add some crafts to get started!
                                </div>
                            </div>
                            <div class="modal-projects-pagination" id="modal-projects-pagination" style="display: none;">
                                <button class="pagination-btn" id="modal-projects-prev">‹</button>
                                <span class="pagination-info" id="modal-projects-page-info">1 / 1</span>
                                <button class="pagination-btn" id="modal-projects-next">›</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Update the existing materials section to be hidden by default
        const materialsSection = document.getElementById('materials-section');
        if (materialsSection) {
            materialsSection.style.display = 'none';
        }
    }
    
    /**
     * Setup all event listeners for the navigation UI
     */
    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.craft-nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.navigateToView(view);
            });
        });
        
        // Breadcrumb navigation
        document.getElementById('breadcrumb-back')?.addEventListener('click', () => {
            this.goBack();
        });
        
        // Search functionality
        document.getElementById('craft-search-input')?.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });
        
        // View mode toggles
        document.querySelectorAll('.view-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.viewMode;
                this.setViewMode(mode);
            });
        });
        
        // Add to projects button
        document.getElementById('add-to-projects-btn')?.addEventListener('click', async () => {
            if (this.currentCraft) {
                try {
                    await this.addToActiveProjects(this.currentCraft);
                } catch (error) {
                    console.error('Error adding to active projects:', error);
                    this.showToast(`Error adding ${this.currentCraft}: ${error.message}`, 'error');
                }
            }
        });
        
        // Info button
        document.getElementById('craft-info-btn')?.addEventListener('click', () => {
            if (this.currentCraft) {
                this.showCraftInfo(this.currentCraft);
            }
        });
        
        // Active Projects Modal - setup basic listeners (expand button)
        this.setupExpandButtonListener();
        
        // Listen for inventory updates
        document.addEventListener('inventoryUpdated', (e) => {
            this.refreshCurrentView();
            this.updateGlobalInventorySummary();
        });
        
        // Add global inventory toggle listener
        const summaryElement = document.getElementById('global-inventory-summary');
        if (summaryElement) {
            summaryElement.addEventListener('click', () => {
                this.toggleGlobalInventoryPanel();
            });
        }
    }
    
    /**
     * Set view mode (grid or list)
     */
    setViewMode(mode) {
        // Update active toggle button
        document.querySelectorAll('.view-toggle').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.viewMode === mode);
        });
        
        // Update grid container class
        const craftGrid = document.getElementById('craft-grid');
        if (craftGrid) {
            craftGrid.className = `craft-grid ${mode}-view`;
        }
        
        this.viewMode = mode;
    }
    
    /**
     * Navigate to a specific view (ships, ship_parts, materials)
     */
    async navigateToView(viewType) {
        this.currentView = viewType;
        
        // Update active tab
        document.querySelectorAll('.craft-nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewType);
        });
        
        // Hide detail views when switching main categories
        this.hideDetailView();
        
        // Load and display crafts for this view
        await this.loadCraftView(viewType);
        
        // Update URL (optional)
        this.updateURL();
    }
    
    /**
     * Load and display crafts for a specific view
     */
    async loadCraftView(viewType) {
        const craftGrid = document.getElementById('craft-grid');
        const crafts = craftNavigator.getCraftsByType(viewType);
        
        craftGrid.innerHTML = '';
        
        if (Object.keys(crafts).length === 0) {
            craftGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <div class="empty-title">No ${viewType.replace('_', ' ')} found</div>
                    <div class="empty-desc">There are no ${viewType.replace('_', ' ')} available in this category.</div>
                </div>
            `;
            return;
        }
        
        // Filter crafts based on view type
        let filteredCrafts = crafts;
        if (viewType === 'ship_parts') {
            // For ship parts, exclude enhanced versions (+1, +2, etc.) and show only base versions
            filteredCrafts = {};
            const baseNames = new Set();
            
            // First pass: collect all base names
            for (const [craftName, craftData] of Object.entries(crafts)) {
                if (!craftName.match(/^\+\d+\s/)) {
                    // This is a base item (no +X prefix)
                    baseNames.add(craftName);
                    filteredCrafts[craftName] = craftData;
                }
            }
            
            // If a base name doesn't exist, show the +10 version as fallback
            for (const [craftName, craftData] of Object.entries(crafts)) {
                if (craftName.match(/^\+10\s/)) {
                    const baseName = craftName.replace(/^\+10\s/, '');
                    if (!baseNames.has(baseName)) {
                        filteredCrafts[baseName] = {
                            ...craftData,
                            isEnhanced: true,
                            originalName: craftName
                        };
                    }
                }
            }
        }
        
        // Create craft cards
        for (const [craftName, craftData] of Object.entries(filteredCrafts)) {
            const craftCard = await this.createCraftCard(craftName, craftData, viewType);
            craftGrid.appendChild(craftCard);
        }
    }
    
    /**
     * Create a craft card element
     */
    async createCraftCard(craftName, craftData, craftType) {
        const card = document.createElement('div');
        card.className = 'craft-card';
        card.dataset.craftName = craftName;
        card.dataset.craftType = craftType;
        
        // Get metadata (use original name if this is an enhanced fallback)
        const metadataKey = craftData.originalName || craftName;
        const metadata = craftNavigator.metadata[metadataKey] || craftNavigator.metadata[craftName];
        
        card.innerHTML = `
            <div class="craft-card-header">
                <div class="craft-card-icon" id="icon-${craftName.replace(/[^a-zA-Z0-9]/g, '-')}">
                    ${this.getCraftIcon(craftType)}
                </div>
                <div class="craft-card-complexity ${metadata?.complexity || 'low'}">
                    ${metadata?.complexity || 'low'}
                </div>
            </div>
            <div class="craft-card-content">
                <div class="craft-card-title">${craftName}</div>
                <div class="craft-card-meta">
                    <span class="craft-card-type">${craftType.replace('_', ' ')}</span>
                    <span class="craft-card-reqs">${metadata?.totalRequirements || 0} requirements</span>
                </div>
                <div class="craft-card-breakdown">
                    ${metadata?.breakdown ? Object.entries(metadata.breakdown)
                        .filter(([key, count]) => count > 0)
                        .map(([key, count]) => `<span class="${key}">${count} ${key.replace('_', ' ')}</span>`)
                        .join(' • ') : ''
                    }
                </div>
            </div>
            <div class="craft-card-actions">
                <button class="craft-card-btn primary" data-action="navigate">
                    <span class="btn-text">View Details</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="m9 18 6-6-6-6"/>
                    </svg>
                </button>
                <button class="craft-card-btn secondary" data-action="add-project" title="Add to Active Projects">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                </button>
            </div>
        `;
        
        // Add event listeners
        card.querySelector('[data-action="navigate"]').addEventListener('click', (e) => {
            e.stopPropagation();
            // Use original name if this is an enhanced fallback, otherwise use craft name
            const targetName = craftData.originalName || craftName;
            this.navigateToCraft(targetName);
        });
        
        card.querySelector('[data-action="add-project"]').addEventListener('click', (e) => {
            e.stopPropagation();
            // Use original name if this is an enhanced fallback, otherwise use craft name
            const targetName = craftData.originalName || craftName;
            this.addToActiveProjects(targetName);
        });
        
        // Load actual icon if available
        const iconContainer = card.querySelector('.craft-card-icon');
        try {
            const iconInfo = iconLoader.getIconInfo(craftName);
            if (iconInfo && iconInfo.filename) {
                iconContainer.innerHTML = `<img src="icons/${iconInfo.filename}" alt="${craftName}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;">`;
            }
        } catch (error) {
            // Keep the fallback emoji icon
        }
        
        return card;
    }
    
    /**
     * Navigate to a specific craft's detail view
     */
    async navigateToCraft(craftName) {
        try {
            const craftInfo = craftNavigator.navigateTo(craftName);
            
            // Update breadcrumb
            this.updateBreadcrumb(craftInfo.breadcrumb);
            
            // Show detail view
            this.showDetailView(craftInfo);
            
            // Hide grid view
            document.querySelector('.craft-grid-container').style.display = 'none';
        } catch (error) {
            // If exact craft not found, try to find base version or similar
            let fallbackName = craftName;
            
            // Try removing enhancement level prefix
            if (craftName.match(/^\+\d+\s/)) {
                fallbackName = craftName.replace(/^\+\d+\s/, '');
                try {
                    const craftInfo = craftNavigator.navigateTo(fallbackName);
                    this.updateBreadcrumb(craftInfo.breadcrumb);
                    this.showDetailView(craftInfo);
                    document.querySelector('.craft-grid-container').style.display = 'none';
                    return;
                } catch (fallbackError) {
                    // Continue to next fallback
                }
            }
            
            // Show error toast and don't navigate
            this.showToast(`Recipe not found: ${craftName}`, 'error');
            console.warn(`Failed to navigate to craft: ${craftName}`, error);
        }
    }
    
    /**
     * Show the detail view for a craft
     */
    async showDetailView(craftInfo) {
        const detailsContainer = document.getElementById('current-craft-details');
        const breadcrumbContainer = document.getElementById('craft-breadcrumb');
        
        // Show containers
        detailsContainer.style.display = 'block';
        breadcrumbContainer.style.display = 'block';
        
        const craftName = craftInfo.breadcrumb[craftInfo.breadcrumb.length - 1];
        this.currentCraft = craftName; // Store current craft for buttons
        
        // Populate craft header
        document.getElementById('current-craft-name').textContent = craftInfo.craft.baseName || craftName;
        document.getElementById('current-craft-type').textContent = craftInfo.type.replace('_', ' ');
        
        // Set type badge class
        const typeBadge = document.getElementById('current-craft-type');
        typeBadge.className = `craft-type-badge ${craftInfo.type}`;
        
        // Load and set icon
        const iconContainer = document.getElementById('current-craft-icon');
        try {
            const iconInfo = iconLoader.getIconInfo(craftName);
            if (iconInfo && iconInfo.filename) {
                iconContainer.innerHTML = `<img src="icons/${iconInfo.filename}" alt="${craftName}" style="width: 100%; height: 100%; object-fit: contain;">`;
            } else {
                iconContainer.innerHTML = this.getCraftIcon(craftInfo.type);
            }
        } catch (error) {
            iconContainer.innerHTML = this.getCraftIcon(craftInfo.type);
        }
        
        // Populate requirements
        await this.populateRequirements(craftInfo.craft.requirements, craftName);
        
        // Update button states
        await this.updateAddToProjectsButtonState();
    }
    
    /**
     * Update the Add to Projects button state based on current craft
     */
    async updateAddToProjectsButtonState() {
        const button = document.getElementById('add-to-projects-btn');
        if (!button || !this.currentCraft) return;
        
        try {
            const canAddResult = await craftNavigator.canAddToProjects(this.currentCraft);
            
            if (canAddResult.canAdd === false) {
                // Gray out the button - only for already added items
                button.disabled = true;
                button.classList.add('disabled');
                
                // Update button text to show reason
                const btnText = button.querySelector('.btn-text') || button.childNodes[button.childNodes.length - 1];
                if (btnText) {
                    btnText.textContent = canAddResult.reason === 'Already in projects' ? 
                        'Already Added' : 
                        'Cannot Add';
                }
                
                // Update icon
                const btnIcon = button.querySelector('.btn-icon');
                if (btnIcon) {
                    btnIcon.textContent = canAddResult.reason === 'Already in projects' ? '✅' : '❌';
                }
                
                // Update title for tooltip
                button.title = canAddResult.reason;
            } else {
                // Enable the button - all recipes can now be added!
                button.disabled = false;
                button.classList.remove('disabled');
                
                // Reset button text and icon
                const btnText = button.querySelector('.btn-text') || button.childNodes[button.childNodes.length - 1];
                if (btnText) {
                    btnText.textContent = 'Add to Projects';
                }
                
                const btnIcon = button.querySelector('.btn-icon');
                if (btnIcon) {
                    btnIcon.textContent = '➕';
                }
                
                // Clear tooltip
                button.title = 'Add this recipe to your active projects';
            }
        } catch (error) {
            console.warn('Error updating button state:', error);
            // Default to enabled if there's an error
            button.disabled = false;
            button.classList.remove('disabled');
        }
    }
    
    /**
     * Hide the detail view
     */
    hideDetailView() {
        document.getElementById('current-craft-details').style.display = 'none';
        document.getElementById('craft-breadcrumb').style.display = 'none';
        document.querySelector('.craft-grid-container').style.display = 'block';
    }
    
    /**
     * Get icon for craft type
     */
    getCraftIcon(craftType) {
        const icons = {
            ships: '🚢',
            ship_parts: '⚙️',
            materials: '🔨'
        };
        return icons[craftType] || '📦';
    }
    
    /**
     * Update breadcrumb navigation
     */
    updateBreadcrumb(breadcrumb) {
        const breadcrumbPath = document.getElementById('breadcrumb-path');
        
        breadcrumbPath.innerHTML = breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1;
            return `
                <span class="breadcrumb-item ${isLast ? 'current' : ''}" data-index="${index}">
                    ${item}
                </span>
                ${!isLast ? '<span class="breadcrumb-separator">›</span>' : ''}
            `;
        }).join('');
        
        // Add click handlers for navigation
        breadcrumbPath.querySelectorAll('.breadcrumb-item:not(.current)').forEach(item => {
            item.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.navigateToBreadcrumbIndex(index);
            });
        });
    }
    
    /**
     * Go back in navigation
     */
    goBack() {
        const backResult = craftNavigator.goBack();
        if (backResult) {
            this.showDetailView(backResult);
            this.updateBreadcrumb(backResult.breadcrumb);
        } else {
            // Go back to main view
            this.hideDetailView();
            this.loadCraftView(this.currentView);
        }
    }
    
    /**
     * Handle search functionality
     */
    handleSearch(query) {
        if (!query.trim()) {
            this.loadCraftView(this.currentView);
            return;
        }
        
        const results = craftNavigator.searchCrafts(query, this.currentView);
        const craftGrid = document.getElementById('craft-grid');
        
        craftGrid.innerHTML = '';
        
        if (results.length === 0) {
            craftGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <div class="empty-title">No results found</div>
                    <div class="empty-desc">Try searching with different keywords.</div>
                </div>
            `;
            return;
        }
        
        results.forEach(result => {
            const craftCard = this.createCraftCard(result.name, result.data, result.type);
            craftCard.then(card => craftGrid.appendChild(card));
        });
    }
    
    /**
     * Populate requirements for a craft
     */
    async populateRequirements(requirements, craftName) {
        const requirementsContainer = document.getElementById('craft-requirements');
        requirementsContainer.innerHTML = '';
        
        if (!requirements || Object.keys(requirements).length === 0) {
            requirementsContainer.innerHTML = `
                <div class="no-requirements">
                    <div class="no-reqs-icon">✨</div>
                    <div class="no-reqs-text">This craft has no requirements!</div>
                </div>
            `;
            return;
        }
        
        // Create requirements list
        for (const [reqName, reqData] of Object.entries(requirements)) {
            const reqElement = await this.createRequirementElement(reqName, reqData, craftName);
            requirementsContainer.appendChild(reqElement);
        }
    }
    
    /**
     * Create a requirement element
     */
    async createRequirementElement(reqName, reqData, parentCraft) {
        const reqElement = document.createElement('div');
        
        // Handle ship alternatives
        if (reqData.type === 'ship_alternatives') {
            reqElement.className = 'requirement-item alternatives';
            reqElement.innerHTML = `
                <div class="req-header">
                    <div class="req-icon">🚢</div>
                    <div class="req-info">
                        <div class="req-name">Ship Requirement</div>
                        <div class="req-alternatives-label">Choose one:</div>
                    </div>
                    <div class="req-quantity">${reqData.alternatives[0]?.quantity || 1}</div>
                </div>
                <div class="alternatives-list">
                    ${reqData.alternatives.map(alt => `
                        <div class="alternative-option ${alt.isRecommended ? 'recommended' : ''}" data-craft="${alt.name}">
                            <div class="alt-indicator">
                                ${alt.isRecommended ? '⭐' : '📋'}
                            </div>
                            <div class="alt-name">${alt.name}</div>
                            <div class="alt-badge">
                                ${alt.isRecommended ? 'Recommended' : 'Alternative'}
                            </div>
                            <button class="alt-navigate-btn" data-craft="${alt.name}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="m9 18 6-6-6-6"/>
                                </svg>
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            // Handle regular requirements
            reqElement.className = `requirement-item ${reqData.type} ${reqData.isClickable ? 'clickable' : ''}`;
            
            // Check if this is an enhanced item and extract base name and level
            const enhancementMatch = reqName.match(/^\+(\d+)\s+(.+)$/);
            const isEnhanced = !!enhancementMatch;
            const requiredLevel = isEnhanced ? parseInt(enhancementMatch[1]) : 0;
            const baseName = isEnhanced ? enhancementMatch[2] : reqName;
            const displayName = baseName; // Always show base name
            
            // Get current enhancement level from storage (starts at 0)
            const currentLevel = window.getCurrentEnhancementLevel ? window.getCurrentEnhancementLevel(baseName, parentCraft) || 0 : 0;
            
            // Get current inventory status
            const stored = globalInventory.getMaterialQuantity(reqName, 'global');
            const needed = reqData.quantity;
            const remaining = Math.max(0, needed - stored);
            const completionPercent = needed > 0 ? Math.min(100, (stored / needed) * 100) : 100;
            
            reqElement.innerHTML = `
                <div class="req-header">
                    <div class="req-icon" id="req-icon-${reqName.replace(/[^a-zA-Z0-9]/g, '-')}">${this.getRequirementIcon(reqData.type)}</div>
                    <div class="req-info">
                        <div class="req-name">${displayName}</div>
                        <div class="req-type-badge ${reqData.type}">${reqData.type.replace('_', ' ')}</div>
                        ${isEnhanced ? `
                            <div class="req-enhancement-info">
                                <span class="enhancement-label">${currentLevel > 0 ? `+${currentLevel}` : 'Base'}</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="req-quantity-controls">
                        <div class="quantity-display">
                            <span class="stored">${stored}</span>
                            <span class="separator">/</span>
                            <span class="needed">${needed}</span>
                        </div>
                        <button class="quantity-edit-btn" data-material="${reqName}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="m13.5 6.5 4 4L8 20H4v-4L13.5 6.5z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="req-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${completionPercent}%"></div>
                    </div>
                    <div class="progress-text">
                        ${remaining === 0 ? 'Complete' : `${remaining} remaining`}
                    </div>
                </div>
                ${this.shouldShowRecipeButton(baseName, reqData) ? `
                    <button class="req-navigate-btn" data-craft="${baseName}">
                        <span>View Recipe</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="m9 18 6-6-6-6"/>
                        </svg>
                    </button>
                ` : ''}
                ${isEnhanced && reqData.type === 'ship_parts' ? `
                    <div class="req-enhancement-controls">
                        <span class="enhancement-text">Enhancement Level:</span>
                        <div class="enhancement-buttons" data-item="${baseName}" data-ship="${parentCraft}">
                            ${Array.from({length: 11}, (_, i) => `
                                <button class="enhancement-btn ${i === currentLevel ? 'active' : ''}" 
                                        data-level="${i}" 
                                        title="+${i} ${baseName}">
                                    ${i}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            `;
        }
        
        // Add navigation event listeners
        reqElement.querySelectorAll('[data-craft]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const craftName = e.currentTarget.dataset.craft;
                this.navigateToCraft(craftName);
            });
        });
        
        // Add quantity edit listeners
        reqElement.querySelectorAll('.quantity-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const materialName = e.currentTarget.dataset.material;
                this.openQuantityEditor(materialName);
            });
        });
        
        // Add enhancement level listeners
        reqElement.querySelectorAll('.enhancement-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const level = parseInt(e.currentTarget.dataset.level);
                const itemName = e.currentTarget.closest('.enhancement-buttons').dataset.item;
                const shipName = e.currentTarget.closest('.enhancement-buttons').dataset.ship;
                
                // Update enhancement level using existing system
                if (window.setEnhancementLevel) {
                    window.setEnhancementLevel(itemName, shipName, level);
                }
                
                // Update button states
                const buttons = e.currentTarget.closest('.enhancement-buttons').querySelectorAll('.enhancement-btn');
                buttons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                // Update the requirement display text to show current tracking level
                const reqNameElement = e.currentTarget.closest('.requirement-item').querySelector('.req-name');
                const enhancementLabel = e.currentTarget.closest('.requirement-item').querySelector('.enhancement-label');
                
                if (level > 0) {
                    enhancementLabel.textContent = `+${level}`;
                } else {
                    enhancementLabel.textContent = 'Base';
                }
            });
        });
        
        // Load actual icon if available (only for regular requirements, not alternatives)
        if (reqData.type !== 'ship_alternatives') {
            const iconContainer = reqElement.querySelector('.req-icon');
            try {
                const iconInfo = iconLoader.getIconInfo(reqName);
                if (iconInfo && iconInfo.filename) {
                    iconContainer.innerHTML = `<img src="icons/${iconInfo.filename}" alt="${reqName}" style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px;">`;
                }
            } catch (error) {
                // Keep the fallback emoji icon
            }
        }
        
        return reqElement;
    }
    
    /**
     * Get icon for requirement type
     */
    getRequirementIcon(reqType) {
        const icons = {
            ships: '🚢',
            ship_parts: '⚙️',
            materials: '🔨',
            ship_alternatives: '🚢'
        };
        return icons[reqType] || '📦';
    }
    
    /**
     * Enhanced add craft to active projects with localStorage integration
     */
    async addToActiveProjects(craftName, forceAdd = false) {
        if (!craftNavigator.allCrafts[craftName]) {
            console.warn(`Cannot add unknown craft: ${craftName}`);
            return false;
        }
        
        // Check if can be added (prevents duplicates)
        const canAddResult = await craftNavigator.canAddToProjects(craftName);
        
        if (canAddResult.canAdd === false) {
            console.log(`Cannot add ${craftName}: ${canAddResult.reason}`);
            this.showToast(`${craftName}: ${canAddResult.reason}`, 'info');
            return false;
        }
        
        // Use enhanced project management from GlobalInventoryManager
        const projectData = {
            type: craftNavigator.metadata[craftName]?.type || 'unknown',
            requirements: craftNavigator.allCrafts[craftName].requirements || {},
            metadata: craftNavigator.metadata[craftName]
        };
        
        // Add to global inventory manager with enhanced tracking
        globalInventory.addProject(craftName, projectData, 'normal');
        
        // Update local state using enhanced craftNavigator method (with auto-dependencies)
        const addedProject = craftNavigator.addToActiveProjects(craftName, projectData);
        
        if (addedProject) {
            this.activeProjects.add(craftName);
            this.saveActiveProjects();
            this.updateActiveProjectsDisplay();
            
            // Update all craft cards to reflect new state
            this.updateAllCraftCards();
            
            // Update button states for current craft
            await this.updateAddToProjectsButtonState();
            
            // Update global dashboard
            if (window.updateDashboard) {
                window.updateDashboard();
            }
            
            // Update inventory system if available
            if (window.inventoryManager && window.inventoryManager.updateNeededQuantities) {
                console.log('🔄 Calling inventory system update after project add...');
                window.inventoryManager.updateNeededQuantities();
            } else {
                console.warn('❌ Inventory manager not available on window object');
            }
            
            // Show success feedback
            this.showToast(`Added ${craftName} to active projects with auto-dependencies`, 'success');
            
            console.log(`➕ Added project: ${craftName} with auto-dependencies`);
            return true;
        } else {
            console.log(`Project ${craftName} was already active or couldn't be added`);
            await this.updateAddToProjectsButtonState(); // Update button state anyway
            return false;
        }
    }
    
    /**
     * Enhanced remove craft from active projects
     */
    removeFromActiveProjects(craftName) {
        // Remove from global inventory manager
        globalInventory.removeProject(craftName);
        
        // Update local state
        craftNavigator.removeFromActiveProjects(craftName);
        this.activeProjects.delete(craftName);
        this.saveActiveProjects();
        this.updateActiveProjectsDisplay();
        
        // Update all craft cards to reflect new state
        this.updateAllCraftCards();
        
        // Update global dashboard
        if (window.updateDashboard) {
            window.updateDashboard();
        }
        
        // Update inventory system if available
        if (window.inventoryManager && window.inventoryManager.updateNeededQuantities) {
            console.log('🔄 Calling inventory system update after project REMOVE...');
            window.inventoryManager.updateNeededQuantities();
        } else {
            console.warn('❌ Inventory manager not available on window object');
        }
        
        // Show success feedback
        this.showToast(`Removed ${craftName} from active projects`, 'info');
        
        console.log(`➖ Removed project: ${craftName}`);
        console.log('🔍 Debug REMOVE - window.inventoryManager available?', !!window.inventoryManager);
        console.log('🔍 Debug REMOVE - updateNeededQuantities method?', !!(window.inventoryManager && window.inventoryManager.updateNeededQuantities));
        return true;
    }
    
    /**
     * Update all craft cards to reflect current project state
     */
    updateAllCraftCards() {
        const craftCards = document.querySelectorAll('.craft-card');
        craftCards.forEach(card => {
            const craftName = card.dataset.craftName;
            if (craftName) {
                this.updateCraftCardState(card, craftName);
            }
        });
    }
    
    /**
     * Update craft card state after project changes
     */
    updateCraftCardState(card, craftName) {
        const isActive = this.activeProjects.has(craftName);
        const projectBtn = card.querySelector('[data-action="add-project"], [data-action="remove-project"]');
        const meta = card.querySelector('.craft-card-meta');
        
        if (projectBtn) {
            projectBtn.dataset.action = isActive ? 'remove-project' : 'add-project';
            projectBtn.title = isActive ? 'Remove from Active Projects' : 'Add to Active Projects';
            projectBtn.className = `craft-card-btn ${isActive ? 'remove' : 'secondary'}`;
            
            projectBtn.innerHTML = isActive ? `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            ` : `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
            `;
        }
        
        // Update active badge
        if (meta) {
            const existingBadge = meta.querySelector('.active-project-badge');
            if (isActive && !existingBadge) {
                meta.insertAdjacentHTML('beforeend', '<span class="active-project-badge">✓ Active</span>');
            } else if (!isActive && existingBadge) {
                existingBadge.remove();
            }
        }
    }
    
    /**
     * Calculate craft completion percentage
     */
    calculateCraftCompletionPercent(craftInventoryStatus) {
        if (!craftInventoryStatus) return 0;
        
        const materials = Object.values(craftInventoryStatus);
        if (materials.length === 0) return 0;
        
        const totalCompletion = materials.reduce((sum, material) => {
            return sum + (material.completionPercent || 0);
        }, 0);
        
        return totalCompletion / materials.length;
    }
    
    /**
     * Update tab counts based on available crafts
     */
    updateTabCounts() {
        try {
            const shipsCount = Object.keys(craftNavigator.getCraftsByType('ships')).length;
            
            // For ship parts, count unique base names to avoid counting enhancement levels
            const shipParts = craftNavigator.getCraftsByType('ship_parts');
            const uniqueBaseNames = new Set();
            
            // Extract unique base names from ship parts
            Object.keys(shipParts).forEach(partName => {
                // Remove enhancement level prefixes like "+1 ", "+10 ", etc.
                const baseName = partName.replace(/^\+\d+\s+/, '');
                uniqueBaseNames.add(baseName);
            });
            
            const shipPartsCount = uniqueBaseNames.size;
            const materialsCount = Object.keys(craftNavigator.getCraftsByType('materials')).length;
            
            document.getElementById('ships-count').textContent = shipsCount;
            document.getElementById('ship-parts-count').textContent = shipPartsCount;
            document.getElementById('materials-count').textContent = materialsCount;
        } catch (error) {
            console.warn('Error updating tab counts:', error);
        }
    }
    
    /**
     * Load active projects from localStorage
     */
    loadActiveProjects() {
        try {
            // Load from new enhanced storage first
            let projects = this.getStorageItem(this.storageKeys.activeProjects, []);
            
            // Fallback to old storage format
            if (projects.length === 0) {
                const oldProjects = this.getStorageItem('bdo-active-projects', []);
                if (oldProjects.length > 0) {
                    // Migrate to new format
                    projects = oldProjects.map(projectName => ({
                        name: projectName,
                        addedAt: Date.now(),
                        priority: 'normal',
                        type: craftNavigator.metadata[projectName]?.type || 'unknown',
                        source: 'migration'
                    }));
                    this.setStorageItem(this.storageKeys.activeProjects, projects);
                }
            }
            
            // Update internal state
            this.activeProjects = new Set(projects.map(p => p.name));
            
            // Sync with craft navigator and global inventory
            projects.forEach(project => {
                const projectData = {
                    type: project.type,
                    requirements: craftNavigator.allCrafts[project.name]?.requirements || {},
                    metadata: craftNavigator.metadata[project.name],
                    ...project
                };
                
                craftNavigator.addToActiveProjects(project.name, projectData);
                globalInventory.addProject(project.name, projectData, project.priority || 'normal');
            });
            
            // Update the display after loading (if HTML elements exist)
            if (document.getElementById('active-projects-count')) {
                this.updateActiveProjectsDisplay();
            }
            
            console.log(`📊 Loaded ${projects.length} active projects`);
        } catch (error) {
            console.warn('Failed to load active projects from localStorage:', error);
            this.activeProjects = new Set();
        }
    }
    
    /**
     * Setup global event listeners for integration
     */
    setupGlobalEventListeners() {
        // Listen for inventory updates
        document.addEventListener('inventoryUpdated', (event) => {
            const { materialName, quantity, context } = event.detail;
            this.handleInventoryUpdate(materialName, quantity, context);
        });
        
        // Listen for craft navigation events
        document.addEventListener('craftNavigationEvent', (event) => {
            const { type, data } = event.detail;
            this.handleNavigationEvent(type, data);
        });
        
        // Listen for storage events from other tabs
        window.addEventListener('storage', (event) => {
            if (event.key && Object.values(this.storageKeys).includes(event.key)) {
                this.handleStorageSync(event);
            }
        });
    }
    
    /**
     * Enhanced localStorage operations
     */
    getStorageItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn(`Failed to parse localStorage item ${key}:`, error);
            return defaultValue;
        }
    }
    
    setStorageItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Failed to save to localStorage ${key}:`, error);
            return false;
        }
    }
    
    /**
     * Load view state from localStorage
     */
    loadViewState() {
        const viewState = this.getStorageItem(this.storageKeys.viewState, {});
        
        if (viewState.currentView && ['ships', 'ship_parts', 'materials'].includes(viewState.currentView)) {
            this.currentView = viewState.currentView;
        }
        
        if (viewState.breadcrumb && Array.isArray(viewState.breadcrumb)) {
            this.breadcrumb = viewState.breadcrumb;
        }
        
        if (viewState.viewMode && ['grid', 'list'].includes(viewState.viewMode)) {
            this.viewMode = viewState.viewMode;
        }
    }
    
    /**
     * Load user preferences from localStorage
     */
    loadUserPreferences() {
        const preferences = this.getStorageItem(this.storageKeys.userPreferences, {});
        
        this.projectsPerPage = preferences.projectsPerPage || 6;
        this.modalProjectsPerPage = preferences.modalProjectsPerPage || 8;
        this.viewMode = preferences.viewMode || 'grid';
        
        // Load filter preferences
        const filterState = this.getStorageItem(this.storageKeys.projectFilters, {});
        this.projectsFilter = filterState.projectsFilter || '';
        this.projectsTypeFilter = filterState.projectsTypeFilter || 'all';
        this.modalProjectsFilter = filterState.modalProjectsFilter || '';
        this.modalProjectsTypeFilter = filterState.modalProjectsTypeFilter || 'all';
    }
    
    /**
     * Enhanced save active projects with full project data
     */
    saveActiveProjects() {
        try {
            const projects = Array.from(this.activeProjects).map(projectName => {
                const craft = craftNavigator.allCrafts[projectName];
                const metadata = craftNavigator.metadata[projectName];
                
                return {
                    name: projectName,
                    type: metadata?.type || 'unknown',
                    addedAt: Date.now(),
                    priority: 'normal', // Default priority
                    requirements: craft?.requirements || {},
                    metadata: metadata,
                    lastUpdated: Date.now()
                };
            });
            
            this.setStorageItem(this.storageKeys.activeProjects, projects);
            
            // Also save to legacy format for compatibility
            this.setStorageItem('bdo-active-projects', Array.from(this.activeProjects));
            
            console.log(`💾 Saved ${projects.length} active projects`);
        } catch (error) {
            console.warn('Failed to save active projects to localStorage:', error);
        }
    }
    
    /**
     * Save view state to localStorage
     */
    saveViewState() {
        const viewState = {
            currentView: this.currentView,
            breadcrumb: this.breadcrumb,
            viewMode: this.viewMode,
            lastUpdated: Date.now()
        };
        
        this.setStorageItem(this.storageKeys.viewState, viewState);
    }
    
    /**
     * Save user preferences to localStorage
     */
    saveUserPreferences() {
        const preferences = {
            projectsPerPage: this.projectsPerPage,
            modalProjectsPerPage: this.modalProjectsPerPage,
            viewMode: this.viewMode,
            lastUpdated: Date.now()
        };
        
        this.setStorageItem(this.storageKeys.userPreferences, preferences);
        
        const filterState = {
            projectsFilter: this.projectsFilter,
            projectsTypeFilter: this.projectsTypeFilter,
            modalProjectsFilter: this.modalProjectsFilter,
            modalProjectsTypeFilter: this.modalProjectsTypeFilter,
            lastUpdated: Date.now()
        };
        
        this.setStorageItem(this.storageKeys.projectFilters, filterState);
    }
    
    /**
     * Handle inventory updates from global system
     */
    handleInventoryUpdate(materialName, quantity, context) {
        // Update local cache
        this.inventoryCache.set(materialName, {
            quantity,
            context,
            timestamp: Date.now()
        });
        
        this.lastInventoryUpdate = Date.now();
        
        // Update UI if relevant to current view
        if (context === 'global' || this.isCurrentlyViewingMaterial(materialName)) {
            this.updateMaterialDisplays(materialName, quantity);
        }
        
        // Update project completion status
        this.updateProjectCompletionStatus();
    }
    
    /**
     * Handle navigation events from craft navigator
     */
    handleNavigationEvent(type, data) {
        switch (type) {
            case 'navigate':
                this.handleCraftNavigation(data);
                break;
            case 'project-added':
                this.handleProjectAdded(data);
                break;
            case 'project-removed':
                this.handleProjectRemoved(data);
                break;
        }
    }
    
    /**
     * Handle storage synchronization from other tabs
     */
    handleStorageSync(event) {
        console.log(`🔄 Storage sync: ${event.key}`);
        
        switch (event.key) {
            case this.storageKeys.activeProjects:
                this.loadActiveProjects();
                this.updateActiveProjectsDisplay();
                break;
            case this.storageKeys.viewState:
                this.loadViewState();
                break;
            case this.storageKeys.userPreferences:
                this.loadUserPreferences();
                break;
        }
    }
    
    /**
     * Get filtered active projects based on current filters
     */
    getFilteredActiveProjects() {
        const activeProjects = craftNavigator.getActiveProjects();
        
        return activeProjects.filter(craftName => {
            // Name filter
            if (this.projectsFilter && !craftName.toLowerCase().includes(this.projectsFilter)) {
                return false;
            }
            
            // Type filter
            if (this.projectsTypeFilter !== 'all') {
                const metadata = craftNavigator.metadata[craftName];
                if (!metadata || metadata.type !== this.projectsTypeFilter) {
                    return false;
                }
            }
            
            return true;
        });
    }
    
    /**
     * Update active projects display with enhanced global inventory info
     */
    updateActiveProjectsDisplay() {
        const actualCount = this.activeProjects.size;
        
        // Update active projects panel count (craft navigation UI)
        const panelCount = document.getElementById('active-projects-count');
        if (panelCount) {
            panelCount.textContent = actualCount;
        }
        
        // Update main dashboard active projects count
        const dashboardCount = document.getElementById('dashboard-active-projects-count');
        if (dashboardCount) {
            dashboardCount.textContent = actualCount;
        }
        
        // Update main dashboard projects breakdown
        const breakdown = document.getElementById('projects-breakdown');
        if (breakdown) {
            breakdown.textContent = `${actualCount} pending completion`;
        }
        
        // Sync floating dashboard if it exists
        if (window.syncFloatingDashboard) {
            window.syncFloatingDashboard();
        }
        
        console.log(`✅ All dashboards updated: ${actualCount} active projects`);
        
        // Update global inventory summary
        this.updateGlobalInventorySummary();
    }
    
    /**
     * Update global inventory summary display
     */
    updateGlobalInventorySummary() {
        const summary = globalInventory.getInventorySummary();
        const multiCraftStats = globalInventory.getMultiCraftStatistics();
        
        // Update completion percentage
        const completionElement = document.getElementById('global-completion-percent');
        if (completionElement) {
            const percent = Math.round(summary.overallCompletionPercent);
            completionElement.textContent = `${percent}%`;
            completionElement.className = `summary-value ${
                percent >= 90 ? 'complete' : 
                percent >= 60 ? 'good' : 
                percent >= 30 ? 'fair' : 'poor'
            }`;
        }
        
        // Update material count
        const materialCountElement = document.getElementById('global-material-count');
        if (materialCountElement) {
            materialCountElement.textContent = `${summary.completedMaterials}/${summary.totalMaterials}`;
        }
        
        // Update bottleneck indicator
        const bottleneckElement = document.getElementById('bottleneck-count');
        const bottleneckIndicator = document.getElementById('bottleneck-indicator');
        if (bottleneckElement && bottleneckIndicator) {
            const bottleneckCount = multiCraftStats.materials.bottlenecks.length;
            bottleneckElement.textContent = bottleneckCount;
            
            // Add warning class if there are bottlenecks
            if (bottleneckCount > 0) {
                bottleneckIndicator.classList.add('warning');
                bottleneckIndicator.title = `${bottleneckCount} materials are blocking progress`;
            } else {
                bottleneckIndicator.classList.remove('warning');
                bottleneckIndicator.title = 'No bottlenecks detected';
            }
        }
    }
    
    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Implementation for toast notifications
        console.log(`${type.toUpperCase()}: ${message}`);
    }
    
    
    /**
     * Refresh current view
     */
    refreshCurrentView() {
        if (document.getElementById('current-craft-details').style.display !== 'none') {
            // Refresh detail view
            const current = craftNavigator.getCurrentCraft();
            if (current) {
                this.populateRequirements(current.craft.requirements, current.breadcrumb[current.breadcrumb.length - 1]);
            }
        } else {
            // Refresh grid view
            this.loadCraftView(this.currentView);
        }
    }
    
    /**
     * Open quantity editor modal
     */
    /**
     * Check if a craft should show the "View Recipe" button
     */
    shouldShowRecipeButton(craftName, reqData) {
        // Only show for clickable items
        if (!reqData.isClickable) {
            return false;
        }
        
        // Check if the craft actually has requirements (is a recipe)
        const craftData = craftNavigator.allCrafts[craftName];
        if (!craftData || !craftData.requirements) {
            return false;
        }
        
        // If requirements is empty or only contains enhancement stones, it's purchasable
        const requirementKeys = Object.keys(craftData.requirements);
        if (requirementKeys.length === 0) {
            return false;
        }
        
        // If only requirement is Black Stone (enhancement), it's likely purchasable
        if (requirementKeys.length === 1 && requirementKeys[0] === 'Black Stone') {
            return false;
        }
        
        return true;
    }
    
    
    openQuantityEditor(materialName) {
        // Integration point with existing quantity editor
        // This will integrate with the existing modal system
        const event = new CustomEvent('openQuantityEditor', {
            detail: { materialName }
        });
        document.dispatchEvent(event);
    }
    
    /**
     * Show craft information modal or details
     */
    showCraftInfo(craftName) {
        const metadata = craftNavigator.metadata[craftName];
        const craftData = craftNavigator.allCrafts[craftName];
        
        if (!metadata || !craftData) {
            this.showToast(`Information not available for ${craftName}`, 'warning');
            return;
        }
        
        // Create modal HTML
        const modalHtml = `
            <div class="modal-overlay" id="craft-info-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>
                            <span class="modal-icon">${this.getCraftIcon(metadata.type)}</span>
                            Craft Information
                        </h3>
                        <button class="modal-close" id="close-craft-info">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="craft-info-grid">
                            <div class="info-section">
                                <h4>Basic Information</h4>
                                <div class="info-row">
                                    <span class="info-label">Name:</span>
                                    <span class="info-value">${craftName}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Type:</span>
                                    <span class="info-value craft-type-${metadata.type}">${metadata.type.replace('_', ' ')}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Complexity:</span>
                                    <span class="info-value complexity-${metadata.complexity}">${metadata.complexity}</span>
                                </div>
                            </div>
                            <div class="info-section">
                                <h4>Requirements Breakdown</h4>
                                <div class="info-row">
                                    <span class="info-label">Total Requirements:</span>
                                    <span class="info-value">${metadata.totalRequirements}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Materials:</span>
                                    <span class="info-value">${metadata.breakdown.materials}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Ship Parts:</span>
                                    <span class="info-value">${metadata.breakdown.ship_parts}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Ships:</span>
                                    <span class="info-value">${metadata.breakdown.ships}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('craft-info-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal with animation
        const modal = document.getElementById('craft-info-modal');
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
        
        // Add close handlers
        const closeBtn = document.getElementById('close-craft-info');
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        };
        
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        // ESC key handler
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
    
    /**
     * Open the active projects modal
     */
    openActiveProjectsModal() {
        const modal = document.getElementById('active-projects-modal');
        if (modal) {
            // Reset filters and pagination
            this.modalProjectsFilter = '';
            this.modalProjectsTypeFilter = 'all';
            this.currentModalProjectsPage = 1;
            
            // Reset filter inputs
            const filterInput = document.getElementById('modal-projects-filter');
            if (filterInput) filterInput.value = '';
            
            document.querySelectorAll('#active-projects-modal .type-filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === 'all');
            });
            
            modal.style.display = 'flex';
            modal.classList.add('show');
            
            // Setup modal event listeners only once
            if (!this.modalListenersSetup) {
                this.setupModalEventListeners();
                this.modalListenersSetup = true;
            }
            
            this.updateModalProjectsList();
        }
    }
    
    /**
     * Close the active projects modal
     */
    closeActiveProjectsModal() {
        const modal = document.getElementById('active-projects-modal');
        if (modal) {
            modal.classList.remove('show');
            // Use timeout to allow fade animation to complete
            setTimeout(() => {
                modal.style.display = 'none';
            }, 200);
        }
    }
    
    /**
     * Setup expand button listener (called during initial setup)
     */
    setupExpandButtonListener() {
        // Expand button to open modal
        const expandBtn = document.querySelector('.expand-projects-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openActiveProjectsModal();
            });
        }
    }
    
    /**
     * Setup modal-specific event listeners (called when modal opens)
     */
    setupModalEventListeners() {
        // Close modal button
        const closeBtn = document.getElementById('close-projects-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeActiveProjectsModal();
            });
        }
        
        // Click outside modal to close
        const modal = document.getElementById('active-projects-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'active-projects-modal') {
                    this.closeActiveProjectsModal();
                }
            });
        }
        
        // Modal filter input
        const modalFilter = document.getElementById('modal-projects-filter');
        if (modalFilter) {
            modalFilter.addEventListener('input', (e) => {
                this.modalProjectsFilter = e.target.value.toLowerCase();
                this.currentModalProjectsPage = 1; // Reset to first page
                this.updateModalProjectsList();
            });
        }
        
        // Modal type filter buttons
        document.querySelectorAll('#active-projects-modal .type-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#active-projects-modal .type-filter-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.modalProjectsTypeFilter = e.currentTarget.dataset.type;
                this.currentModalProjectsPage = 1; // Reset to first page
                this.updateModalProjectsList();
            });
        });
        
        // Modal pagination buttons
        const modalPrevBtn = document.getElementById('modal-projects-prev');
        if (modalPrevBtn) {
            modalPrevBtn.addEventListener('click', () => {
                if (this.currentModalProjectsPage > 1) {
                    this.currentModalProjectsPage--;
                    this.updateModalProjectsList();
                }
            });
        }
        
        const modalNextBtn = document.getElementById('modal-projects-next');
        if (modalNextBtn) {
            modalNextBtn.addEventListener('click', () => {
                const filteredProjects = this.getFilteredModalProjects();
                const totalPages = Math.ceil(filteredProjects.length / this.modalProjectsPerPage);
                if (this.currentModalProjectsPage < totalPages) {
                    this.currentModalProjectsPage++;
                    this.updateModalProjectsList();
                }
            });
        }
    }
    
    /**
     * Get filtered modal projects
     */
    getFilteredModalProjects() {
        const activeProjects = craftNavigator.getActiveProjects();
        
        return activeProjects.filter(project => {
            // Ensure we have a proper craft name string
            const craftName = typeof project === 'string' ? project : project.name || String(project);
            
            // Name filter
            if (this.modalProjectsFilter && !craftName.toLowerCase().includes(this.modalProjectsFilter)) {
                return false;
            }
            
            // Type filter
            if (this.modalProjectsTypeFilter && this.modalProjectsTypeFilter !== 'all') {
                const metadata = craftNavigator.metadata[craftName];
                if (!metadata || metadata.type !== this.modalProjectsTypeFilter) {
                    return false;
                }
            }
            
            return true;
        });
    }
    
    /**
     * Update the modal projects list
     */
    updateModalProjectsList() {
        const listContainer = document.getElementById('modal-projects-list');
        const paginationContainer = document.getElementById('modal-projects-pagination');
        if (!listContainer) return;
        
        const filteredProjects = this.getFilteredModalProjects();
        
        // Calculate pagination
        const totalPages = Math.ceil(filteredProjects.length / this.modalProjectsPerPage);
        const startIndex = (this.currentModalProjectsPage - 1) * this.modalProjectsPerPage;
        const endIndex = startIndex + this.modalProjectsPerPage;
        const paginatedProjects = filteredProjects.slice(startIndex, endIndex);
        
        if (filteredProjects.length === 0) {
            listContainer.innerHTML = `
                <div class="no-active-projects">
                    ${this.modalProjectsFilter || this.modalProjectsTypeFilter !== 'all' 
                        ? 'No projects match your filters' 
                        : 'No active projects yet. Add some crafts to get started!'}
                </div>
            `;
            if (paginationContainer) paginationContainer.style.display = 'none';
            return;
        }
        
        // Show pagination if needed
        if (paginationContainer) {
            if (totalPages > 1) {
                paginationContainer.style.display = 'flex';
                const pageInfo = document.getElementById('modal-projects-page-info');
                if (pageInfo) {
                    pageInfo.textContent = `${this.currentModalProjectsPage} / ${totalPages}`;
                }
                
                // Update button states
                const prevBtn = document.getElementById('modal-projects-prev');
                const nextBtn = document.getElementById('modal-projects-next');
                if (prevBtn) prevBtn.disabled = this.currentModalProjectsPage === 1;
                if (nextBtn) nextBtn.disabled = this.currentModalProjectsPage === totalPages;
            } else {
                paginationContainer.style.display = 'none';
            }
        }
        
        listContainer.innerHTML = paginatedProjects.map(project => {
            // Ensure we have a proper craft name string
            const craftName = typeof project === 'string' ? project : project.name || String(project);
            const safeId = String(craftName).replace(/[^a-zA-Z0-9]/g, '-');
            const metadata = craftNavigator.metadata[craftName];
            const typeIcon = this.getCraftIcon(metadata?.type);
            
            return `
                <div class="modal-project-item" data-craft="${craftName}">
                    <div class="project-icon" id="modal-icon-${safeId}">${typeIcon}</div>
                    <div class="project-info">
                        <div class="project-name">${craftName}</div>
                        <div class="project-type">${metadata?.type || 'unknown'}</div>
                    </div>
                    <div class="project-actions">
                        <button class="project-navigate-btn" data-craft="${craftName}" title="Navigate to craft">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="m9 18 6-6-6-6"/>
                            </svg>
                        </button>
                        <button class="project-remove-btn" data-craft="${craftName}" title="Remove from projects">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add event listeners for project actions
        listContainer.querySelectorAll('.project-navigate-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const craftName = e.currentTarget.dataset.craft;
                this.closeActiveProjectsModal();
                this.navigateToCraft(craftName);
            });
        });
        
        listContainer.querySelectorAll('.project-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const craftName = e.currentTarget.dataset.craft;
                this.removeFromActiveProjects(craftName);
                this.updateModalProjectsList(); // Refresh modal list
            });
        });
        
        // Load icons for modal projects
        paginatedProjects.forEach(async (project) => {
            // Ensure we have a proper craft name string
            const craftName = typeof project === 'string' ? project : project.name || String(project);
            const safeId = String(craftName).replace(/[^a-zA-Z0-9]/g, '-');
            const iconContainer = document.getElementById(`modal-icon-${safeId}`);
            if (iconContainer) {
                try {
                    const iconInfo = iconLoader.getIconInfo(craftName);
                    if (iconInfo && iconInfo.filename) {
                        iconContainer.innerHTML = `<img src="icons/${iconInfo.filename}" alt="${craftName}" style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px;">`;
                    }
                } catch (error) {
                    // Keep the fallback emoji icon
                }
            }
        });
    }
    
    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Implementation for toast notifications
        console.log(`${type.toUpperCase()}: ${message}`);
    }
    
    /**
     * Update URL for bookmarking
     */
    updateURL() {
        const url = new URL(window.location);
        url.searchParams.set('view', this.currentView);
        window.history.replaceState({}, '', url);
    }
    
    /**
     * Setup global inventory panel functionality
     */
    setupGlobalInventoryPanel() {
        // Close panel button
        document.addEventListener('click', (e) => {
            if (e.target.closest('.close-inventory-panel')) {
                this.hideGlobalInventoryPanel();
            }
        });
        
        // Filter buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('inventory-filter-btn')) {
                document.querySelectorAll('.inventory-filter-btn').forEach(btn => 
                    btn.classList.remove('active'));
                e.target.classList.add('active');
                
                const filter = e.target.dataset.filter;
                this.updateGlobalInventoryPanel(filter);
            }
        });
    }
    
    /**
     * Toggle global inventory panel visibility
     */
    toggleGlobalInventoryPanel() {
        const panel = document.getElementById('global-inventory-panel');
        if (!panel) return;
        
        if (panel.style.display === 'none') {
            this.showGlobalInventoryPanel();
        } else {
            this.hideGlobalInventoryPanel();
        }
    }
    
    /**
     * Show global inventory panel
     */
    showGlobalInventoryPanel() {
        const panel = document.getElementById('global-inventory-panel');
        if (!panel) return;
        
        panel.style.display = 'block';
        this.updateGlobalInventoryPanel('all');
        
        // Add animation
        requestAnimationFrame(() => {
            panel.classList.add('show');
        });
    }
    
    /**
     * Hide global inventory panel
     */
    hideGlobalInventoryPanel() {
        const panel = document.getElementById('global-inventory-panel');
        if (!panel) return;
        
        panel.classList.remove('show');
        setTimeout(() => {
            panel.style.display = 'none';
        }, 300);
    }
    
    /**
     * Update global inventory panel content
     */
    updateGlobalInventoryPanel(filter = 'all') {
        const content = document.getElementById('inventory-panel-content');
        if (!content) return;
        
        const globalStatus = globalInventory.calculateGlobalInventoryStatus();
        const multiCraftStats = globalInventory.getMultiCraftStatistics();
        
        // Filter materials based on selected filter
        let filteredMaterials = Object.entries(globalStatus);
        
        switch (filter) {
            case 'bottlenecks':
                filteredMaterials = filteredMaterials.filter(([name, status]) => 
                    status.bottleneckScore > 500);
                break;
            case 'complete':
                filteredMaterials = filteredMaterials.filter(([name, status]) => 
                    status.isComplete);
                break;
            case 'missing':
                filteredMaterials = filteredMaterials.filter(([name, status]) => 
                    status.remaining > 0);
                break;
            case 'all':
            default:
                // No filtering
                break;
        }
        
        // Sort by bottleneck score (highest first)
        filteredMaterials.sort((a, b) => b[1].bottleneckScore - a[1].bottleneckScore);
        
        let html = '';
        
        // Add statistics header
        html += `
            <div class="inventory-stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${multiCraftStats.projects.total}</div>
                    <div class="stat-label">Active Projects</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${multiCraftStats.materials.crossCraftShared}</div>
                    <div class="stat-label">Shared Materials</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${multiCraftStats.dependencies.circularDetected}</div>
                    <div class="stat-label">Circular Deps</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${Math.round(globalInventory.getInventorySummary().overallCompletionPercent)}%</div>
                    <div class="stat-label">Overall Progress</div>
                </div>
            </div>
        `;
        
        // Add material grid
        if (filteredMaterials.length === 0) {
            html += `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <div class="empty-title">No materials found</div>
                    <div class="empty-desc">Try adjusting your filter selection.</div>
                </div>
            `;
        } else {
            html += '<div class="global-material-grid">';
            
            filteredMaterials.forEach(([materialName, status]) => {
                const progressPercent = Math.round(status.completionPercent);
                const isBottleneck = status.bottleneckScore > 500;
                const hasAlternatives = status.alternativeSources.length > 0;
                
                html += `
                    <div class="global-material-item ${
                        status.isComplete ? 'complete' : ''
                    } ${isBottleneck ? 'bottleneck' : ''}" data-material="${materialName}">
                        <div class="material-header">
                            <div class="material-icon-container">
                                <div class="material-icon" id="global-icon-${materialName.replace(/[^a-zA-Z0-9]/g, '-')}">
                                    ${this.getRequirementIcon(status.type)}
                                </div>
                                ${isBottleneck ? '<div class="bottleneck-badge">!</div>' : ''}
                            </div>
                            <div class="material-info">
                                <div class="material-name">${materialName}</div>
                                <div class="material-meta">
                                    <span class="material-type ${status.type}">${status.type.replace('_', ' ')}</span>
                                    <span class="material-usage">${status.usedBy.length} projects</span>
                                </div>
                            </div>
                            <div class="material-progress-circle">
                                <svg width="40" height="40" viewBox="0 0 40 40">
                                    <circle cx="20" cy="20" r="18" fill="none" stroke="var(--bg-quaternary)" stroke-width="3"/>
                                    <circle cx="20" cy="20" r="18" fill="none" 
                                        stroke="${status.isComplete ? 'var(--success)' : 'var(--accent-primary)'}" 
                                        stroke-width="3" stroke-linecap="round"
                                        stroke-dasharray="${2 * Math.PI * 18}" 
                                        stroke-dashoffset="${2 * Math.PI * 18 * (1 - progressPercent / 100)}"
                                        transform="rotate(-90 20 20)"/>
                                </svg>
                                <div class="progress-percent">${progressPercent}%</div>
                            </div>
                        </div>
                        
                        <div class="material-details">
                            <div class="quantity-display">
                                <span class="stored ${status.isComplete ? 'complete' : ''}">${status.stored}</span>
                                <span class="separator">/</span>
                                <span class="needed">${status.needed}</span>
                                ${status.remaining > 0 ? `<span class="remaining">(${status.remaining} needed)</span>` : ''}
                            </div>
                            
                            ${status.priorityProjects.length > 0 ? `
                                <div class="priority-projects">
                                    <span class="priority-label">Used by:</span>
                                    ${status.priorityProjects.slice(0, 3).map(project => `
                                        <span class="priority-project ${project.priority}">${project.name}</span>
                                    `).join('')}
                                    ${status.priorityProjects.length > 3 ? `<span class="more-count">+${status.priorityProjects.length - 3}</span>` : ''}
                                </div>
                            ` : ''}
                            
                            ${hasAlternatives ? `
                                <div class="alternatives-indicator">
                                    <span class="alt-icon">🔄</span>
                                    <span class="alt-text">${status.alternativeSources.length} alternative source${status.alternativeSources.length !== 1 ? 's' : ''}</span>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="material-actions">
                            <button class="material-action-btn edit" data-action="edit" data-material="${materialName}" title="Edit Quantity">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="m13.5 6.5 4 4L8 20H4v-4L13.5 6.5z"/>
                                </svg>
                            </button>
                            ${status.isClickable ? `
                                <button class="material-action-btn navigate" data-action="navigate" data-material="${materialName}" title="View Recipe">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="m9 18 6-6-6-6"/>
                                    </svg>
                                </button>
                            ` : ''}
                            ${hasAlternatives ? `
                                <button class="material-action-btn alternatives" data-action="alternatives" data-material="${materialName}" title="View Alternatives">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="3"/>
                                        <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
                                    </svg>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        content.innerHTML = html;
        
        // Setup action listeners
        this.setupGlobalInventoryActions();
        
        // Load icons
        this.loadGlobalInventoryIcons(filteredMaterials);
    }
    
    /**
     * Setup action listeners for global inventory panel
     */
    setupGlobalInventoryActions() {
        document.querySelectorAll('.material-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = e.currentTarget.dataset.action;
                const materialName = e.currentTarget.dataset.material;
                
                switch (action) {
                    case 'edit':
                        this.openQuantityEditor(materialName);
                        break;
                    case 'navigate':
                        this.hideGlobalInventoryPanel();
                        this.navigateToCraft(materialName);
                        break;
                    case 'alternatives':
                        this.showAlternativesModal(materialName);
                        break;
                }
            });
        });
        
        // Material item click to edit
        document.querySelectorAll('.global-material-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.material-action-btn')) {
                    const materialName = item.dataset.material;
                    this.openQuantityEditor(materialName);
                }
            });
        });
    }
    
    /**
     * Load icons for global inventory materials
     */
    async loadGlobalInventoryIcons(materials) {
        for (const [materialName] of materials) {
            const iconContainer = document.getElementById(`global-icon-${materialName.replace(/[^a-zA-Z0-9]/g, '-')}`);
            if (iconContainer) {
                try {
                    const iconInfo = iconLoader.getIconInfo(materialName);
                    if (iconInfo && iconInfo.filename) {
                        iconContainer.innerHTML = `<img src="icons/${iconInfo.filename}" alt="${materialName}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;">`;
                    }
                } catch (error) {
                    // Keep the fallback icon
                }
            }
        }
    }
    
    /**
     * Show alternatives modal for a material
     */
    showAlternativesModal(materialName) {
        const globalStatus = globalInventory.calculateGlobalInventoryStatus();
        const status = globalStatus[materialName];
        
        if (!status || status.alternativeSources.length === 0) {
            this.showToast('No alternatives available for this material', 'info');
            return;
        }
        
        // Create modal HTML
        const modalHtml = `
            <div class="modal-overlay" id="alternatives-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>
                            <span class="modal-icon">🔄</span>
                            Alternative Sources: ${materialName}
                        </h3>
                        <button class="modal-close" id="close-alternatives">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="alternatives-list">
                            ${status.alternativeSources.map(alt => `
                                <div class="alternative-item ${alt.isRecommended ? 'recommended' : ''}">
                                    <div class="alt-indicator">
                                        ${alt.method === 'barter' ? '🏪' : alt.isRecommended ? '⭐' : '📋'}
                                    </div>
                                    <div class="alt-details">
                                        <div class="alt-source">${alt.source}</div>
                                        <div class="alt-method">${alt.method}</div>
                                        ${alt.isRecommended ? '<div class="alt-badge recommended">Recommended</div>' : ''}
                                    </div>
                                    ${alt.method !== 'barter' ? `
                                        <button class="alt-navigate-btn" data-source="${alt.source}">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="m9 18 6-6-6-6"/>
                                            </svg>
                                        </button>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('alternatives-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal with animation
        const modal = document.getElementById('alternatives-modal');
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
        
        // Add close handlers
        const closeBtn = document.getElementById('close-alternatives');
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        };
        
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        // Navigation handlers
        modal.querySelectorAll('.alt-navigate-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const source = e.currentTarget.dataset.source;
                closeModal();
                this.hideGlobalInventoryPanel();
                this.navigateToCraft(source);
            });
        });
        
        // ESC key handler
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
}

// Create and export the navigation UI instance
export const craftNavigationUI = new CraftNavigationUI();