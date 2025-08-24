// BDO Ship Upgrade Tracker - Inventory UI Component
// Grid-based inventory interface with advanced filtering and management

import { inventoryManager, ITEM_CATEGORIES, getInventoryStats } from './inventory-system.js';
import { globalInventory } from './craft-system/global_inventory.js';

/**
 * Inventory UI Manager Class
 */
export class InventoryUI {
    constructor() {
        this.container = null;
        this.currentTab = 'materials';
        this.isModalOpen = false;
        this.selectedItem = null;
        this.tooltipElement = null;
        this.quantityModal = null;
        
        this.setupEventListeners();
    }
    
    /**
     * Initialize the inventory UI
     */
    async initialize() {
        try {
            // Wait for inventory manager to be ready
            await this.waitForInventoryManager();
            
            console.log('🎨 Inventory UI initialized');
        } catch (error) {
            console.error('Failed to initialize inventory UI:', error);
        }
    }
    
    /**
     * Wait for inventory manager to be ready
     */
    waitForInventoryManager() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds max wait
            
            const checkReady = () => {
                attempts++;
                console.log(`⏳ Waiting for inventory manager... attempt ${attempts}/${maxAttempts}, items: ${inventoryManager.items.size}`);
                
                if (inventoryManager.items.size > 0) {
                    console.log('✅ Inventory manager ready!');
                    resolve();
                } else if (attempts >= maxAttempts) {
                    console.error('❌ Inventory manager failed to initialize within timeout');
                    reject(new Error('Inventory manager initialization timeout'));
                } else {
                    setTimeout(checkReady, 100);
                }
            };
            checkReady();
        });
    }
    
    /**
     * Open the inventory modal
     */
    async openInventoryModal() {
        if (this.isModalOpen) return;
        
        // Ensure inventory manager is ready
        if (inventoryManager.items.size === 0) {
            console.log('🔄 Inventory not ready, waiting...');
            try {
                await this.waitForInventoryManager();
            } catch (error) {
                console.error('❌ Failed to wait for inventory manager:', error);
                // Show error modal instead
                this.showErrorModal('Inventory system is not ready. Please refresh the page and try again.');
                return;
            }
        }
        
        this.isModalOpen = true;
        
        // Force update inventory data before rendering
        console.log('🔄 Force updating inventory data before opening modal...');
        inventoryManager.updateNeededQuantities();
        
        this.createInventoryModal();
        this.resetUIFilters();
        this.renderInventoryContent();
        
        // Add escape key listener
        document.addEventListener('keydown', this.handleEscapeKey.bind(this));
    }
    
    /**
     * Close the inventory modal
     */
    closeInventoryModal() {
        if (!this.isModalOpen) return;
        
        this.isModalOpen = false;
        
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        
        if (this.tooltipElement) {
            this.tooltipElement.remove();
            this.tooltipElement = null;
        }
        
        document.removeEventListener('keydown', this.handleEscapeKey.bind(this));
    }
    
    /**
     * Show error modal
     */
    showErrorModal(message) {
        const errorModal = document.createElement('div');
        errorModal.className = 'inventory-modal';
        errorModal.innerHTML = `
            <div class="inventory-modal-overlay" onclick="this.parentElement.remove()"></div>
            <div class="inventory-modal-content" style="width: 500px; height: auto; max-height: 300px;">
                <div class="inventory-header">
                    <div class="inventory-title">
                        <h2>❌ Error</h2>
                        <p>Inventory System Error</p>
                    </div>
                    <button class="inventory-close-btn" onclick="this.closest('.inventory-modal').remove()">✕</button>
                </div>
                <div style="padding: var(--space-lg); text-align: center;">
                    <p style="color: var(--text-primary); margin-bottom: var(--space-lg);">${message}</p>
                    <button class="btn-primary" onclick="window.location.reload()">Reload Page</button>
                </div>
            </div>
        `;
        document.body.appendChild(errorModal);
    }
    
    /**
     * Create the main inventory modal structure
     */
    createInventoryModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('inventory-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        this.container = document.createElement('div');
        this.container.id = 'inventory-modal';
        this.container.className = 'inventory-modal';
        
        this.container.innerHTML = `
            <div class="inventory-modal-overlay" onclick="inventoryUI.closeInventoryModal()"></div>
            <div class="inventory-modal-content">
                <div class="inventory-header">
                    <div class="inventory-title">
                        <h2>🎒 Global Inventory</h2>
                        <p>Manage your materials across all projects</p>
                    </div>
                    <button class="inventory-close-btn" onclick="inventoryUI.closeInventoryModal()">✕</button>
                </div>
                
                <div class="inventory-stats-compact">
                    <div class="stats-left">
                        <span class="stat-compact">
                            <span class="stat-icon">📦</span>
                            <span class="stat-label">Total:</span>
                            <span id="total-items">0</span>
                        </span>
                        <span class="stat-compact">
                            <span class="stat-icon">💎</span>
                            <span class="stat-label">Owned:</span>
                            <span id="owned-items">0</span>
                        </span>
                        <span class="stat-compact">
                            <span class="stat-icon">📋</span>
                            <span class="stat-label">Needed:</span>
                            <span id="needed-items">0</span>
                        </span>
                    </div>
                    <div class="stats-right">
                        <div class="completion-bars">
                            <div class="completion-bar">
                                <span class="completion-label">Items:</span>
                                <div class="completion-fill" id="completion-fill"></div>
                                <span class="completion-text" id="completion-rate">100%</span>
                            </div>
                            <div class="completion-bar">
                                <span class="completion-label">Total:</span>
                                <div class="completion-fill" id="progress-fill"></div>
                                <span class="completion-text" id="progress-rate">100%</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="inventory-controls">
                    <!-- Compact toolbar with search, filters, and controls in one row -->
                    <div class="inventory-toolbar">
                        <div class="toolbar-left">
                            <div class="inventory-search">
                                <input type="text" id="inventory-search" placeholder="Search items..." autocomplete="off">
                                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="11" cy="11" r="8"/>
                                    <path d="m21 21-4.35-4.35"/>
                                </svg>
                            </div>
                            
                            <div class="toolbar-filters">
                                <button class="filter-btn compact" data-filter="owned" title="Show owned items">
                                    💎
                                </button>
                                <button class="filter-btn compact" data-filter="needed" title="Show needed items">
                                    📋
                                </button>
                            </div>
                        </div>
                        
                        <div class="toolbar-right">
                            <select id="sort-order" class="compact-select">
                                <option value="name">Name</option>
                                <option value="category">Category</option>
                                <option value="quantity">Quantity</option>
                                <option value="needed">Needed</option>
                            </select>
                            
                            <div class="view-toggle compact">
                                <button class="view-toggle-btn active" data-view="grid" title="Grid View">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="3" width="7" height="7"/>
                                        <rect x="14" y="3" width="7" height="7"/>
                                        <rect x="14" y="14" width="7" height="7"/>
                                        <rect x="3" y="14" width="7" height="7"/>
                                    </svg>
                                </button>
                                <button class="view-toggle-btn" data-view="list" title="List View">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                    </div>
                    
                    <!-- Compact category tabs -->
                    <div class="inventory-tabs compact">
                        ${this.createTabsHTML()}
                    </div>
                </div>
                
                <div class="inventory-content">
                    <div class="inventory-grid" id="inventory-grid">
                        <!-- Items will be rendered here -->
                    </div>
                </div>
                
                <div class="inventory-footer">
                    <div class="inventory-actions">
                        <button class="action-btn" onclick="inventoryUI.exportInventory()">
                            <span>📤</span> Export
                        </button>
                        <button class="action-btn" onclick="inventoryUI.importInventory()">
                            <span>📥</span> Import
                        </button>
                        <button class="action-btn danger" onclick="inventoryUI.clearInventory()">
                            <span>🗑️</span> Clear All
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.container);
        this.setupModalEventListeners();
    }
    
    /**
     * Create tabs HTML for categories
     */
    createTabsHTML() {
        const allTab = `<button class="inventory-tab active" data-category="all">
            <span class="tab-icon">🌐</span>
            <span class="tab-text">All</span>
            <span class="tab-count">0</span>
        </button>`;
        
        const categoryTabs = Object.entries(ITEM_CATEGORIES).map(([key, category]) => `
            <button class="inventory-tab" data-category="${key}">
                <span class="tab-icon">${category.icon}</span>
                <span class="tab-text">${category.name}</span>
                <span class="tab-count">0</span>
            </button>
        `).join('');
        
        return allTab + categoryTabs;
    }
    
    /**
     * Reset UI controls to match default filter state
     */
    resetUIFilters() {
        if (!this.container) return;
        
        // Reset inventory manager filters and view
        inventoryManager.resetFilters();
        inventoryManager.isGridView = true;
        
        // Reset search input
        const searchInput = this.container.querySelector('#inventory-search');
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Reset category tabs to "All"
        this.container.querySelectorAll('.inventory-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.category === 'all');
        });
        
        // Reset filter buttons to inactive
        this.container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Reset sort to name
        const sortSelect = this.container.querySelector('#inventory-sort');
        if (sortSelect) {
            sortSelect.value = 'name';
        }
        
        // Reset view toggle to grid
        this.container.querySelectorAll('.view-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === 'grid');
        });
        
        // Apply grid view CSS
        const grid = this.container.querySelector('#inventory-grid');
        if (grid) {
            grid.className = 'inventory-grid';
        }
        
        console.log('🎨 UI filters and view reset to defaults');
    }
    
    /**
     * Setup modal event listeners
     */
    setupModalEventListeners() {
        // Tab switching
        this.container.querySelectorAll('.inventory-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.switchTab(category);
            });
        });
        
        // Search
        const searchInput = this.container.querySelector('#inventory-search');
        searchInput.addEventListener('input', (e) => {
            inventoryManager.setFilters({ search: e.target.value });
            this.renderInventoryGrid();
        });
        
        // Filter buttons
        this.container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                const isActive = e.currentTarget.classList.contains('active');
                
                e.currentTarget.classList.toggle('active');
                
                const filterUpdate = {};
                filterUpdate[filter] = !isActive;
                inventoryManager.setFilters(filterUpdate);
                this.renderInventoryGrid();
            });
        });
        
        // Sort order
        const sortSelect = this.container.querySelector('#sort-order');
        sortSelect.addEventListener('change', (e) => {
            inventoryManager.setSortOrder(e.target.value);
            this.renderInventoryGrid();
        });
        
        // View toggle
        this.container.querySelectorAll('.view-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.toggleView(view);
            });
        });
    }
    
    /**
     * Switch to a different category tab
     */
    switchTab(category) {
        // Update active tab
        this.container.querySelectorAll('.inventory-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        this.container.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        // Update filters
        inventoryManager.setFilters({ category });
        this.currentTab = category;
        this.renderInventoryGrid();
    }
    
    /**
     * Toggle view mode
     */
    toggleView(view) {
        // Update active view button
        this.container.querySelectorAll('.view-toggle-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        this.container.querySelector(`[data-view="${view}"]`).classList.add('active');
        
        // Update inventory manager
        inventoryManager.isGridView = (view === 'grid');
        
        // Update grid class
        const grid = this.container.querySelector('#inventory-grid');
        grid.className = `inventory-${view}`;
        
        this.renderInventoryGrid();
    }
    
    /**
     * Render the complete inventory content
     */
    renderInventoryContent() {
        this.updateStats();
        this.updateTabCounts();
        this.renderInventoryGrid();
    }
    
    /**
     * Update statistics display
     */
    updateStats() {
        const stats = getInventoryStats();
        
        if (this.container) {
            this.container.querySelector('#total-items').textContent = stats.totalItems;
            this.container.querySelector('#owned-items').textContent = stats.ownedItems;
            this.container.querySelector('#needed-items').textContent = stats.neededItems;
            
            const completionRate = Math.round(stats.completionRate);
            const progressRate = Math.round(stats.progressRate);
            
            this.container.querySelector('#completion-rate').textContent = `${completionRate}%`;
            this.container.querySelector('#progress-rate').textContent = `${progressRate}%`;
            
            // Update progress bars (using CSS custom properties for ::after pseudo-elements)
            const completionFill = this.container.querySelector('#completion-fill');
            const progressFill = this.container.querySelector('#progress-fill');
            
            if (completionFill) {
                completionFill.style.setProperty('--fill-width', `${completionRate}%`);
            }
            if (progressFill) {
                progressFill.style.setProperty('--fill-width', `${progressRate}%`);
            }
        }
    }
    
    /**
     * Update tab counts
     */
    updateTabCounts() {
        const stats = inventoryManager.getCategoryStats();
        const totalItems = inventoryManager.items.size;
        
        if (this.container) {
            // Update all tab
            const allTab = this.container.querySelector('[data-category="all"] .tab-count');
            if (allTab) allTab.textContent = totalItems;
            
            // Update category tabs
            Object.entries(stats).forEach(([category, categoryStats]) => {
                const tabCount = this.container.querySelector(`[data-category="${category}"] .tab-count`);
                if (tabCount) {
                    tabCount.textContent = categoryStats.totalItems;
                }
            });
        }
    }
    
    /**
     * Render the inventory grid
     */
    renderInventoryGrid() {
        const grid = this.container?.querySelector('#inventory-grid');
        if (!grid) return;
        
        const items = inventoryManager.getFilteredItems();
        
        if (items.length === 0) {
            grid.innerHTML = `
                <div class="inventory-empty">
                    <div class="empty-icon">📦</div>
                    <h3>No items found</h3>
                    <p>Try adjusting your filters or search terms</p>
                </div>
            `;
            return;
        }
        
        const isGridView = inventoryManager.isGridView;
        grid.innerHTML = items.map(item => {
            return isGridView ? this.createGridItemHTML(item) : this.createListItemHTML(item);
        }).join('');
        
        // Setup item event listeners
        this.setupItemEventListeners();
    }
    
    /**
     * Create grid item HTML
     */
    createGridItemHTML(item) {
        const hasQuantity = item.quantity > 0;
        const isNeeded = item.needed > 0;
        const isComplete = isNeeded && item.quantity >= item.needed;
        const category = ITEM_CATEGORIES[item.category];
        
        let statusClass = '';
        if (isComplete) statusClass = 'complete';
        else if (hasQuantity && isNeeded) statusClass = 'partial';
        else if (isNeeded) statusClass = 'needed';
        else if (hasQuantity) statusClass = 'owned';
        
        return `
            <div class="inventory-item ${statusClass}" 
                 data-item="${item.name}"
                 data-category="${item.category}">
                <div class="item-icon-container">
                    <img src="icons/${item.icon}" 
                         alt="${item.name}"
                         class="item-icon"
                         loading="lazy"
                         onerror="this.src='icons/00000000_common.webp'">
                    ${item.quantity > 0 ? `<span class="item-quantity">${item.quantity}</span>` : ''}
                    ${item.needed > 0 ? `<span class="item-needed">${item.needed}</span>` : ''}
                </div>
                <div class="item-category-badge" style="background-color: ${category.color}">
                    ${category.icon}
                </div>
                ${isComplete ? '<div class="item-complete-badge">✓</div>' : ''}
            </div>
        `;
    }
    
    /**
     * Create list item HTML
     */
    createListItemHTML(item) {
        const hasQuantity = item.quantity > 0;
        const isNeeded = item.needed > 0;
        const isComplete = isNeeded && item.quantity >= item.needed;
        const category = ITEM_CATEGORIES[item.category];
        
        let statusClass = '';
        if (isComplete) statusClass = 'complete';
        else if (hasQuantity && isNeeded) statusClass = 'partial';
        else if (isNeeded) statusClass = 'needed';
        else if (hasQuantity) statusClass = 'owned';
        
        return `
            <div class="inventory-item-list ${statusClass}" 
                 data-item="${item.name}"
                 data-category="${item.category}">
                <div class="item-list-icon">
                    <img src="icons/${item.icon}" 
                         alt="${item.name}"
                         loading="lazy"
                         onerror="this.src='icons/00000000_common.webp'">
                </div>
                <div class="item-list-info">
                    <div class="item-list-name">${item.name}</div>
                    <div class="item-list-category" style="color: ${category.color}">
                        ${category.icon} ${category.name}
                    </div>
                </div>
                <div class="item-list-quantities">
                    <div class="quantity-group">
                        <span class="quantity-label">Owned</span>
                        <span class="quantity-value">${item.quantity}</span>
                    </div>
                    ${isNeeded ? `
                        <div class="quantity-group">
                            <span class="quantity-label">Needed</span>
                            <span class="quantity-value">${item.needed}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="item-list-actions">
                    <button class="quick-edit-btn" onclick="inventoryUI.quickEditQuantity('${item.name}')">
                        ✏️
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Setup item event listeners
     */
    setupItemEventListeners() {
        if (!this.container) return;
        
        // Item clicks for tooltips and editing
        this.container.querySelectorAll('.inventory-item, .inventory-item-list').forEach(itemEl => {
            const itemName = itemEl.dataset.item;
            
            // Click to edit quantity
            itemEl.addEventListener('click', () => {
                this.openQuantityModal(itemName);
            });
            
            // Hover for tooltip
            itemEl.addEventListener('mouseenter', (e) => {
                this.showTooltip(e, itemName);
            });
            
            itemEl.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
            
            itemEl.addEventListener('mousemove', (e) => {
                this.updateTooltipPosition(e);
            });
        });
    }
    
    /**
     * Show item tooltip
     */
    showTooltip(event, itemName) {
        const item = inventoryManager.items.get(itemName);
        if (!item) return;
        
        const category = ITEM_CATEGORIES[item.category];
        const projectInfo = inventoryManager.getProjectInfo(itemName);
        
        if (this.tooltipElement) {
            this.tooltipElement.remove();
        }
        
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.className = 'inventory-tooltip';
        
        let projectsSection = '';
        if (projectInfo?.usedByProjects && projectInfo.usedByProjects.length > 0) {
            projectsSection = `
                <div class="tooltip-section">
                    <div class="tooltip-section-title">Used in Projects:</div>
                    ${projectInfo.usedByProjects.map(project => 
                        `<div class="tooltip-project">• ${project}</div>`
                    ).join('')}
                </div>
            `;
        }
        
        let barterSection = '';
        if (item.barterInfo?.canBeBarterd) {
            barterSection = `
                <div class="tooltip-section">
                    <div class="tooltip-barter">
                        💰 Can be obtained through barter
                    </div>
                </div>
            `;
        }
        
        this.tooltipElement.innerHTML = `
            <div class="tooltip-header">
                <img src="icons/${item.icon}" alt="${item.name}" class="tooltip-icon">
                <div class="tooltip-title">${item.name}</div>
            </div>
            <div class="tooltip-category" style="color: ${category.color}">
                ${category.icon} ${category.name}
            </div>
            <div class="tooltip-stats">
                <div class="tooltip-stat">
                    <span class="stat-label">Owned:</span>
                    <span class="stat-value">${item.quantity}</span>
                </div>
                ${item.needed > 0 ? `
                    <div class="tooltip-stat">
                        <span class="stat-label">Needed:</span>
                        <span class="stat-value">${item.needed}</span>
                    </div>
                    <div class="tooltip-stat">
                        <span class="stat-label">Remaining:</span>
                        <span class="stat-value">${Math.max(0, item.needed - item.quantity)}</span>
                    </div>
                    ${projectInfo?.completionPercent !== undefined ? `
                        <div class="tooltip-stat">
                            <span class="stat-label">Progress:</span>
                            <span class="stat-value">${Math.round(projectInfo.completionPercent)}%</span>
                        </div>
                    ` : ''}
                ` : ''}
                ${item.allocated > 0 ? `
                    <div class="tooltip-stat">
                        <span class="stat-label">Allocated:</span>
                        <span class="stat-value">${item.allocated}</span>
                    </div>
                ` : ''}
            </div>
            ${projectsSection}
            ${barterSection}
            <div class="tooltip-actions">
                <small>Click to edit quantity</small>
            </div>
        `;
        
        document.body.appendChild(this.tooltipElement);
        this.updateTooltipPosition(event);
    }
    
    /**
     * Hide tooltip
     */
    hideTooltip() {
        if (this.tooltipElement) {
            this.tooltipElement.remove();
            this.tooltipElement = null;
        }
    }
    
    /**
     * Update tooltip position
     */
    updateTooltipPosition(event) {
        if (!this.tooltipElement) return;
        
        const x = event.clientX + 15;
        const y = event.clientY + 15;
        
        this.tooltipElement.style.left = `${x}px`;
        this.tooltipElement.style.top = `${y}px`;
        
        // Adjust if tooltip goes off screen
        const rect = this.tooltipElement.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.tooltipElement.style.left = `${event.clientX - rect.width - 15}px`;
        }
        if (rect.bottom > window.innerHeight) {
            this.tooltipElement.style.top = `${event.clientY - rect.height - 15}px`;
        }
    }
    
    /**
     * Open quantity editing modal
     */
    openQuantityModal(itemName) {
        const item = inventoryManager.items.get(itemName);
        if (!item) return;
        
        this.selectedItem = item;
        this.createQuantityModal();
    }
    
    /**
     * Create quantity editing modal
     */
    createQuantityModal() {
        if (!this.selectedItem) return;
        
        // Remove existing modal
        const existing = document.getElementById('quantity-modal');
        if (existing) existing.remove();
        
        this.quantityModal = document.createElement('div');
        this.quantityModal.id = 'quantity-modal';
        this.quantityModal.className = 'quantity-modal';
        
        const category = ITEM_CATEGORIES[this.selectedItem.category];
        
        this.quantityModal.innerHTML = `
            <div class="quantity-modal-overlay" onclick="inventoryUI.closeQuantityModal()"></div>
            <div class="quantity-modal-content">
                <div class="quantity-modal-header">
                    <div class="quantity-item-info">
                        <img src="icons/${this.selectedItem.icon}" alt="${this.selectedItem.name}" class="quantity-item-icon">
                        <div>
                            <h3>${this.selectedItem.name}</h3>
                            <p style="color: ${category.color}">${category.icon} ${category.name}</p>
                        </div>
                    </div>
                    <button class="quantity-close-btn" onclick="inventoryUI.closeQuantityModal()">✕</button>
                </div>
                
                <div class="quantity-modal-body">
                    <div class="quantity-current">
                        <span>Current Quantity: </span>
                        <span class="current-value">${this.selectedItem.quantity}</span>
                    </div>
                    
                    ${this.selectedItem.needed > 0 ? `
                        <div class="quantity-needed">
                            <span>Needed: </span>
                            <span class="needed-value">${this.selectedItem.needed}</span>
                        </div>
                    ` : ''}
                    
                    <div class="quantity-input-section">
                        <label for="quantity-input">New Quantity:</label>
                        <div class="quantity-input-group">
                            <button class="quantity-btn subtract" onclick="inventoryUI.adjustQuantity(-1)">-</button>
                            <input type="number" 
                                   id="quantity-input" 
                                   value="${this.selectedItem.quantity}" 
                                   min="0" 
                                   step="1">
                            <button class="quantity-btn add" onclick="inventoryUI.adjustQuantity(1)">+</button>
                        </div>
                    </div>
                    
                    <div class="quantity-quick-actions">
                        <button class="quantity-action-btn" onclick="inventoryUI.setQuickQuantity(0)">
                            Set to 0
                        </button>
                        ${this.selectedItem.needed > 0 ? `
                            <button class="quantity-action-btn" onclick="inventoryUI.setQuickQuantity(${this.selectedItem.needed})">
                                Set to Needed (${this.selectedItem.needed})
                            </button>
                        ` : ''}
                        <button class="quantity-action-btn" onclick="inventoryUI.adjustQuantity(10)">
                            +10
                        </button>
                        <button class="quantity-action-btn" onclick="inventoryUI.adjustQuantity(100)">
                            +100
                        </button>
                    </div>
                    
                    <div class="quantity-custom-add">
                        <label for="custom-add-input">Add Custom Amount:</label>
                        <div class="custom-add-group">
                            <input type="number" 
                                   id="custom-add-input" 
                                   placeholder="0" 
                                   min="0" 
                                   step="1"
                                   class="custom-add-input">
                            <button class="custom-add-btn" onclick="inventoryUI.addCustomAmount()">
                                Add
                            </button>
                        </div>
                        <small class="custom-add-help">Enter amount to add to current quantity (${this.selectedItem.quantity})</small>
                    </div>
                </div>
                
                <div class="quantity-modal-footer">
                    <button class="btn-secondary" onclick="inventoryUI.closeQuantityModal()">Cancel</button>
                    <button class="btn-primary" onclick="inventoryUI.saveQuantity()">Save</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.quantityModal);
        
        // Focus input and select text
        const input = this.quantityModal.querySelector('#quantity-input');
        input.focus();
        input.select();
        
        // Add keyboard listeners for main input
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.saveQuantity();
            } else if (e.key === 'Escape') {
                this.closeQuantityModal();
            }
        });
        
        // Add keyboard listeners for custom add input
        const customAddInput = this.quantityModal.querySelector('#custom-add-input');
        customAddInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.addCustomAmount();
            } else if (e.key === 'Escape') {
                this.closeQuantityModal();
            }
        });
        
        // Clear custom input when main input changes manually
        input.addEventListener('input', () => {
            customAddInput.value = '';
        });
    }
    
    /**
     * Close quantity modal
     */
    closeQuantityModal() {
        if (this.quantityModal) {
            this.quantityModal.remove();
            this.quantityModal = null;
        }
        this.selectedItem = null;
    }
    
    /**
     * Adjust quantity by amount
     */
    adjustQuantity(amount) {
        const input = this.quantityModal?.querySelector('#quantity-input');
        if (!input) return;
        
        const currentValue = parseInt(input.value) || 0;
        const newValue = Math.max(0, currentValue + amount);
        input.value = newValue;
    }
    
    /**
     * Set quantity to specific value
     */
    setQuickQuantity(value) {
        const input = this.quantityModal?.querySelector('#quantity-input');
        if (!input) return;
        
        input.value = Math.max(0, value);
    }
    
    /**
     * Add custom amount to current quantity
     */
    addCustomAmount() {
        const customInput = this.quantityModal?.querySelector('#custom-add-input');
        const quantityInput = this.quantityModal?.querySelector('#quantity-input');
        
        if (!customInput || !quantityInput) return;
        
        const customAmount = parseInt(customInput.value) || 0;
        if (customAmount <= 0) {
            // Visual feedback for invalid input
            customInput.style.borderColor = '#ef4444';
            setTimeout(() => {
                customInput.style.borderColor = '';
            }, 1000);
            return;
        }
        
        const currentQuantity = parseInt(quantityInput.value) || 0;
        const newQuantity = currentQuantity + customAmount;
        
        quantityInput.value = newQuantity;
        
        // Clear the custom input and show success feedback
        customInput.value = '';
        customInput.style.borderColor = '#10b981';
        setTimeout(() => {
            customInput.style.borderColor = '';
        }, 1000);
        
        // Update the help text to show the new total
        const helpText = this.quantityModal?.querySelector('.custom-add-help');
        if (helpText) {
            helpText.textContent = `Added ${customAmount}! New total will be: ${newQuantity}`;
            setTimeout(() => {
                helpText.textContent = `Enter amount to add to current quantity (${this.selectedItem.quantity})`;
            }, 3000);
        }
    }
    
    /**
     * Save quantity changes with unified completion system integration
     */
    async saveQuantity() {
        const input = this.quantityModal?.querySelector('#quantity-input');
        if (!input || !this.selectedItem) return;
        
        const newQuantity = parseInt(input.value) || 0;
        const oldQuantity = this.selectedItem.quantity;
        const neededQuantity = this.selectedItem.needed;
        const itemName = this.selectedItem.name;
        
        console.log(`📦 Quantity change: ${itemName} ${oldQuantity} → ${newQuantity} (needed: ${neededQuantity})`);
        
        // DEBUG: Log selectedItem properties
        console.log(`🔍 DEBUG selectedItem for ${itemName}:`, {
            name: this.selectedItem.name,
            isClickable: this.selectedItem.isClickable,
            needed: this.selectedItem.needed,
            quantity: this.selectedItem.quantity,
            keys: Object.keys(this.selectedItem)
        });
        
        console.log(`🔍 DEBUG: About to check completion conditions...`);
        
        // Check if this is a recipe completion (quantity now >= needed and it's a clickable recipe)
        const isRecipeCompletion = (
            this.selectedItem.isClickable && 
            neededQuantity > 0 && 
            oldQuantity < neededQuantity && 
            newQuantity >= neededQuantity
        );
        
        // Debug logging for completion detection
        console.log(`🔍 Recipe completion check for ${itemName}: isClickable=${this.selectedItem.isClickable}, needed=${neededQuantity}, ${oldQuantity}→${newQuantity}, result=${isRecipeCompletion}`);
        
        if (isRecipeCompletion) {
            console.log(`🎯 Recipe completion detected via quantity: ${itemName}`);
            
            try {
                // Use unified completion system instead of just setting quantity
                const { completeRecipe, validateRecipeForCompletion } = await import('./craft-system/global_inventory.js');
                
                // For manual quantity setting in inventory UI, skip dependency validation
                // This allows users to mark recipes as completed when they've crafted them externally
                console.log(`🎯 Manual recipe completion via inventory UI - bypassing dependency validation for ${itemName}`);
                
                // Optional: Show warning if dependencies aren't met, but still allow completion
                const validationResult = await validateRecipeForCompletion(itemName, {});
                if (!validationResult.canComplete) {
                    console.log(`⚠️ Note: Recipe ${itemName} has unmet dependencies, but allowing manual completion`);
                    console.log(`📋 Missing: ${validationResult.reason}`);
                }
                
                // Close modal first to prevent UI issues
                this.closeQuantityModal();
                
                // Show loading feedback
                const originalButton = document.querySelector(`[data-item="${itemName}"] .quantity-btn`);
                if (originalButton) {
                    const originalText = originalButton.textContent;
                    originalButton.textContent = '⏳';
                    originalButton.disabled = true;
                }
                
                // Complete the recipe using unified system with dependency check bypass
                const transaction = await completeRecipe(itemName, 'inventory_quantity', {
                    triggeredFrom: 'quantity_modal',
                    originalQuantity: oldQuantity,
                    targetQuantity: newQuantity,
                    autoCascade: true,
                    skipDependencyCheck: true, // Allow manual completion regardless of dependencies
                    manualCompletion: true // Flag this as a manual completion
                });
                
                console.log(`✅ Recipe completed via quantity setting:`, transaction);
                
                // Refresh the display
                this.renderInventoryContent();
                
                // Show success notification
                if (window.UnifiedCompletion && window.UnifiedCompletion.showNotification) {
                    const cascadeText = transaction.cascadeCompletions && transaction.cascadeCompletions.length > 0 
                        ? ` (+${transaction.cascadeCompletions.length} cascades)` : '';
                    window.UnifiedCompletion.showNotification(
                        'Recipe Completed', 
                        `${itemName} completed successfully${cascadeText}`, 
                        'success'
                    );
                }
                
                return;
                
            } catch (error) {
                console.error(`❌ Unified completion failed for ${itemName}:`, error);
                
                // Fallback to regular quantity setting
                console.log(`⚠️ Falling back to regular quantity setting for ${itemName}`);
                inventoryManager.setItemQuantity(itemName, newQuantity);
                
                // Close modal and refresh display
                this.closeQuantityModal();
                this.renderInventoryContent();
                
                if (window.UnifiedCompletion && window.UnifiedCompletion.showNotification) {
                    // Provide a more user-friendly error message
                    const errorMsg = error.message.includes('Missing dependencies') 
                        ? `Recipe ${itemName} has missing dependencies. Quantity updated instead.`
                        : `Could not complete recipe: ${error.message}. Set as regular quantity instead.`;
                    
                    window.UnifiedCompletion.showNotification(
                        'Completion Error', 
                        errorMsg, 
                        'error'
                    );
                }
            }
        } else {
            // Regular quantity setting (not a recipe completion)
            inventoryManager.setItemQuantity(itemName, newQuantity);
            console.log(`📦 Regular quantity update: ${itemName} = ${newQuantity}`);
        }
        
        this.closeQuantityModal();
        this.renderInventoryContent(); // Refresh the display
    }
    
    /**
     * Quick edit quantity (inline editing)
     */
    quickEditQuantity(itemName) {
        this.openQuantityModal(itemName);
    }
    
    /**
     * Export inventory data
     */
    exportInventory() {
        const data = inventoryManager.exportInventory();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `bdo-inventory-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * Import inventory data
     */
    importInventory() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    inventoryManager.importInventory(data);
                    this.renderInventoryContent();
                    alert('Inventory imported successfully!');
                } catch (error) {
                    alert('Failed to import inventory: ' + error.message);
                }
            };
            reader.readAsText(file);
        };
        
        input.click();
    }
    
    /**
     * Clear all inventory
     */
    clearInventory() {
        if (confirm('Are you sure you want to clear all inventory quantities? This cannot be undone.')) {
            inventoryManager.clearInventory();
            this.renderInventoryContent();
        }
    }
    
    /**
     * Handle escape key
     */
    handleEscapeKey(event) {
        if (event.key === 'Escape') {
            if (this.quantityModal) {
                this.closeQuantityModal();
            } else {
                this.closeInventoryModal();
            }
        }
    }
    
    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Listen for inventory changes
        document.addEventListener('inventoryChanged', (event) => {
            const { type } = event.detail;
            
            if (this.isModalOpen && ['quantity-changed', 'bulk-updated', 'imported', 'cleared'].includes(type)) {
                this.renderInventoryContent();
            }
        });
        
        // Listen for global inventory updates
        document.addEventListener('inventoryUpdated', (event) => {
            if (this.isModalOpen) {
                // Update needed quantities
                inventoryManager.updateNeededQuantities();
                this.renderInventoryContent();
            }
        });
    }
}

// Create global instance
export const inventoryUI = new InventoryUI();

// Make it available globally for cross-system updates
window.inventoryUI = inventoryUI;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => inventoryUI.initialize());
} else {
    inventoryUI.initialize();
}