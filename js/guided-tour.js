// Guided Tour Module for BDO Ship Upgrade Tracker
// Uses Driver.js for creating interactive tours

class GuidedTour {
    constructor() {
        this.driver = null;
        this.isAvailable = false;
        this.isRunning = false;
        this.initAttempts = 0;
        this.maxInitAttempts = 50; // Maximum 5 seconds of retries
        this.initialized = false;
        
        // Don't auto-initialize - wait for first use (lazy loading)
    }
    
    // Lazy initialization only when needed
    ensureInitialized() {
        if (!this.initialized) {
            this.initialized = true;
            this.init();
        }
    }

    init() {
        this.initAttempts++;
        
        if (typeof window.driver !== 'undefined') {
            this.isAvailable = true;
            this.createDriver();
        } else if (this.initAttempts < this.maxInitAttempts) {
            // Retry with exponential backoff, but stop after max attempts
            setTimeout(() => this.init(), Math.min(100 * this.initAttempts, 500));
        } else {
            // Give up after max attempts to prevent infinite loop
            this.isAvailable = false;
        }
    }

    createDriver() {
        try {
            // Try multiple approaches to access driver
            let driverFn = null;
            
            if (typeof window.driver === 'function') {
                driverFn = window.driver;
            } else if (window.driver && typeof window.driver.js?.driver === 'function') {
                driverFn = window.driver.js.driver;
            } else if (window.driver && typeof window.driver.driver === 'function') {
                driverFn = window.driver.driver;
            }
            
            if (!driverFn) {
                throw new Error('Cannot find driver function');
            }
            
            this.driver = driverFn({
                showProgress: true,
                showButtons: ['next', 'previous', 'close'],
                overlayOpacity: 0.1,  // Very light overlay - almost transparent
                overlayColor: '#000000',
                stagePadding: 10,  // More space around highlighted elements
                stageRadius: 12,   // Rounded corners for highlighted elements
                allowClose: true,
                animate: true,  // Re-enable smooth animations
                smoothScroll: true,  // Re-enable smooth scrolling
                popoverClass: 'driver-popover-ocean-theme',
                doneBtnText: 'Finish Tour',
                closeBtnText: 'Skip',
                nextBtnText: 'Next',
                prevBtnText: 'Previous',
                onDestroyed: () => {
                    // Clean up revealed elements and save completion
                    this.cleanupTourRevealedElements();
                    this.isRunning = false;
                    localStorage.setItem('bdo_ship_upgrade-tour_completed', 'true');
                    
                    // Refresh page state without server call
                    this.refreshPageState();
                },
                onDeselected: () => {
                    // Clean up when moving between steps
                    this.isRunning = false;
                },
                onHighlightStarted: (element) => {
                    // Force element to be completely visible and on top
                    if (element) {
                        // Remove any blur or filters
                        element.style.filter = 'none !important';
                        element.style.backdropFilter = 'none !important';
                        
                        // Ensure maximum visibility with bright outline
                        element.style.outline = '4px solid #0ea5e9';
                        element.style.outlineOffset = '4px';
                        element.style.boxShadow = '0 0 0 8px rgba(14, 165, 233, 0.4), 0 0 40px rgba(14, 165, 233, 0.8)';
                        element.style.position = 'relative';
                        element.style.zIndex = '99999';  // Maximum z-index
                        element.style.transform = 'translateZ(0)';  // Force hardware acceleration
                        
                        // Ensure parent containers don't interfere
                        let parent = element.parentElement;
                        while (parent && parent !== document.body) {
                            parent.style.zIndex = Math.max(parseInt(parent.style.zIndex) || 0, 99998);
                            parent = parent.parentElement;
                        }
                        
                    }
                },
                onDeselected: (element) => {
                    // Clean up all custom styles
                    if (element) {
                        element.style.filter = '';
                        element.style.backdropFilter = '';
                        element.style.outline = '';
                        element.style.outlineOffset = '';
                        element.style.boxShadow = '';
                        element.style.zIndex = '';
                        element.style.transform = '';
                    }
                }
            });
            
        } catch (error) {
            this.isAvailable = false;
        }
    }

    // Simple show-and-tell tour that automatically reveals UI elements  
    startMainTour() {
        this.ensureInitialized();
        if (!this.isAvailable) {
            return;
        }
        
        if (this.isRunning) {
            this.driver.destroy();
            this.isRunning = false;
        }
        
        this.isRunning = true;
        
        // Simple show-and-tell steps that automatically reveal and explain features
        const steps = [
            {
                popover: {
                    title: '🌊 Welcome to BDO Ship Upgrade Tracker!',
                    description: 'Your guide to Black Desert Online ship upgrades tracker! This tour will show you all the key features. Just click "Next" to explore - we\'ll handle the rest! <br> <br> Note this web app uses local storage to save your tracked items!',
                    position: 'center'
                }
            },
            {
                element: '.ship-selector-container',
                popover: {
                    title: '⚓ Ship Selection',
                    description: 'This is where you choose your ship! The dropdown shows all available ships with their completion percentage and key stats. And this is what it looks like when opened...',
                    position: 'bottom'
                },
                onHighlightStarted: () => {
                    // Automatically open the ship dropdown for demonstration
                    this.revealShipDropdown();
                }
            },
            {
                element: '#ship-search-input',
                popover: {
                    title: '🔍 Ship Search',
                    description: 'This search box lets you quickly find specific ships. Very helpful when managing multiple upgrade projects!',
                    position: 'bottom'
                },
                onHighlightStarted: () => {
                    // Switch to Epheria Caravel which has more recipe materials for demonstration
                    this.selectShipForDemo('Epheria Caravel');
                }
            },
            {
                element: '#progress-dashboard',
                popover: {
                    title: '📊 Progress Dashboard',
                    description: 'This dashboard tracks your selected ship overall progress! It shows completion percentage, items collected, and important resources like Crow Coins and Enhancement Stones needed.',
                    position: 'left'
                },
                onHighlightStarted: () => {
                    // Directly hide the dropdown by adding the hidden class and resetting styles
                    const dropdownMenu = document.getElementById('ship-dropdown-menu');
                    if (dropdownMenu) {
                        dropdownMenu.classList.add('hidden');
                        dropdownMenu.style.display = 'none';
                        dropdownMenu.style.zIndex = '';
                        dropdownMenu.style.position = '';
                    }
                    // Make sure progress dashboard is visible
                    this.revealProgressDashboard();
                }
            },
            {
                element: '.controls-section',
                popover: {
                    title: '🔍 Search & Filters',
                    description: 'Use this search box to find specific materials, and the filter chips to show only certain types of items (Vendor, Recipe, Barter, etc.)',
                    position: 'bottom',
                    onHighlightStarted: () => {
                        // Make sure materials section is visible
                        this.revealMaterialsSection();
                    }
                }
            },
            {
                element: '.tabs-nav',
                popover: {
                    title: '🏷️ Material Categories',
                    description: 'These tabs organize your materials: "All" shows everything, "Basic Supplies" shows ready to use materials, and "Crafting Orders" shows items you need to craft.',
                    position: 'bottom'
                }
            },
            {
                element: '.material-card',
                popover: {
                    title: '📦 Material Cards',
                    description: 'Each card shows an item needed for your ship upgrade. Progress is shown with percentages and visual indicators. Click cards to open quantity tracking controls.',
                    position: 'top'
                }
            },
            {
                popover: {
                    title: '🔗 BDO Codex Integration',
                    description: 'Item names are clickable links to BDOCodex. Click any item name to open detailed information about that item including locations and drop rates.',
                    position: 'center'
                }
            },
            {
                element: '.badge',
                popover: {
                    title: '🏅 Information Badges',
                    description: 'Badges show acquisition methods: "Vendor" = purchasable, "Recipe" = craftable, "Barter" = tradeable. Click badges to see detailed acquisition information.',
                    position: 'top'
                }
            },
            {
                element: '.enhancement-arrow',
                popover: {
                    title: '⚡ Enhancement Arrows',
                    description: 'These ▲▼ arrows adjust enhancement levels on ship parts. Click ▲ to increase (+1, +2, +3...) or ▼ to decrease enhancement levels. This changes material requirements and costs.',
                    position: 'top',
                    onHighlightStarted: () => {
                        // Make sure we have enhancement arrows visible
                        this.ensureEnhancementArrowsVisible();
                    }
                }
            },
            {
                element: '.material-card.has-recipe',
                popover: {
                    title: '📋 Recipe Cards',
                    description: 'Cards with the 📋 icon are craftable items with recipes. Clicking on the cards will open the recipe modal to show the crafting management system.',
                    position: 'top'
                },
                onDeselected: () => {
                    // Execute your exact command when leaving this step (going to modal steps)
                    try {
                        document.querySelector('[title="Graphite Ingot for Upgrade (Click to view on BDO Codex)"]').parentNode.parentNode.parentNode.click();
                    } catch (error) {
                        // Fallback - try any recipe card
                        const recipeCard = document.querySelector('.material-card.has-recipe');
                        if (recipeCard) recipeCard.click();
                    }
                }
            },
            {
                element: '.recipe-modal-header',
                popover: {
                    title: '📦 Recipe Management Modal',
                    description: 'Recipe modal for tracking crafting progress. Shows completed items and raw materials needed for crafting.',
                    position: 'bottom'
                }
            },
            {
                element: '.recipe-modal-progress',
                popover: {
                    title: '📊 Recipe Progress Overview',
                    description: 'Shows total recipe completion percentage with progress bar. Combines completed items and raw material progress using hybrid calculation.',
                    position: 'bottom'
                }
            },
            {
                element: '.progress-breakdown',
                popover: {
                    title: '💡 Progress Breakdown',
                    description: 'Shows detailed recipe progress breakdown: completed items vs raw materials collected.',
                    position: 'left'
                }
            },
            {
                element: '.completed-items-section',
                popover: {
                    title: '🔧 Completed Items Section',
                    description: 'Track already-crafted items here. When you log completed items, the system automatically reduces raw material requirements accordingly.',
                    position: 'left'
                }
            },
            {
                element: '.raw-materials-section',
                popover: {
                    title: '⚙️ Raw Materials Tracking',
                    description: 'Tracks individual raw materials needed for remaining crafts. Shows acquisition methods and has quantity controls for each material.',
                    position: 'left'
                }
            },
            {
                element: '.modal-quantity-controls',
                popover: {
                    title: '🎯 Quantity Controls',
                    description: 'Material quantity controls: -/+ buttons adjust amounts, type numbers directly, or click ✓ to set to full required amount.',
                    position: 'left'
                }
            },
            {
                element: '.recipe-complete-btn',
                popover: {
                    title: '✅ Complete Recipe Button',
                    description: 'Marks entire recipe as finished.',
                    position: 'top'
                }
            },
            {
                element: '.reset-btn',
                popover: {
                    title: '🔄 Reset Recipe Button',
                    description: 'Resets both completed items and raw material quantities to zero.',
                    position: 'top'
                },
                onDeselected: () => {
                    // Close modal immediately when leaving this step
                    this.closeRecipeModalForDemo();
                }
            },
            {
                popover: {
                    title: '📱 Floating Progress Panel',
                    description: 'Notice the floating progress panel in the top-right corner? When the main dashboard goes out of view, this panel appears automatically. Click its first card to toggle between expanded and minimized views.',
                    position: 'over',
                    side: 'left'
                },
                onHighlightStarted: () => {
                    // Ensure floating panel is visible and expanded for demonstration
                    const floatingPanel = document.getElementById('floating-progress-dashboard');
                    if (floatingPanel) {
                        // Don't change positioning, just ensure it's expanded
                        floatingPanel.classList.remove('minimized');
                        // Increase z-index to appear above tour-modified elements
                        floatingPanel.style.zIndex = '99999';
                        // Add a subtle glow effect to draw attention without moving it
                        floatingPanel.style.boxShadow = '0 0 30px rgba(14, 165, 233, 0.6)';
                        floatingPanel.style.transition = 'box-shadow 0.3s ease';
                    }
                    
                    // Position popover near floating panel
                    setTimeout(() => {
                        const popover = document.querySelector('.driver-popover');
                        if (popover && floatingPanel) {
                            const panelRect = floatingPanel.getBoundingClientRect();
                            popover.style.position = 'fixed';
                            popover.style.top = `${panelRect.bottom + 10}px`;
                            popover.style.left = `${panelRect.right - popover.offsetWidth}px`;
                        }
                    }, 100);
                },
                onDeselected: () => {
                    // Remove the glow effect and reset z-index
                    const floatingPanel = document.getElementById('floating-progress-dashboard');
                    if (floatingPanel) {
                        floatingPanel.style.boxShadow = '';
                        floatingPanel.style.transition = '';
                        floatingPanel.style.zIndex = '';
                    }
                }
            },
            {
                element: '#water-ripples-toggle',
                popover: {
                    title: '🌊 Ocean Ambiance',
                    description: 'Toggles water ripples effect on/off. Creates realistic water ripples that follow your cursor movement.',
                    position: 'left'
                }
            },
            {
                popover: {
                    title: '🎉 Tour Complete!',
                    description: 'You can now use the ship upgrade tracker:<br/><br/>• Select ships from dropdown<br/>• Track materials with cards<br/>• Click item names for BDOCodex info<br/>• Use enhancement arrows (▲▼)<br/>• Open recipe modals for crafting<br/>• Monitor progress dashboard<br/><br/>Happy sailing! ⚓',
                    position: 'center'
                }
            }
        ];

        this.driver.setSteps(steps);
        this.driver.drive();
    }


    // Simple ship selection tour
    startShipSelectionTour() {
        if (!this.isAvailable) return;
        
        if (this.isRunning) {
            this.driver.destroy();
            this.isRunning = false;
        }
        
        this.isRunning = true;

        const steps = [
            {
                element: '.ship-selector-container',
                popover: {
                    title: '🚢 Ship Selection',
                    description: 'This shows your currently selected ship with progress and stats. Click the dropdown to see all available ships and switch between projects!',
                    position: 'bottom'
                },
                onHighlightStarted: () => {
                    this.revealShipDropdown();
                }
            },
            {
                element: '#ship-search-input',
                popover: {
                    title: '🔍 Quick Search',
                    description: 'Type here to quickly find specific ships. Very helpful when managing multiple upgrade projects!',
                    position: 'bottom'
                }
            }
        ];

        this.driver.setSteps(steps);
        this.driver.drive();
    }

    // Water ripples feature tour
    startWaterRipplesTour() {
        if (!this.isAvailable) return;

        const steps = [
            {
                element: '.water-toggle-btn',
                popover: {
                    title: '🌊 Ocean Ambiance',
                    description: 'Toggle realistic water ripples for an immersive maritime experience! Perfect for getting in the sailing mood while planning upgrades.',
                    position: 'left'
                }
            }
        ];

        this.driver.setSteps(steps);
        this.driver.drive();
    }

    // Check if user has seen the tour and auto-tour is enabled
    shouldShowTour() {
        const autoTourEnabled = localStorage.getItem('bdo_ship_upgrade-auto_tour_enabled') !== 'false';
        const tourCompleted = localStorage.getItem('bdo_ship_upgrade-tour_completed');
        return autoTourEnabled && !tourCompleted;
    }

    // Reset tour state
    resetTour() {
        localStorage.removeItem('bdo_ship_upgrade-tour_completed');
    }

    // Show tour if it's the user's first time and auto-tour is enabled
    checkAndShowInitialTour() {
        if (this.shouldShowTour()) {
            // Minimal delay for page stabilization
            setTimeout(() => {
                this.startMainTour();
            }, 500);
        }
    }

    // Setup auto-tour checkbox functionality
    setupAutoTourCheckbox() {
        this.ensureInitialized();
        const checkbox = document.getElementById('auto-tour-checkbox');
        if (!checkbox) return;

        // Set initial state from localStorage (default: enabled)
        const autoTourEnabled = localStorage.getItem('bdo_ship_upgrade-auto_tour_enabled') !== 'false';
        checkbox.checked = autoTourEnabled;

        // Handle checkbox changes
        checkbox.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('bdo_ship_upgrade-auto_tour_enabled', enabled.toString());
            
            if (enabled) {
                // If user re-enables auto-tour, reset completion state
                localStorage.removeItem('bdo_ship_upgrade-tour_completed');
            }
        });
    }

    // Helper methods to automatically reveal hidden UI elements for the tour
    revealShipDropdown() {
        const shipTrigger = document.getElementById('ship-selector-trigger');
        const dropdownMenu = document.getElementById('ship-dropdown-menu');
        
        if (shipTrigger && dropdownMenu) {
            // Open the dropdown if it's closed
            if (dropdownMenu.classList.contains('hidden')) {
                shipTrigger.click();
            }
            
            // Ensure dropdown is visible and properly positioned
            setTimeout(() => {
                dropdownMenu.style.zIndex = '999998';
                dropdownMenu.style.position = 'relative';
                dropdownMenu.classList.remove('hidden');
                dropdownMenu.style.display = 'block';
            }, 100);
        }
    }
    
    revealProgressDashboard() {
        const dashboard = document.getElementById('progress-dashboard');
        if (dashboard) {
            // Make sure the dashboard is visible
            dashboard.style.display = 'grid';
            dashboard.style.zIndex = '999997';
        }
    }
    
    revealMaterialsSection() {
        const materialsSection = document.getElementById('materials-section');
        if (materialsSection) {
            // Make sure the materials section is visible
            materialsSection.style.display = 'block';
            materialsSection.style.zIndex = '999996';
        }
    }
    
    selectShipForDemo(shipName) {
        // Find the ship option in the dropdown
        const shipOptions = document.querySelectorAll('.ship-option');
        for (const option of shipOptions) {
            const nameElement = option.querySelector('.ship-option-name');
            if (nameElement && nameElement.textContent.includes(shipName)) {
                option.click();
                break;
            }
        }
        
        // Wait for the ship change to process
        setTimeout(() => {
            // Close the dropdown after selection
            const dropdown = document.getElementById('ship-dropdown-menu');
            const trigger = document.getElementById('ship-selector-trigger');
            if (dropdown && trigger && !dropdown.classList.contains('hidden')) {
                trigger.click();
            }
        }, 500);
    }
    
    ensureRecipeCardVisible() {
        // Look for a recipe card and scroll it into view
        const recipeCard = document.querySelector('.material-card.has-recipe');
        if (recipeCard) {
            recipeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            recipeCard.style.animation = 'pulse-attention 2s infinite';
        }
    }
    
    ensureEnhancementSystemVisible() {
        // Make sure the progress dashboard is visible
        const dashboard = document.getElementById('progress-dashboard');
        if (dashboard) {
            dashboard.style.display = 'grid';
            dashboard.style.zIndex = '999997';
        }
        
        // Scroll to the enhancement stones card
        const enhancementCard = document.querySelector('.dashboard-card:nth-child(4)'); // Enhancement stones is 4th card
        if (enhancementCard) {
            enhancementCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            enhancementCard.style.animation = 'pulse-attention 2s infinite';
        }
    }
    
    ensureEnhancementArrowsVisible() {
        // Make sure materials section is visible
        const materialsSection = document.getElementById('materials-section');
        if (materialsSection) {
            materialsSection.style.display = 'block';
            materialsSection.style.zIndex = '999996';
        }
        
        // Look for the first enhancement arrow and scroll it into view
        const enhancementArrow = document.querySelector('.enhancement-arrow');
        if (enhancementArrow) {
            enhancementArrow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight the parent material card
            const materialCard = enhancementArrow.closest('.material-card');
            if (materialCard) {
                materialCard.style.animation = 'pulse-attention 2s infinite';
            }
        }
    }
    
    openRecipeModalForDemo() {
        // Find and click on a recipe card to open the modal
        const recipeCards = document.querySelectorAll('.material-card.has-recipe');
        
        if (recipeCards.length > 0) {
            const recipeCard = recipeCards[0];
            
            // Ensure the card is visible
            recipeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            recipeCard.style.animation = 'pulse-attention 1s infinite';
            
            // Use the working method to open modal
            setTimeout(() => {
                try {
                    document.querySelector('[title="Graphite Ingot for Upgrade (Click to view on BDO Codex)"]').parentNode.parentNode.parentNode.click();
                    this.waitForModalElements();
                } catch (error) {
                    // Fallback - try clicking any recipe card
                    recipeCard.click();
                }
            }, 500);
        }
    }
    
    // Helper method to wait for modal elements to be ready
    waitForModalElements() {
        let attempts = 0;
        const maxAttempts = 25;
        
        const checkModal = () => {
            attempts++;
            const modal = document.getElementById('recipe-modal');
            const modalHeader = document.querySelector('.recipe-modal-header');
            
            if (modal && !modal.classList.contains('hidden') && modalHeader) {
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(checkModal, 100);
            }
        };
        
        checkModal();
    }
    
    closeRecipeModalForDemo() {
        // Close the recipe modal
        const modal = document.getElementById('recipe-modal');
        const closeBtn = document.getElementById('recipe-modal-close');
        
        if (modal && closeBtn && !modal.classList.contains('hidden')) {
            closeBtn.click();
        }
    }
    
    // Cleanup method to restore original states
    cleanupTourRevealedElements() {
        // Close ship dropdown using direct method
        const dropdownMenu = document.getElementById('ship-dropdown-menu');
        if (dropdownMenu) {
            dropdownMenu.classList.add('hidden');
            dropdownMenu.style.display = 'none';
            dropdownMenu.style.zIndex = '';
            dropdownMenu.style.position = '';
        }
        
        // Close recipe modal if it was opened by tour
        this.closeRecipeModalForDemo();
        
        // Remove any pulse animations
        const animatedElements = document.querySelectorAll('[style*="pulse-attention"]');
        animatedElements.forEach(element => {
            element.style.animation = '';
        });
        
        // Also remove animations from dashboard cards
        const dashboardCards = document.querySelectorAll('.dashboard-card');
        dashboardCards.forEach(card => {
            card.style.animation = '';
        });
        
        // Reset z-indexes including modals
        const elementsToReset = [
            '#ship-dropdown-menu',
            '#progress-dashboard', 
            '#materials-section'
        ];
        
        elementsToReset.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                element.style.zIndex = '';
            }
        });
    }

    // Public method to manually start any tour
    startTour(tourType = 'main') {
        this.ensureInitialized();
        switch (tourType) {
            case 'main':
                this.startMainTour();
                break;
            case 'ship':
                this.startShipSelectionTour();
                break;
            case 'water':
                this.startWaterRipplesTour();
                break;
            default:
                this.startMainTour();
        }
    }
    
    // Refresh page state with full reload
    refreshPageState() {
        // Small delay to ensure tour cleanup completes, then reload
        setTimeout(() => {
            window.location.reload();
        }, 100);
    }
}

// Create and export the guided tour instance
export const guidedTour = new GuidedTour();

// Make guidedTour available globally for callback access
window.guidedTour = guidedTour;