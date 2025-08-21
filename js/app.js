// Main application logic converted from Python/Brython to JavaScript
// Full implementation matching modern-ui.html functionality

// Import all data modules
import { ships } from './ships.js';
import { recipes } from './recipes.js';
import { coins } from './sea_coins.js';
import { tccost } from './totals.js';
import { barters } from './tradein.js';
import { items } from './vendor_items.js';
import { shipbarters } from './shipbarter.js';
import { genInfo, shipstats } from './information.js';
import { iconLoader } from './icon-loader.js';
import { shipMaterialTotals } from './ship_totals.js';
import RealisticWaterRipples from './realistic-water-ripples.js';
import { guidedTour } from './guided-tour.js';

// Motion library is loaded via CDN and available globally as Motion
// Safe animate function that checks for Motion availability
const animate = (element, keyframes, options = {}) => {
    if (window.Motion && window.Motion.animate) {
        return window.Motion.animate(element, keyframes, options);
    }
    // Fallback: return resolved promise if Motion isn't available
    return Promise.resolve();
};

// Helper function for stagger
const stagger = (...args) => {
    if (window.Motion && window.Motion.stagger) {
        return window.Motion.stagger(...args);
    }
    return 0;
};

// Analytics modules removed - not needed for self-hosted app

// Storage key prefix
const storageKey = "bdo_ship_upgrade";

// Global state
let currentShip = "Epheria Sailboat";
let searchQuery = "";
let activeFilter = "all";
let activeTab = "all";

// Floating dashboard state
let floatingDashboardGlobal = null;
let isFloating = false;
let isTransitioning = false;
let dashboardInitialized = false;

// Professional Animation System - Elegant & Gooey
const animationConfig = {
    // Elegant gooey easing curves
    easing: {
        gooey: "cubic-bezier(0.34, 1.26, 0.64, 1)",           // Subtle gooey bounce
        smooth: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",       // Ultra smooth
        elastic: "cubic-bezier(0.68, -0.15, 0.265, 1.15)",    // Gentle elastic
        morphing: "cubic-bezier(0.23, 1, 0.32, 1)"            // Fluid morphing
    },
    // Professional timing values
    timing: {
        micro: 0.15,    // Quick feedback
        fast: 0.25,     // Button interactions
        medium: 0.4,    // Card hovers
        slow: 0.6,      // Modal transitions
        stagger: 0.06   // List animations
    },
    // Subtle scale values - professional feel
    scale: {
        micro: 1.01,    // Barely noticeable
        small: 1.03,    // Subtle hover
        medium: 1.05,   // Card interactions
        large: 1.08     // Modal emphasis
    }
};

// Animation utility functions with Motion safety checks
const animUtils = {
    // Elegant gooey hover - subtle and professional
    gooeyHover: (element, options = {}) => {
        const { scale = animationConfig.scale.small, intensity = 'medium' } = options;
        const duration = animationConfig.timing[intensity];
        
        element.addEventListener('mouseenter', () => {
            animate(element, {
                scale,
                filter: ["brightness(1)", "brightness(1.02)"],
                y: [0, -2],
                boxShadow: [
                    "0 2px 8px rgba(0,0,0,0.08)", 
                    "0 8px 32px rgba(74, 158, 255, 0.12)"
                ]
            }, {
                duration,
                easing: animationConfig.easing.gooey
            });
        });
        
        element.addEventListener('mouseleave', () => {
            animate(element, {
                scale: 1,
                filter: "brightness(1)",
                y: 0,
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
            }, {
                duration,
                easing: animationConfig.easing.smooth
            });
        });
    },
    
    // Fluid morphing entrance - like liquid coming to life
    morphIn: (element, options = {}) => {
        const { delay = 0, intensity = 'medium' } = options;
        
        animate(element, {
            opacity: [0, 1],
            scale: [0.94, 1.01, 1],
            y: [8, 0],
            filter: ["blur(1px)", "blur(0px)"]
        }, {
            duration: animationConfig.timing.slow,
            delay,
            easing: animationConfig.easing.morphing
        });
    },
    
    // Gentle pulse feedback - professional button interaction
    pulse: (element, options = {}) => {
        const { scale = animationConfig.scale.micro } = options;
        
        return animate(element, {
            scale: [1, scale, 1],
            filter: ["brightness(1)", "brightness(1.03)", "brightness(1)"]
        }, {
            duration: animationConfig.timing.fast,
            easing: animationConfig.easing.elastic
        });
    },
    
    // Elegant staggered appearance - like ripples in water
    staggerReveal: (elements, options = {}) => {
        const { intensity = 'medium' } = options;
        const staggerDelay = animationConfig.timing.stagger;
        
        elements.forEach((element, index) => {
            animate(element, {
                opacity: [0, 1],
                y: [12, 0],
                scale: [0.97, 1],
                filter: ["blur(1px)", "blur(0px)"]
            }, {
                duration: animationConfig.timing[intensity],
                delay: index * staggerDelay,
                easing: animationConfig.easing.morphing
            });
        });
    },
    
    // Smooth slide transition with gooey feel
    slideTransition: (element, direction = 'up', options = {}) => {
        const { distance = 20, intensity = 'medium' } = options;
        const offset = direction === 'up' ? -distance : distance;
        
        return animate(element, {
            y: [0, offset, 0],
            scale: [1, 1.01, 1],
            opacity: [1, 0.9, 1]
        }, {
            duration: animationConfig.timing[intensity],
            easing: animationConfig.easing.gooey
        });
    }
};

// Tooltip system
function createTooltip() {
    let tooltip = document.getElementById('material-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'material-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            z-index: 10000;
            background: var(--bg-primary);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-md);
            padding: 12px;
            max-width: 350px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            font-size: 13px;
            line-height: 1.4;
            display: none;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
        `;
        document.body.appendChild(tooltip);
    }
    return tooltip;
}

// Toast notification system for ship switching feedback
async function createToast(message, type = 'info', duration = 4000, shipName = null) {
    const toastContainer = getToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `ship-switch-toast toast-${type}`;
    toast.style.cssText = `
        background: ${type === 'success' ? 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)' : 
                    type === 'info' ? 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)' : 
                    'linear-gradient(135deg, #f87171 0%, #dc2626 100%)'};
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        margin-bottom: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        transform: translateX(100%);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
        border: 2px solid rgba(255, 255, 255, 0.2);
        font-weight: 600;
        font-size: 14px;
        line-height: 1.4;
        position: relative;
        overflow: hidden;
        min-width: 320px;
        max-width: 400px;
    `;
    
    // Create content container
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'display: flex; align-items: center; gap: 10px;';
    
    // Create icon container
    const iconContainer = document.createElement('div');
    iconContainer.style.cssText = `
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.2);
        overflow: hidden;
    `;
    
    // Get ship icon if shipName is provided and it's a ship
    if (shipName && ships.includes(shipName)) {
        try {
            const shipIcon = await iconLoader.createIcon(shipName, "md", { clickable: false, interactive: false });
            shipIcon.style.cssText = `
                width: 20px;
                height: 20px;
                border-radius: 3px;
                filter: brightness(1.2) saturate(1.1);
            `;
            iconContainer.appendChild(shipIcon);
        } catch (error) {
            // Fallback to emoji if ship icon fails
            const fallbackIcon = type === 'success' ? '🚢' : type === 'info' ? '⚓' : '⚠️';
            iconContainer.innerHTML = `<span style="font-size: 16px;">${fallbackIcon}</span>`;
        }
    } else {
        // Use emoji for non-ship notifications
        const fallbackIcon = type === 'success' ? '🚢' : type === 'info' ? '⚓' : '⚠️';
        iconContainer.innerHTML = `<span style="font-size: 16px;">${fallbackIcon}</span>`;
    }
    
    // Create message span
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    
    contentDiv.appendChild(iconContainer);
    contentDiv.appendChild(messageSpan);
    toast.appendChild(contentDiv);
    
    // Add progress bar for timed toasts
    if (duration > 0) {
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: rgba(255, 255, 255, 0.6);
            width: 100%;
            transform-origin: left;
            animation: toastProgress ${duration}ms linear forwards;
        `;
        toast.appendChild(progressBar);
    }
    
    toastContainer.appendChild(toast);
    
    // Elegant slide-in entrance with gooey morphing
    animate(toast, {
        x: [300, 0],
        scale: [0.96, 1],
        opacity: [0, 1],
        filter: ["blur(1px)", "blur(0px)"]
    }, {
        duration: animationConfig.timing.medium,
        easing: animationConfig.easing.gooey
    });
    
    // Click to dismiss with elegant feedback
    toast.addEventListener('click', () => {
        // Gentle press feedback before dismiss
        animUtils.pulse(toast, { scale: animationConfig.scale.micro })
            .then(() => dismissToast(toast));
    });
    
    // Auto dismiss after duration
    if (duration > 0) {
        setTimeout(() => {
            dismissToast(toast);
        }, duration);
    }
    
    return toast;
}

function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10001;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            pointer-events: none;
        `;
        
        // Add CSS animation for progress bar
        const style = document.createElement('style');
        style.textContent = `
            @keyframes toastProgress {
                from { transform: scaleX(1); }
                to { transform: scaleX(0); }
            }
            
            .ship-switch-toast {
                pointer-events: all;
            }
            
            .ship-switch-toast:hover {
                transform: translateX(0) scale(1.02) !important;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3) !important;
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(container);
    }
    return container;
}

function dismissToast(toast) {
    // Elegant slide-out with gooey morphing
    animate(toast, {
        x: [0, 300],
        scale: [1, 0.94],
        opacity: [1, 0],
        filter: ["blur(0px)", "blur(1px)"]
    }, {
        duration: animationConfig.timing.medium,
        easing: animationConfig.easing.smooth
    }).then(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    });
}

// Elegant completion animation - professional and smooth
async function createCompletionAnimation(button, materialName) {
    // Phase 1: Gentle press feedback with gooey morphing
    await animate(button, {
        scale: [1, 0.97, 1.02],
        filter: ["brightness(1)", "brightness(1.05)"],
        borderRadius: ["var(--radius-md)", "var(--radius-lg)"]
    }, {
        duration: animationConfig.timing.fast,
        easing: animationConfig.easing.gooey
    });
    
    // Phase 2: Smooth state transition
    button.textContent = '✓ Completed';
    
    // Elegant gradient transition
    await animate(button, {
        background: [
            button.style.background || 'var(--success)',
            'linear-gradient(135deg, #10b981, #059669)'
        ],
        scale: [1.02, 1],
        boxShadow: [
            "0 2px 8px rgba(0,0,0,0.08)",
            "0 8px 24px rgba(16, 185, 129, 0.25)"
        ]
    }, {
        duration: animationConfig.timing.medium,
        easing: animationConfig.easing.morphing
    });
    
    // Phase 3: Subtle success pulse
    await animate(button, {
        scale: [1, 1.03, 1],
        filter: ["brightness(1.05)", "brightness(1.1)", "brightness(1.05)"]
    }, {
        duration: animationConfig.timing.medium,
        easing: animationConfig.easing.elastic
    });
    
    // Elegant completion toast
    await createToast(
        `✨ "${materialName}" completed successfully`,
        'success',
        2500,
        materialName
    );
}

// Elegant card completion - subtle professional feedback
function createCardCompletionCelebration(card, progressCircle, materialName) {
    // Phase 1: Gentle card acknowledgment with gooey feel
    animate(card, {
        scale: [1, 1.03, 1],
        filter: ["brightness(1)", "brightness(1.08)", "brightness(1.02)"],
        boxShadow: [
            "0 2px 8px rgba(0,0,0,0.08)", 
            "0 8px 24px rgba(16, 185, 129, 0.2)",
            "0 4px 16px rgba(16, 185, 129, 0.1)"
        ]
    }, {
        duration: animationConfig.timing.medium,
        easing: animationConfig.easing.gooey
    });
    
    // Phase 2: Smooth progress circle enhancement
    animate(progressCircle, {
        filter: [
            "drop-shadow(0 0 0px var(--success))",
            "drop-shadow(0 0 6px var(--success))",
            "drop-shadow(0 0 2px var(--success))"
        ]
    }, {
        duration: animationConfig.timing.slow,
        easing: animationConfig.easing.smooth
    });
    
    // Phase 3: Elegant completion pulse
    setTimeout(() => {
        animUtils.pulse(card, { scale: animationConfig.scale.micro });
    }, 200);
}

// Enhanced ship switching toast with dual ship icons
async function createShipSwitchToast(fromShip, toShip, type = 'info', duration = 4000) {
    const toastContainer = getToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `ship-switch-toast toast-${type}`;
    toast.style.cssText = `
        background: ${type === 'success' ? 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)' : 
                    type === 'info' ? 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)' : 
                    'linear-gradient(135deg, #f87171 0%, #dc2626 100%)'};
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        margin-bottom: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        transform: translateX(100%);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
        border: 2px solid rgba(255, 255, 255, 0.2);
        font-weight: 600;
        font-size: 14px;
        line-height: 1.4;
        position: relative;
        overflow: hidden;
        min-width: 360px;
        max-width: 450px;
    `;
    
    // Create content container
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'display: flex; align-items: center; gap: 12px;';
    
    // Create dual ship icon container
    const iconsContainer = document.createElement('div');
    iconsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    `;
    
    // From ship icon
    if (fromShip && ships.includes(fromShip)) {
        try {
            const fromIcon = await iconLoader.createIcon(fromShip, "md", { clickable: false, interactive: false });
            fromIcon.style.cssText = `
                width: 22px;
                height: 22px;
                border-radius: 4px;
                filter: brightness(0.8) saturate(0.8);
                opacity: 0.7;
                border: 1px solid rgba(255, 255, 255, 0.3);
            `;
            iconsContainer.appendChild(fromIcon);
        } catch (error) {
            // Fallback for from ship
            const fallbackFrom = document.createElement('div');
            fallbackFrom.innerHTML = '⚓';
            fallbackFrom.style.cssText = 'font-size: 16px; opacity: 0.7;';
            iconsContainer.appendChild(fallbackFrom);
        }
    }
    
    // Arrow separator
    const arrow = document.createElement('div');
    arrow.innerHTML = '→';
    arrow.style.cssText = 'font-size: 16px; font-weight: bold; color: rgba(255, 255, 255, 0.9);';
    iconsContainer.appendChild(arrow);
    
    // To ship icon (highlighted)
    if (toShip && ships.includes(toShip)) {
        try {
            const toIcon = await iconLoader.createIcon(toShip, "md", { clickable: false, interactive: false });
            toIcon.style.cssText = `
                width: 24px;
                height: 24px;
                border-radius: 4px;
                filter: brightness(1.2) saturate(1.2);
                border: 2px solid rgba(255, 255, 255, 0.6);
                box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
            `;
            iconsContainer.appendChild(toIcon);
        } catch (error) {
            // Fallback for to ship
            const fallbackTo = document.createElement('div');
            fallbackTo.innerHTML = '🚢';
            fallbackTo.style.cssText = 'font-size: 18px;';
            iconsContainer.appendChild(fallbackTo);
        }
    }
    
    // Create message span
    const messageSpan = document.createElement('span');
    messageSpan.textContent = `Switching from "${fromShip}" to "${toShip}"...`;
    
    contentDiv.appendChild(iconsContainer);
    contentDiv.appendChild(messageSpan);
    toast.appendChild(contentDiv);
    
    // Add progress bar for timed toasts
    if (duration > 0) {
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: rgba(255, 255, 255, 0.6);
            width: 100%;
            transform-origin: left;
            animation: toastProgress ${duration}ms linear forwards;
        `;
        toast.appendChild(progressBar);
    }
    
    toastContainer.appendChild(toast);
    
    // Elegant ship switch entrance with fluid morphing
    animate(toast, {
        x: [350, 0],
        scale: [0.9, 1.02, 1],
        opacity: [0, 1],
        filter: ["blur(2px)", "blur(0px)"]
    }, {
        duration: animationConfig.timing.slow,
        easing: animationConfig.easing.morphing
    });
    
    // Click to dismiss with elegant feedback
    toast.addEventListener('click', () => {
        // Gentle acknowledgment before dismiss
        animUtils.pulse(toast, { scale: animationConfig.scale.small })
            .then(() => dismissToast(toast));
    });
    
    // Auto dismiss after duration
    if (duration > 0) {
        setTimeout(() => {
            dismissToast(toast);
        }, duration);
    }
    
    return toast;
}

// Ship switching functionality
async function handleShipSwitch(newShip, previousShip, clickEvent = null) {
    try {
        // Immediate feedback with dual ship icons
        await createShipSwitchToast(previousShip, newShip, 'info', 2000);
        
        // Add loading state to the clicked item
        if (clickEvent) {
            const clickedItem = clickEvent.target.closest('.modal-material-item');
            if (clickedItem) {
                clickedItem.style.opacity = '0.6';
                clickedItem.style.pointerEvents = 'none';
            }
        }
        
        // Close the modal with smooth transition (if modal is open)
        const modal = document.getElementById('recipe-modal');
        if (modal && !modal.classList.contains('hidden')) {
            await smoothCloseModal();
        }
        
        // Perform the ship switch
        await selectShip(newShip);
        
        // Success feedback with detailed information and ship icon
        const previousProgress = getShipProgress(previousShip);
        const newProgress = getShipProgress(newShip);
        
        await createToast(
            `Successfully switched to "${newShip}"! Previous progress on "${previousShip}": ${previousProgress.toFixed(1)}%`, 
            'success', 
            5000,
            newShip
        );
        
        // Optional: Show progress comparison if both ships have progress
        if (previousProgress > 0 && newProgress > 0) {
            setTimeout(async () => {
                await createToast(
                    `"${newShip}" current progress: ${newProgress.toFixed(1)}%`, 
                    'info', 
                    3000,
                    newShip
                );
            }, 1000);
        }
        
    } catch (error) {
        await createToast(`Failed to switch ships: ${error.message}`, 'error', 5000);
    }
}

async function smoothCloseModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('recipe-modal');
        const modalContent = modal.querySelector('.recipe-modal-content');
        
        if (modalContent) {
            // Gooey morphing close animation
            animate(modalContent, {
                scale: [1, 1.05, 0.8],
                opacity: [1, 0.7, 0],
                rotate: [0, -3, 5],
                filter: ["blur(0px)", "blur(4px)"]
            }, {
                duration: 0.5,
                easing: "cubic-bezier(0.55, 0.055, 0.675, 0.19)"
            }).then(() => {
                hideRecipeModal();
                resolve();
            });
        } else {
            hideRecipeModal();
            resolve();
        }
    });
}

function getShipProgress(shipName) {
    if (!(shipName in recipes)) {
        return 0;
    }
    
    const flattenedMaterials = flattenRecipeRequirements(shipName);
    
    // Calculate total items dynamically based on current flattened materials
    let totalItems = 0;
    for (const [materialName, requiredQty] of flattenedMaterials) {
        totalItems += requiredQty;
    }
    
    if (totalItems === 0) {
        return 0;
    }
    
    let completedItems = 0;
    for (const [materialName, requiredQty] of flattenedMaterials) {
        const totalStoredQty = getTotalStoredQuantity(materialName, shipName);
        const actualCompleted = Math.min(totalStoredQty, requiredQty);
        completedItems += actualCompleted;
    }
    
    return (completedItems / totalItems) * 100;
}

function showTooltip(element, content, x, y) {
    const tooltip = createTooltip();
    tooltip.innerHTML = content;
    tooltip.style.display = 'block';
    tooltip.style.opacity = '0';
    
    // Position tooltip (need to calculate position before making it visible)
    const rect = element.getBoundingClientRect();
    
    // Set initial position to calculate tooltip dimensions
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    
    // Force layout recalculation to get tooltip dimensions
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Default position: above the element
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    let top = rect.top - tooltipRect.height - 8;
    
    // Adjust if tooltip would go off screen
    if (left < 8) left = 8;
    if (left + tooltipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - tooltipRect.width - 8;
    }
    if (top < 8) {
        // Show below if no room above
        top = rect.bottom + 8;
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    
    // Fade in
    setTimeout(() => {
        tooltip.style.opacity = '1';
    }, 10);
}

function hideTooltip() {
    const tooltip = document.getElementById('material-tooltip');
    if (tooltip && tooltip.style.display !== 'none') {
        tooltip.style.opacity = '0';
        setTimeout(() => {
            tooltip.style.display = 'none';
        }, 200);
    }
}

async function addTooltipToBadge(badge, materialName, type, barterSubtype = null) {
    let content = '';
    let cachedBarterContent = null;
    
    if (type === 'vendor' && materialName in items) {
        const vendorInfo = items[materialName];
        content = `<div style="font-weight: 600; color: var(--info); margin-bottom: 8px;">📦 Acquisition Information</div>`;
        content += `<div style="font-weight: 500; margin-bottom: 6px;">${materialName}</div>`;
        content += `<div style="color: var(--text-secondary);">`;
        
        // Handle the new structured format with categorized acquisition methods
        for (const [methodType, sources] of Object.entries(vendorInfo)) {
            content += `<div style="margin-bottom: 4px;"><strong>${methodType}:</strong></div>`;
            sources.forEach(source => {
                content += `• ${source}<br>`;
            });
        }
        content += `</div>`;
    } else if (type === 'barter' && (materialName in shipbarters || materialName in barters)) {
        // Use the specific barter subtype to get the correct data
        if (barterSubtype === 'ship' && materialName in shipbarters) {
            const barterInfo = shipbarters[materialName];
            content = await createBarterTooltipContent(materialName, barterInfo, 'ship');
        } else if (barterSubtype === 'trade' && materialName in barters) {
            const barterInfo = barters[materialName];
            content = await createBarterTooltipContent(materialName, barterInfo, 'trade');
        }
        cachedBarterContent = content;
    }
    
    // Add hover events
    badge.addEventListener('mouseenter', async (e) => {
        let tooltipContent = content;
        // For barter tooltips, use cached content or regenerate if not cached
        if (type === 'barter' && (materialName in shipbarters || materialName in barters)) {
            if (!cachedBarterContent) {
                if (barterSubtype === 'ship' && materialName in shipbarters) {
                    tooltipContent = await createBarterTooltipContent(materialName, shipbarters[materialName], 'ship');
                } else if (barterSubtype === 'trade' && materialName in barters) {
                    tooltipContent = await createBarterTooltipContent(materialName, barters[materialName], 'trade');
                }
                cachedBarterContent = tooltipContent;
            } else {
                tooltipContent = cachedBarterContent;
            }
        }
        showTooltip(badge, tooltipContent, e.clientX, e.clientY);
    });
    
    badge.addEventListener('mouseleave', () => {
        hideTooltip();
    });
    
    // Add click events for mobile/touch devices
    badge.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tooltip = document.getElementById('material-tooltip');
        if (!tooltip || tooltip.style.display === 'none' || tooltip.style.opacity === '0') {
            let tooltipContent = content;
            // For barter tooltips, use cached content or regenerate if not cached
            if (type === 'barter' && (materialName in shipbarters || materialName in barters)) {
                if (!cachedBarterContent) {
                    if (barterSubtype === 'ship' && materialName in shipbarters) {
                        tooltipContent = await createBarterTooltipContent(materialName, shipbarters[materialName], 'ship');
                    } else if (barterSubtype === 'trade' && materialName in barters) {
                        tooltipContent = await createBarterTooltipContent(materialName, barters[materialName], 'trade');
                    }
                    cachedBarterContent = tooltipContent;
                } else {
                    tooltipContent = cachedBarterContent;
                }
            }
            showTooltip(badge, tooltipContent, e.clientX, e.clientY);
            // Hide after 3 seconds on click
            setTimeout(hideTooltip, 3000);
        } else {
            hideTooltip();
        }
    });
}

async function createBarterTooltipContent(materialName, barterInfo, barterType = 'ship') {
    const isShipBarter = barterType === 'ship';
    const icon = isShipBarter ? '⚓' : '🔄';
    const title = isShipBarter ? 'Ship Material Barter Information' : 'Trade Item Barter Information';
    const color = isShipBarter ? 'var(--accent-primary)' : 'var(--warning)';
    
    let content = `<div style="font-weight: 600; color: ${color}; margin-bottom: 8px;">${icon} ${title}</div>`;
    content += `<div style="font-weight: 500; margin-bottom: 6px;">${materialName}</div>`;
    content += `<div style="color: var(--text-secondary);">`;
    
    for (let index = 0; index < barterInfo.length; index++) {
        const barter = barterInfo[index];
        if (index > 0) content += `<br><br>`;
        content += `<div style="margin-bottom: 8px;"><strong>Trade ${barter.count}x for:</strong></div>`;
        
        for (const item of barter.input) {
            // Create icon for each barter item
            try {
                const iconElement = await createItemIcon(item, "sm");
                // Ensure icon has proper styling for tooltip
                iconElement.style.cssText = 'width: 20px; height: 20px; flex-shrink: 0; border-radius: 2px;';
                const iconHtml = iconElement.outerHTML;
                content += `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">`;
                content += iconHtml;
                content += `<span style="flex: 1;">${item}</span>`;
                content += `</div>`;
            } catch (error) {
                // Fallback if icon fails to load - use a simple icon placeholder
                content += `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">`;
                content += `<div style="width: 20px; height: 20px; background: var(--bg-secondary); border-radius: 2px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 10px;">?</div>`;
                content += `<span style="flex: 1;">${item}</span>`;
                content += `</div>`;
            }
        }
    }
    content += `</div>`;
    return content;
}

// Global tooltip event listeners
document.addEventListener('click', (e) => {
    // Hide tooltip when clicking outside of badges
    if (!e.target.classList.contains('badge')) {
        hideTooltip();
    }
});

document.addEventListener('scroll', hideTooltip);
window.addEventListener('resize', hideTooltip);

// Storage utility functions
function setStorage(key, val) {
    localStorage.setItem(`${storageKey}-${key}`, val);
}

function getStorage(key) {
    return localStorage.getItem(`${storageKey}-${key}`) || "";
}

function checkStorage(key) {
    return localStorage.getItem(`${storageKey}-${key}`) !== null;
}

// Material categorization
function categorizeMaterial(materialName) {
    // Check if this material has a recipe (excluding ships)
    if (recipes[materialName] && !ships.includes(materialName)) {
        return 'recipes';
    }
    
    // Everything else is basic materials
    return 'basic';
}

function getAcquisitionMethods(materialName) {
    const methods = [];
    
    if (coins[materialName]) {
        methods.push(['coins', 'Crow Coins', coins[materialName]]);
    }
    
    if (items[materialName]) {
        const itemData = items[materialName];
        // Handle the new structured format with categorized acquisition methods
        for (const [methodType, sources] of Object.entries(itemData)) {
            let sourceInfo;
            if (Array.isArray(sources)) {
                // Old format: array of source names
                sourceInfo = sources.join(', ');
            } else {
                // New format: object with source names as keys
                sourceInfo = Object.keys(sources).join(', ');
            }
            methods.push(['vendor', methodType, sourceInfo]);
        }
    }
    
    if (recipes[materialName] && !ships.includes(materialName)) {
        methods.push(['recipe', 'Recipe', 'Craftable']);
    }
    
    if (barters[materialName]) {
        methods.push(['barter', 'Trade Item Barter', 'Barter Exchange']);
    }
    
    if (shipbarters[materialName]) {
        methods.push(['barter', 'Ship Material Barter', 'Ship Material Barter']);
    }
    
    return methods;
}

async function createItemIcon(itemName, size = "md", acquisitionMethod = null) {
    return await iconLoader.createMaterialIcon(itemName, size, acquisitionMethod);
}

async function createMaterialCard(materialName, requiredQuantity, currentQuantity = 0, originalPartName = null) {
    const card = document.createElement('div');
    card.className = 'material-card';
    
    // Determine if this is an enhanced item
    const isEnhanced = materialName.includes('+');
    const maxValue = requiredQuantity;
    const displayName = isEnhanced && materialName.startsWith('+10 ') 
        ? materialName.substring(4) 
        : materialName;
    
    // Header with icon and info
    const header = document.createElement('div');
    header.className = 'material-card-header';
    
    // Get icon info for potential BDO Codex link
    const iconInfo = iconLoader.getIconInfo(displayName);
    const hasUrl = iconInfo && iconInfo.url;
    
    if (hasUrl) {
        // Create clickable icon container
        const iconContainer = document.createElement('a');
        iconContainer.href = iconInfo.url;
        iconContainer.target = '_blank';
        iconContainer.rel = 'noopener noreferrer';
        iconContainer.style.cssText = `
            text-decoration: none; 
            color: inherit;
            cursor: pointer;
            border-radius: var(--radius-sm);
            padding: 2px;
            transition: background-color 0.2s ease;
            display: block;
        `;
        
        // Add hover effect to icon only
        iconContainer.addEventListener('mouseenter', () => {
            iconContainer.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
        });
        iconContainer.addEventListener('mouseleave', () => {
            iconContainer.style.backgroundColor = 'transparent';
        });
        iconContainer.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Create icon with acquisition method styling (non-clickable, part of the link)
        const methods = getAcquisitionMethods(materialName);
        const primaryMethod = methods.length > 0 ? methods[0][0] : null;
        const icon = await iconLoader.createIcon(displayName, "xl", { clickable: false, interactive: false });
        icon.classList.add("material-icon-large");
        iconContainer.appendChild(icon);
        header.appendChild(iconContainer);
    } else {
        // Non-clickable icon for items without URLs
        const methods = getAcquisitionMethods(materialName);
        const primaryMethod = methods.length > 0 ? methods[0][0] : null;
        const icon = await createItemIcon(displayName, "xl", primaryMethod);
        icon.classList.add("material-icon-large");
        header.appendChild(icon);
    }
    
    // Material info section (always present, separate from icon)
    const info = document.createElement('div');
    info.className = 'material-card-info';
    
    // Title with potential clickable link
    if (hasUrl) {
        const titleLink = document.createElement('a');
        titleLink.href = iconInfo.url;
        titleLink.target = '_blank';
        titleLink.rel = 'noopener noreferrer';
        titleLink.className = 'material-card-title';
        
        // Create title with enhancement buttons outside the link
        if (isEnhanceableItem(materialName)) {
            const enhancementLevel = getCurrentEnhancementLevel(materialName, currentShip);
            const baseName = materialName.replace(/^\+\d+\s+/, '');
            
            // Create container for buttons + link
            const titleContainer = document.createElement('div');
            titleContainer.style.cssText = 'display: flex; align-items: center; gap: 4px;';
            
            // Add enhancement buttons first (outside the link)
            const inlineButtons = createInlineEnhancementButtons(materialName, currentShip);
            if (inlineButtons) {
                titleContainer.appendChild(inlineButtons);
            }
            
            // Create the enhanced name text for the link
            const finalText = enhancementLevel > 0 
                ? (isEnhanced ? `+${enhancementLevel} ${baseName} (x${requiredQuantity})` : `+${enhancementLevel} ${baseName}`)
                : (isEnhanced ? `${baseName} (x${requiredQuantity})` : baseName);
            
            titleLink.textContent = finalText;
            titleLink.style.cssText = `
                text-decoration: none; 
                color: inherit;
                cursor: pointer;
                transition: color 0.2s ease;
            `;
            titleLink.addEventListener('mouseenter', () => {
                titleLink.style.color = 'var(--accent-primary)';
            });
            titleLink.addEventListener('mouseleave', () => {
                titleLink.style.color = 'inherit';
            });
            titleLink.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            titleContainer.appendChild(titleLink);
            
            // Replace the info appendChild with container
            info.appendChild(titleContainer);
            // Continue with the rest of the function
        } else {
            // Non-enhanceable item, use simple text
            titleLink.textContent = isEnhanced ? `${materialName} (x${requiredQuantity})` : materialName;
            
            titleLink.style.cssText = `
                text-decoration: none; 
                color: inherit;
                cursor: pointer;
                transition: color 0.2s ease;
            `;
            titleLink.addEventListener('mouseenter', () => {
                titleLink.style.color = 'var(--accent-primary)';
            });
            titleLink.addEventListener('mouseleave', () => {
                titleLink.style.color = 'inherit';
            });
            titleLink.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            info.appendChild(titleLink);
        }
    } else {
        const title = document.createElement('div');
        title.className = 'material-card-title';
        
        // Create title with enhancement buttons first
        if (isEnhanceableItem(materialName)) {
            const enhancementLevel = getCurrentEnhancementLevel(materialName, currentShip);
            const baseName = materialName.replace(/^\+\d+\s+/, '');
            
            // Create container for buttons + title
            const titleContainer = document.createElement('div');
            titleContainer.style.cssText = 'display: flex; align-items: center; gap: 4px;';
            
            // Add enhancement buttons first
            const inlineButtons = createInlineEnhancementButtons(materialName, currentShip);
            if (inlineButtons) {
                titleContainer.appendChild(inlineButtons);
            }
            
            // Create the enhanced name text
            const finalText = enhancementLevel > 0 
                ? (isEnhanced ? `+${enhancementLevel} ${baseName} (x${requiredQuantity})` : `+${enhancementLevel} ${baseName}`)
                : (isEnhanced ? `${baseName} (x${requiredQuantity})` : baseName);
            
            title.textContent = finalText;
            titleContainer.appendChild(title);
            
            // Replace the info appendChild with container
            info.appendChild(titleContainer);
        } else {
            // Non-enhanceable item, use simple text
            title.textContent = isEnhanced ? `${materialName} (x${requiredQuantity})` : materialName;
            info.appendChild(title);
        }
    }
    
    // Acquisition method badges
    const meta = document.createElement('div');
    meta.className = 'material-card-meta';
    
    // Add ship indicator badge first if this is a ship material
    if (ships.includes(displayName)) {
        const shipBadge = document.createElement('span');
        shipBadge.className = 'badge badge-ship';
        shipBadge.textContent = '🚢 Ship Material';
        shipBadge.style.cssText = `
            background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
            color: white;
            border: 1px solid #3b82f6;
            font-weight: 700;
            order: -2;
            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        `;
        shipBadge.title = 'This material is a ship - can be selected for tracking';
        meta.appendChild(shipBadge);
    }
    
    const acquisitionMethods = getAcquisitionMethods(materialName);
    for (const [methodType, methodName] of acquisitionMethods) {
        const badge = document.createElement('span');
        badge.className = `badge badge-${methodType}`;
        badge.textContent = methodName;
        
        // Add modal functionality for vendor and barter badges
        if (methodType === 'vendor' && materialName in items) {
            badge.style.cursor = 'pointer';
            badge.title = 'Click for acquisition details';
            badge.addEventListener('click', async (event) => {
                event.stopPropagation(); // Prevent triggering parent click events
                const itemData = items[materialName];
                const methodSources = itemData[methodName] || [];
                await showAcquisitionModal(materialName, methodName, methodSources);
            });
        } else if (methodType === 'barter' && (materialName in shipbarters || materialName in barters)) {
            badge.style.cursor = 'pointer';
            badge.title = 'Click for barter details';
            // Determine which barter type this specific badge represents
            const barterSubtype = methodName === 'Trade Item Barter' ? 'trade' : 'ship';
            badge.addEventListener('click', async (event) => {
                event.stopPropagation(); // Prevent triggering parent click events
                // Use proper modal instead of tooltip
                const barterInfo = barterSubtype === 'ship' ? shipbarters[materialName] : barters[materialName];
                await showBarterModal(materialName, barterSubtype, barterInfo);
            });
        }
        
        meta.appendChild(badge);
    }
    info.appendChild(meta);
    header.appendChild(info);
    card.appendChild(header);
    
    // Progress section
    const progressSection = document.createElement('div');
    progressSection.className = 'progress-section';
    
    // Controls container
    const controls = document.createElement('div');
    controls.className = 'progress-controls';
    
    // Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'progress-input-row';
    
    // Label on the left
    const label = document.createElement('span');
    label.textContent = "Quantity:";
    label.style.cssText = "font-size: 14px; color: var(--text-secondary); font-weight: 500;";
    inputRow.appendChild(label);
    
    // Centered controls group
    const controlsGroup = document.createElement('div');
    controlsGroup.className = 'quantity-controls-group';
    
    // Check if this is a recipe material
    const isRecipeMaterial = materialName in recipes && !ships.includes(materialName);
    
    // Only create buttons for non-recipe materials
    let btnMinus, btnPlus;
    if (!isRecipeMaterial) {
        // Quick decrease button
        btnMinus = document.createElement('button');
        btnMinus.className = 'quick-btn';
        btnMinus.textContent = '-';
        
        // Add elegant gooey hover animation
        animUtils.gooeyHover(btnMinus, { scale: animationConfig.scale.medium, intensity: 'fast' });
        
        controlsGroup.appendChild(btnMinus);
    }
    
    // Quantity input (always present)
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.value = currentQuantity;
    quantityInput.min = '0';
    quantityInput.max = maxValue;
    quantityInput.className = 'quantity-input';
    // Use the original part name for storage ID, or fall back to material name
    const partForStorage = originalPartName || materialName;
    quantityInput.id = `modern-${currentShip}-${partForStorage}`;
    controlsGroup.appendChild(quantityInput);
    
    if (!isRecipeMaterial) {
        // Quick increase button
        btnPlus = document.createElement('button');
        btnPlus.className = 'quick-btn';
        btnPlus.textContent = '+';
        
        // Add elegant gooey hover animation  
        animUtils.gooeyHover(btnPlus, { scale: animationConfig.scale.medium, intensity: 'fast' });
        
        controlsGroup.appendChild(btnPlus);
    }
    
    inputRow.appendChild(controlsGroup);
    
    // Max quantity label on the right
    const maxLabel = document.createElement('span');
    maxLabel.textContent = `/ ${requiredQuantity}`;
    maxLabel.style.cssText = "font-size: 14px; color: var(--text-secondary); font-weight: 500;";
    inputRow.appendChild(maxLabel);
    
    controls.appendChild(inputRow);
    
    // Circular progress
    let progressPercentage;
    if (displayName in recipes && !ships.includes(displayName)) {
        progressPercentage = calculateSubRecipeProgress(displayName);
    } else {
        progressPercentage = maxValue > 0 ? (currentQuantity / maxValue * 100) : 0;
    }
    
    const circumference = 2 * Math.PI * 30; // radius = 30 (for 72px circle)
    const strokeDashoffset = circumference - (progressPercentage / 100 * circumference);
    
    // Create circular progress
    const circularProgress = document.createElement('div');
    circularProgress.className = 'circular-progress';
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 72 72");
    svg.style.width = "100%";
    svg.style.height = "100%";
    
    // Background circle
    const circleBg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circleBg.setAttribute("cx", "36");
    circleBg.setAttribute("cy", "36");
    circleBg.setAttribute("r", "30");
    circleBg.setAttribute("class", "progress-bg");
    
    // Progress circle
    const circleFill = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circleFill.setAttribute("cx", "36");
    circleFill.setAttribute("cy", "36");
    circleFill.setAttribute("r", "30");
    circleFill.setAttribute("class", "progress-fill");
    
    // Set up circle with proper stroke-dasharray and immediate visibility
    // Use SVG attributes (more reliable than CSS for SVG elements)
    circleFill.setAttribute('stroke-dasharray', `${circumference} ${circumference}`);
    
    // Add completed class and set progress if 100%
    if (progressPercentage >= 100) {
        circleFill.classList.add('completed');
        circleFill.setAttribute('stroke-dashoffset', '0');
    } else {
        // Set immediate progress for partial completion (0-99%)
        circleFill.setAttribute('stroke-dashoffset', strokeDashoffset.toString());
    }
    
    // Also set as style for better compatibility
    circleFill.style.strokeDasharray = `${circumference} ${circumference}`;
    circleFill.style.strokeDashoffset = progressPercentage >= 100 ? '0' : strokeDashoffset.toString();
    
    svg.appendChild(circleBg);
    svg.appendChild(circleFill);
    circularProgress.appendChild(svg);
    
    // Animation removed to fix initial visibility - circles now appear immediately with correct progress
    // For 0% progress, the circle should already be set to full strokeDashoffset (invisible)
    // For 100% progress, the circle should already be set to 0 strokeDashoffset (full circle)
    
    const progressText = document.createElement('div');
    progressText.className = progressPercentage >= 100 ? 'progress-text completed' : 'progress-text';
    
    // Start with 0% for animation
    progressText.textContent = '0%';
    circularProgress.appendChild(progressText);
    
    // Animate percentage counter
    setTimeout(() => {
        const targetValue = progressPercentage >= 100 ? 100 : Math.floor(progressPercentage * 1000) / 1000;
        let currentValue = 0;
        
        const counter = setInterval(() => {
            currentValue += targetValue / 60; // Animate over ~1 second
            if (currentValue >= targetValue) {
                currentValue = targetValue;
                clearInterval(counter);
            }
            progressText.textContent = currentValue >= 100 ? '100%' : `${Math.floor(currentValue * 10) / 10}%`;
        }, 16); // ~60fps
    }, 400);
    
    // Set initial completed state for circle
    if (progressPercentage >= 100) {
        circleFill.classList.add('completed');
        // Set full circle stroke for completed state
        const fullCircumference = 2 * Math.PI * 30;
        circleFill.style.strokeDasharray = `${fullCircumference} ${fullCircumference}`;
        circleFill.style.strokeDashoffset = 0;
    }
    
    // Circle row
    const circleRow = document.createElement('div');
    circleRow.className = 'progress-circle-row';
    circleRow.appendChild(circularProgress);
    
    controls.appendChild(circleRow);
    progressSection.appendChild(controls);
    
    card.appendChild(progressSection);
    
    // Add crow coins display for base materials (not recipes)
    if (!(materialName in recipes) && materialName in coins) {
        const coinInfo = document.createElement('div');
        coinInfo.className = 'coin-info';
        coinInfo.style.cssText = 'padding: 8px 12px; font-size: 12px; color: var(--text-secondary); text-align: center; background: rgba(255, 215, 0, 0.1); border-radius: 4px; margin-top: 8px;';
        
        const coinPrice = coins[materialName];
        const totalCoins = coinPrice * currentQuantity;
        coinInfo.textContent = `💰 ${coinPrice.toLocaleString()} coins/unit • ${totalCoins.toLocaleString()} total`;
        
        card.appendChild(coinInfo);
    }
    
    // Check if this material is a ship that can be switched to
    if (ships.includes(displayName)) {
        card.classList.add("has-ship");
        card.style.cursor = 'pointer';
        
        // Add special styling for ship materials
        card.style.background = 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(74, 158, 255, 0.08) 100%)';
        card.style.borderLeft = '4px solid rgba(74, 158, 255, 0.6)';
        card.style.transition = 'all var(--transition-fast)';
        
        // Add ship switching click handler
        card.addEventListener('click', async (event) => {
            // Prevent triggering when clicking on controls
            if (event.target.closest('.progress-input-row') || event.target.closest('button') || event.target.closest('a')) {
                return;
            }
            await handleShipSwitch(displayName, currentShip, event);
        });
        
        // Add elegant gooey hover effects for ship materials  
        animUtils.gooeyHover(card, { scale: animationConfig.scale.small, intensity: 'medium' });
        
        // Add tooltip for ship materials
        card.title = `🚢 Click to switch from "${currentShip}" to "${displayName}"`;
        
    } else if (materialName in recipes && !ships.includes(materialName)) {
        card.classList.add("has-recipe");
        card.style.cursor = 'pointer';
        
        // Recipe materials have disabled quantity input (no buttons)
        // Users should manage quantities through the recipe modal, not the main cards
        inputRow.style.opacity = '0.5';
        inputRow.style.pointerEvents = 'none';
        quantityInput.disabled = true;
        
        // Make entire card clickable for recipe modal
        card.addEventListener('click', async (event) => {
            // Prevent triggering when clicking on controls or links
            if (event.target.closest('.progress-input-row') || event.target.closest('a')) {
                return;
            }
            await showRecipeModal(materialName);
        });
    } else {
        // For basic materials (non-recipes), add complete button
        const completeBtn = document.createElement('button');
        completeBtn.className = 'quick-btn complete-btn';
        completeBtn.innerHTML = '✓';
        completeBtn.title = 'Complete - Set to required amount';
        completeBtn.style.cssText = `
            background: var(--success);
            color: white;
            margin-left: var(--space-sm);
            border-radius: var(--radius-sm);
            transition: all var(--transition-normal);
        `;
        
        // Add hover effect
        completeBtn.addEventListener('mouseenter', () => {
            completeBtn.style.background = 'var(--success-dark)';
            completeBtn.style.transform = 'scale(1.05)';
        });
        completeBtn.addEventListener('mouseleave', () => {
            completeBtn.style.background = 'var(--success)';
            completeBtn.style.transform = 'scale(1)';
        });
        
        // Complete button functionality
        completeBtn.addEventListener('click', () => {
            quantityInput.value = maxValue;
            updateQuantity(0); // Trigger the update logic
        });
        
        // Hide complete button if already at max quantity
        if (currentQuantity >= maxValue) {
            completeBtn.style.display = 'none';
        }
        
        controlsGroup.appendChild(completeBtn);
    }
    
    // Bind quantity update events (only for non-recipe materials)
    function updateQuantity(delta) {
        const current = parseInt(quantityInput.value) || 0;
        const newValue = Math.max(0, Math.min(maxValue, current + delta));
        quantityInput.value = newValue;
        
        // Update storage
        setStorage(quantityInput.id.replace('modern-', ''), newValue.toString());
        
        // Update ship selector progress in real-time
        updateShipSelectorProgress();
        
        // Calculate new percentage (this is only for basic materials now)
        const newPercentage = maxValue > 0 ? (newValue / maxValue * 100) : 0;
        
        const newOffset = circumference - (newPercentage / 100 * circumference);
        
        // Animate progress change with spring physics
        animate(circleFill, 
            { strokeDashoffset: newOffset },
            { 
                duration: 0.8,
                easing: "cubic-bezier(0.68, -0.55, 0.265, 1.55)"
            }
        );
        
        // Animate text change
        const startValue = parseFloat(progressText.textContent) || 0;
        const targetValue = newPercentage >= 100 ? 100 : Math.floor(newPercentage * 1000) / 1000;
        
        let currentValue = startValue;
        const increment = (targetValue - startValue) / 30; // Animate over ~0.5 seconds
        
        const textCounter = setInterval(() => {
            currentValue += increment;
            if ((increment > 0 && currentValue >= targetValue) || (increment < 0 && currentValue <= targetValue)) {
                currentValue = targetValue;
                clearInterval(textCounter);
            }
            progressText.textContent = currentValue >= 100 ? '100%' : `${Math.floor(currentValue * 10) / 10}%`;
        }, 16);
        
        // Update completed class with achievement effects
        const wasCompleted = circleFill.classList.contains('completed');
        const isNowCompleted = newPercentage >= 100;
        
        if (isNowCompleted) {
            circleFill.classList.add('completed');
            progressText.className = 'progress-text completed';
            
            // Set full circle stroke for completed state
            const circumference = 2 * Math.PI * 30;
            circleFill.style.strokeDasharray = `${circumference} ${circumference}`;
            circleFill.style.strokeDashoffset = 0;
            
            // Achievement celebration animation if newly completed
            if (!wasCompleted) {
                // Epic card completion celebration
                createCardCompletionCelebration(card, circleFill, displayName);
            }
            
            // Add completed class to any progress bars in the same card
            const progressBars = card.querySelectorAll('.progress-fill');
            progressBars.forEach(bar => {
                if (bar !== circleFill) {
                    bar.classList.add('completed');
                }
            });
            
            // Trigger celebration if just completed
            if (!wasCompleted && isNowCompleted) {
                card.classList.add('celebration-burst');
                setTimeout(() => {
                    card.classList.remove('celebration-burst');
                }, 800);
            }
        } else {
            circleFill.classList.remove('completed');
            progressText.className = 'progress-text';
            
            // Remove completed class from progress bars
            const progressBars = card.querySelectorAll('.progress-fill');
            progressBars.forEach(bar => {
                if (bar !== circleFill) {
                    bar.classList.remove('completed');
                }
            });
        }
        
        // Update crow coins display if present
        const coinInfo = card.querySelector('.coin-info');
        if (coinInfo && materialName in coins) {
            const coinPrice = coins[materialName];
            const totalCoins = coinPrice * newValue;
            coinInfo.textContent = `💰 ${coinPrice.toLocaleString()} coins/unit • ${totalCoins.toLocaleString()} total`;
        }
        
        // Show/hide complete button for basic materials
        const completeBtn = controlsGroup.querySelector('.complete-btn');
        if (completeBtn) {
            if (newValue >= maxValue) {
                completeBtn.style.display = 'none';
            } else {
                completeBtn.style.display = 'block';
            }
        }
        
        // Update overall progress and sync all UI elements
        updateOverallProgress();
        syncMaterialAcrossAllTabs(displayName);
    }
    
    // Only add event listeners for buttons that exist (non-recipe materials)
    if (btnMinus && btnPlus) {
        btnMinus.addEventListener('click', () => updateQuantity(-1));
        btnPlus.addEventListener('click', () => updateQuantity(1));
        quantityInput.addEventListener('change', () => updateQuantity(0));
    }
    
    return card;
}

function calculateSubRecipeProgress(recipeName) {
    return calculateHybridRecipeProgress(recipeName, currentShip);
}

function calculateSubRecipeProgressForShip(recipeName, shipName) {
    return calculateHybridRecipeProgress(recipeName, shipName);
}

// Hybrid progress calculation for dual-level input system
function calculateHybridRecipeProgress(recipeName, shipName) {
    if (!(recipeName in recipes)) {
        return 0;
    }
    
    // Find parent recipe quantity from ship's recipe
    let parentQuantity = 1;
    if (shipName in recipes && recipeName in recipes[shipName]) {
        parentQuantity = recipes[shipName][recipeName];
    } else {
        // Check for +10 version
        const plus10Name = `+10 ${recipeName}`;
        if (shipName in recipes && plus10Name in recipes[shipName]) {
            parentQuantity = recipes[shipName][plus10Name];
        }
    }
    
    // Get completed items at recipe level
    const completedStorageId = `${shipName}-${recipeName}-completed`;
    const completedItems = parseInt(getStorage(completedStorageId)) || 0;
    
    // Calculate remaining needed
    const remainingNeeded = Math.max(0, parentQuantity - completedItems);
    
    // Start with progress from completed items
    let totalProgress = Math.min(completedItems, parentQuantity);
    
    // Add progress from raw materials for remaining items
    if (remainingNeeded > 0) {
        let rawMaterialProgress = 0;
        let totalRawNeeded = 0;
        
        for (const [material, quantity] of Object.entries(recipes[recipeName])) {
            const neededForRemaining = quantity * remainingNeeded;
            const storageId = `${shipName}-${recipeName}-${material}`;
            const currentRaw = parseInt(getStorage(storageId)) || 0;
            
            totalRawNeeded += neededForRemaining;
            rawMaterialProgress += Math.min(currentRaw, neededForRemaining);
        }
        
        const rawProgressRatio = totalRawNeeded > 0 ? rawMaterialProgress / totalRawNeeded : 0;
        totalProgress += rawProgressRatio * remainingNeeded;
    }
    
    const finalProgress = parentQuantity > 0 ? (totalProgress / parentQuantity) * 100 : 0;
    return Math.min(100, finalProgress);
}

// Helper function to get conversion info for completed items
function getRecipeConversionInfo(recipeName) {
    if (!(recipeName in recipes)) {
        return null;
    }
    
    const materials = Object.entries(recipes[recipeName]);
    if (materials.length === 1) {
        const [material, quantity] = materials[0];
        return {
            material,
            quantity,
            description: `1 ${recipeName} = ${quantity} ${material}`
        };
    } else {
        const total = materials.reduce((sum, [_, qty]) => sum + qty, 0);
        return {
            materials: materials,
            total,
            description: `1 ${recipeName} = ${total} materials total`
        };
    }
}

// Helper function to create completed item controls
async function createCompletedItemControls(materialName, parentQuantity) {
    const completedStorageId = `${currentShip}-${materialName}-completed`;
    const currentCompleted = parseInt(getStorage(completedStorageId)) || 0;
    
    const controls = document.createElement('div');
    controls.className = 'completed-item-controls';
    controls.style.cssText = `
        display: flex;
        align-items: center;
        gap: var(--space-md);
        background: rgba(34, 197, 94, 0.1);
        padding: var(--space-md);
        border-radius: var(--radius-md);
    `;
    
    // Icon
    const icon = await createItemIcon(materialName, "md");
    icon.style.cssText = 'width: 32px; height: 32px;';
    controls.appendChild(icon);
    
    // Info section
    const info = document.createElement('div');
    info.style.flex = '1';
    
    const title = document.createElement('div');
    title.textContent = `Finished ${materialName}s`;
    title.style.cssText = 'font-weight: 600; color: var(--text-primary); margin-bottom: 4px;';
    info.appendChild(title);
    
    const progress = document.createElement('div');
    const completedPercent = parentQuantity > 0 ? Math.min((currentCompleted / parentQuantity) * 100, 100) : 0;
    progress.textContent = `${currentCompleted} / ${parentQuantity} (${Math.floor(completedPercent)}%)`;
    progress.style.cssText = `color: ${completedPercent >= 100 ? 'var(--success)' : 'var(--text-secondary)'}; font-size: 14px;`;
    info.appendChild(progress);
    
    controls.appendChild(info);
    
    // Quantity controls
    const qtyControls = document.createElement('div');
    qtyControls.style.cssText = 'display: flex; align-items: center; gap: var(--space-sm);';
    
    const btnMinus = document.createElement('button');
    btnMinus.textContent = '-';
    btnMinus.className = 'quick-btn';
    btnMinus.style.cssText = 'width: 32px; height: 32px; background: var(--bg-secondary);';
    
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentCompleted;
    input.min = '0';
    input.max = parentQuantity;
    input.className = 'quantity-input';
    input.style.cssText = 'width: 80px; text-align: center;';
    
    const btnPlus = document.createElement('button');
    btnPlus.textContent = '+';
    btnPlus.className = 'quick-btn';
    btnPlus.style.cssText = 'width: 32px; height: 32px; background: var(--bg-secondary);';
    
    const completeBtn = document.createElement('button');
    completeBtn.textContent = '✓';
    completeBtn.className = 'quick-btn';
    completeBtn.style.cssText = `
        width: 32px; height: 32px; 
        background: var(--success); 
        color: white; 
        margin-left: var(--space-xs);
    `;
    
    // Update function for completed items
    function updateCompletedQuantity(delta) {
        const current = parseInt(input.value) || 0;
        const newValue = Math.max(0, Math.min(parentQuantity, current + delta));
        
        input.value = newValue;
        setStorage(completedStorageId, newValue.toString());
        
        // Smart material adjustment: adjust raw materials based on completed item changes
        if (newValue > current) {
            // User is increasing completed items - reduce raw materials to prevent double-counting
            const itemsAdded = newValue - current;
            for (const [subMaterial, subQuantity] of Object.entries(recipes[materialName])) {
                const storageId = `${currentShip}-${currentShip}-${subMaterial}`;
                const currentRaw = parseInt(getStorage(storageId)) || 0;
                const materialsToReduce = subQuantity * itemsAdded;
                const newRawValue = Math.max(0, currentRaw - materialsToReduce);
                setStorage(storageId, newRawValue.toString());
            }
        } else if (newValue < current) {
            // User is decreasing completed items - add materials back to raw material pool
            const itemsRemoved = current - newValue;
            for (const [subMaterial, subQuantity] of Object.entries(recipes[materialName])) {
                const storageId = `${currentShip}-${currentShip}-${subMaterial}`;
                const currentRaw = parseInt(getStorage(storageId)) || 0;
                const materialsToAdd = subQuantity * itemsRemoved;
                const newRawValue = currentRaw + materialsToAdd;
                setStorage(storageId, newRawValue.toString());
            }
        }
        
        // Update progress display
        const newPercent = parentQuantity > 0 ? Math.min((newValue / parentQuantity) * 100, 100) : 0;
        progress.textContent = `${newValue} / ${parentQuantity} (${Math.floor(newPercent)}%)`;
        progress.style.color = newPercent >= 100 ? 'var(--success)' : 'var(--text-secondary)';
        
        // Hide/show complete button
        completeBtn.style.display = newValue >= parentQuantity ? 'none' : 'block';
        
        // Update the modal progress
        updateHybridModalProgress(materialName);
        
        // Refresh the raw materials section with new quantities
        refreshRawMaterialsSection(materialName, parentQuantity);
        
        // Update main card progress
        updateOverallProgress();
        updateShipSelectorProgress();
        refreshAllMaterialCards();
    }
    
    btnMinus.addEventListener('click', () => updateCompletedQuantity(-1));
    btnPlus.addEventListener('click', () => updateCompletedQuantity(1));
    input.addEventListener('change', () => updateCompletedQuantity(0));
    completeBtn.addEventListener('click', () => {
        input.value = parentQuantity;
        updateCompletedQuantity(0);
    });
    
    // Hide complete button if already at max
    if (currentCompleted >= parentQuantity) {
        completeBtn.style.display = 'none';
    }
    
    qtyControls.appendChild(btnMinus);
    qtyControls.appendChild(input);
    qtyControls.appendChild(btnPlus);
    qtyControls.appendChild(completeBtn);
    
    controls.appendChild(qtyControls);
    
    return controls;
}

// Helper function to create hybrid modal material items (for raw materials)
async function createHybridModalMaterialItem(materialName, requiredQuantity, parentRecipe) {
    
    const item = document.createElement('div');
    item.className = 'hybrid-modal-material-item';
    
    // Check if this material is a ship
    const isShipMaterial = ships.includes(materialName);
    
    // Add special styling for ship materials
    const baseStyles = `
        display: flex; 
        align-items: center; 
        gap: var(--space-md); 
        padding: var(--space-md); 
        margin: var(--space-sm) 0; 
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
    `;
    
    const shipStyles = isShipMaterial ? `
        background: linear-gradient(135deg, var(--bg-tertiary) 0%, rgba(74, 158, 255, 0.1) 100%);
        border: 2px solid rgba(74, 158, 255, 0.3);
        cursor: pointer;
        position: relative;
        overflow: hidden;
    ` : `
        background: var(--bg-tertiary);
        border: 2px solid transparent;
    `;
    
    item.style.cssText = baseStyles + shipStyles;
    
    // Get icon info for potential BDO Codex link
    const iconInfo = iconLoader.getIconInfo(materialName);
    const hasUrl = iconInfo && iconInfo.url;
    
    // Icon (clickable if URL exists)
    const methods = getAcquisitionMethods(materialName);
    const primaryMethod = methods.length > 0 ? methods[0][0] : null;
    
    if (hasUrl) {
        const iconLink = document.createElement('a');
        iconLink.href = iconInfo.url;
        iconLink.target = '_blank';
        iconLink.rel = 'noopener noreferrer';
        iconLink.style.cssText = `
            text-decoration: none; 
            border-radius: var(--radius-sm);
            padding: 2px;
            transition: background-color 0.2s ease;
        `;
        iconLink.addEventListener('mouseenter', () => {
            iconLink.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
        });
        iconLink.addEventListener('mouseleave', () => {
            iconLink.style.backgroundColor = 'transparent';
        });
        
        iconLink.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        const icon = await iconLoader.createIcon(materialName, "lg", { clickable: false, interactive: false });
        icon.classList.add("modal-material-icon");
        iconLink.appendChild(icon);
        item.appendChild(iconLink);
    } else {
        const icon = await createItemIcon(materialName, "lg", primaryMethod);
        icon.classList.add("modal-material-icon");
        item.appendChild(icon);
    }
    
    // Main info section
    const infoSection = document.createElement('div');
    infoSection.className = 'modal-material-info';
    infoSection.style.flex = '1';
    
    // Material name (clickable if URL exists)
    if (hasUrl) {
        const nameLink = document.createElement('a');
        nameLink.href = iconInfo.url;
        nameLink.target = '_blank';
        nameLink.rel = 'noopener noreferrer';
        nameLink.textContent = materialName;
        nameLink.style.cssText = `
            font-weight: 600; 
            color: var(--text-primary);
            margin-bottom: 4px;
            text-decoration: none;
            cursor: pointer;
            transition: color 0.2s ease;
            display: block;
        `;
        nameLink.addEventListener('mouseenter', () => {
            nameLink.style.color = 'var(--accent-primary)';
        });
        nameLink.addEventListener('mouseleave', () => {
            nameLink.style.color = 'var(--text-primary)';
        });
        nameLink.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        infoSection.appendChild(nameLink);
    } else {
        const nameElem = document.createElement('div');
        nameElem.textContent = materialName;
        nameElem.style.cssText = 'font-weight: 600; color: var(--text-primary); margin-bottom: 4px;';
        infoSection.appendChild(nameElem);
    }
    
    // Acquisition method badges for modal
    const modalMeta = document.createElement('div');
    modalMeta.className = 'modal-material-meta';
    modalMeta.style.cssText = 'display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap;';
    
    const acquisitionMethods = getAcquisitionMethods(materialName);
    for (const [methodType, methodName] of acquisitionMethods) {
        const badge = document.createElement('span');
        badge.className = `badge badge-${methodType}`;
        badge.textContent = methodName;
        badge.style.cssText = 'font-size: 10px; padding: 2px 6px;';
        
        // Add modal functionality for vendor and barter badges in modal
        if (methodType === 'vendor' && materialName in items) {
            badge.style.cursor = 'pointer';
            badge.title = 'Click for acquisition details';
            badge.addEventListener('click', async (event) => {
                event.stopPropagation(); // Prevent triggering parent click events
                const itemData = items[materialName];
                const methodSources = itemData[methodName] || [];
                await showAcquisitionModal(materialName, methodName, methodSources);
            });
        } else if (methodType === 'barter' && (materialName in shipbarters || materialName in barters)) {
            badge.style.cursor = 'pointer';
            badge.title = 'Click for barter details';
            // Determine which barter type this specific badge represents
            const barterSubtype = methodName === 'Trade Item Barter' ? 'trade' : 'ship';
            badge.addEventListener('click', async (event) => {
                event.stopPropagation(); // Prevent triggering parent click events
                // Use proper modal instead of tooltip
                const barterInfo = barterSubtype === 'ship' ? shipbarters[materialName] : barters[materialName];
                await showBarterModal(materialName, barterSubtype, barterInfo);
            });
        }
        
        modalMeta.appendChild(badge);
    }
    infoSection.appendChild(modalMeta);
    
    // Quantity row
    const storageId = `${currentShip}-${parentRecipe}-${materialName}`;
    const currentQty = parseInt(getStorage(storageId)) || 0;
    
    const qtyRow = document.createElement('div');
    qtyRow.style.cssText = 'display: flex; gap: var(--space-md); margin-top: var(--space-xs);';
    
    const requiredSpan = document.createElement('span');
    requiredSpan.textContent = `Required: ${requiredQuantity}`;
    requiredSpan.style.color = 'var(--text-secondary)';
    
    const currentSpan = document.createElement('span');
    currentSpan.textContent = `Have: ${currentQty}`;
    
    // Color code based on completion
    if (currentQty >= requiredQuantity) {
        currentSpan.style.color = 'var(--success)';
        const checkmark = document.createElement('span');
        checkmark.textContent = ' ✓';
        checkmark.style.marginLeft = '5px';
        currentSpan.appendChild(checkmark);
    } else if (currentQty > 0) {
        currentSpan.style.color = 'var(--warning)';
    } else {
        currentSpan.style.color = 'var(--danger)';
    }
    
    qtyRow.appendChild(requiredSpan);
    qtyRow.appendChild(currentSpan);
    infoSection.appendChild(qtyRow);
    item.appendChild(infoSection);
    
    // Quantity controls
    const controls = document.createElement('div');
    controls.className = 'modal-quantity-controls';
    controls.style.cssText = 'display: flex; align-items: center; gap: var(--space-sm);';
    
    const btnMinus = document.createElement('button');
    btnMinus.textContent = '-';
    btnMinus.className = 'quick-btn';
    btnMinus.style.cssText = 'width: 30px; height: 30px;';
    
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.value = currentQty;
    quantityInput.min = '0';
    quantityInput.max = requiredQuantity;
    quantityInput.className = 'quantity-input modal-qty-input';
    quantityInput.id = `hybrid-modal-${currentShip}-${parentRecipe}-${materialName}`;
    quantityInput.style.width = '80px';
    
    const btnPlus = document.createElement('button');
    btnPlus.textContent = '+';
    btnPlus.className = 'quick-btn';
    btnPlus.style.cssText = 'width: 30px; height: 30px;';
    
    // Complete button (green checkmark)
    const completeBtn = document.createElement('button');
    completeBtn.textContent = '✓';
    completeBtn.className = 'quick-btn complete-btn';
    completeBtn.style.cssText = `
        width: 30px; 
        height: 30px; 
        background: var(--success); 
        color: white; 
        border: none; 
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
        margin-left: var(--space-xs);
    `;
    
    // Add hover effects
    completeBtn.addEventListener('mouseenter', () => {
        completeBtn.style.background = 'var(--success-dark)';
        completeBtn.style.transform = 'scale(1.05)';
    });
    completeBtn.addEventListener('mouseleave', () => {
        completeBtn.style.background = 'var(--success)';
        completeBtn.style.transform = 'scale(1)';
    });
    
    // Complete button functionality - set to max required quantity
    completeBtn.addEventListener('click', () => {
        quantityInput.value = requiredQuantity;
        updateHybridModalQuantity(0); // Trigger the update logic
    });
    
    // Hide complete button if already at max quantity
    if (currentQty >= requiredQuantity) {
        completeBtn.style.display = 'none';
    }
    
    controls.appendChild(btnMinus);
    controls.appendChild(quantityInput);
    controls.appendChild(btnPlus);
    controls.appendChild(completeBtn);
    
    // Progress percentage
    const progressPct = requiredQuantity > 0 ? (currentQty / requiredQuantity * 100) : 0;
    const progressText = document.createElement('span');
    progressText.className = progressPct >= 100 ? 'progress-percentage completed' : 'progress-percentage';
    progressText.textContent = progressPct >= 100 ? '100%' : `${Math.floor(progressPct * 1000) / 1000}%`;
    progressText.style.cssText = 'font-size: var(--font-size-sm); color: var(--text-secondary);';
    controls.appendChild(progressText);
    
    item.appendChild(controls);
    
    // Update function for raw materials in hybrid system
    function updateHybridModalQuantity(delta) {
        const current = parseInt(quantityInput.value) || 0;
        const newValue = Math.max(0, Math.min(requiredQuantity, current + delta));
        
        quantityInput.value = newValue;
        
        // Update storage
        const storageKey = quantityInput.id.replace('hybrid-modal-', '');
        setStorage(storageKey, newValue.toString());
        
        // Update visual elements
        const newPercentage = requiredQuantity > 0 ? (newValue / requiredQuantity * 100) : 0;
        progressText.textContent = newPercentage >= 100 ? '100%' : `${Math.floor(newPercentage * 1000) / 1000}%`;
        
        // Update completed class
        if (newPercentage >= 100) {
            progressText.className = 'progress-percentage completed';
        } else {
            progressText.className = 'progress-percentage';
        }
        
        // Update color coding
        currentSpan.innerHTML = `Have: ${newValue}`;
        if (newValue >= requiredQuantity) {
            currentSpan.style.color = 'var(--success)';
            const checkmark = document.createElement('span');
            checkmark.textContent = ' ✓';
            checkmark.style.marginLeft = '5px';
            currentSpan.appendChild(checkmark);
        } else if (newValue > 0) {
            currentSpan.style.color = 'var(--warning)';
        } else {
            currentSpan.style.color = 'var(--danger)';
        }
        
        // Show/hide complete button based on current quantity
        const completeBtn = item.querySelector('.complete-btn');
        if (completeBtn) {
            if (newValue >= requiredQuantity) {
                completeBtn.style.display = 'none';
            } else {
                completeBtn.style.display = 'block';
            }
        }
        
        // Update the modal progress
        updateHybridModalProgress(parentRecipe);
        
        // Update overall progress
        updateOverallProgress();
        updateShipSelectorProgress();
        refreshAllMaterialCards();
    }
    
    btnMinus.addEventListener('click', () => updateHybridModalQuantity(-1));
    btnPlus.addEventListener('click', () => updateHybridModalQuantity(1));
    quantityInput.addEventListener('change', () => updateHybridModalQuantity(0));
    
    return item;
}

// Helper function to update hybrid modal progress
function updateHybridModalProgress(recipeName) {
    if (!recipeName || !(recipeName in recipes)) {
        return;
    }
    
    // Calculate current recipe progress with hybrid system
    const recipeProgress = calculateHybridRecipeProgress(recipeName, currentShip);
    
    // Update the progress display in the modal
    const modalBody = document.getElementById('recipe-modal-body');
    const progressSection = modalBody.querySelector('.recipe-modal-progress');
    
    if (progressSection) {
        const h4 = progressSection.querySelector('h4');
        if (h4) {
            h4.textContent = `Recipe Progress: ${recipeProgress >= 100 ? '100%' : `${Math.floor(recipeProgress * 1000) / 1000}%`}`;
        }
        
        const progressFill = progressSection.querySelector('.progress-fill');
        if (progressFill) {
            progressFill.style.width = `${recipeProgress}%`;
        }
    }
    
    // Update progress breakdown
    const breakdownSection = modalBody.querySelector('.progress-breakdown');
    if (breakdownSection) {
        // Refresh the breakdown section
        const completedStorageId = `${currentShip}-${recipeName}-completed`;
        const completedItems = parseInt(getStorage(completedStorageId)) || 0;
        
        // Find parent quantity
        let parentQuantity = 1;
        if (currentShip in recipes && recipeName in recipes[currentShip]) {
            parentQuantity = recipes[currentShip][recipeName];
        } else {
            const plus10Name = `+10 ${recipeName}`;
            if (currentShip in recipes && plus10Name in recipes[currentShip]) {
                parentQuantity = recipes[currentShip][recipeName];
            }
        }
        
        // Clear and rebuild breakdown
        breakdownSection.innerHTML = '';
        
        const breakdownTitle = document.createElement('div');
        breakdownTitle.innerHTML = `💡 <strong>Progress Breakdown:</strong>`;
        breakdownTitle.style.marginBottom = 'var(--space-sm)';
        breakdownSection.appendChild(breakdownTitle);
        
        if (completedItems > 0) {
            const completedInfo = document.createElement('div');
            const completedPercent = Math.min((completedItems / parentQuantity) * 100, 100);
            completedInfo.innerHTML = `• ${completedItems} completed ${recipeName}${completedItems > 1 ? 's' : ''}: <span style="color: var(--success);">${Math.floor(completedPercent)}%</span>`;
            breakdownSection.appendChild(completedInfo);
        }
        
        const remainingNeeded = Math.max(0, parentQuantity - completedItems);
        if (remainingNeeded > 0) {
            let totalRawProgress = 0;
            let totalRawNeeded = 0;
            
            for (const [material, quantity] of Object.entries(recipes[recipeName])) {
                const neededForRemaining = quantity * remainingNeeded;
                const storageId = `${currentShip}-${recipeName}-${material}`;
                const currentRaw = parseInt(getStorage(storageId)) || 0;
                
                totalRawNeeded += neededForRemaining;
                totalRawProgress += Math.min(currentRaw, neededForRemaining);
            }
            
            const rawPercent = totalRawNeeded > 0 ? (totalRawProgress / totalRawNeeded) * 100 : 0;
            const rawInfo = document.createElement('div');
            rawInfo.innerHTML = `• Raw materials for ${remainingNeeded} remaining: <span style="color: ${rawPercent >= 100 ? 'var(--success)' : rawPercent > 0 ? 'var(--warning)' : 'var(--danger)'};">${Math.floor(rawPercent)}%</span>`;
            breakdownSection.appendChild(rawInfo);
        }
    }
}

// Function to refresh the raw materials section when completed items change
async function refreshRawMaterialsSection(materialName, parentQuantity) {
    const modalBody = document.getElementById('recipe-modal-body');
    const rawSection = modalBody.querySelector('.raw-materials-section');
    
    if (!rawSection || !(materialName in recipes)) {
        return;
    }
    
    // Get current completed items
    const completedStorageId = `${currentShip}-${materialName}-completed`;
    const completedItems = parseInt(getStorage(completedStorageId)) || 0;
    const remainingNeeded = Math.max(0, parentQuantity - completedItems);
    
    // Find the existing materials list and remaining info
    const existingMaterialsList = rawSection.querySelector('.recipe-materials-list');
    const existingRemainingInfo = rawSection.querySelector('div:nth-child(2)'); // The "Need materials for X more" div
    
    if (remainingNeeded > 0) {
        // Update the remaining info text
        if (existingRemainingInfo) {
            existingRemainingInfo.textContent = `Need materials for ${remainingNeeded} more ${materialName}${remainingNeeded > 1 ? 's' : ''}`;
            existingRemainingInfo.style.display = 'block';
        }
        
        // Update or create the materials list
        if (existingMaterialsList) {
            // Clear existing materials
            existingMaterialsList.innerHTML = '';
            
            // Recreate materials with new quantities
            for (const [subMaterial, subQuantity] of Object.entries(recipes[materialName])) {
                const neededForRemaining = subQuantity * remainingNeeded;
                const subItem = await createHybridModalMaterialItem(subMaterial, neededForRemaining, materialName);
                existingMaterialsList.appendChild(subItem);
            }
        }
        
        // Show the raw section content
        if (existingMaterialsList) existingMaterialsList.style.display = 'block';
        
        // Hide the "all complete" message if it exists
        const allCompleteMsg = rawSection.querySelector('div[style*="color: var(--success)"]');
        if (allCompleteMsg) {
            allCompleteMsg.style.display = 'none';
        }
        
    } else {
        // All items are completed - show completion message
        if (existingRemainingInfo) {
            existingRemainingInfo.style.display = 'none';
        }
        if (existingMaterialsList) {
            existingMaterialsList.style.display = 'none';
        }
        
        // Show or create the "all complete" message
        let allCompleteMsg = rawSection.querySelector('div[style*="color: var(--success)"]');
        if (!allCompleteMsg) {
            allCompleteMsg = document.createElement('div');
            allCompleteMsg.innerHTML = `✅ <strong>All ${materialName}s completed!</strong> No raw materials needed.`;
            allCompleteMsg.style.cssText = `
                color: var(--success);
                font-size: 14px;
                text-align: center;
                padding: var(--space-lg);
                background: rgba(34, 197, 94, 0.1);
                border-radius: var(--radius-md);
            `;
            rawSection.appendChild(allCompleteMsg);
        } else {
            allCompleteMsg.style.display = 'block';
        }
    }
}

async function showRecipeModal(materialName) {
    
    const modal = document.getElementById('recipe-modal');
    const modalTitle = document.getElementById('recipe-modal-title');
    const modalBody = document.getElementById('recipe-modal-body');
    
    // Set title
    modalTitle.textContent = `Recipe: ${materialName}`;
    
    // Clear body
    modalBody.innerHTML = '';
    
    // Find parent recipe quantity from current ship's recipe
    let parentQuantity = 1;
    if (currentShip in recipes && materialName in recipes[currentShip]) {
        parentQuantity = recipes[currentShip][materialName];
    } else {
        // Check for +10 version
        const plus10Name = `+10 ${materialName}`;
        if (currentShip in recipes && plus10Name in recipes[currentShip]) {
            parentQuantity = recipes[currentShip][plus10Name];
        }
    }
    
    // Add progress for this recipe using hybrid calculation
    if (materialName in recipes) {
        const progressSection = document.createElement('div');
        progressSection.className = 'recipe-modal-progress';
        
        // Calculate recipe progress using hybrid system
        const recipeProgress = calculateHybridRecipeProgress(materialName, currentShip);
        
        const h4 = document.createElement('h4');
        h4.textContent = `Recipe Progress: ${recipeProgress >= 100 ? '100%' : `${Math.floor(recipeProgress * 1000) / 1000}%`}`;
        progressSection.appendChild(h4);
        
        // Progress bar
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.style.cssText = `
            width: 100%; 
            height: 8px; 
            background: var(--bg-tertiary); 
            border-radius: 4px; 
            margin: var(--space-sm) 0;
        `;
        
        const progressFill = document.createElement('div');
        progressFill.className = 'progress-fill';
        progressFill.style.cssText = `
            width: ${recipeProgress}%; 
            height: 100%; 
            background: var(--accent-primary); 
            border-radius: 4px; 
            transition: width 0.3s ease;
        `;
        progressBar.appendChild(progressFill);
        progressSection.appendChild(progressBar);
        
        modalBody.appendChild(progressSection);
        
        // Get conversion info for this recipe
        const conversionInfo = getRecipeConversionInfo(materialName);
        
        // Add progress breakdown if there are both completed items and raw materials
        const completedStorageId = `${currentShip}-${materialName}-completed`;
        const completedItems = parseInt(getStorage(completedStorageId)) || 0;
        
        if (completedItems > 0 || parentQuantity > 1) {
            const breakdownSection = document.createElement('div');
            breakdownSection.className = 'progress-breakdown';
            breakdownSection.style.cssText = `
                background: rgba(74, 158, 255, 0.05);
                border: 1px solid rgba(74, 158, 255, 0.2);
                border-radius: var(--radius-md);
                padding: var(--space-md);
                margin: var(--space-md) 0;
                font-size: 14px;
            `;
            
            const breakdownTitle = document.createElement('div');
            breakdownTitle.innerHTML = `💡 <strong>Progress Breakdown:</strong>`;
            breakdownTitle.style.marginBottom = 'var(--space-sm)';
            breakdownSection.appendChild(breakdownTitle);
            
            if (completedItems > 0) {
                const completedInfo = document.createElement('div');
                const completedPercent = Math.min((completedItems / parentQuantity) * 100, 100);
                completedInfo.innerHTML = `• ${completedItems} completed ${materialName}${completedItems > 1 ? 's' : ''}: <span style="color: var(--success);">${Math.floor(completedPercent)}%</span>`;
                if (conversionInfo && conversionInfo.description) {
                    completedInfo.innerHTML += ` <span style="color: var(--text-secondary); font-size: 12px;">(${conversionInfo.description})</span>`;
                }
                breakdownSection.appendChild(completedInfo);
            }
            
            const remainingNeeded = Math.max(0, parentQuantity - completedItems);
            if (remainingNeeded > 0) {
                let totalRawProgress = 0;
                let totalRawNeeded = 0;
                
                for (const [material, quantity] of Object.entries(recipes[materialName])) {
                    const neededForRemaining = quantity * remainingNeeded;
                    const storageId = `${currentShip}-${materialName}-${material}`;
                    const currentRaw = parseInt(getStorage(storageId)) || 0;
                    
                    totalRawNeeded += neededForRemaining;
                    totalRawProgress += Math.min(currentRaw, neededForRemaining);
                }
                
                const rawPercent = totalRawNeeded > 0 ? (totalRawProgress / totalRawNeeded) * 100 : 0;
                const rawInfo = document.createElement('div');
                rawInfo.innerHTML = `• Raw materials for ${remainingNeeded} remaining: <span style="color: ${rawPercent >= 100 ? 'var(--success)' : rawPercent > 0 ? 'var(--warning)' : 'var(--danger)'};">${Math.floor(rawPercent)}%</span>`;
                breakdownSection.appendChild(rawInfo);
            }
            
            modalBody.appendChild(breakdownSection);
        }
        
        // Dual-level input sections
        
        // 1. Completed Items Section
        const completedSection = document.createElement('div');
        completedSection.className = 'completed-items-section';
        completedSection.style.cssText = `
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(34, 197, 94, 0.02) 100%);
            border: 2px solid rgba(34, 197, 94, 0.2);
            border-radius: var(--radius-lg);
            padding: var(--space-lg);
            margin: var(--space-md) 0;
        `;
        
        const completedHeader = document.createElement('h4');
        completedHeader.innerHTML = `🔧 Completed ${materialName}s`;
        completedHeader.style.cssText = `
            color: var(--success);
            margin: 0 0 var(--space-md) 0;
            font-size: 16px;
            font-weight: 600;
        `;
        completedSection.appendChild(completedHeader);
        
        if (conversionInfo && conversionInfo.description) {
            const conversionHint = document.createElement('div');
            conversionHint.textContent = `💡 ${conversionInfo.description}`;
            conversionHint.style.cssText = `
                color: var(--text-secondary);
                font-size: 12px;
                margin-bottom: var(--space-md);
                font-style: italic;
            `;
            completedSection.appendChild(conversionHint);
        }
        
        const completedControls = await createCompletedItemControls(materialName, parentQuantity);
        completedSection.appendChild(completedControls);
        modalBody.appendChild(completedSection);
        
        // 2. Raw Materials Section
        const rawSection = document.createElement('div');
        rawSection.className = 'raw-materials-section';
        rawSection.style.cssText = `
            background: linear-gradient(135deg, rgba(74, 158, 255, 0.05) 0%, rgba(74, 158, 255, 0.02) 100%);
            border: 2px solid rgba(74, 158, 255, 0.2);
            border-radius: var(--radius-lg);
            padding: var(--space-lg);
            margin: var(--space-md) 0;
        `;
        
        const rawHeader = document.createElement('h4');
        rawHeader.innerHTML = `⚙️ Raw Materials for Remaining ${materialName}s`;
        rawHeader.style.cssText = `
            color: var(--accent-primary);
            margin: 0 0 var(--space-md) 0;
            font-size: 16px;
            font-weight: 600;
        `;
        rawSection.appendChild(rawHeader);
        
        const remainingNeeded = Math.max(0, parentQuantity - completedItems);
        if (remainingNeeded > 0) {
            const remainingInfo = document.createElement('div');
            remainingInfo.textContent = `Need materials for ${remainingNeeded} more ${materialName}${remainingNeeded > 1 ? 's' : ''}`;
            remainingInfo.style.cssText = `
                color: var(--text-secondary);
                font-size: 14px;
                margin-bottom: var(--space-md);
            `;
            rawSection.appendChild(remainingInfo);
            
            const materialsList = document.createElement('div');
            materialsList.className = 'recipe-materials-list';
            
            for (const [subMaterial, subQuantity] of Object.entries(recipes[materialName])) {
                const neededForRemaining = subQuantity * remainingNeeded;
                const subItem = await createHybridModalMaterialItem(subMaterial, neededForRemaining, materialName);
                materialsList.appendChild(subItem);
            }
            
            rawSection.appendChild(materialsList);
        } else {
            const allCompleteMsg = document.createElement('div');
            allCompleteMsg.innerHTML = `✅ <strong>All ${materialName}s completed!</strong> No raw materials needed.`;
            allCompleteMsg.style.cssText = `
                color: var(--success);
                font-size: 14px;
                text-align: center;
                padding: var(--space-lg);
                background: rgba(34, 197, 94, 0.1);
                border-radius: var(--radius-md);
            `;
            rawSection.appendChild(allCompleteMsg);
        }
        
        modalBody.appendChild(rawSection);
        
        // Action buttons
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            gap: var(--space-md);
            margin: var(--space-lg) 0;
            justify-content: center;
        `;
        
        // Add completion button if recipe is not complete
        if (recipeProgress < 100) {
            const completeBtn = document.createElement('button');
            completeBtn.textContent = '✅ Complete All';
            completeBtn.className = 'quick-btn recipe-complete-btn';
            completeBtn.style.cssText = `
                background: var(--accent-primary);
                border-color: var(--accent-primary);
                color: white;
                font-weight: 600;
                padding: var(--space-md) var(--space-lg);
                font-size: 14px;
                border-radius: var(--radius-md);
                min-width: 140px;
            `;
            
            completeBtn.addEventListener('click', async () => {
                // Epic completion animation sequence
                await createCompletionAnimation(completeBtn, materialName);
                
                // Set completed items to full parent quantity
                const completedStorageId = `${currentShip}-${materialName}-completed`;
                setStorage(completedStorageId, parentQuantity.toString());
                
                // Clear all raw materials since we're marking as fully completed
                for (const [subMaterial, subQuantity] of Object.entries(recipes[materialName])) {
                    const storageId = `${currentShip}-${materialName}-${subMaterial}`;
                    setStorage(storageId, '0');
                }
                
                // Close modal after completion
                hideRecipeModal();
            });
            
            buttonsContainer.appendChild(completeBtn);
        }
        
        // Add reset button for recipe
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '🔄 Reset All';
        resetBtn.className = 'quick-btn reset-btn';
        resetBtn.style.cssText = `
            background: var(--bg-tertiary);
            border: 1px solid var(--text-secondary);
            color: var(--text-secondary);
            font-weight: 600;
            padding: var(--space-md) var(--space-lg);
            font-size: 14px;
            border-radius: var(--radius-md);
            min-width: 140px;
        `;
        
        resetBtn.addEventListener('click', async () => {
            // Get current completed items to redistribute
            const completedStorageId = `${currentShip}-${materialName}-completed`;
            const currentCompleted = parseInt(getStorage(completedStorageId)) || 0;
            
            // Add completed items back to raw material pool before resetting
            if (currentCompleted > 0) {
                for (const [subMaterial, subQuantity] of Object.entries(recipes[materialName])) {
                    const storageId = `${currentShip}-${materialName}-${subMaterial}`;
                    const currentRaw = parseInt(getStorage(storageId)) || 0;
                    const materialsToAdd = subQuantity * currentCompleted;
                    const newRawValue = currentRaw + materialsToAdd;
                    setStorage(storageId, newRawValue.toString());
                }
            }
            
            // Reset completed items to 0
            setStorage(completedStorageId, '0');
            
            // Close modal and refresh
            hideRecipeModal();
            await loadShipMaterials();
        });
        
        buttonsContainer.appendChild(resetBtn);
        modalBody.appendChild(buttonsContainer);
    }
    
    // Show modal with gooey entrance
    modal.classList.remove("hidden");
    
    
    // Animate modal entrance
    const modalContent = modal.querySelector('.recipe-modal-content');
    if (modalContent) {
        animate(modalContent, {
            scale: [0.92, 1.03, 1],
            opacity: [0, 1],
            filter: ["blur(2px)", "blur(0px)"]
        }, {
            duration: animationConfig.timing.slow,
            easing: animationConfig.easing.morphing
        });
    }
}


async function createModalMaterialItem(materialName, requiredQuantity, parentRecipe) {
    
    const item = document.createElement('div');
    item.className = 'modal-material-item';
    
    // Check if this material is a ship
    const isShipMaterial = ships.includes(materialName);
    
    // Add special styling for ship materials
    const baseStyles = `
        display: flex; 
        align-items: center; 
        gap: var(--space-md); 
        padding: var(--space-md); 
        margin: var(--space-sm) 0; 
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
    `;
    
    const shipStyles = isShipMaterial ? `
        background: linear-gradient(135deg, var(--bg-tertiary) 0%, rgba(74, 158, 255, 0.1) 100%);
        border: 2px solid rgba(74, 158, 255, 0.3);
        cursor: pointer;
        position: relative;
        overflow: hidden;
    ` : `
        background: var(--bg-tertiary);
        border: 2px solid transparent;
    `;
    
    item.style.cssText = baseStyles + shipStyles;
    
    // Add ship indicator overlay for ship materials
    if (isShipMaterial) {
        const shipIndicator = document.createElement('div');
        shipIndicator.innerHTML = '🚢';
        shipIndicator.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            font-size: 18px;
            opacity: 0.7;
            pointer-events: none;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        `;
        item.appendChild(shipIndicator);
        
        // Add hover effects for ship materials
        item.addEventListener('mouseenter', () => {
            item.style.borderColor = 'rgba(74, 158, 255, 0.6)';
            item.style.background = 'linear-gradient(135deg, var(--bg-tertiary) 0%, rgba(74, 158, 255, 0.15) 100%)';
            item.style.transform = 'translateY(-2px)';
            item.style.boxShadow = '0 8px 24px rgba(74, 158, 255, 0.2)';
            shipIndicator.style.opacity = '1';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.borderColor = 'rgba(74, 158, 255, 0.3)';
            item.style.background = 'linear-gradient(135deg, var(--bg-tertiary) 0%, rgba(74, 158, 255, 0.1) 100%)';
            item.style.transform = 'translateY(0)';
            item.style.boxShadow = 'none';
            shipIndicator.style.opacity = '0.7';
        });
        
        // Add click handler for ship switching
        item.addEventListener('click', async (event) => {
            // Prevent if clicking on other interactive elements
            if (event.target.closest('a') || event.target.closest('button') || event.target.closest('.enhancement-control')) {
                return;
            }
            
            await handleShipSwitch(materialName, currentShip, event);
        });
        
        // Add tooltip for ship materials
        item.title = `🚢 Click to switch from "${currentShip}" to "${materialName}"`;
    }
    
    // Get icon info for potential BDO Codex link
    const iconInfo = iconLoader.getIconInfo(materialName);
    const hasUrl = iconInfo && iconInfo.url;
    
    // Icon (clickable if URL exists)
    const methods = getAcquisitionMethods(materialName);
    const primaryMethod = methods.length > 0 ? methods[0][0] : null;
    
    if (hasUrl) {
        const iconLink = document.createElement('a');
        iconLink.href = iconInfo.url;
        iconLink.target = '_blank';
        iconLink.rel = 'noopener noreferrer';
        iconLink.style.cssText = `
            text-decoration: none; 
            border-radius: var(--radius-sm);
            padding: 2px;
            transition: background-color 0.2s ease;
        `;
        iconLink.addEventListener('mouseenter', () => {
            iconLink.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
        });
        iconLink.addEventListener('mouseleave', () => {
            iconLink.style.backgroundColor = 'transparent';
        });
        
        iconLink.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        const icon = await iconLoader.createIcon(materialName, "lg", { clickable: false, interactive: false });
        icon.classList.add("modal-material-icon");
        iconLink.appendChild(icon);
        item.appendChild(iconLink);
    } else {
        const icon = await createItemIcon(materialName, "lg", primaryMethod);
        icon.classList.add("modal-material-icon");
        item.appendChild(icon);
    }
    
    // Main info section
    const infoSection = document.createElement('div');
    infoSection.className = 'modal-material-info';
    infoSection.style.flex = '1';
    
    // Material name with enhancement buttons outside clickable links
    if (isEnhanceableItem(materialName)) {
        const enhancementLevel = getCurrentEnhancementLevel(materialName, currentShip);
        const baseName = materialName.replace(/^\+\d+\s+/, '');
        
        // Create container for buttons + name
        const nameContainer = document.createElement('div');
        nameContainer.style.cssText = 'display: flex; align-items: center; gap: 4px;';
        
        // Add enhancement buttons first (outside any link)
        const inlineButtons = createInlineEnhancementButtons(materialName, currentShip);
        if (inlineButtons) {
            nameContainer.appendChild(inlineButtons);
        }
        
        // Create the enhanced name text
        const finalText = enhancementLevel > 0 ? `+${enhancementLevel} ${baseName}` : baseName;
        
        if (hasUrl) {
            const nameLink = document.createElement('a');
            nameLink.href = iconInfo.url;
            nameLink.target = '_blank';
            nameLink.rel = 'noopener noreferrer';
            nameLink.textContent = finalText;
            nameLink.style.cssText = `
                font-weight: 600; 
                color: var(--text-primary);
                text-decoration: none;
                cursor: pointer;
                transition: color 0.2s ease;
            `;
            nameLink.addEventListener('mouseenter', () => {
                nameLink.style.color = 'var(--accent-primary)';
            });
            nameLink.addEventListener('mouseleave', () => {
                nameLink.style.color = 'var(--text-primary)';
            });
            nameLink.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            nameContainer.appendChild(nameLink);
        } else {
            const nameElem = document.createElement('div');
            nameElem.textContent = finalText;
            nameElem.style.cssText = 'font-weight: 600; color: var(--text-primary);';
            nameContainer.appendChild(nameElem);
        }
        
        infoSection.appendChild(nameContainer);
    } else {
        // Non-enhanceable item
        if (hasUrl) {
            const nameLink = document.createElement('a');
            nameLink.href = iconInfo.url;
            nameLink.target = '_blank';
            nameLink.rel = 'noopener noreferrer';
            nameLink.textContent = materialName;
            nameLink.style.cssText = `
                font-weight: 600; 
                color: var(--text-primary);
                text-decoration: none;
                cursor: pointer;
                transition: color 0.2s ease;
            `;
            nameLink.addEventListener('mouseenter', () => {
                nameLink.style.color = 'var(--accent-primary)';
            });
            nameLink.addEventListener('mouseleave', () => {
                nameLink.style.color = 'var(--text-primary)';
            });
            nameLink.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            infoSection.appendChild(nameLink);
        } else {
            const nameElem = document.createElement('div');
            nameElem.textContent = materialName;
            nameElem.style.cssText = 'font-weight: 600; color: var(--text-primary);';
            infoSection.appendChild(nameElem);
        }
    }
    
    // Acquisition method badges for modal
    const modalMeta = document.createElement('div');
    modalMeta.className = 'modal-material-meta';
    modalMeta.style.cssText = 'display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap;';
    
    const acquisitionMethods = getAcquisitionMethods(materialName);
    for (const [methodType, methodName] of acquisitionMethods) {
        const badge = document.createElement('span');
        badge.className = `badge badge-${methodType}`;
        badge.textContent = methodName;
        badge.style.cssText = 'font-size: 10px; padding: 2px 6px;';
        
        // Add modal functionality for vendor and barter badges in modal
        if (methodType === 'vendor' && materialName in items) {
            badge.style.cursor = 'pointer';
            badge.title = 'Click for acquisition details';
            badge.addEventListener('click', async (event) => {
                event.stopPropagation(); // Prevent triggering parent click events
                const itemData = items[materialName];
                const methodSources = itemData[methodName] || [];
                await showAcquisitionModal(materialName, methodName, methodSources);
            });
        } else if (methodType === 'barter' && (materialName in shipbarters || materialName in barters)) {
            badge.style.cursor = 'pointer';
            badge.title = 'Click for barter details';
            // Determine which barter type this specific badge represents
            const barterSubtype = methodName === 'Trade Item Barter' ? 'trade' : 'ship';
            badge.addEventListener('click', async (event) => {
                event.stopPropagation(); // Prevent triggering parent click events
                // Use proper modal instead of tooltip
                const barterInfo = barterSubtype === 'ship' ? shipbarters[materialName] : barters[materialName];
                await showBarterModal(materialName, barterSubtype, barterInfo);
            });
        }
        
        modalMeta.appendChild(badge);
    }
    infoSection.appendChild(modalMeta);
    
    // Required vs Current
    // Use context-specific storage key that includes the parent recipe
    const storageId = `${currentShip}-${parentRecipe}-${materialName}`;
    const currentQty = parseInt(getStorage(storageId)) || 0;
    
    const qtyRow = document.createElement('div');
    qtyRow.style.cssText = 'display: flex; gap: var(--space-md); margin-top: var(--space-xs);';
    
    const requiredSpan = document.createElement('span');
    requiredSpan.textContent = `Required: ${requiredQuantity}`;
    requiredSpan.style.color = 'var(--text-secondary)';
    
    const currentSpan = document.createElement('span');
    currentSpan.textContent = `Have: ${currentQty}`;
    
    // Color code based on completion
    if (currentQty >= requiredQuantity) {
        currentSpan.style.color = 'var(--success)';
        const checkmark = document.createElement('span');
        checkmark.textContent = ' ✓';
        checkmark.style.marginLeft = '5px';
        currentSpan.appendChild(checkmark);
    } else if (currentQty > 0) {
        currentSpan.style.color = 'var(--warning)';
    } else {
        currentSpan.style.color = 'var(--danger)';
    }
    
    qtyRow.appendChild(requiredSpan);
    qtyRow.appendChild(currentSpan);
    infoSection.appendChild(qtyRow);
    item.appendChild(infoSection);
    
    // Quantity controls
    const controls = document.createElement('div');
    controls.className = 'modal-quantity-controls';
    controls.style.cssText = 'display: flex; align-items: center; gap: var(--space-sm);';
    
    const btnMinus = document.createElement('button');
    btnMinus.textContent = '-';
    btnMinus.className = 'quick-btn';
    btnMinus.style.cssText = 'width: 30px; height: 30px;';
    
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.value = currentQty;
    quantityInput.min = '0';
    quantityInput.max = requiredQuantity;
    quantityInput.className = 'quantity-input modal-qty-input';
    quantityInput.id = `modal-${currentShip}-${parentRecipe}-${materialName}`;
    quantityInput.style.width = '80px';
    
    const btnPlus = document.createElement('button');
    btnPlus.textContent = '+';
    btnPlus.className = 'quick-btn';
    btnPlus.style.cssText = 'width: 30px; height: 30px;';
    
    // Complete button (green checkmark)
    const completeBtn = document.createElement('button');
    completeBtn.textContent = '✓';
    completeBtn.className = 'quick-btn complete-btn';
    completeBtn.style.cssText = `
        width: 30px; 
        height: 30px; 
        background: var(--success); 
        color: white; 
        border: none; 
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
        margin-left: var(--space-xs);
    `;
    
    // Add hover effects
    completeBtn.addEventListener('mouseenter', () => {
        completeBtn.style.background = 'var(--success-dark)';
        completeBtn.style.transform = 'scale(1.05)';
    });
    completeBtn.addEventListener('mouseleave', () => {
        completeBtn.style.background = 'var(--success)';
        completeBtn.style.transform = 'scale(1)';
    });
    
    // Complete button functionality - set to max required quantity
    completeBtn.addEventListener('click', () => {
        quantityInput.value = requiredQuantity;
        updateModalQuantity(0); // Trigger the update logic
    });
    
    // Hide complete button if already at max quantity
    if (currentQty >= requiredQuantity) {
        completeBtn.style.display = 'none';
    }
    
    controls.appendChild(btnMinus);
    controls.appendChild(quantityInput);
    controls.appendChild(btnPlus);
    controls.appendChild(completeBtn);
    
    // Progress percentage
    const progressPct = requiredQuantity > 0 ? (currentQty / requiredQuantity * 100) : 0;
    const progressText = document.createElement('span');
    progressText.className = progressPct >= 100 ? 'progress-percentage completed' : 'progress-percentage';
    progressText.textContent = progressPct >= 100 ? '100%' : `${Math.floor(progressPct * 1000) / 1000}%`;
    progressText.style.cssText = 'font-size: var(--font-size-sm); color: var(--text-secondary);';
    controls.appendChild(progressText);
    
    item.appendChild(controls);
    
    // Update parent material card progress for both exact name and +10 enhanced versions
    function updateParentCardProgress(parentRecipe) {
        
        if (!parentRecipe) {
            return;
        }
        
        if (!(parentRecipe in recipes)) {
            return;
        }
        
        
        // Search for both the exact recipe name and the +10 enhanced version
        const searchNames = [
            parentRecipe,                    // e.g., "Epheria Galleass: Upgraded Plating"
            `+10 ${parentRecipe}`           // e.g., "+10 Epheria Galleass: Upgraded Plating"
        ];
        
        
        let totalCardsFound = 0;
        
        for (const searchName of searchNames) {
            const selector = `.material-card[data-material="${searchName.toLowerCase()}"]`;
            
            const parentCards = document.querySelectorAll(selector);
            totalCardsFound += parentCards.length;
            
            // Debug: Show what data-material attributes are actually available
            if (parentCards.length === 0) {
                const allCards = document.querySelectorAll('.material-card[data-material]');
                Array.from(allCards).slice(0, 20).forEach(card => {
                    const dataMaterial = card.getAttribute('data-material');
                    if (dataMaterial && (dataMaterial.includes('plating') || dataMaterial.includes('galleass'))) {
                    }
                });
            }
            
            for (const card of parentCards) {
                
                // Recalculate the recipe progress using the base recipe name (without +10)
                const newProgress = calculateSubRecipeProgress(parentRecipe);
                
                // Update the circular progress display
                const progressFill = card.querySelector('.progress-fill');
                if (progressFill) {
                    const circumference = 2 * Math.PI * 30; // radius = 30
                    const newOffset = circumference - (newProgress / 100 * circumference);
                    progressFill.style.strokeDashoffset = newOffset;
                    progressFill.classList.toggle('completed', newProgress >= 100);
                } else {
                }
                
                // Update the progress text
                const progressText = card.querySelector('.progress-text');
                if (progressText) {
                    const displayProgress = newProgress >= 100 ? '100%' : `${Math.floor(newProgress * 1000) / 1000}%`;
                    progressText.textContent = displayProgress;
                    progressText.classList.toggle('completed', newProgress >= 100);
                } else {
                }
                
                // Update card completion state
                card.classList.toggle('completed', newProgress >= 100);
                card.setAttribute('data-completed', newProgress >= 100 ? 'true' : 'false');
            }
        }
        
    }

    // Bind quantity update events
    function updateModalQuantity(delta) {
        
        const current = parseInt(quantityInput.value) || 0;
        const newValue = Math.max(0, Math.min(requiredQuantity, current + delta));
        
        quantityInput.value = newValue;
        
        // Update storage
        const storageKey = quantityInput.id.replace('modal-', '');
        setStorage(storageKey, newValue.toString());
        
        // Update ship selector progress in real-time
        updateShipSelectorProgress();
        
        // Update parent material card if we're in a recipe modal
        updateParentCardProgress(parentRecipe);
        
        // Update visual elements
        const newPercentage = requiredQuantity > 0 ? (newValue / requiredQuantity * 100) : 0;
        progressText.textContent = newPercentage >= 100 ? '100%' : `${Math.floor(newPercentage * 1000) / 1000}%`;
        
        // Update completed class
        if (newPercentage >= 100) {
            progressText.className = 'progress-percentage completed';
        } else {
            progressText.className = 'progress-percentage';
        }
        
        // Update color coding
        currentSpan.innerHTML = `Have: ${newValue}`;
        if (newValue >= requiredQuantity) {
            currentSpan.style.color = 'var(--success)';
            const checkmark = document.createElement('span');
            checkmark.textContent = ' ✓';
            checkmark.style.marginLeft = '5px';
            currentSpan.appendChild(checkmark);
        } else if (newValue > 0) {
            currentSpan.style.color = 'var(--warning)';
        } else {
            currentSpan.style.color = 'var(--danger)';
        }
        
        // Show/hide complete button based on current quantity
        const completeBtn = item.querySelector('.complete-btn');
        if (completeBtn) {
            if (newValue >= requiredQuantity) {
                completeBtn.style.display = 'none';
            } else {
                completeBtn.style.display = 'block';
            }
        }
        
        // Update modal crow coins display if present
        const modalCoinInfo = item.querySelector('.modal-coin-info');
        if (modalCoinInfo && materialName in coins) {
            const coinPrice = coins[materialName];
            const totalCoins = coinPrice * newValue;
            modalCoinInfo.textContent = `💰 ${coinPrice.toLocaleString()} coins/unit • ${totalCoins.toLocaleString()} total`;
        }
        
        updateOverallProgress();
        
        // Update recipe modal progress if we're in a recipe modal
        updateRecipeModalProgress(parentRecipe);
        
        // Update the main material card progress for this recipe
        updateMainCardProgressForRecipe(parentRecipe);
        
        // Sync this material across all tabs
        syncMaterialAcrossAllTabs(materialName);
    }
    
    btnMinus.addEventListener('click', () => updateModalQuantity(-1));
    btnPlus.addEventListener('click', () => updateModalQuantity(1));
    quantityInput.addEventListener('change', () => updateModalQuantity(0));
    
    // Add crow coins display for base materials (not recipes)
    if (!(materialName in recipes) && materialName in coins) {
        const coinInfo = document.createElement('div');
        coinInfo.className = 'modal-coin-info';
        coinInfo.style.cssText = 'margin-top: 8px; padding: 6px 10px; font-size: 11px; color: var(--text-secondary); text-align: center; background: rgba(255, 215, 0, 0.1); border-radius: 4px;';
        
        const coinPrice = coins[materialName];
        const totalCoins = coinPrice * currentQty;
        coinInfo.textContent = `💰 ${coinPrice.toLocaleString()} coins/unit • ${totalCoins.toLocaleString()} total`;
        
        infoSection.appendChild(coinInfo);
    }
    
    
    return item;
}

function updateRecipeModalProgress(recipeName) {
    // Use the hybrid progress update function instead for backward compatibility
    updateHybridModalProgress(recipeName);
}

function updateMainCardProgressForRecipe(recipeName) {
    if (!recipeName || !(recipeName in recipes)) {
        return;
    }
    
    // Find the material card for this recipe in the main view
    const materialCards = document.querySelectorAll(`.material-card[data-material="${recipeName.toLowerCase()}"]`);
    
    for (const card of materialCards) {
        // Calculate the new sub-recipe progress
        const subRecipeProgress = calculateSubRecipeProgress(recipeName);
        
        // Update the circular progress
        const progressCircles = card.querySelectorAll('.progress-fill');
        for (const circle of progressCircles) {
            const circumference = 2 * Math.PI * 30;
            const newOffset = circumference - (subRecipeProgress / 100 * circumference);
            circle.style.strokeDashoffset = newOffset;
        }
        
        // Update progress text
        const progressTexts = card.querySelectorAll('.progress-text');
        const isComplete = subRecipeProgress >= 100;
        for (const text of progressTexts) {
            text.textContent = subRecipeProgress >= 100 ? '100%' : `${Math.floor(subRecipeProgress * 1000) / 1000}%`;
            // Add/remove completed class for styling
            if (isComplete) {
                text.classList.add('completed');
            } else {
                text.classList.remove('completed');
            }
        }
        
        // Update completion status
        card.setAttribute('data-completed', isComplete ? 'true' : 'false');
        
        // Auto-set main recipe quantity to 1 when sub-recipe is 100% complete
        if (isComplete) {
            const storageId = `${currentShip}-${recipeName}`;
            const currentMainQty = parseInt(getStorage(storageId)) || 0;
            
            // Only update if currently 0 (don't override user-set quantities > 1)
            if (currentMainQty === 0) {
                setStorage(storageId, '1');
                
                // Update the quantity input in the card if it exists
                const quantityInput = card.querySelector('.treasure-input');
                if (quantityInput) {
                    quantityInput.value = 1;
                }
                
                // Refresh UI to reflect the quantity change
                updateOverallProgress();
                syncMaterialAcrossAllTabs(recipeName);
            }
        }
    }
}

function hideRecipeModal() {
    const modal = document.getElementById('recipe-modal');
    modal.classList.add("hidden");
    refreshAllMaterialCards();
}

function hideAcquisitionModal() {
    const modal = document.getElementById('acquisition-modal');
    modal.classList.add("hidden");
}

// Barter Modal Functions
async function showBarterModal(materialName, barterType, barterInfo) {
    const modal = document.getElementById('acquisition-modal'); // Reuse the same modal
    const modalTitle = document.getElementById('acquisition-modal-title');
    const modalBody = document.getElementById('acquisition-modal-body');
    
    // Set title based on barter type
    const barterTypeName = barterType === 'ship' ? 'Ship Material Barter' : 'Trade Item Barter';
    modalTitle.textContent = `${barterTypeName}: ${materialName}`;
    
    // Clear body
    modalBody.innerHTML = '';
    
    // Create content for barter modal
    await createBarterModalContent(modalBody, materialName, barterType, barterInfo);
    
    // Show modal
    modal.classList.remove('hidden');
}

async function createBarterModalContent(container, materialName, barterType, barterInfo) {
    // Header with icon and title
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px;';
    
    // Get icon info for potential BDO Codex link
    const iconInfo = iconLoader.getIconInfo(materialName);
    const hasUrl = iconInfo && iconInfo.url;
    
    // Item icon (clickable if URL exists)
    if (hasUrl) {
        const iconLink = document.createElement('a');
        iconLink.href = iconInfo.url;
        iconLink.target = '_blank';
        iconLink.rel = 'noopener noreferrer';
        iconLink.style.cssText = `
            text-decoration: none; 
            border-radius: var(--radius-sm);
            padding: 2px;
            transition: background-color 0.2s ease;
        `;
        iconLink.addEventListener('mouseenter', () => {
            iconLink.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
        });
        iconLink.addEventListener('mouseleave', () => {
            iconLink.style.backgroundColor = 'transparent';
        });
        
        const icon = await iconLoader.createIcon(materialName, "lg", { clickable: false, interactive: false });
        icon.style.cssText = 'width: 48px; height: 48px; flex-shrink: 0;';
        iconLink.appendChild(icon);
        header.appendChild(iconLink);
    } else {
        const icon = await iconLoader.createIcon(materialName, "lg", { clickable: false });
        icon.style.cssText = 'width: 48px; height: 48px; flex-shrink: 0;';
        header.appendChild(icon);
    }
    
    // Item info
    const info = document.createElement('div');
    
    // Title (clickable if URL exists)
    if (hasUrl) {
        const titleLink = document.createElement('a');
        titleLink.href = iconInfo.url;
        titleLink.target = '_blank';
        titleLink.rel = 'noopener noreferrer';
        titleLink.textContent = materialName;
        titleLink.style.cssText = `
            font-weight: 600; 
            font-size: 16px; 
            color: var(--text-accent); 
            margin-bottom: 4px;
            text-decoration: none;
            cursor: pointer;
            transition: color 0.2s ease;
            display: block;
        `;
        titleLink.addEventListener('mouseenter', () => {
            titleLink.style.color = 'var(--accent-primary)';
        });
        titleLink.addEventListener('mouseleave', () => {
            titleLink.style.color = 'var(--text-accent)';
        });
        info.appendChild(titleLink);
    } else {
        const titleDiv = document.createElement('div');
        titleDiv.textContent = materialName;
        titleDiv.style.cssText = 'font-weight: 600; font-size: 16px; color: var(--text-accent); margin-bottom: 4px;';
        info.appendChild(titleDiv);
    }
    
    // Barter type info
    const isShipBarter = barterType === 'ship';
    const barterIcon = isShipBarter ? '⚓' : '🔄';
    const barterTypeName = isShipBarter ? 'Ship Material Barter' : 'Trade Item Barter';
    const barterColor = isShipBarter ? 'var(--accent-primary)' : 'var(--warning)';
    
    const methodDiv = document.createElement('div');
    methodDiv.innerHTML = `
        <div style="color: var(--text-secondary); font-size: 14px; display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 16px;">${barterIcon}</span>
            Acquisition Method: ${barterTypeName}
        </div>
    `;
    info.appendChild(methodDiv);
    
    header.appendChild(info);
    container.appendChild(header);
    
    // Barter trades content
    const barterContent = document.createElement('div');
    barterContent.style.cssText = 'margin-bottom: 16px;';
    
    // Header for barter section
    const barterHeader = document.createElement('div');
    barterHeader.style.cssText = `font-weight: 600; margin-bottom: 16px; color: ${barterColor};`;
    barterHeader.innerHTML = `${barterIcon} ${barterTypeName} Options`;
    barterContent.appendChild(barterHeader);
    
    // Create barter trade options
    for (let index = 0; index < barterInfo.length; index++) {
        const barter = barterInfo[index];
        
        // Trade option container
        const tradeOption = document.createElement('div');
        tradeOption.style.cssText = `
            margin-bottom: 16px; 
            padding: 12px; 
            background: var(--bg-secondary); 
            border-radius: 8px; 
            border-left: 3px solid ${barterColor};
        `;
        
        // Trade header
        const tradeHeader = document.createElement('div');
        tradeHeader.style.cssText = 'font-weight: 600; margin-bottom: 12px; color: var(--text-accent);';
        tradeHeader.textContent = `Trade ${barter.count}x ${materialName} for:`;
        tradeOption.appendChild(tradeHeader);
        
        // Create list of required items
        const itemsList = document.createElement('div');
        itemsList.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        
        for (const item of barter.input) {
            const itemRow = await createBarterItemAsync(item);
            itemsList.appendChild(itemRow);
        }
        
        tradeOption.appendChild(itemsList);
        barterContent.appendChild(tradeOption);
    }
    
    container.appendChild(barterContent);
}

// Create individual barter item with proper icon and clickability
async function createBarterItemAsync(itemName) {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px 0;';
    
    // Clean item name by removing [Level X] prefix for icon lookup
    const cleanItemName = itemName.replace(/^\[Level \d+\]\s*/, '');
    
    // Create icon - prefer centralized mapping using clean name
    const iconInfo = iconLoader.getIconInfo(cleanItemName);
    let icon;
    
    if (iconInfo) {
        // Use clickable icon that links to BDO Codex (using clean name for icon lookup)
        icon = await iconLoader.createClickableIcon(cleanItemName, "sm", {
            className: 'barter-item-icon',
            style: {
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                border: '1px solid var(--bg-quaternary)',
                flexShrink: '0'
            }
        });
    } else {
        // Fallback icon when no mapping exists (using clean name)
        icon = await iconLoader.createIcon(cleanItemName, "sm", {
            clickable: false,
            className: 'barter-item-icon fallback',
            style: {
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                border: '1px solid var(--bg-quaternary)',
                flexShrink: '0'
            }
        });
    }
    
    item.appendChild(icon);
    
    // Create text content with clickable functionality
    const textContainer = document.createElement('div');
    textContainer.style.cssText = 'flex: 1; display: flex; align-items: center;';
    
    let textElement;
    
    // If we have icon info (URL exists), make the text clickable
    if (iconInfo && iconInfo.url) {
        textElement = document.createElement('a');
        textElement.href = iconInfo.url;
        textElement.target = '_blank';
        textElement.rel = 'noopener noreferrer';
        textElement.style.cssText = `
            color: var(--text-primary); 
            font-size: 14px; 
            text-decoration: none;
            flex: 1;
            transition: color 0.2s ease;
        `;
        textElement.addEventListener('mouseenter', () => {
            textElement.style.color = 'var(--accent-primary)';
        });
        textElement.addEventListener('mouseleave', () => {
            textElement.style.color = 'var(--text-primary)';
        });
    } else {
        textElement = document.createElement('span');
        textElement.style.cssText = 'color: var(--text-primary); font-size: 14px; flex: 1;';
    }
    
    textElement.textContent = itemName;
    textContainer.appendChild(textElement);
    item.appendChild(textContainer);
    
    // Add hover effects for interactive items
    if (iconInfo) {
        item.style.cursor = 'pointer';
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
            item.style.borderRadius = '4px';
        });
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
        });
    }
    
    return item;
}

async function markRecipeComplete(recipeName) {
    if (!(recipeName in recipes)) {
        return;
    }
    
    // Find parent recipe quantity from current ship's recipe
    let parentQuantity = 1;
    if (currentShip in recipes && recipeName in recipes[currentShip]) {
        parentQuantity = recipes[currentShip][recipeName];
    } else {
        // Check for +10 version
        const plus10Name = `+10 ${recipeName}`;
        if (currentShip in recipes && plus10Name in recipes[currentShip]) {
            parentQuantity = recipes[currentShip][plus10Name];
        }
    }
    
    // Mark all sub-materials in the recipe as complete with scaled quantities
    for (const [subMaterial, subQuantity] of Object.entries(recipes[recipeName])) {
        const scaledQuantity = subQuantity * parentQuantity;
        const storageId = `${currentShip}-${recipeName}-${subMaterial}`;
        setStorage(storageId, scaledQuantity.toString());
    }
    
    // Update overall progress and sync UI
    updateOverallProgress();
    refreshAllMaterialCards();
}

// Acquisition Modal Functions
async function showAcquisitionModal(materialName, methodName, methodInfo) {
    const modal = document.getElementById('acquisition-modal');
    const modalTitle = document.getElementById('acquisition-modal-title');
    const modalBody = document.getElementById('acquisition-modal-body');
    
    // Create clean title with icon for all modal types
    modalTitle.innerHTML = '';
    
    // Create title with icon
    const titleContainer = document.createElement('div');
    titleContainer.style.cssText = 'display: flex; align-items: center; gap: 12px;';
    
    // Get icon for the material - use same approach as working processing text links
    const iconInfo = iconLoader.getIconInfo(materialName);
    if (iconInfo) {
        // Create non-clickable icon first
        const icon = await iconLoader.createIcon(materialName, "md", {
            clickable: false,
            className: 'title-icon',
            style: {
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: '1px solid var(--bg-quaternary)',
                flexShrink: '0',
                cursor: iconInfo.url ? 'pointer' : 'default'
            }
        });
        
        // Add the same click handler that works for processing text
        if (iconInfo.url) {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open(iconInfo.url, '_blank', 'noopener,noreferrer');
            });
        }
        
        titleContainer.appendChild(icon);
    }
    
    const titleText = document.createElement('span');
    titleText.textContent = materialName;
    titleText.style.cssText = 'color: var(--text-accent); font-weight: 600; font-size: 18px;';
    titleContainer.appendChild(titleText);
    
    modalTitle.appendChild(titleContainer);
    
    // Clear body
    modalBody.innerHTML = '';
    
    // Create content based on method type
    await createAcquisitionModalContent(modalBody, materialName, methodName, methodInfo);
    
    // Show modal
    modal.classList.remove('hidden');
}

async function createAcquisitionModalContent(container, materialName, methodName, methodInfo) {
    // Skip redundant header for all modals since info is now in title
    
    // Method-specific content with icons
    const methodContent = document.createElement('div');
    methodContent.style.cssText = 'margin-bottom: 16px;';
    
    // Create content asynchronously with proper icon loading
    if (methodName === 'Purchase') {
        await createPurchaseContentAsync(methodContent, methodInfo);
    } else if (methodName === 'Market') {
        await createMarketContentAsync(methodContent, methodInfo);
    } else if (methodName === 'Monster Drop') {
        await createMonsterDropContentAsync(methodContent, methodInfo);
    } else if (methodName === 'Quest Reward') {
        await createQuestRewardContentAsync(methodContent, methodInfo);
    } else if (methodName === 'Crafting') {
        await createCraftingContentAsync(methodContent, methodInfo);
    } else if (methodName === 'Processing') {
        await createProcessingContentAsync(methodContent, methodInfo);
    } else if (methodName === 'Gathering') {
        await createGatheringContentAsync(methodContent, methodInfo);
    } else if (methodName === 'Exchange') {
        await createExchangeContentAsync(methodContent, methodInfo);
    } else {
        await createGenericContentAsync(methodContent, methodInfo);
    }
    
    container.appendChild(methodContent);
    
    // No longer adding external links section here - sources are now clickable
}

// Content creation functions for different acquisition methods
// Helper function to get method-specific icons
function getMethodIcon(methodName) {
    const iconMap = {
        'Purchase': '🛍️',
        'Market': '🏪', 
        'Monster Drop': '🐉',
        'Quest Reward': '🏹',
        'Crafting': '🔨',
        'Processing': '⚙️',
        'Gathering': '🌿',
        'Exchange': '🔄'
    };
    return iconMap[methodName] || '📋';
}

// Helper function to create clickable source links
function createSourceLink(source, searchType = 'items') {
    const searchTerm = source.split('(')[0].trim(); // Remove price info for search
    const bdocodexUrl = `https://bdocodex.com/us/${searchType}/?q=${encodeURIComponent(searchTerm)}`;
    return `<a href="${bdocodexUrl}" target="_blank" style="color: var(--accent-primary); text-decoration: none; border-bottom: 1px dotted var(--accent-primary);" onmouseover="this.style.color='var(--accent-secondary)'" onmouseout="this.style.color='var(--accent-primary)'">${source}</a>`;
}

// Enhanced async source content creation with proper icon loading
async function createSourceContentAsync(container, sources, fallbackSearchType) {
    const sourceList = document.createElement('div');
    sourceList.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
    
    if (Array.isArray(sources)) {
        // Handle old array format
        for (const source of sources) {
            const sourceItem = await createSourceItemAsync(source, fallbackSearchType);
            sourceList.appendChild(sourceItem);
        }
    } else {
        // Handle new object format with enhanced icon loading
        for (const [sourceName, sourceData] of Object.entries(sources)) {
            let sourceItem;
            if (typeof sourceData === 'object' && sourceData.icon && sourceData.url) {
                // Use embedded icon/URL data but enhance with proper icon loading
                sourceItem = await createSourceItemAsync(sourceName, fallbackSearchType, sourceData);
            } else {
                // Use centralized icon mapping
                sourceItem = await createSourceItemAsync(sourceName, fallbackSearchType);
            }
            sourceList.appendChild(sourceItem);
        }
    }
    
    container.appendChild(sourceList);
}

// Create individual source item with proper icon and clickability
async function createSourceItemAsync(sourceName, fallbackSearchType, embeddedData = null) {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 4px 0;';
    
    // Create icon - prefer centralized mapping over embedded data
    // Clean source name for icon lookup (remove level prefixes and other formatting)
    let cleanSourceName = sourceName.replace(/^\[Level \d+\]\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    
    // Special handling for processing entries: extract the item name from "Verb ItemName" format
    if (fallbackSearchType === 'items' && /^(Heating|Chopping|Melting|Grinding|Drying|Processing)\s+/.test(cleanSourceName)) {
        // Extract the item name after the processing verb
        cleanSourceName = cleanSourceName.replace(/^(Heating|Chopping|Melting|Grinding|Drying|Processing)\s+/, '').trim();
    }
    
    const iconInfo = iconLoader.getIconInfo(cleanSourceName);
    let icon;
    
    if (iconInfo || embeddedData) {
        // Use clickable icon that links to BDO Codex
        icon = await iconLoader.createClickableIcon(cleanSourceName, "sm", {
            className: 'source-icon',
            style: {
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: '1px solid var(--bg-quaternary)',
                flexShrink: '0'
            }
        });
    } else {
        // Fallback icon when no mapping exists
        icon = await iconLoader.createIcon(cleanSourceName, "sm", {
            clickable: false,
            className: 'source-icon fallback',
            style: {
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: '1px solid var(--bg-quaternary)',
                flexShrink: '0'
            }
        });
    }
    
    item.appendChild(icon);
    
    // Create text content with special formatting for processing entries
    const textContainer = document.createElement('div');
    textContainer.style.cssText = 'flex: 1; display: flex; align-items: center;';
    
    let textElement;
    
    // If we have icon info (URL exists), make the text clickable
    if (iconInfo && iconInfo.url) {
        textElement = document.createElement('a');
        textElement.href = iconInfo.url;
        textElement.target = '_blank';
        textElement.rel = 'noopener noreferrer';
        textElement.style.cssText = `
            color: var(--text-primary); 
            font-size: 14px; 
            text-decoration: none;
            flex: 1;
            transition: color 0.2s ease;
        `;
        textElement.addEventListener('mouseenter', () => {
            textElement.style.color = 'var(--accent-primary)';
        });
        textElement.addEventListener('mouseleave', () => {
            textElement.style.color = 'var(--text-primary)';
        });
    } else {
        textElement = document.createElement('span');
        textElement.style.cssText = 'color: var(--text-primary); font-size: 14px; flex: 1;';
    }
    
    // Special formatting for processing entries: show "Icon + Verb + Item" with verb highlighted
    if (fallbackSearchType === 'items' && /^(Heating|Chopping|Melting|Grinding|Drying|Processing)\s+/.test(sourceName.replace(/^\[Level \d+\]\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim())) {
        const cleanSource = sourceName.replace(/^\[Level \d+\]\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
        const match = cleanSource.match(/^(Heating|Chopping|Melting|Grinding|Drying|Processing)\s+(.+)$/);
        if (match) {
            const [, verb, itemName] = match;
            
            // Map processing types to their corresponding icons
            const processingIconMap = {
                'Chopping': 'chopping.webp',
                'Heating': 'cooking.webp',
                'Melting': 'grinding.webp',
                'Grinding': 'grinding.webp',
                'Drying': 'drying.webp',
                'Processing': 'manufaturing.webp'
            };
            
            const iconFile = processingIconMap[verb];
            if (iconFile) {
                const processingIcon = document.createElement('img');
                processingIcon.src = `icons/${iconFile}`;
                processingIcon.alt = verb;
                processingIcon.style.cssText = `
                    width: 16px;
                    height: 16px;
                    margin-right: 4px;
                    vertical-align: middle;
                    display: inline-block;
                `;
                
                // Create a container for the icon and text
                const contentContainer = document.createElement('span');
                contentContainer.style.cssText = 'display: flex; align-items: center;';
                
                contentContainer.appendChild(processingIcon);
                
                const textSpan = document.createElement('span');
                textSpan.innerHTML = `<span style="color: var(--accent-secondary); font-weight: 500;">${verb}</span> ${itemName}`;
                contentContainer.appendChild(textSpan);
                
                textElement.innerHTML = '';
                textElement.appendChild(contentContainer);
            } else {
                textElement.innerHTML = `<span style="color: var(--accent-secondary); font-weight: 500;">${verb}</span> ${itemName}`;
            }
        } else {
            textElement.textContent = sourceName;
        }
    } else {
        textElement.textContent = sourceName;
    }
    
    // Add additional info if available
    if (embeddedData && typeof embeddedData === 'string') {
        textElement.textContent += ` (${embeddedData})`;
    }
    
    textContainer.appendChild(textElement);
    item.appendChild(textContainer);
    
    // Add hover effects and click handlers for interactive items
    if (iconInfo && iconInfo.url) {
        item.style.cursor = 'pointer';
        
        // Add click handler for the entire item
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(iconInfo.url, '_blank', 'noopener,noreferrer');
        });
        
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
            item.style.borderRadius = '4px';
        });
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
        });
    }
    
    return item;
}

// Legacy function for backwards compatibility
function createSourceContent(sources, fallbackSearchType) {
    if (Array.isArray(sources)) {
        // Handle old array format
        return sources.map(source => `• ${createSourceLink(source, fallbackSearchType)}`).join('<br>');
    } else {
        // Handle new object format with icons and URLs
        return Object.entries(sources).map(([sourceName, sourceData]) => {
            if (typeof sourceData === 'object' && sourceData.icon && sourceData.url) {
                return `• <img src="icons/${sourceData.icon}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;"> <a href="${sourceData.url}" target="_blank" style="color: var(--accent-primary); text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${sourceName}</a>`;
            } else {
                // Fallback for mixed format
                return `• ${createSourceLink(sourceName, fallbackSearchType)}`;
            }
        }).join('<br>');
    }
}

function createPurchaseContent(sources) {
    return `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--warning);">🛍️ Purchase from NPCs</div>
        <div style="color: var(--text-secondary); line-height: 1.5;">
            ${createSourceContent(sources, 'npcs')}
        </div>
    `;
}

function createMarketContent(sources) {
    return `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--info);">🏪 Central Market</div>
        <div style="color: var(--text-secondary); line-height: 1.5;">
            Available for purchase on the Central Market<br>
            ${createSourceContent(sources, 'items')}
        </div>
    `;
}

function createMonsterDropContent(sources) {
    return `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--error);">🐉 Monster Drops</div>
        <div style="color: var(--text-secondary); line-height: 1.5;">
            ${createSourceContent(sources, 'npcs')}
        </div>
    `;
}

function createQuestRewardContent(sources) {
    return `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--success);">🏹 Quest Rewards</div>
        <div style="color: var(--text-secondary); line-height: 1.5;">
            ${createSourceContent(sources, 'quests')}
        </div>
    `;
}

function createCraftingContent(sources) {
    return `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--accent-primary);">🔨 Crafting</div>
        <div style="color: var(--text-secondary); line-height: 1.5;">
            ${createSourceContent(sources, 'workshops')}
        </div>
    `;
}

function createProcessingContent(sources) {
    return `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--accent-secondary);">⚙️ Processing</div>
        <div style="color: var(--text-secondary); line-height: 1.5;">
            ${createSourceContent(sources, 'items')}
        </div>
    `;
}

function createGatheringContent(sources) {
    return `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--success);">🌿 Gathering</div>
        <div style="color: var(--text-secondary); line-height: 1.5;">
            ${createSourceContent(sources, 'nodes')}
        </div>
    `;
}

function createExchangeContent(sources) {
    return `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--trade-tier-5);">🔄 Exchange</div>
        <div style="color: var(--text-secondary); line-height: 1.5;">
            ${createSourceContent(sources, 'items')}
        </div>
    `;
}

function createGenericContent(sources) {
    return `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-accent);">📋 Details</div>
        <div style="color: var(--text-secondary); line-height: 1.5;">
            ${createSourceContent(sources, 'items')}
        </div>
    `;
}

// Enhanced async content creation functions with proper icon loading
async function createPurchaseContentAsync(container, sources) {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: 600; margin-bottom: 8px; color: var(--warning);';
    header.innerHTML = '🛍️ Purchase from NPCs';
    container.appendChild(header);
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'color: var(--text-secondary); line-height: 1.5;';
    await createSourceContentAsync(contentDiv, sources, 'npcs');
    container.appendChild(contentDiv);
}

async function createMarketContentAsync(container, sources) {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: 600; margin-bottom: 8px; color: var(--info);';
    header.innerHTML = '🏪 Central Market';
    container.appendChild(header);
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'color: var(--text-secondary); line-height: 1.5;';
    contentDiv.innerHTML = 'Available for purchase on the Central Market<br>';
    await createSourceContentAsync(contentDiv, sources, 'items');
    container.appendChild(contentDiv);
}

async function createMonsterDropContentAsync(container, sources) {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: 600; margin-bottom: 8px; color: var(--error);';
    header.innerHTML = '🐉 Monster Drops';
    container.appendChild(header);
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'color: var(--text-secondary); line-height: 1.5;';
    await createSourceContentAsync(contentDiv, sources, 'npcs');
    container.appendChild(contentDiv);
}

async function createQuestRewardContentAsync(container, sources) {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: 600; margin-bottom: 8px; color: var(--success);';
    header.innerHTML = '🏹 Quest Rewards';
    container.appendChild(header);
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'color: var(--text-secondary); line-height: 1.5;';
    await createSourceContentAsync(contentDiv, sources, 'quests');
    container.appendChild(contentDiv);
}

async function createCraftingContentAsync(container, sources) {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: 600; margin-bottom: 8px; color: var(--accent-primary);';
    header.innerHTML = '🔨 Crafting';
    container.appendChild(header);
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'color: var(--text-secondary); line-height: 1.5;';
    await createSourceContentAsync(contentDiv, sources, 'workshops');
    container.appendChild(contentDiv);
}

async function createProcessingContentAsync(container, sources) {
    // For processing modals, we'll create a cleaner, more focused display
    const processingList = document.createElement('div');
    processingList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
    
    if (Array.isArray(sources)) {
        // Handle old array format
        for (const source of sources) {
            const processingItem = await createProcessingItemAsync(source);
            processingList.appendChild(processingItem);
        }
    } else {
        // Handle new object format
        for (const [sourceName, sourceData] of Object.entries(sources)) {
            const processingItem = await createProcessingItemAsync(sourceName, sourceData);
            processingList.appendChild(processingItem);
        }
    }
    
    container.appendChild(processingList);
}

// Create a focused processing item display
async function createProcessingItemAsync(sourceName, embeddedData = null) {
    const item = document.createElement('div');
    item.style.cssText = `
        display: flex; 
        align-items: center; 
        gap: 12px; 
        padding: 12px; 
        background: var(--bg-tertiary); 
        border-radius: 8px; 
        border: 1px solid var(--bg-quaternary);
    `;
    
    // Extract processing verb and item name
    const cleanSource = sourceName.replace(/^\[Level \d+\]\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const match = cleanSource.match(/^(Heating|Chopping|Melting|Grinding|Drying|Processing)\s+(.+)$/);
    
    if (match) {
        const [, verb, itemName] = match;
        
        // Map processing types to their corresponding icons
        const processingIconMap = {
            'Chopping': 'chopping.webp',
            'Heating': 'cooking.webp',
            'Melting': 'grinding.webp',
            'Grinding': 'grinding.webp',
            'Drying': 'drying.webp',
            'Processing': 'manufaturing.webp'
        };
        
        const iconFile = processingIconMap[verb];
        if (iconFile) {
            // Processing method icon
            const processingIcon = document.createElement('img');
            processingIcon.src = `icons/${iconFile}`;
            processingIcon.alt = verb;
            processingIcon.style.cssText = `
                width: 32px;
                height: 32px;
                border-radius: 6px;
                border: 1px solid var(--bg-quaternary);
                flex-shrink: 0;
            `;
            item.appendChild(processingIcon);
        }
        
        // Material icon (what we're processing) - use same approach as working text links
        const iconInfo = iconLoader.getIconInfo(itemName);
        if (iconInfo) {
            // Create non-clickable icon first
            const materialIcon = await iconLoader.createIcon(itemName, "sm", {
                clickable: false,
                className: 'material-icon',
                style: {
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    border: '1px solid var(--bg-quaternary)',
                    flexShrink: '0',
                    cursor: iconInfo.url ? 'pointer' : 'default'
                }
            });
            
            // Add the same click handler that works for text
            if (iconInfo.url) {
                materialIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.open(iconInfo.url, '_blank', 'noopener,noreferrer');
                });
            }
            
            item.appendChild(materialIcon);
        }
        
        // Text content - make item name clickable if URL exists
        const textContainer = document.createElement('div');
        textContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column;';
        
        const methodText = document.createElement('div');
        methodText.style.cssText = 'color: var(--accent-secondary); font-weight: 500; font-size: 14px;';
        methodText.textContent = verb;
        
        // Create clickable item name if URL exists
        if (iconInfo && iconInfo.url) {
            const itemLink = document.createElement('a');
            itemLink.href = iconInfo.url;
            itemLink.target = '_blank';
            itemLink.rel = 'noopener noreferrer';
            itemLink.textContent = itemName;
            itemLink.style.cssText = `
                color: var(--text-primary); 
                font-size: 16px; 
                margin-top: 2px;
                text-decoration: none;
                cursor: pointer;
                transition: color 0.2s ease;
            `;
            
            // Ensure link clicks work by preventing event bubbling
            itemLink.addEventListener('click', (e) => {
                e.stopPropagation();
                // Force open in new tab if default doesn't work
                window.open(iconInfo.url, '_blank', 'noopener,noreferrer');
            });
            
            itemLink.addEventListener('mouseenter', () => {
                itemLink.style.color = 'var(--accent-primary)';
            });
            itemLink.addEventListener('mouseleave', () => {
                itemLink.style.color = 'var(--text-primary)';
            });
            textContainer.appendChild(methodText);
            textContainer.appendChild(itemLink);
        } else {
            const itemText = document.createElement('div');
            itemText.style.cssText = 'color: var(--text-primary); font-size: 16px; margin-top: 2px;';
            itemText.textContent = itemName;
            textContainer.appendChild(methodText);
            textContainer.appendChild(itemText);
        }
        
        item.appendChild(textContainer);
        
    } else {
        // Fallback for non-standard format
        const textElement = document.createElement('div');
        textElement.style.cssText = 'color: var(--text-primary); font-size: 16px;';
        textElement.textContent = sourceName;
        item.appendChild(textElement);
    }
    
    // Add smooth transitions and hover effects
    item.style.transition = 'all 0.2s ease';
    item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'var(--bg-secondary)';
        item.style.transform = 'translateY(-2px)';
        item.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.1)';
        item.style.borderColor = 'var(--accent-primary)';
    });
    item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'var(--bg-tertiary)';
        item.style.transform = 'translateY(0)';
        item.style.boxShadow = 'none';
        item.style.borderColor = 'var(--bg-quaternary)';
    });
    
    return item;
}

async function createGatheringContentAsync(container, sources) {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: 600; margin-bottom: 8px; color: var(--success);';
    header.innerHTML = '🌿 Gathering';
    container.appendChild(header);
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'color: var(--text-secondary); line-height: 1.5;';
    await createSourceContentAsync(contentDiv, sources, 'nodes');
    container.appendChild(contentDiv);
}

async function createExchangeContentAsync(container, sources) {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: 600; margin-bottom: 8px; color: var(--trade-tier-5);';
    header.innerHTML = '🔄 Exchange';
    container.appendChild(header);
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'color: var(--text-secondary); line-height: 1.5;';
    await createSourceContentAsync(contentDiv, sources, 'items');
    container.appendChild(contentDiv);
}

async function createGenericContentAsync(container, sources) {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: 600; margin-bottom: 8px; color: var(--text-accent);';
    header.innerHTML = '📋 Details';
    container.appendChild(header);
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'color: var(--text-secondary); line-height: 1.5;';
    await createSourceContentAsync(contentDiv, sources, 'items');
    container.appendChild(contentDiv);
}

function refreshAllMaterialCards() {
    if (currentShip in recipes) {
        for (const part of Object.keys(recipes[currentShip])) {
            const val = recipes[currentShip][part];
            const name = part.includes('+') ? part.substring(4) : part;
            const storageId = `${currentShip}-${part}`;
            const currentQty = parseInt(getStorage(storageId)) || 0;
            
            if (name in recipes && !ships.includes(name)) {
                const subRecipeProgress = calculateSubRecipeProgress(name);
                const calculatedQty = Math.floor((subRecipeProgress / 100.0) * val);
                // For recipes, use calculated quantity (based on sub-materials) not stored quantity
                refreshMaterialCardProgress(name, val, calculatedQty);
            } else {
                refreshMaterialCardProgress(name, val, currentQty);
            }
        }
    }
    
    updateOverallProgress();
}

function refreshMaterialCardProgress(materialName, requiredQty, currentQty) {
    const cards = document.querySelectorAll(`.material-card[data-material="${materialName.toLowerCase()}"]`);
    
    for (const card of cards) {
        // Update quantity input
        const quantityInputs = card.querySelectorAll('.quantity-input');
        for (const qtyInput of quantityInputs) {
            qtyInput.value = currentQty;
        }
        
        // Update circular progress
        const progressCircles = card.querySelectorAll('.progress-fill');
        for (const circle of progressCircles) {
            let progressPercentage;
            if (materialName in recipes && !ships.includes(materialName)) {
                progressPercentage = calculateSubRecipeProgress(materialName);
            } else {
                progressPercentage = requiredQty > 0 ? (currentQty / requiredQty * 100) : 0;
            }
            
            const circumference = 2 * Math.PI * 30;
            const newOffset = circumference - (progressPercentage / 100 * circumference);
            circle.style.strokeDashoffset = newOffset;
            
            // Update completed class
            if (progressPercentage >= 100) {
                circle.classList.add('completed');
            } else {
                circle.classList.remove('completed');
            }
        }
        
        // Update progress text
        const progressTexts = card.querySelectorAll('.progress-text');
        for (const text of progressTexts) {
            let progressPercentage;
            if (materialName in recipes && !ships.includes(materialName)) {
                progressPercentage = calculateSubRecipeProgress(materialName);
            } else {
                progressPercentage = requiredQty > 0 ? (currentQty / requiredQty * 100) : 0;
            }
            text.textContent = progressPercentage >= 100 ? '100%' : `${Math.floor(progressPercentage * 1000) / 1000}%`;
            
            // Add/remove completed class for styling
            if (progressPercentage >= 100) {
                text.classList.add('completed');
            } else {
                text.classList.remove('completed');
            }
        }
        
        // Update completion status
        let isComplete;
        if (materialName in recipes && !ships.includes(materialName)) {
            isComplete = calculateSubRecipeProgress(materialName) >= 100;
        } else {
            isComplete = currentQty >= requiredQty;
        }
        card.setAttribute('data-completed', isComplete ? 'true' : 'false');
    }
}

// Sync all materials across all tabs by refreshing all material cards
function syncMaterialAcrossAllTabs(materialName) {
    // Simply refresh all material cards to ensure synchronization
    refreshAllMaterialCards();
    
    // Update ship selector progress in real-time
    updateShipSelectorProgress();
}

async function createShipCard(shipName) {
    const card = document.createElement('div');
    card.className = 'ship-card fade-in';
    card.id = `ship-card-${shipName.replace(/[ ()]/g, '-')}`;
    card.style.cssText = `
        background: var(--bg-secondary);
        border: 2px solid var(--bg-tertiary);
        border-radius: var(--radius-lg);
        padding: var(--space-lg);
        cursor: pointer;
        transition: all var(--transition-normal);
        text-align: center;
        min-height: 200px;
    `;
    
    // Hover effects
    card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'var(--accent-primary)';
        card.style.transform = 'translateY(-4px)';
        card.style.boxShadow = '0 8px 24px rgba(74, 158, 255, 0.2)';
    });
    
    card.addEventListener('mouseleave', () => {
        if (!card.classList.contains('selected')) {
            card.style.borderColor = 'var(--bg-tertiary)';
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
        }
    });
    
    // Header
    const header = document.createElement('div');
    header.className = 'ship-card-header';
    
    // Icon
    const icon = await iconLoader.createShipIcon(shipName, "xxl");
    icon.classList.add("ship-icon");
    icon.style.cssText = 'margin: 0 auto var(--space-md) auto;';
    header.appendChild(icon);
    
    const title = document.createElement('h3');
    title.textContent = shipName;
    title.className = 'ship-card-title';
    title.style.cssText = 'color: var(--text-accent); margin: 0 0 var(--space-md) 0;';
    header.appendChild(title);
    
    card.appendChild(header);
    
    // Description
    const descriptions = {
        "Epheria Sailboat": "Entry-level ocean vessel for exploration",
        "Improved Epheria Sailboat": "Enhanced sailboat with better performance",
        "Epheria Caravel": "Versatile trading vessel with cargo capacity",
        "Carrack (Advance)": "High-speed carrack for fast travel",
        "Carrack (Balance)": "Well-rounded carrack for all activities",
        "Epheria Frigate": "Combat vessel for sea monster hunting",
        "Improved Epheria Frigate": "Enhanced frigate with superior firepower",
        "Epheria Galleass": "Large cargo ship for extensive trading",
        "Carrack (Volante)": "Speed-focused carrack for rapid traversal",
        "Carrack (Valor)": "Combat-oriented carrack with firepower",
        "Panokseon": "Traditional Korean warship"
    };
    
    if (descriptions[shipName]) {
        const desc = document.createElement('div');
        desc.textContent = descriptions[shipName];
        desc.className = 'ship-card-description';
        desc.style.cssText = 'color: var(--text-secondary); margin-bottom: var(--space-md);';
        card.appendChild(desc);
    }
    
    // Progress for ships with recipes
    if (shipName in recipes) {
        const progress = getShipProgress(shipName);
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        
        const progressText = document.createElement('div');
        progressText.style.cssText = 'margin-bottom: var(--space-sm);';
        
        const progressSpan = document.createElement('span');
        progressSpan.textContent = `Progress: ${progress >= 100 ? '100%' : `${Math.floor(progress * 1000) / 1000}%`}`;
        progressSpan.style.color = 'var(--text-primary)';
        progressText.appendChild(progressSpan);
        
        let status;
        if (progress === 100) {
            status = document.createElement('span');
            status.textContent = ' Complete';
            status.style.cssText = 'color: var(--success); font-weight: bold; margin-left: var(--space-sm);';
        } else if (progress > 0) {
            status = document.createElement('span');
            status.textContent = ' In Progress';
            status.style.cssText = 'color: var(--warning); font-weight: bold; margin-left: var(--space-sm);';
        } else {
            status = document.createElement('span');
            status.textContent = ' Not Started';
            status.style.cssText = 'color: var(--text-secondary); font-weight: bold; margin-left: var(--space-sm);';
        }
        
        progressText.appendChild(status);
        progressContainer.appendChild(progressText);
        
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            width: 100%; 
            height: 6px; 
            background: var(--bg-tertiary); 
            border-radius: 3px;
        `;
        
        const progressFill = document.createElement('div');
        progressFill.style.cssText = `
            width: ${progress}%; 
            height: 100%; 
            background: var(--accent-primary); 
            border-radius: 3px;
            transition: width 0.3s ease;
        `;
        progressBar.appendChild(progressFill);
        progressContainer.appendChild(progressBar);
        
        card.appendChild(progressContainer);
    }
    
    // Click handler
    card.addEventListener('click', async () => {
        currentShip = shipName;
        setStorage('ship', shipName);
        updateShipSelection();
        await loadShipMaterials();
    });
    
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    
    return card;
}

async function createShipList() {
    // Initialize the new compact ship selector
    await initCompactShipSelector();
}

async function initCompactShipSelector() {
    // Preload ship icons for better performance
    await iconLoader.preloadIcons(ships);
    
    // Get descriptions mapping
    const descriptions = {
        "Epheria Sailboat": "Entry-level ocean vessel for exploration",
        "Improved Epheria Sailboat": "Enhanced sailboat with better performance",
        "Epheria Caravel": "Versatile trading vessel with cargo capacity",
        "Carrack (Advance)": "High-speed carrack for fast travel",
        "Carrack (Balance)": "Well-rounded carrack for all activities",
        "Epheria Frigate": "Combat vessel for sea monster hunting",
        "Improved Epheria Frigate": "Enhanced frigate with superior firepower",
        "Epheria Galleass": "Large cargo ship for extensive trading",
        "Carrack (Volante)": "Speed-focused carrack for rapid traversal",
        "Carrack (Valor)": "Combat-oriented carrack with firepower",
        "Panokseon": "Traditional Korean warship"
    };
    
    // Update current selection display
    await updateCurrentShipDisplay(currentShip, descriptions);
    
    // Populate dropdown options
    await populateShipDropdown(descriptions);
    
    // Set up event handlers
    setupShipSelectorEvents();
}

async function updateCurrentShipDisplay(shipName, descriptions) {
    const iconElement = document.getElementById('ship-current-icon');
    const nameElement = document.getElementById('ship-current-name');
    const descElement = document.getElementById('ship-current-desc');
    const progressElement = document.getElementById('ship-current-progress');
    
    // Update icon
    iconElement.innerHTML = '';
    const icon = await iconLoader.createShipIcon(shipName, "lg");
    iconElement.appendChild(icon);
    
    // Update text content
    nameElement.textContent = shipName;
    descElement.textContent = descriptions[shipName] || "Maritime vessel";
    
    // Update ship stats
    const statsElement = document.getElementById('ship-current-stats');
    if (statsElement) {
        statsElement.innerHTML = '';
        const allStats = getAllShipStats(shipName);
        if (allStats) {
            const statsDisplay = createCompactStatDisplay(allStats, 'ship-current-stats');
            statsElement.appendChild(statsDisplay);
        }
    }
    
    // Update progress
    if (shipName in recipes) {
        const progress = getShipProgress(shipName);
        let status;
        if (progress === 100) {
            status = 'Complete';
        } else if (progress > 0) {
            status = 'In Progress';
        } else {
            status = 'Not Started';
        }
        const formattedProgress = progress >= 100 ? '100%' : `${Math.floor(progress * 1000) / 1000}%`;
        progressElement.textContent = `Progress: ${formattedProgress} • ${status}`;
        
        // Force update overall progress dashboard after ship selection
        updateOverallProgress();
        
        // Force refresh floating dashboard to ensure perfect sync after ship change
        refreshFloatingDashboard();
    } else {
        progressElement.textContent = 'No recipe available';
    }
}

async function populateShipDropdown(descriptions) {
    const dropdownContent = document.getElementById('ship-dropdown-content');
    dropdownContent.innerHTML = '';
    
    for (const ship of ships) {
        const option = await createShipOption(ship, descriptions);
        dropdownContent.appendChild(option);
    }
}

async function createShipOption(shipName, descriptions) {
    const option = document.createElement('div');
    option.className = 'ship-option';
    option.setAttribute('data-ship', shipName);
    
    // Icon
    const iconContainer = document.createElement('div');
    iconContainer.className = 'ship-option-icon';
    const icon = await iconLoader.createShipIcon(shipName, "sm");
    iconContainer.appendChild(icon);
    
    // Details
    const details = document.createElement('div');
    details.className = 'ship-option-details';
    
    const name = document.createElement('div');
    name.className = 'ship-option-name';
    name.textContent = shipName;
    
    const desc = document.createElement('div');
    desc.className = 'ship-option-desc';
    desc.textContent = descriptions[shipName] || "Maritime vessel";
    
    details.appendChild(name);
    details.appendChild(desc);
    
    // Add ship stats
    const allStats = getAllShipStats(shipName);
    if (allStats) {
        const statsDisplay = createCompactStatDisplay(allStats, 'ship-option-stats');
        details.appendChild(statsDisplay);
    }
    
    // Progress
    const progressContainer = document.createElement('div');
    progressContainer.className = 'ship-option-progress';
    
    if (shipName in recipes) {
        const progress = getShipProgress(shipName);
        let status, color;
        if (progress === 100) {
            status = 'Complete';
            color = 'var(--success)';
        } else if (progress > 0) {
            status = 'In Progress';
            color = 'var(--warning)';
        } else {
            status = 'Not Started';
            color = 'var(--text-tertiary)';
        }
        progressContainer.innerHTML = `
            <div style="color: ${color}; font-weight: 600;">${progress.toFixed(1)}%</div>
            <div style="color: var(--text-tertiary);">${status}</div>
        `;
    } else {
        progressContainer.innerHTML = `<div style="color: var(--text-tertiary);">No Recipe</div>`;
    }
    
    option.appendChild(iconContainer);
    option.appendChild(details);
    option.appendChild(progressContainer);
    
    // Mark as selected if current ship
    if (shipName === currentShip) {
        option.classList.add('selected');
    }
    
    // Add click handler
    option.addEventListener('click', async () => {
        await selectShip(shipName);
    });
    
    return option;
}

function setupShipSelectorEvents() {
    const trigger = document.getElementById('ship-selector-trigger');
    const currentInfo = document.getElementById('ship-current-info');
    const dropdownMenu = document.getElementById('ship-dropdown-menu');
    const searchInput = document.getElementById('ship-search-input');
    
    // Toggle dropdown
    const toggleDropdown = (open) => {
        const isOpen = open !== undefined ? open : trigger.getAttribute('aria-expanded') !== 'true';
        trigger.setAttribute('aria-expanded', isOpen);
        dropdownMenu.classList.toggle('hidden', !isOpen);
        
        // Focus search input when opening
        if (isOpen) {
            setTimeout(() => {
                searchInput.focus();
                searchInput.select();
            }, 100);
            // Reset keyboard navigation
            selectedIndex = -1;
            document.querySelectorAll('.ship-option').forEach(option => {
                option.classList.remove('keyboard-selected');
            });
        } else {
            searchInput.value = '';
            filterShipOptions('');
            selectedIndex = -1;
            document.querySelectorAll('.ship-option').forEach(option => {
                option.classList.remove('keyboard-selected');
            });
        }
    };
    
    // Open dropdown when clicking trigger or current selection
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown();
    });
    
    currentInfo.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown();
    });
    
    
    let selectedIndex = -1;
    
    const updateSelectedOption = (index) => {
        const visibleOptions = document.querySelectorAll('.ship-option:not(.hidden)');
        
        // Remove previous highlight
        document.querySelectorAll('.ship-option').forEach(option => {
            option.classList.remove('keyboard-selected');
        });
        
        if (visibleOptions.length > 0) {
            selectedIndex = Math.max(0, Math.min(index, visibleOptions.length - 1));
            visibleOptions[selectedIndex].classList.add('keyboard-selected');
            
            // Scroll into view if needed
            visibleOptions[selectedIndex].scrollIntoView({ 
                block: 'nearest', 
                behavior: 'smooth' 
            });
        }
    };
    
    searchInput.addEventListener('keydown', (e) => {
        const visibleOptions = document.querySelectorAll('.ship-option:not(.hidden)');
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                updateSelectedOption(selectedIndex + 1);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                updateSelectedOption(selectedIndex - 1);
                break;
                
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < visibleOptions.length) {
                    visibleOptions[selectedIndex].click();
                } else if (visibleOptions.length > 0) {
                    visibleOptions[0].click();
                }
                break;
                
            case 'Escape':
                toggleDropdown(false);
                break;
        }
    });
    
    // Reset selected index when search changes
    searchInput.addEventListener('input', (e) => {
        selectedIndex = -1;
        document.querySelectorAll('.ship-option').forEach(option => {
            option.classList.remove('keyboard-selected');
        });
        filterShipOptions(e.target.value);
    });
    
    // Prevent closing dropdown when clicking inside
    dropdownMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.ship-selector-container')) {
            toggleDropdown(false);
        }
    });
    
    // Close dropdown on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            toggleDropdown(false);
        }
    });
}

function filterShipOptions(searchTerm) {
    const options = document.querySelectorAll('.ship-option');
    const term = searchTerm.toLowerCase().trim();
    
    options.forEach(option => {
        const shipName = option.getAttribute('data-ship').toLowerCase();
        const matches = shipName.includes(term);
        option.classList.toggle('hidden', !matches);
    });
}

function updateShipSelectorProgress() {
    // Update current ship display progress
    const progressElement = document.getElementById('ship-current-progress');
    if (progressElement && currentShip in recipes) {
        const progress = getShipProgress(currentShip);
        let status;
        if (progress === 100) {
            status = 'Complete';
        } else if (progress > 0) {
            status = 'In Progress';
        } else {
            status = 'Not Started';
        }
        const formattedProgress = progress >= 100 ? '100%' : `${Math.floor(progress * 1000) / 1000}%`;
        progressElement.textContent = `Progress: ${formattedProgress} • ${status}`;
    }
    
    // Update dropdown option progress for ALL ships
    const allShipOptions = document.querySelectorAll('.ship-option');
    allShipOptions.forEach(shipOption => {
        const shipName = shipOption.getAttribute('data-ship');
        if (shipName && shipName in recipes) {
            const progress = getShipProgress(shipName);
            const progressContainer = shipOption.querySelector('.ship-option-progress');
            if (progressContainer) {
                let status, color;
                if (progress === 100) {
                    status = 'Complete';
                    color = 'var(--success)';
                } else if (progress > 0) {
                    status = 'In Progress';
                    color = 'var(--warning)';
                } else {
                    status = 'Not Started';
                    color = 'var(--text-tertiary)';
                }
                progressContainer.innerHTML = `
                    <div style="color: ${color}; font-weight: 600;">${progress >= 100 ? '100%' : `${Math.floor(progress * 1000) / 1000}%`}</div>
                    <div style="color: var(--text-tertiary);">${status}</div>
                `;
            }
        }
    });
}

async function selectShip(shipName) {
    // Update current ship
    currentShip = shipName;
    setStorage('ship', currentShip);
    
    // Update current selection display
    const descriptions = {
        "Epheria Sailboat": "Entry-level ocean vessel for exploration",
        "Improved Epheria Sailboat": "Enhanced sailboat with better performance",
        "Epheria Caravel": "Versatile trading vessel with cargo capacity",
        "Carrack (Advance)": "High-speed carrack for fast travel",
        "Carrack (Balance)": "Well-rounded carrack for all activities",
        "Epheria Frigate": "Combat vessel for sea monster hunting",
        "Improved Epheria Frigate": "Enhanced frigate with superior firepower",
        "Epheria Galleass": "Large cargo ship for extensive trading",
        "Carrack (Volante)": "Speed-focused carrack for rapid traversal",
        "Carrack (Valor)": "Combat-oriented carrack with firepower",
        "Panokseon": "Traditional Korean warship"
    };
    
    await updateCurrentShipDisplay(shipName, descriptions);
    
    // Update dropdown selection
    document.querySelectorAll('.ship-option').forEach(option => {
        option.classList.toggle('selected', option.getAttribute('data-ship') === shipName);
    });
    
    // Close dropdown
    document.getElementById('ship-selector-trigger').setAttribute('aria-expanded', 'false');
    document.getElementById('ship-dropdown-menu').classList.add('hidden');
    
    // Load materials for selected ship
    await loadShipMaterials();
}

// Helper function to get all ship stats for compact display
function getAllShipStats(shipName) {
    const stats = shipstats[shipName];
    if (!stats) return null;
    
    // Return all stats with improved labels for compact display
    const allStats = {};
    Object.entries(stats).forEach(([key, value]) => {
        // Map to more compact labels where appropriate
        switch(key) {
            case 'Base LT':
                allStats['Load'] = value;
                break;
            case 'Inventory':
                allStats['Slots'] = value;
                break;
            case 'Cannon Count':
                allStats['Cannons'] = value;
                break;
            case 'Cannon Reload':
                allStats['Reload'] = value;
                break;
            default:
                allStats[key] = value;
        }
    });
    
    return allStats;
}

// More representative nautical SVG icons
function createNauticalIcon(iconName, size = 14) {
    const icons = {
        'HP': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5Z"/></svg>`,
        
        'Durability': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
        
        'Rations': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6s7.56 2.54 8.5 6c-.94 3.46-4.94 6-8.5 6s-7.56-2.54-8.5-6Z"/><path d="M18 10.5c-.64 0-1.23.2-1.72.54L15 12l1.28.96c.49.34 1.08.54 1.72.54s1.23-.2 1.72-.54L21 12l-1.28-.96c-.49-.34-1.08-.54-1.72-.54Z"/><path d="M9 10.5c-.64 0-1.23.2-1.72.54L6 12l1.28.96c.49.34 1.08.54 1.72.54s1.23-.2 1.72-.54L12 12l-1.28-.96c-.49-.34-1.08-.54-1.72-.54Z"/></svg>`,
        
        'Load': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L3 7v10c0 5.55 3.84 10 9 11 5.16-1 9-5.45 9-11V7l-9-5Z"/><path d="m9 12 2 2 4-4"/></svg>`,
        
        'Speed': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.1c1.9-1.2 4.1-1.2 6 0l1.9 1.2c.7.4 1.1 1.2 1.1 2v7.4c0 .8-.4 1.6-1.1 2L14 16.9c-1.9 1.2-4.1 1.2-6 0L6.1 15.7c-.7-.4-1.1-1.2-1.1-2V6.3c0-.8.4-1.6 1.1-2L8 3.1Z"/><path d="M12 8v8"/><path d="M12 8l-2-2"/><path d="M12 8l2-2"/></svg>`,
        
        'Accel': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14h10l-5-7Z"/><path d="M12 14v7"/><path d="M12 7V2"/></svg>`,
        
        'Turn': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3"/><path d="M19 11a7 7 0 1 1-7-7"/><path d="m21 9-2 2-2-2"/></svg>`,
        
        'Brake': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v8"/><path d="M6 8c-2.2 0-4 1.8-4 4s1.8 4 4 4h12c2.2 0 4-1.8 4-4s-1.8-4-4-4"/><path d="M12 2L8 6l4 4 4-4Z"/></svg>`,
        
        'Slots': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
        
        'Cabins': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/></svg>`,
        
        'Cannons': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/><path d="M12 3v2"/><path d="M12 19v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>`,
        
        'Reload': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`
    };
    
    return icons[iconName] || `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 8 22l4-9 4 9Z"/></svg>`;
}

// Map labels to full stat names for tooltips
function getStatDisplayName(label) {
    const statNames = {
        'HP': 'Health Points',
        'Durability': 'Ship Durability',
        'Rations': 'Ship Rations',
        'Load': 'Load Capacity (Base LT)',
        'Speed': 'Movement Speed',
        'Accel': 'Acceleration',
        'Turn': 'Turn Rate',
        'Brake': 'Braking Power',
        'Slots': 'Inventory Slots',
        'Cabins': 'Cabin Count',
        'Cannons': 'Cannon Count',
        'Reload': 'Reload Time'
    };
    return statNames[label] || label;
}

// Helper function to create stat icons for compact display
function createCompactStatDisplay(stats, className = 'compact-stats') {
    const container = document.createElement('div');
    container.className = className;
    
    Object.entries(stats).forEach(([label, value]) => {
        const statItem = document.createElement('span');
        statItem.className = 'compact-stat-item';
        statItem.setAttribute('title', `${getStatDisplayName(label)}: ${value}`);
        
        const iconContainer = document.createElement('span');
        iconContainer.className = 'stat-icon';
        iconContainer.innerHTML = createNauticalIcon(label, 12);
        
        const valueSpan = document.createElement('span');
        valueSpan.textContent = value;
        
        statItem.appendChild(iconContainer);
        statItem.appendChild(valueSpan);
        container.appendChild(statItem);
    });
    
    return container;
}


function updateShipSelection() {
    for (const ship of ships) {
        const cardId = `ship-card-${ship.replace(/[ ()]/g, '-')}`;
        const card = document.getElementById(cardId);
        if (card) {
            if (ship === currentShip) {
                card.classList.add("selected");
                card.style.borderColor = 'var(--accent-primary)';
                card.style.boxShadow = '0 8px 24px rgba(74, 158, 255, 0.3)';
            } else {
                card.classList.remove("selected");
                card.style.borderColor = 'var(--bg-tertiary)';
                card.style.boxShadow = 'none';
                card.style.transform = 'translateY(0)';
            }
        }
    }
}

async function loadShipMaterials() {
    if (!(currentShip in recipes)) {
        return;
    }
    
    // Show sections
    document.getElementById('progress-dashboard').style.display = 'grid';
    document.getElementById('materials-section').style.display = 'block';
    
    // Update enhancement stones icon for the current ship
    updateEnhancementStoneIcon();
    
    // Clear all material containers
    for (const tab of ['all', 'basic', 'recipes']) {
        document.getElementById(`${tab}-materials`).innerHTML = '';
    }
    
    // Preload material icons for better performance
    const materialNames = Object.keys(recipes[currentShip]).map(part => 
        part.includes('+') ? part.substring(4) : part
    );
    await iconLoader.preloadIcons(materialNames);
    
    // Load materials by category
    const materialCounts = { all: 0, basic: 0, recipes: 0 };
    const animatedCards = [];
    
    for (const [part, val] of Object.entries(recipes[currentShip])) {
        const name = part.includes('+') ? part.substring(4) : part;
        
        // Get current quantity from storage
        const storageId = `${currentShip}-${part}`;
        let currentQty = parseInt(getStorage(storageId)) || 0;
        
        // For recipe items, calculate quantity based on sub-recipe progress
        if (name in recipes && !ships.includes(name)) {
            const subRecipeProgress = calculateSubRecipeProgress(name);
            currentQty = Math.floor((subRecipeProgress / 100.0) * val);
        }
        
        // Categorize and create card
        const category = categorizeMaterial(name);
        if (currentQty < val) {
            materialCounts[category] += 1;
            materialCounts.all += 1;
        }
        
        // Create card for category-specific tab
        const card = await createMaterialCard(name, val, currentQty, part);
        card.setAttribute('data-material', name.toLowerCase());
        card.setAttribute('data-category', category);
        card.setAttribute('data-completed', currentQty >= val ? 'true' : 'false');
        
        // Add acquisition method classes for filtering
        const methods = getAcquisitionMethods(name);
        for (const [methodType] of methods) {
            card.classList.add(`has-${methodType}`);
        }
        
        // Set initial state for animation (invisible)
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px) scale(0.9)';
        
        // Add to category-specific tab
        document.getElementById(`${category}-materials`).appendChild(card);
        animatedCards.push(card);
        
        // Create a copy for the "All" tab
        const allCard = await createMaterialCard(name, val, currentQty, part);
        allCard.setAttribute('data-material', name.toLowerCase());
        allCard.setAttribute('data-category', category);
        allCard.setAttribute('data-completed', currentQty >= val ? 'true' : 'false');
        
        // Add acquisition method classes for filtering
        for (const [methodType] of methods) {
            allCard.classList.add(`has-${methodType}`);
        }
        
        // Add category badge to the meta section for the "All" tab
        const metaSection = allCard.querySelector('.material-card-meta');
        if (metaSection) {
            const categoryBadge = document.createElement('span');
            categoryBadge.className = 'badge badge-category';
            categoryBadge.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            categoryBadge.style.cssText = `
                background: linear-gradient(135deg, var(--bg-tertiary) 0%, var(--bg-quaternary) 100%);
                color: var(--text-accent);
                border: 1px solid var(--accent-primary);
                order: -1;
            `;
            metaSection.appendChild(categoryBadge);
        }
        
        // Set initial state for animation (invisible)
        allCard.style.opacity = '0';
        allCard.style.transform = 'translateY(30px) scale(0.9)';
        
        document.getElementById('all-materials').appendChild(allCard);
        animatedCards.push(allCard);
    }
    
    // Update tab badges
    for (const [category, count] of Object.entries(materialCounts)) {
        const badge = document.getElementById(`${category}-count`);
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline' : 'none';
    }
    
    // Elegant staggered reveal - like ripples in water
    animUtils.staggerReveal(animatedCards);
    
    updateOverallProgress();
    
    // Force refresh floating dashboard after loading new ship materials
    // This ensures perfect synchronization of card visibility and content
    refreshFloatingDashboard();
}

function updateCategoryBadges() {
    if (!(currentShip in recipes)) {
        return;
    }
    
    const materialCounts = { all: 0, basic: 0, recipes: 0 };
    
    for (const [part, val] of Object.entries(recipes[currentShip])) {
        const name = part.includes('+') ? part.substring(4) : part;
        const storageId = `${currentShip}-${part}`;
        const currentQty = parseInt(getStorage(storageId)) || 0;
        
        // For items with sub-recipes, check sub-recipe completion
        let isIncomplete;
        if (name in recipes && !ships.includes(name)) {
            const subRecipeProgress = calculateSubRecipeProgress(name);
            const calculatedQty = Math.floor((subRecipeProgress / 100.0) * val);
            // For recipes, use calculated quantity (based on sub-materials) not stored quantity
            isIncomplete = calculatedQty < val;
        } else {
            isIncomplete = currentQty < val;
        }
        
        if (isIncomplete) {
            const category = categorizeMaterial(name);
            materialCounts[category] += 1;
            materialCounts.all += 1;
        }
    }
    
    // Update tab badges
    for (const [category, count] of Object.entries(materialCounts)) {
        const badge = document.getElementById(`${category}-count`);
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline' : 'none';
        }
    }
}

function updateAllShipProgressDisplays() {
    for (const ship of ships) {
        if (ship in recipes) {
            updateShipProgressDisplay(ship);
        }
    }
}

function updateShipProgressDisplay(shipName) {
    const cardId = `ship-card-${shipName.replace(/[ ()]/g, '-')}`;
    const card = document.getElementById(cardId);
    if (!card) return;
    
    const progress = getShipProgress(shipName);
    // Round to 1 decimal place to avoid floating point precision issues
    const roundedProgress = Math.round(progress * 10) / 10;
    
    // Find and update progress text and status
    const progressContainer = card.querySelector('.progress-container');
    if (!progressContainer) return;
    
    const progressText = progressContainer.querySelector('div');
    if (!progressText) return;
    
    const spans = progressText.querySelectorAll('span');
    let progressTextSpan = spans[0]; // First span is always progress text
    let statusSpan = spans[1]; // Second span is always status
    
    // Update progress text
    if (progressTextSpan) {
        progressTextSpan.textContent = `Progress: ${roundedProgress >= 100 ? '100%' : `${Math.floor(roundedProgress * 1000) / 1000}%`}`;
    }
    
    // Update status using rounded progress value
    if (statusSpan) {
        if (roundedProgress >= 100.0) {
            // Complete: 100.0%
            statusSpan.textContent = ' Complete';
            statusSpan.style.cssText = 'color: var(--success); font-weight: bold; margin-left: var(--space-sm);';
        } else if (roundedProgress > 0.0) {
            // In Progress: 0.1% - 99.9%
            statusSpan.textContent = ' In Progress';
            statusSpan.style.cssText = 'color: var(--warning); font-weight: bold; margin-left: var(--space-sm);';
        } else {
            // Not Started: exactly 0.0%
            statusSpan.textContent = ' Not Started';
            statusSpan.style.cssText = 'color: var(--text-secondary); font-weight: bold; margin-left: var(--space-sm);';
        }
    }
    
    // Update progress bar fill
    const progressBars = card.querySelectorAll('div');
    for (const div of progressBars) {
        const style = div.style.cssText;
        if (style.includes('width:') && style.includes('%') && 
            style.includes('background: var(--accent-primary)')) {
            div.style.width = `${roundedProgress}%`;
            break;
        }
    }
}

// Recursively flatten all recipe requirements to base materials
function flattenRecipeRequirements(shipName) {
    const flatMaterials = new Map();
    
    if (!(shipName in recipes)) {
        return flatMaterials;
    }
    
    // Process each top-level requirement of the ship
    for (const [materialName, quantity] of Object.entries(recipes[shipName])) {
        // Strip +10 enhancement prefix to get base material name
        const baseName = materialName.startsWith('+10 ') ? materialName.substring(4) : materialName;
        
        // Handle different types of materials
        if (ships.includes(baseName)) {
            // Ship component - add as-is (don't expand ship recipes)
            if (flatMaterials.has(baseName)) {
                flatMaterials.set(baseName, flatMaterials.get(baseName) + quantity);
            } else {
                flatMaterials.set(baseName, quantity);
            }
        } else if (baseName in recipes) {
            // Recipe component (like "Epheria Galleass: Black Dragon Figurehead")
            // Handle partial completion: keep completed items as recipes, expand remaining to base materials
            const completedStorageId = `${shipName}-${baseName}-completed`;
            const completedItems = parseInt(getStorage(completedStorageId)) || 0;
            const remainingItems = Math.max(0, quantity - completedItems);
            
            // Part 1: Add completed items as recipes (if any)
            if (completedItems > 0) {
                const completedToAdd = Math.min(completedItems, quantity);
                if (flatMaterials.has(baseName)) {
                    flatMaterials.set(baseName, flatMaterials.get(baseName) + completedToAdd);
                } else {
                    flatMaterials.set(baseName, completedToAdd);
                }
            }
            
            // Part 2: Expand remaining items to base materials (if any)
            if (remainingItems > 0) {
                for (const [subMaterial, subQuantity] of Object.entries(recipes[baseName])) {
                    // Strip +10 enhancement prefix from sub-materials
                    const subBaseName = subMaterial.startsWith('+10 ') ? subMaterial.substring(4) : subMaterial;
                    const totalQuantity = subQuantity * remainingItems;
                    
                    if (flatMaterials.has(subBaseName)) {
                        flatMaterials.set(subBaseName, flatMaterials.get(subBaseName) + totalQuantity);
                    } else {
                        flatMaterials.set(subBaseName, totalQuantity);
                    }
                }
            }
        } else {
            // Base material - add directly
            if (flatMaterials.has(baseName)) {
                flatMaterials.set(baseName, flatMaterials.get(baseName) + quantity);
            } else {
                flatMaterials.set(baseName, quantity);
            }
        }
    }
    
    return flatMaterials;
}

// Calculate materials data for the ship
function calculateMaterialsForShip(shipName) {
    const flatMaterials = flattenRecipeRequirements(shipName);
    const materialsData = {};
    
    for (const [materialName, needed] of flatMaterials) {
        const completed = getTotalStoredQuantity(materialName, shipName);
        materialsData[materialName] = {
            needed: needed,
            completed: completed,
            remaining: Math.max(0, needed - completed)
        };
    }
    
    return materialsData;
}

// Get total stored quantity for a material, considering all places it might be stored
function getTotalStoredQuantity(materialName, shipName) {
    let totalStored = 0;
    
    // 1. Check direct storage: shipName-materialName
    // Also check for +10 prefixed version since items can be stored with enhancement prefix
    const directKey1 = `${shipName}-${materialName}`;
    const directKey2 = `${shipName}-+10 ${materialName}`;
    const directQty1 = parseInt(getStorage(directKey1)) || 0;
    const directQty2 = parseInt(getStorage(directKey2)) || 0;
    totalStored += directQty1 + directQty2;
    
    // 2. Check recipe context storage: shipName-recipeName-materialName
    // Also check for +10 prefixed versions since materials are stored with enhancement prefix
    if (shipName in recipes) {
        for (const [part, quantity] of Object.entries(recipes[shipName])) {
            const baseName = part.startsWith('+10 ') ? part.substring(4) : part;
            if (baseName in recipes && !ships.includes(baseName)) {
                // Check both with and without +10 prefix
                const contextKey1 = `${shipName}-${baseName}-${materialName}`;
                const contextKey2 = `${shipName}-${baseName}-+10 ${materialName}`;
                
                const contextQty1 = parseInt(getStorage(contextKey1)) || 0;
                const contextQty2 = parseInt(getStorage(contextKey2)) || 0;
                
                totalStored += contextQty1 + contextQty2;
            }
        }
    }
    
    // 3. FIXED: Check if this material is a recipe and account for completed items properly
    if (materialName in recipes) {
        // Get completed recipe items from the hybrid system storage
        const completedStorageId = `${shipName}-${materialName}-completed`;
        const completedItems = parseInt(getStorage(completedStorageId)) || 0;
        
        // Add completed items directly
        totalStored += completedItems;
        
        // Also check for raw material progress, but only count fractional part beyond completed items
        // This handles case where user has both completed items AND partial progress on additional items
        
        // Find how many items this ship actually needs for this recipe
        let parentQuantity = 1; // Default to 1 if not specified
        if (shipName in recipes && materialName in recipes[shipName]) {
            parentQuantity = recipes[shipName][materialName];
        } else {
            // Check for +10 version
            const plus10Name = `+10 ${materialName}`;
            if (shipName in recipes && plus10Name in recipes[shipName]) {
                parentQuantity = recipes[shipName][plus10Name];
            }
        }
        
        // If we have fewer completed items than needed, check raw material progress for the remainder
        if (completedItems < parentQuantity) {
            const remainingNeeded = parentQuantity - completedItems;
            
            // Calculate raw material progress for the remaining items
            let rawMaterialProgress = 0;
            let totalRawNeeded = 0;
            
            for (const [subMaterial, subQuantity] of Object.entries(recipes[materialName])) {
                const neededForRemaining = subQuantity * remainingNeeded;
                const storageId = `${shipName}-${materialName}-${subMaterial}`;
                const currentRaw = parseInt(getStorage(storageId)) || 0;
                
                totalRawNeeded += neededForRemaining;
                rawMaterialProgress += Math.min(currentRaw, neededForRemaining);
            }
            
            // Add fractional progress from raw materials
            if (totalRawNeeded > 0) {
                const rawProgressRatio = rawMaterialProgress / totalRawNeeded;
                const fractionalQuantity = rawProgressRatio * remainingNeeded;
                totalStored += fractionalQuantity;
            }
        }
    }
    
    return totalStored;
}


function updateOverallProgress() {
    if (!(currentShip in recipes)) {
        return;
    }
    
    // Update ship selector progress whenever overall progress updates
    updateShipSelectorProgress();
    
    // Use flattened recipe requirements to count actual completed materials
    const flattenedMaterials = flattenRecipeRequirements(currentShip);
    
    // Calculate total items dynamically based on current flattened materials
    // This accounts for recipes being kept as recipes vs expanded to raw materials
    let totalItems = 0;
    for (const [materialName, requiredQty] of flattenedMaterials) {
        totalItems += requiredQty;
    }
    
    let completedItems = 0;
    let completedCrowCoins = 0;
    let remainingCrowCoins = 0;
    let totalCrowCoins = 0;
    let hasCrowCoinRequirements = false;
    
    // Simple approach: Count each flattened material individually
    // This prevents double-counting because we only count base materials,
    // not recipes AND their constituent materials
    
    for (const [materialName, requiredQty] of flattenedMaterials) {
        const totalStoredQty = getTotalStoredQuantity(materialName, currentShip);
        const actualCompleted = Math.min(totalStoredQty, requiredQty);
        completedItems += actualCompleted;
    }
    
    // First pass: check if ship requires any materials that cost crow coins
    for (const [materialName, requiredQty] of flattenedMaterials) {
        if (materialName in coins) {
            hasCrowCoinRequirements = true;
            break;
        }
    }
    
    // Calculate crow coin costs using flattened materials (includes all sub-materials)
    // Only calculate if ship actually requires crow coins
    if (hasCrowCoinRequirements) {
        for (const [materialName, requiredQty] of flattenedMaterials) {
            if (materialName in coins) {
            const coinCost = coins[materialName];
            
            // Get total stored quantity for this material across all contexts
            const totalStoredQty = getTotalStoredQuantity(materialName, currentShip);
            
            // Cap completed items at required quantity
            const actualCompleted = Math.min(totalStoredQty, requiredQty);
            
            // Completed items cost
            completedCrowCoins += coinCost * actualCompleted;
            
            // Remaining items cost
            const remainingQty = requiredQty - actualCompleted;
            remainingCrowCoins += coinCost * remainingQty;
            
                // Total cost for all required items
                totalCrowCoins += coinCost * requiredQty;
                
            }
        }
    }
    
    // Update dashboard
    const overallPercentage = totalItems > 0 ? (completedItems / totalItems * 100) : 0;
    
    // Format percentage: 100% for complete, high precision otherwise (floor to avoid false 100%)
    const formattedPercentage = overallPercentage >= 100 ? '100%' : `${Math.floor(overallPercentage * 1000) / 1000}%`;
    
    // Update overall progress with detailed tooltip
    const overallProgressEl = document.getElementById('overall-progress');
    if (overallProgressEl) {
        overallProgressEl.textContent = formattedPercentage;
        const completedCount = Math.floor(completedItems);
        const remainingCount = totalItems - completedCount;
        overallProgressEl.title = `Completed: ${completedCount.toLocaleString()} | Total: ${totalItems.toLocaleString()} | Remaining: ${remainingCount.toLocaleString()}`;
    }
    
    // Update completed items with detailed tooltip
    const completedItemsEl = document.getElementById('completed-items');
    if (completedItemsEl) {
        const completedCount = Math.floor(completedItems);
        const remainingCount = totalItems - completedCount;
        completedItemsEl.textContent = `${completedCount}/${totalItems}`;
        completedItemsEl.title = `Completed: ${completedCount.toLocaleString()} | Total: ${totalItems.toLocaleString()} | Remaining: ${remainingCount.toLocaleString()}`;
    }
    
    // Handle crow coins card visibility and content
    const crowCoinsProgressEl = document.getElementById('crow-coins-progress');
    const crowCoinsCard = crowCoinsProgressEl ? crowCoinsProgressEl.closest('.dashboard-card') : null;
    
    if (!hasCrowCoinRequirements) {
        // Ship doesn't require crow coins - hide the card
        if (crowCoinsCard) {
            crowCoinsCard.style.display = 'none';
        }
    } else {
        // Ship requires crow coins - show the card and format progress
        if (crowCoinsCard) {
            crowCoinsCard.style.display = 'block';
        }
        
        const completedText = completedCrowCoins.toLocaleString();
        const totalText = totalCrowCoins.toLocaleString();
        const remainingText = remainingCrowCoins.toLocaleString();
        const fullText = `${completedText}/${totalText} (${remainingText})`;
        
        // Determine if we need two lines based on text length
        if (fullText.length <= 20) {
            // Short enough for single line
            crowCoinsProgressEl.classList.remove('two-lines');
            crowCoinsProgressEl.textContent = fullText;
            crowCoinsProgressEl.title = `Completed: ${completedText} | Total: ${totalText} | Remaining: ${remainingText}`;
        } else {
            // Too long, use two lines
            crowCoinsProgressEl.classList.add('two-lines');
            crowCoinsProgressEl.innerHTML = `${completedText}/${totalText}<br/>(${remainingText})`;
            crowCoinsProgressEl.title = `Completed: ${completedText} | Total: ${totalText} | Remaining: ${remainingText}`;
        }
    }
    
    // Calculate and display enhancement stones progress
    let completedEnhancementStones = 0;
    let totalEnhancementStones = 0;
    let remainingEnhancementStones = 0;
    let hasEnhancementRequirements = false;
    
    // Check if the ship actually requires any enhancement - look for +10 items in recipe
    if (currentShip in recipes) {
        // First pass: check if ship requires any +10 enhanced items
        for (const [originalMaterialName, requiredQty] of Object.entries(recipes[currentShip])) {
            if (originalMaterialName.startsWith('+10 ')) {
                hasEnhancementRequirements = true;
                break;
            }
        }
        
        // Only calculate enhancement costs if ship actually requires enhancement
        if (hasEnhancementRequirements) {
            for (const [originalMaterialName, requiredQty] of Object.entries(recipes[currentShip])) {
                // Check if this is a +10 enhanced item requirement
                if (originalMaterialName.startsWith('+10 ')) {
                    const baseName = originalMaterialName.substring(4); // Remove "+10 " prefix
                    
                    // Check if this item has enhancement recipes (by checking for +1 version)
                    const plus1Name = `+1 ${baseName}`;
                    if (plus1Name in recipes) {
                        // Calculate total cost to enhance from 0 to 10
                        const totalCostData = calculateEnhancementCost(baseName, 10);
                        if (totalCostData && totalCostData.totalCost > 0) {
                            totalEnhancementStones += totalCostData.totalCost * requiredQty;
                            
                            // Calculate completed based on current enhancement level
                            const currentLevel = getCurrentEnhancementLevel(baseName, currentShip) || 0;
                            if (currentLevel > 0) {
                                const completedCostData = calculateEnhancementCost(baseName, currentLevel);
                                if (completedCostData) {
                                    completedEnhancementStones += completedCostData.totalCost * requiredQty;
                                }
                            }
                        }
                    }
                }
            }
            
            // Also check flattened materials for other enhanceable items that might not be +10 requirements
            for (const [materialName, requiredQty] of flattenedMaterials) {
                const baseName = getBaseItemName(materialName);
                
                // Skip if we already processed this as a +10 requirement
                const plus10Name = `+10 ${baseName}`;
                if (currentShip in recipes && plus10Name in recipes[currentShip]) {
                    continue;
                }
                
                // Check if this item has enhancement recipes (by checking for +1 version)
                const plus1Name = `+1 ${baseName}`;
                if (plus1Name in recipes) {
                    // Calculate total cost to enhance from 0 to 10
                    const totalCostData = calculateEnhancementCost(materialName, 10);
                    if (totalCostData && totalCostData.totalCost > 0) {
                        totalEnhancementStones += totalCostData.totalCost * requiredQty;
                        
                        // Calculate completed based on current enhancement level
                        const currentLevel = getCurrentEnhancementLevel(materialName, currentShip) || 0;
                        if (currentLevel > 0) {
                            const completedCostData = calculateEnhancementCost(materialName, currentLevel);
                            if (completedCostData) {
                                completedEnhancementStones += completedCostData.totalCost * requiredQty;
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Calculate remaining stones as total minus completed
    remainingEnhancementStones = totalEnhancementStones - completedEnhancementStones;
    
    // Update enhancement stones icon based on the stone type used by this ship
    updateEnhancementStoneIcon();
    
    // Handle enhancement stones card visibility and content
    const enhancementProgressEl = document.getElementById('enhancement-stones-progress');
    const enhancementCard = enhancementProgressEl ? enhancementProgressEl.closest('.dashboard-card') : null;
    
    if (!hasEnhancementRequirements) {
        // Ship doesn't require enhancement - hide the card
        if (enhancementCard) {
            enhancementCard.style.display = 'none';
        }
    } else {
        // Ship requires enhancement - show the card and format progress
        if (enhancementCard) {
            enhancementCard.style.display = 'block';
        }
        
        const enhCompletedText = completedEnhancementStones.toLocaleString();
        const enhTotalText = totalEnhancementStones.toLocaleString();
        const enhRemainingText = remainingEnhancementStones.toLocaleString();
        const enhFullText = `${enhCompletedText}/${enhTotalText} (${enhRemainingText})`;
        
        if (enhFullText.length <= 20) {
            enhancementProgressEl.classList.remove('two-lines');
            enhancementProgressEl.textContent = enhFullText;
            enhancementProgressEl.title = `Completed: ${enhCompletedText} | Total: ${enhTotalText} | Remaining: ${enhRemainingText}`;
        } else {
            enhancementProgressEl.classList.add('two-lines');
            enhancementProgressEl.innerHTML = `${enhCompletedText}/${enhTotalText}<br/>(${enhRemainingText})`;
            enhancementProgressEl.title = `Completed: ${enhCompletedText} | Total: ${enhTotalText} | Remaining: ${enhRemainingText}`;
        }
    }
    
    // Update category badges
    updateCategoryBadges();
    
    // Update all ship progress displays
    updateAllShipProgressDisplays();
    
    // Sync floating dashboard if it's visible
    syncFloatingDashboard();
}

// Tab system
function setupTabs() {
    const tabButtons = document.querySelectorAll(".tab-button");
    for (const button of tabButtons) {
        const tabName = button.getAttribute('data-tab');
        button.addEventListener('click', (event) => {
            activeTab = tabName;
            
            // Update button states
            for (const btn of tabButtons) {
                btn.classList.remove("active");
            }
            event.target.classList.add("active");
            
            // Update content visibility
            for (const content of document.querySelectorAll(".tab-content")) {
                content.classList.remove("active");
            }
            document.getElementById(`tab-${tabName}`).classList.add("active");
            
            // Apply current filters
            applyFilters();
        });
    }
}

// Search and filter system
function setupSearchAndFilters() {
    const searchInput = document.getElementById('search-input');
    const filterChips = document.querySelectorAll(".filter-chip");
    
    searchInput.addEventListener('input', (event) => {
        searchQuery = event.target.value.toLowerCase();
        applyFilters();
    });
    
    for (const chip of filterChips) {
        const filterType = chip.getAttribute('data-filter');
        chip.addEventListener('click', (event) => {
            activeFilter = filterType;
            
            // Update chip states
            for (const c of filterChips) {
                c.classList.remove("active");
            }
            event.target.classList.add("active");
            
            applyFilters();
        });
    }
}

function applyFilters() {
    const tabCategories = ['all', 'basic', 'recipes'];
    const tabVisibleCounts = {};
    
    // Apply filters to all tabs
    for (const category of tabCategories) {
        const tabContent = document.getElementById(`tab-${category}`);
        const cards = tabContent.querySelectorAll(".material-card");
        let visibleCount = 0;
        
        for (const card of cards) {
            let showCard = true;
            
            // Search filter
            if (searchQuery) {
                const materialName = card.getAttribute('data-material');
                if (!materialName.includes(searchQuery)) {
                    showCard = false;
                }
            }
            
            // Acquisition method filter
            if (activeFilter !== 'all') {
                if (activeFilter === 'missing') {
                    if (card.getAttribute('data-completed') === 'true') {
                        showCard = false;
                    }
                } else {
                    if (!card.classList.contains(`has-${activeFilter}`)) {
                        showCard = false;
                    }
                }
            }
            
            // Show/hide card
            card.style.display = showCard ? 'block' : 'none';
            if (showCard) {
                visibleCount += 1;
            }
        }
        
        tabVisibleCounts[category] = visibleCount;
        
        // Handle empty states for each tab
        const emptyStates = tabContent.querySelectorAll(".empty-state");
        if (visibleCount === 0 && emptyStates.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            
            const icon = document.createElement('div');
            icon.textContent = '🔍';
            icon.className = 'empty-state-icon';
            
            const text = document.createElement('p');
            text.textContent = 'No materials found matching your criteria.';
            
            emptyDiv.appendChild(icon);
            emptyDiv.appendChild(text);
            tabContent.appendChild(emptyDiv);
        } else if (visibleCount > 0 && emptyStates.length > 0) {
            for (const state of emptyStates) {
                state.remove();
            }
        }
    }
    
    // Update tab indicators to show if tabs have visible results
    updateTabIndicators(tabVisibleCounts);
}

function updateTabIndicators(tabVisibleCounts) {
    const tabCategories = ['all', 'basic', 'recipes'];
    
    for (const category of tabCategories) {
        const tabButton = document.querySelector(`[data-tab="${category}"]`);
        const visibleCount = tabVisibleCounts[category];
        
        if (tabButton) {
            // Add visual indicator if tab has matching results
            if (searchQuery || activeFilter !== 'all') {
                if (visibleCount > 0) {
                    tabButton.style.opacity = '1';
                    tabButton.style.position = 'relative';
                    
                    // Add a small indicator showing how many items match
                    let indicator = tabButton.querySelector('.search-indicator');
                    if (!indicator) {
                        indicator = document.createElement('span');
                        indicator.className = 'search-indicator';
                        indicator.style.cssText = `
                            position: absolute;
                            top: -2px;
                            right: -2px;
                            background: var(--accent-primary);
                            color: white;
                            border-radius: 50%;
                            width: 18px;
                            height: 18px;
                            font-size: 10px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: bold;
                        `;
                        tabButton.appendChild(indicator);
                    }
                    indicator.textContent = visibleCount;
                } else {
                    tabButton.style.opacity = '0.5';
                    const indicator = tabButton.querySelector('.search-indicator');
                    if (indicator) {
                        indicator.remove();
                    }
                }
            } else {
                // Reset tab appearance when no filters are active
                tabButton.style.opacity = '1';
                const indicator = tabButton.querySelector('.search-indicator');
                if (indicator) {
                    indicator.remove();
                }
            }
        }
    }
}

function setupModal() {
    // Recipe Modal
    const recipeModal = document.getElementById('recipe-modal');
    const recipeCloseBtn = document.getElementById('recipe-modal-close');
    
    // Recipe modal close button
    recipeCloseBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        hideRecipeModal();
    });
    
    // Recipe modal click outside to close
    recipeModal.addEventListener('click', (event) => {
        if (event.target === recipeModal) {
            hideRecipeModal();
        }
    });
    
    // Acquisition Modal
    const acquisitionModal = document.getElementById('acquisition-modal');
    const acquisitionCloseBtn = document.getElementById('acquisition-modal-close');
    
    // Acquisition modal close button
    acquisitionCloseBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        hideAcquisitionModal();
    });
    
    // Acquisition modal click outside to close
    acquisitionModal.addEventListener('click', (event) => {
        if (event.target === acquisitionModal) {
            hideAcquisitionModal();
        }
    });
}

async function resetData() {
    if (confirm("Are you sure you want to reset all data? This cannot be undone.")) {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith(storageKey)) {
                localStorage.removeItem(key);
            }
        }
        
        // Properly select Epheria Sailboat and update all UI
        await selectShip("Epheria Sailboat");
        updateShipSelectorProgress();
    }
}

// Global water ripples instance
let waterRipples = null;
let waterRipplesEnabled = false;

// Initialize realistic water ripples using WebGL
function initWaterRipples() {
    // Check saved preference first - default to false if never set
    const savedPreference = getStorage('waterRipplesEnabled');
    
    if (savedPreference !== null) {
        // Properly parse boolean from localStorage (handles string "false" correctly)
        waterRipplesEnabled = savedPreference === true || savedPreference === 'true';
    } else {
        // First time user - default to disabled and save this preference
        waterRipplesEnabled = false;
        setStorage('waterRipplesEnabled', false);
    }

    // Only create water ripples if enabled - save resources if disabled
    if (waterRipplesEnabled) {
        createWaterRipples();
    }
    // If disabled, waterRipples remains null - no resources used
}

// Toggle water ripples on/off
function toggleWaterRipples() {
    waterRipplesEnabled = !waterRipplesEnabled;
    
    if (waterRipplesEnabled) {
        // Create and initialize water ripples
        createWaterRipples();
    } else {
        // Completely destroy water ripples to free up resources
        destroyWaterRipples();
    }
    
    // Save preference to localStorage
    setStorage('waterRipplesEnabled', waterRipplesEnabled);
    updateWaterToggleButton();
}

// Create water ripples instance
function createWaterRipples() {
    if (waterRipples) {
        // Already exists, just show it
        waterRipples.show();
        waterRipples.play();
        return;
    }
    
    try {
        waterRipples = RealisticWaterRipples.create(document.body, {
            resolution: 512,
            dropRadius: 30,
            perturbance: 0.06,
            interactive: true,
            initiallyVisible: true,
            initiallyRunning: true
        });

        const success = waterRipples.init();
        if (!success) {
                waterRipples = null;
        }
    } catch (error) {
        waterRipples = null;
    }
}

// Completely destroy water ripples to free up memory and GPU resources
function destroyWaterRipples() {
    if (waterRipples) {
        waterRipples.destroy();
        waterRipples = null;
    }
}

// Update water toggle button appearance
function updateWaterToggleButton() {
    const toggleBtn = document.getElementById('water-ripples-toggle');
    if (!toggleBtn) return;
    
    const icon = toggleBtn.querySelector('.water-toggle-icon');
    const text = toggleBtn.querySelector('.water-toggle-text');
    
    if (waterRipplesEnabled) {
        // Water ripples enabled
        toggleBtn.classList.remove('disabled');
        toggleBtn.disabled = false;
        toggleBtn.title = 'Disable Water Ripples Effect';
        if (icon) icon.textContent = '🌊';
        if (text) text.textContent = 'Water';
    } else {
        // Water ripples disabled
        toggleBtn.classList.remove('disabled');
        toggleBtn.disabled = false;
        toggleBtn.title = 'Enable Water Ripples Effect';
        if (icon) icon.textContent = '💧';
        if (text) text.textContent = 'No Water';
    }
}

// Setup water ripples toggle button
function setupWaterToggle() {
    const toggleBtn = document.getElementById('water-ripples-toggle');
    if (!toggleBtn) return;
    
    // Setup click handler
    toggleBtn.addEventListener('click', toggleWaterRipples);
    
    // Initial state update (preference already loaded in initWaterRipples)
    updateWaterToggleButton();
}

// Setup guided tour functionality
function setupGuidedTour() {
    const tourBtn = document.getElementById('guided-tour-btn');
    if (!tourBtn) {
        return;
    }
    
    // Setup click handler to start main tour
    tourBtn.addEventListener('click', () => {
        guidedTour.startTour('main');
    });
    
    // Check if user should see the tour automatically
    setTimeout(() => {
        guidedTour.checkAndShowInitialTour();
    }, 1000); // Reduced wait time
}

// Function to trigger specific tours (can be called from anywhere)
function startSpecificTour(tourType) {
    guidedTour.startTour(tourType);
}


// Make tour functions globally available for manual triggers
window.startGuidedTour = (type = 'main') => {
    guidedTour.startTour(type);
};
window.resetTour = () => {
    guidedTour.resetTour();
};

// Initialize the application
async function initApp() {
    
    // Initialize application (privacy manager removed)
    
    // Load stored ship selection
    if (checkStorage('ship') && ships.includes(getStorage('ship'))) {
        currentShip = getStorage('ship');
    } else {
        currentShip = "Epheria Sailboat";
        setStorage('ship', "Epheria Sailboat");
    }
    
    // Create ship list
    await createShipList();
    
    // Setup interactive elements
    setupTabs();
    setupSearchAndFilters();
    setupModal();
    
    // Initialize water ripples cursor trail effect
    initWaterRipples();
    
    // Setup water ripples toggle button
    setupWaterToggle();
    
    // Setup guided tour (lazy loaded - only when first needed)
    setupGuidedTour();
    // Setup auto-tour checkbox
    guidedTour.setupAutoTourCheckbox();
    
    // Load initial materials
    await loadShipMaterials();
    
    // Setup reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '🗑️ Reset All Data';
    resetBtn.className = 'filter-chip';
    resetBtn.style.cssText = `
        background: var(--error) !important; 
        color: white !important; 
        border-color: var(--error) !important;
        padding: var(--space-sm) var(--space-md);
        cursor: pointer;
    `;
    resetBtn.addEventListener('click', resetData);
    
    // Add reset button to filter chips area
    const filterChips = document.querySelector('.filter-chips');
    if (filterChips) {
        filterChips.appendChild(resetBtn);
    }
    
    // Setup enhancement arrow event listeners
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('enhancement-arrow')) {
            const itemName = e.target.getAttribute('data-item');
            const shipName = e.target.getAttribute('data-ship');
            const change = parseInt(e.target.getAttribute('data-change'));
            
            adjustEnhancementLevel(itemName, shipName, change);
        }
    });
}

// Start the application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}


// Export for debugging
// Helper functions for UI
function shouldShowMaterial(material, data) {
    // Apply search filter
    if (searchQuery && !material.toLowerCase().includes(searchQuery)) {
        return false;
    }
    
    // Apply category filter
    if (activeFilter === 'missing') {
        const completed = getStorage(`${material}_completed`) || 0;
        const needed = data.needed || 0;
        return completed < needed;
    } else if (activeFilter === 'vendor') {
        return data.hasVendor;
    } else if (activeFilter === 'recipe') {
        return data.hasRecipe;
    } else if (activeFilter === 'barter') {
        return data.hasBarter;
    }
    
    return true; // Show all for 'all' filter
}

function getItemCategory(material) {
    // Categorize items based on their properties
    if (recipes[material]) return 'Crafted';
    if (items[material]?.vendor) return 'Vendor';
    if (shipbarters[material] || barters[material]) return 'Barter';
    return 'Material';
}

function updateMaterialProgress(material, value) {
    setStorage(`${material}_completed`, value);
    
    // Update progress display for the specific material
    const card = document.querySelector(`[data-material="${material}"]`);
    if (card) {
        const progressCircle = card.querySelector('.progress-fill');
        const progressText = card.querySelector('.progress-text');
        const input = card.querySelector('.treasure-input');
        
        if (input) {
            const needed = parseInt(input.max) || 0;
            const progress = needed > 0 ? Math.min((value / needed) * 100, 100) : 0;
            
            if (progressCircle) {
                const circumference = 157.08;
                progressCircle.style.strokeDashoffset = circumference - (circumference * progress / 100);
                progressCircle.classList.toggle('completed', progress >= 100);
            }
            
            if (progressText) {
                progressText.textContent = `${Math.round(progress)}%`;
            }
            
            card.classList.toggle('treasure-completed', progress >= 100);
        }
    }
    
    // Update overall progress
    updateOverallProgress();
    
}

// Enhancement Level Tracking
function isEnhanceableItem(itemName) {
    // Remove any existing +X prefix to get base name
    const baseName = itemName.replace(/^\+\d+\s+/, '');
    
    // Exclude ship names themselves (not ship parts)
    const shipNames = [
        "Epheria Sailboat", "Improved Epheria Sailboat", "Epheria Caravel",
        "Carrack (Advance)", "Carrack (Balance)", "Epheria Frigate", 
        "Improved Epheria Frigate", "Epheria Galleass", "Carrack (Volante)",
        "Carrack (Valor)", "Panokseon", "Bartali Sailboat"
    ];
    
    // Don't enhance actual ships
    if (shipNames.includes(baseName)) {
        return false;
    }
    
    // Check if the current ship's recipe specifically requires a +10 version of this item
    if (currentShip in recipes) {
        const plus10Name = `+10 ${baseName}`;
        return recipes[currentShip][plus10Name] !== undefined;
    }
    
    return false;
}

function getBaseItemName(itemName) {
    // Remove +X enhancement prefix to get base item name
    return itemName.replace(/^\+\d+\s+/, '');
}

function getCurrentEnhancementLevel(itemName, shipName) {
    const baseName = getBaseItemName(itemName);
    const enhancementKey = `${shipName}-${baseName}-enhancement`;
    return parseInt(getStorage(enhancementKey)) || 0;
}

function setEnhancementLevel(itemName, shipName, level) {
    const baseName = getBaseItemName(itemName);
    const enhancementKey = `${shipName}-${baseName}-enhancement`;
    setStorage(enhancementKey, level.toString());
    
    // Update enhancement-specific UI elements in real-time
    updateEnhancementUI(itemName, shipName, level);
    updateOverallProgress();
    updateShipSelectorProgress();
}

function adjustEnhancementLevel(itemName, shipName, change) {
    const currentLevel = getCurrentEnhancementLevel(itemName, shipName);
    const newLevel = Math.max(0, Math.min(10, currentLevel + change));
    
    if (newLevel !== currentLevel) {
        setEnhancementLevel(itemName, shipName, newLevel);
    }
}

function updateEnhancementUI(itemName, shipName, newLevel) {
    const baseName = getBaseItemName(itemName);
    
    // Update all inline enhancement buttons for this item
    document.querySelectorAll('.enhancement-inline').forEach(container => {
        const downBtn = container.querySelector('.enhancement-down');
        const upBtn = container.querySelector('.enhancement-up');
        
        if (downBtn && downBtn.getAttribute('data-item') === itemName) {
            downBtn.disabled = newLevel <= 0;
            if (upBtn) {
                upBtn.disabled = newLevel >= 10;
            }
            
            // Update or add enhancement cost display
            let costDisplay = container.querySelector('.enhancement-cost');
            if (newLevel > 0) {
                const costInfo = calculateEnhancementCost(itemName, newLevel);
                if (costInfo.totalCost > 0 && costInfo.stoneType) {
                    if (!costDisplay) {
                        // Create new cost display
                        costDisplay = document.createElement('span');
                        costDisplay.className = 'enhancement-cost';
                        costDisplay.style.cssText = `
                            margin-left: 6px;
                            font-size: 11px;
                            color: var(--text-secondary);
                            display: inline-flex;
                            align-items: center;
                            gap: 2px;
                            background: rgba(0,0,0,0.3);
                            padding: 2px 4px;
                            border-radius: 3px;
                        `;
                        
                        // Add stone icon using proper BDO icons
                        const stoneIcon = document.createElement('img');
                        let iconFile;
                        if (costInfo.stoneType === 'Black Stone') {
                            iconFile = '00000008.webp';
                        } else if (costInfo.stoneType === 'Tidal Black Stone') {
                            iconFile = '00756005.webp';
                        }
                        
                        stoneIcon.src = `icons/${iconFile}`;
                        stoneIcon.alt = costInfo.stoneType;
                        stoneIcon.style.cssText = 'width: 14px; height: 14px; object-fit: contain;';
                        
                        const costText = document.createElement('span');
                        costText.style.cssText = 'font-weight: 600;';
                        
                        costDisplay.appendChild(stoneIcon);
                        costDisplay.appendChild(costText);
                        container.appendChild(costDisplay);
                    }
                    // Update cost text
                    const costText = costDisplay.querySelector('span:last-child');
                    if (costText) {
                        costText.textContent = costInfo.totalCost;
                    }
                }
            } else if (costDisplay) {
                // Remove cost display if level is 0
                costDisplay.remove();
            }
        }
    });
    
    // Update all modal enhancement controls for this item
    document.querySelectorAll('.enhancement-control').forEach(container => {
        const downBtn = container.querySelector('.enhancement-down');
        const upBtn = container.querySelector('.enhancement-up');
        
        if (downBtn && downBtn.getAttribute('data-item') === itemName) {
            downBtn.disabled = newLevel <= 0;
            if (upBtn) {
                upBtn.disabled = newLevel >= 10;
            }
        }
    });
    
    // Update title text elements that show enhancement levels
    updateEnhancementTitles(itemName, shipName, newLevel);
}

function updateEnhancementTitles(itemName, shipName, newLevel) {
    const baseName = getBaseItemName(itemName);
    
    // Find all material cards and modal items that display this item
    document.querySelectorAll('.material-card, .modal-material-item').forEach(element => {
        // Look for title containers with enhancement buttons
        const titleContainers = element.querySelectorAll('div[style*="display: flex"]');
        titleContainers.forEach(container => {
            const enhancementButtons = container.querySelector('.enhancement-inline');
            if (enhancementButtons) {
                const downBtn = enhancementButtons.querySelector('.enhancement-down');
                if (downBtn && downBtn.getAttribute('data-item') === itemName) {
                    // This container has our item - update the title text
                    const titleElement = container.querySelector('a, div.material-card-title, div');
                    if (titleElement && titleElement !== enhancementButtons) {
                        const currentText = titleElement.textContent;
                        // Replace the enhancement level in the text
                        const updatedText = newLevel > 0 
                            ? currentText.replace(/^(\+\d+\s+)?(.+)$/, `+${newLevel} $2`)
                            : currentText.replace(/^\+\d+\s+/, '');
                        titleElement.textContent = updatedText;
                    }
                }
            }
        });
    });
}

function createEnhancementLevelControl(itemName, shipName) {
    if (!isEnhanceableItem(itemName)) {
        return '';
    }
    
    const baseName = getBaseItemName(itemName);
    const currentLevel = getCurrentEnhancementLevel(itemName, shipName);
    const baseId = `enhancement-${shipName}-${baseName}`.replace(/[^a-zA-Z0-9-]/g, '-');
    
    return `
        <div class="enhancement-control">
            <button class="enhancement-arrow enhancement-down" 
                    data-item="${itemName}" data-ship="${shipName}" data-change="-1"
                    ${currentLevel <= 0 ? 'disabled' : ''}>▼</button>
            <button class="enhancement-arrow enhancement-up" 
                    data-item="${itemName}" data-ship="${shipName}" data-change="1"
                    ${currentLevel >= 10 ? 'disabled' : ''}>▲</button>
        </div>
    `;
}

function calculateEnhancementCost(itemName, targetLevel) {
    const baseName = getBaseItemName(itemName);
    let totalCost = 0;
    let stoneType = null;
    
    // Check which type of stone is used by looking at +1 recipe
    const plus1Name = `+1 ${baseName}`;
    if (plus1Name in recipes) {
        if ('Black Stone' in recipes[plus1Name]) {
            stoneType = 'Black Stone';
        } else if ('Tidal Black Stone' in recipes[plus1Name]) {
            stoneType = 'Tidal Black Stone';
        }
    }
    
    if (!stoneType) return { totalCost: 0, stoneType: null };
    
    // Calculate accumulated cost from +1 to target level
    for (let level = 1; level <= targetLevel; level++) {
        const enhancedName = `+${level} ${baseName}`;
        if (enhancedName in recipes && stoneType in recipes[enhancedName]) {
            totalCost += recipes[enhancedName][stoneType];
        }
    }
    
    return { totalCost, stoneType };
}

function updateEnhancementStoneIcon() {
    // Get the main dashboard icon element
    const iconElement = document.getElementById('enhancement-stones-icon');
    if (!iconElement) return;
    
    // Find the stone type used by the current ship by checking enhanceable items
    let stoneType = null;
    
    if (currentShip in recipes) {
        const flattenedMaterials = flattenRecipeRequirements(currentShip);
        
        // Look for any enhanceable items to determine stone type
        for (const [materialName] of flattenedMaterials) {
            const baseName = getBaseItemName(materialName);
            const plus1Name = `+1 ${baseName}`;
            
            if (plus1Name in recipes) {
                if ('Black Stone' in recipes[plus1Name]) {
                    stoneType = 'Black Stone';
                    break;
                } else if ('Tidal Black Stone' in recipes[plus1Name]) {
                    stoneType = 'Tidal Black Stone';
                    break;
                }
            }
        }
    }
    
    // Set the appropriate icon
    let iconFile;
    let altText;
    
    if (stoneType === 'Tidal Black Stone') {
        iconFile = '00756005.webp';
        altText = 'Tidal Black Stones';
    } else {
        // Default to Black Stone (also handles case where no enhanceable items found)
        iconFile = '00000008.webp';
        altText = 'Black Stones';
    }
    
    // Update main dashboard icon
    iconElement.src = `icons/${iconFile}`;
    iconElement.alt = altText;
    
    // Also update floating dashboard icon if it exists
    if (floatingDashboardGlobal) {
        const floatingIcon = floatingDashboardGlobal.querySelector('#enhancement-stones-icon');
        if (floatingIcon) {
            floatingIcon.src = `icons/${iconFile}`;
            floatingIcon.alt = altText;
        }
    }
}

function createInlineEnhancementButtons(itemName, shipName) {
    if (!isEnhanceableItem(itemName)) {
        return null;
    }
    
    
    const currentLevel = getCurrentEnhancementLevel(itemName, shipName);
    
    const container = document.createElement('span');
    container.className = 'enhancement-inline';
    container.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 1px;
        margin: 0 4px;
        vertical-align: middle;
    `;
    
    // Down button
    const downBtn = document.createElement('button');
    downBtn.textContent = '▼';
    downBtn.className = 'enhancement-arrow enhancement-down';
    downBtn.setAttribute('data-item', itemName);
    downBtn.setAttribute('data-ship', shipName);
    downBtn.setAttribute('data-change', '-1');
    downBtn.disabled = currentLevel <= 0;
    downBtn.style.cssText = `
        width: 20px;
        height: 20px;
        border: 1px solid var(--accent-primary);
        background: var(--bg-secondary);
        color: var(--accent-primary);
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
        margin: 0;
    `;
    
    // Up button
    const upBtn = document.createElement('button');
    upBtn.textContent = '▲';
    upBtn.className = 'enhancement-arrow enhancement-up';
    upBtn.setAttribute('data-item', itemName);
    upBtn.setAttribute('data-ship', shipName);
    upBtn.setAttribute('data-change', '1');
    upBtn.disabled = currentLevel >= 10;
    upBtn.style.cssText = `
        width: 20px;
        height: 20px;
        border: 1px solid var(--accent-primary);
        background: var(--bg-secondary);
        color: var(--accent-primary);
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
        margin: 0;
    `;
    
    // Add hover and click effects
    [downBtn, upBtn].forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            if (!btn.disabled) {
                btn.style.background = 'var(--accent-primary)';
                btn.style.color = 'white';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (!btn.disabled) {
                btn.style.background = 'var(--bg-secondary)';
                btn.style.color = 'var(--accent-primary)';
            }
        });
        // Add click event listener
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent modal from opening
            if (!btn.disabled) {
                const itemName = btn.getAttribute('data-item');
                const shipName = btn.getAttribute('data-ship');
                const change = parseInt(btn.getAttribute('data-change'));
                adjustEnhancementLevel(itemName, shipName, change);
            }
        });
    });
    
    container.appendChild(downBtn);
    container.appendChild(upBtn);
    
    // Add enhancement cost display
    if (currentLevel > 0) {
        const costInfo = calculateEnhancementCost(itemName, currentLevel);
        if (costInfo.totalCost > 0 && costInfo.stoneType) {
            const costDisplay = document.createElement('span');
            costDisplay.className = 'enhancement-cost';
            costDisplay.style.cssText = `
                margin-left: 6px;
                font-size: 11px;
                color: var(--text-secondary);
                display: inline-flex;
                align-items: center;
                gap: 2px;
                background: rgba(0,0,0,0.3);
                padding: 2px 4px;
                border-radius: 3px;
            `;
            
            // Add stone icon using proper BDO icons
            const stoneIcon = document.createElement('img');
            let iconFile;
            if (costInfo.stoneType === 'Black Stone') {
                iconFile = '00000008.webp';
            } else if (costInfo.stoneType === 'Tidal Black Stone') {
                iconFile = '00756005.webp';
            }
            
            stoneIcon.src = `icons/${iconFile}`;
            stoneIcon.alt = costInfo.stoneType;
            stoneIcon.style.cssText = 'width: 14px; height: 14px; object-fit: contain;';
            
            const costText = document.createElement('span');
            costText.textContent = costInfo.totalCost;
            costText.style.cssText = 'font-weight: 600;';
            
            costDisplay.appendChild(stoneIcon);
            costDisplay.appendChild(costText);
            container.appendChild(costDisplay);
        }
    }
    
    return container;
}

function createCompactEnhancementControl(itemName, shipName) {
    if (!isEnhanceableItem(itemName)) {
        return null;
    }
    
    const baseName = getBaseItemName(itemName);
    const currentLevel = getCurrentEnhancementLevel(itemName, shipName);
    const baseId = `enhancement-${shipName}-${baseName}`.replace(/[^a-zA-Z0-9-]/g, '-');
    
    const container = document.createElement('div');
    container.className = 'enhancement-control-compact';
    container.style.cssText = `
        display: flex;
        align-items: center;
        gap: 3px;
        margin-left: var(--space-xs);
        padding: 3px;
        background: var(--bg-tertiary);
        border-radius: var(--radius-sm);
        border: 1px solid var(--bg-quaternary);
    `;
    
    // Down button
    const downBtn = document.createElement('button');
    downBtn.textContent = '▼';
    downBtn.className = 'enhancement-arrow enhancement-down';
    downBtn.setAttribute('data-item', itemName);
    downBtn.setAttribute('data-ship', shipName);
    downBtn.setAttribute('data-change', '-1');
    downBtn.disabled = currentLevel <= 0;
    downBtn.style.cssText = `
        width: 16px;
        height: 16px;
        border: 1px solid var(--accent-primary);
        background: var(--bg-secondary);
        color: var(--accent-primary);
        border-radius: 3px;
        cursor: pointer;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
    `;
    
    // Up button
    const upBtn = document.createElement('button');
    upBtn.textContent = '▲';
    upBtn.className = 'enhancement-arrow enhancement-up';
    upBtn.setAttribute('data-item', itemName);
    upBtn.setAttribute('data-ship', shipName);
    upBtn.setAttribute('data-change', '1');
    upBtn.disabled = currentLevel >= 10;
    upBtn.style.cssText = `
        width: 16px;
        height: 16px;
        border: 1px solid var(--accent-primary);
        background: var(--bg-secondary);
        color: var(--accent-primary);
        border-radius: 3px;
        cursor: pointer;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
    `;
    
    // Add hover and click effects
    [downBtn, upBtn].forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            if (!btn.disabled) {
                btn.style.background = 'var(--accent-primary)';
                btn.style.color = 'white';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (!btn.disabled) {
                btn.style.background = 'var(--bg-secondary)';
                btn.style.color = 'var(--accent-primary)';
            }
        });
        // Add click event listener for compact controls
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent modal from opening
            if (!btn.disabled) {
                const itemName = btn.getAttribute('data-item');
                const shipName = btn.getAttribute('data-ship');
                const change = parseInt(btn.getAttribute('data-change'));
                adjustEnhancementLevel(itemName, shipName, change);
            }
        });
    });
    
    container.appendChild(downBtn);
    container.appendChild(upBtn);
    
    return container;
}

// Sticky/Floating Progress Dashboard
let dashboardOriginalPosition = null;
let scrollTimeout = null;
let lastScrollY = 0;

// Function to sync floating dashboard data with improved text handling
function syncFloatingDashboard() {
    if (!floatingDashboardGlobal || !isFloating) {
        return;
    }
    
    // Get main dashboard element for complete structure comparison
    const mainDashboard = document.getElementById('progress-dashboard');
    if (!mainDashboard) return;
    
    // Get all dashboard cards from main dashboard
    const mainCards = mainDashboard.querySelectorAll('.dashboard-card');
    const floatingCards = floatingDashboardGlobal.querySelectorAll('.dashboard-card');
    
    // Ensure we have the same number of cards
    if (mainCards.length !== floatingCards.length) {
        // Remove existing floating dashboard and recreate
        if (floatingDashboardGlobal.parentNode) {
            floatingDashboardGlobal.parentNode.removeChild(floatingDashboardGlobal);
        }
        floatingDashboardGlobal = null;
        isFloating = false;
        // Will be recreated on next intersection event
        return;
    }
    
    // Helper function to sync both content and tooltip from main to floating element
    const syncElementData = (mainElement, floatingElement) => {
        if (!mainElement || !floatingElement) return;
        
        // Copy text content (handle both textContent and innerHTML)
        if (mainElement.innerHTML !== mainElement.textContent) {
            // Element has HTML content (like <br/> tags for two-line display)
            floatingElement.innerHTML = mainElement.innerHTML;
        } else {
            floatingElement.textContent = mainElement.textContent;
        }
        
        // Copy tooltip from main element, or create a basic one if main doesn't have one
        if (mainElement.title) {
            floatingElement.title = mainElement.title;
        } else {
            // Create a basic tooltip if main element doesn't have one
            const text = mainElement.textContent || mainElement.innerText || '';
            floatingElement.title = text;
        }
        
        // Copy CSS classes for proper styling (like two-lines class)
        floatingElement.className = mainElement.className;
        
        // Set cursor style for elements that might be truncated
        const text = floatingElement.textContent || floatingElement.innerText || '';
        if (text.length > 15) {
            floatingElement.style.cursor = 'help';
        } else {
            floatingElement.style.cursor = '';
        }
    };
    
    // Sync each card individually to maintain perfect structure match
    for (let i = 0; i < mainCards.length && i < floatingCards.length; i++) {
        const mainCard = mainCards[i];
        const floatingCard = floatingCards[i];
        
        // Sync card visibility first
        const mainCardDisplay = window.getComputedStyle(mainCard).display;
        floatingCard.style.display = mainCardDisplay;
        
        // Only sync content if card is visible
        if (mainCardDisplay !== 'none') {
            // Sync dashboard value element
            const mainValue = mainCard.querySelector('.dashboard-value');
            const floatingValue = floatingCard.querySelector('.dashboard-value');
            syncElementData(mainValue, floatingValue);
            
            // Sync dashboard icon if present
            const mainIcon = mainCard.querySelector('.dashboard-icon-img');
            const floatingIcon = floatingCard.querySelector('.dashboard-icon-img');
            if (mainIcon && floatingIcon) {
                floatingIcon.src = mainIcon.src;
                floatingIcon.alt = mainIcon.alt;
            }
            
            // Sync dashboard label
            const mainLabel = mainCard.querySelector('.dashboard-label');
            const floatingLabel = floatingCard.querySelector('.dashboard-label');
            if (mainLabel && floatingLabel) {
                floatingLabel.textContent = mainLabel.textContent;
            }
        }
    }
}

// Function to refresh floating dashboard by recreating it
function refreshFloatingDashboard() {
    // Only refresh if floating dashboard exists and is active
    if (floatingDashboardGlobal && isFloating) {
        // Remove existing floating dashboard
        if (floatingDashboardGlobal.parentNode) {
            floatingDashboardGlobal.parentNode.removeChild(floatingDashboardGlobal);
        }
        
        // Reset state
        floatingDashboardGlobal = null;
        const wasMinimized = localStorage.getItem('bdo_ship_upgrade-floating-minimized') === 'true';
        
        // Get main dashboard and recreate floating version
        const mainDashboard = document.getElementById('progress-dashboard');
        if (mainDashboard) {
            // Create new floating dashboard
            floatingDashboardGlobal = mainDashboard.cloneNode(true);
            floatingDashboardGlobal.id = 'floating-progress-dashboard';
            floatingDashboardGlobal.classList.add('floating');
            floatingDashboardGlobal.style.display = 'flex';
            document.body.appendChild(floatingDashboardGlobal);
            
            // Restore minimized state
            if (wasMinimized) {
                floatingDashboardGlobal.classList.add('minimized');
            }
            
            // Add click handler for overall progress card toggle
            floatingDashboardGlobal.addEventListener('click', (event) => {
                const firstCard = floatingDashboardGlobal.querySelector('.dashboard-card:first-child');
                
                if (firstCard && firstCard.contains(event.target)) {
                    event.preventDefault();
                    event.stopPropagation();
                    floatingDashboardGlobal.classList.toggle('minimized');
                    
                    // Store minimized state
                    const isMinimized = floatingDashboardGlobal.classList.contains('minimized');
                    localStorage.setItem('bdo_ship_upgrade-floating-minimized', isMinimized.toString());
                }
            });
            
            // Sync the content immediately
            syncFloatingDashboard();
        }
    }
}

function initStickyProgressDashboard() {
    const progressDashboard = document.getElementById('progress-dashboard');
    if (!progressDashboard) return;

    let intersectionObserver = null;
    let floatingDashboard = null;

    // Create floating dashboard clone
    const createFloatingDashboard = () => {
        if (floatingDashboard) return;
        
        // Always create a fresh clone to ensure current state
        floatingDashboard = progressDashboard.cloneNode(true);
        floatingDashboard.id = 'floating-progress-dashboard';
        floatingDashboard.classList.add('floating');
        floatingDashboard.style.display = 'none';
        document.body.appendChild(floatingDashboard);
        
        // Set global reference for syncing
        floatingDashboardGlobal = floatingDashboard;
        
        // Immediately sync the content to match current state
        syncFloatingDashboard();
        
        // Add click handler for overall progress card toggle
        floatingDashboard.addEventListener('click', (event) => {
            // Find the first dashboard card (overall progress)
            const firstCard = floatingDashboard.querySelector('.dashboard-card:first-child');
            
            if (firstCard && firstCard.contains(event.target)) {
                // Clicked on the overall progress card - toggle minimized state
                event.preventDefault();
                event.stopPropagation();
                floatingDashboard.classList.toggle('minimized');
                
                // Store minimized state in localStorage
                const isMinimized = floatingDashboard.classList.contains('minimized');
                localStorage.setItem('bdo_ship_upgrade-floating-minimized', isMinimized.toString());
            }
        });
        
        // Restore minimized state from localStorage
        const savedMinimizedState = localStorage.getItem('bdo_ship_upgrade-floating-minimized');
        if (savedMinimizedState === 'true') {
            floatingDashboard.classList.add('minimized');
        }
    };

    // Simple intersection-based approach
    const setupIntersectionObserver = () => {
        // Don't set up observer if dashboard is not visible
        if (progressDashboard.style.display === 'none') {
            return;
        }

        // Clean up existing observer
        if (intersectionObserver) {
            intersectionObserver.disconnect();
        }

        // Create floating dashboard if it doesn't exist
        // Wait for main dashboard to be fully rendered before creating floating version
        setTimeout(() => {
            createFloatingDashboard();
        }, 100);

        // Create intersection observer with very conservative settings
        intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (isTransitioning || !dashboardInitialized) return;

                // Very conservative - only trigger when completely out of view
                const isVisible = entry.isIntersecting;
                
                if (!isVisible && !isFloating) {
                    // Dashboard completely not visible, show floating
                    isTransitioning = true;
                    isFloating = true;
                    
                    // Ensure floating dashboard content is fully synced before showing
                    syncFloatingDashboard();
                    if (floatingDashboard) {
                        floatingDashboard.style.display = 'flex';
                        floatingDashboard.classList.add('slide-in');
                        floatingDashboard.classList.remove('slide-out');
                    }
                    
                    // Restore minimized state
                    const savedMinimizedState = localStorage.getItem('bdo_ship_upgrade-floating-minimized');
                    if (savedMinimizedState === 'true' && floatingDashboard) {
                        floatingDashboard.classList.add('minimized');
                    }
                    
                    setTimeout(() => {
                        isTransitioning = false;
                    }, 350);
                    
                } else if (isVisible && isFloating) {
                    // Dashboard visible again, hide floating
                    isTransitioning = true;
                    isFloating = false;
                    if (floatingDashboard) {
                        floatingDashboard.classList.add('slide-out');
                        floatingDashboard.classList.remove('slide-in');
                        
                        setTimeout(() => {
                            if (floatingDashboard) {
                                floatingDashboard.style.display = 'none';
                                floatingDashboard.classList.remove('slide-out');
                            }
                            isTransitioning = false;
                        }, 350);
                    } else {
                        isTransitioning = false;
                    }
                }
            });
        }, {
            root: null,
            rootMargin: '0px', // No margin - only trigger when completely out
            threshold: [0]
        });

        // Mark as initialized and start observing
        dashboardInitialized = true;
        intersectionObserver.observe(progressDashboard);
    };

    // Re-setup observer when dashboard becomes visible
    const visibilityObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const display = progressDashboard.style.display;
                if (display !== 'none' && display !== '') {
                    // Reset state when dashboard becomes visible
                    isFloating = false;
                    dashboardInitialized = false;
                    
                    // Hide floating dashboard if it exists
                    if (floatingDashboard) {
                        floatingDashboard.style.display = 'none';
                        floatingDashboard.classList.remove('slide-in', 'slide-out', 'minimized');
                    }
                    
                    // Setup observer after a delay
                    setTimeout(() => {
                        setupIntersectionObserver();
                    }, 1000); // Longer delay for stability
                }
            }
        });
    });

    visibilityObserver.observe(progressDashboard, {
        attributes: true,
        attributeFilter: ['style']
    });

    // Don't setup initially - wait for dashboard to be made visible by ship selection
}

// Initialize sticky dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', initStickyProgressDashboard);

window.BDOApp = {
    ships,
    recipes,
    coins,
    tccost,
    barters,
    items,
    shipbarters,
    genInfo,
    getShipProgress,
    setStorage,
    getStorage,
    resetData,
    currentShip: () => currentShip,
    adjustEnhancementLevel,
    showRecipeModal
};