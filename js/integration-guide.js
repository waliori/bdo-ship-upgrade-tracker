/**
 * Integration Guide for New Utility Modules
 * Demonstrates how to integrate the new utility modules into existing code
 * 
 * @file integration-guide.js
 * @description Examples and migration patterns for adopting the new utilities
 * @version 1.0.0
 */

// =====================================================
// IMPORT EXAMPLES
// =====================================================

/*
// Import specific utilities as needed
import { STORAGE_KEY, ANIMATION_CONFIG, UI_CONFIG } from './constants.js';
import { setTextContent, createElement, addClass } from './dom-utils.js';
import { animate, animUtils, animationPresets } from './animation-utils.js';
import { handleError, withErrorHandling, BDOError } from './error-handling.js';
import { formatNumber, getStorageItem, setStorageItem } from './utils.js';
*/

// =====================================================
// MIGRATION EXAMPLES
// =====================================================

/**
 * Example: Migrating unsafe innerHTML usage to safe DOM utilities
 */
export const domMigrationExamples = {
    // BEFORE - Unsafe innerHTML usage
    oldUnsafeWay: function(element, userInput) {
        // ❌ XSS vulnerable
        element.innerHTML = `<span>Hello ${userInput}</span>`;
    },

    // AFTER - Safe DOM utilities
    newSafeWay: function(element, userInput) {
        // ✅ XSS protected
        import('./dom-utils.js').then(({ createElement, setTextContent }) => {
            const span = createElement('span');
            setTextContent(span, `Hello ${userInput}`);
            element.appendChild(span);
        });
    },

    // Alternative using setHtmlContent with sanitization
    alternativeSafeWay: function(element, content) {
        import('./dom-utils.js').then(({ setHtmlContent }) => {
            // ✅ HTML is sanitized automatically
            setHtmlContent(element, content, true);
        });
    }
};

/**
 * Example: Migrating hardcoded values to constants
 */
export const constantsMigrationExamples = {
    // BEFORE - Magic numbers and hardcoded strings
    oldHardcodedWay: function() {
        // ❌ Magic numbers and strings scattered throughout code
        const storageKey = "bdo_ship_upgrade-materials";
        const animationDuration = 0.4;
        const toastDuration = 5000;
        
        localStorage.setItem(storageKey, JSON.stringify(data));
        animate(element, { scale: 1.05 }, { duration: animationDuration });
        setTimeout(hideToast, toastDuration);
    },

    // AFTER - Centralized constants
    newConstantsWay: function() {
        // ✅ Centralized, maintainable configuration
        import('./constants.js').then(({ STORAGE_KEYS, ANIMATION_CONFIG, UI_CONFIG }) => {
            localStorage.setItem(STORAGE_KEYS.MATERIAL_PROGRESS, JSON.stringify(data));
            animate(element, { scale: ANIMATION_CONFIG.scale.medium }, { 
                duration: ANIMATION_CONFIG.timing.medium 
            });
            setTimeout(hideToast, UI_CONFIG.toast.duration.medium);
        });
    }
};

/**
 * Example: Migrating ad-hoc animations to animation utilities
 */
export const animationMigrationExamples = {
    // BEFORE - Inconsistent animation handling
    oldAnimationWay: function(element) {
        // ❌ Inconsistent animation logic, no fallbacks
        if (window.Motion) {
            window.Motion.animate(element, {
                scale: [1, 1.03, 1],
                y: [0, -2, 0]
            }, {
                duration: 0.25,
                easing: "cubic-bezier(0.34, 1.26, 0.64, 1)"
            });
        }
    },

    // AFTER - Unified animation utilities
    newAnimationWay: function(element) {
        // ✅ Consistent, fallback-safe animations
        import('./animation-utils.js').then(({ animationPresets }) => {
            animationPresets.button.hover(element);
        });
    },

    // Custom animation with utilities
    customAnimationWay: function(element) {
        import('./animation-utils.js').then(({ animUtils }) => {
            animUtils.gooeyHover(element, { 
                scale: ANIMATION_CONFIG.scale.small,
                intensity: 'medium'
            });
        });
    }
};

/**
 * Example: Migrating error handling
 */
export const errorHandlingMigrationExamples = {
    // BEFORE - Ad-hoc error handling
    oldErrorWay: async function() {
        try {
            // ❌ Inconsistent error handling
            const data = await fetchData();
            processData(data);
        } catch (error) {
            console.error(error);
            alert('Something went wrong!');
        }
    },

    // AFTER - Structured error handling
    newErrorWay: async function() {
        // ✅ Consistent, user-friendly error handling
        const { withErrorHandling, ErrorCategory, ErrorSeverity } = await import('./error-handling.js');
        
        const safeProcessData = withErrorHandling(processData, {
            category: ErrorCategory.DATA,
            severity: ErrorSeverity.MEDIUM,
            showUser: true,
            feedbackOptions: {
                showRetry: true,
                retryAction: () => this.newErrorWay()
            }
        });

        const data = await fetchData();
        await safeProcessData(data);
    },

    // Manual error handling with BDOError
    manualErrorWay: function() {
        import('./error-handling.js').then(({ handleError, BDOError, ErrorCategory, ErrorSeverity }) => {
            try {
                riskyOperation();
            } catch (error) {
                handleError(new BDOError(
                    'Failed to process ship data',
                    ErrorCategory.DATA,
                    ErrorSeverity.HIGH,
                    { shipName: currentShip, operation: 'riskyOperation' }
                ));
            }
        });
    }
};

/**
 * Example: Migrating utility functions
 */
export const utilityMigrationExamples = {
    // BEFORE - Inline utility logic
    oldUtilityWay: function(materials) {
        // ❌ Repeated utility logic throughout codebase
        const total = materials.reduce((sum, item) => sum + item.count, 0);
        const formatted = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        
        try {
            localStorage.setItem('bdo_ship_upgrade-total', JSON.stringify(total));
        } catch (e) {
            console.warn('Storage failed');
        }
        
        return formatted;
    },

    // AFTER - Centralized utilities
    newUtilityWay: function(materials) {
        // ✅ Reusable, tested utility functions
        import('./utils.js').then(({ formatNumber, setStorageItem }) => {
            const total = materials.reduce((sum, item) => sum + item.count, 0);
            const formatted = formatNumber(total);
            
            setStorageItem('bdo_ship_upgrade-total', total);
            
            return formatted;
        });
    }
};

// =====================================================
// INTEGRATION PATTERNS
// =====================================================

/**
 * Pattern: Gradual Migration Strategy
 * Demonstrates how to gradually adopt new utilities without breaking existing code
 */
export const gradualMigrationPattern = {
    // Step 1: Add imports alongside existing code
    step1_addImports: function() {
        // Add new imports but keep old code working
        Promise.all([
            import('./constants.js'),
            import('./dom-utils.js'),
            import('./utils.js')
        ]).then(([constants, domUtils, utils]) => {
            // New utilities available, but old code still works
            window.BDOUtils = { constants, domUtils, utils };
        });
    },

    // Step 2: Replace high-impact areas first
    step2_replaceHighImpact: function() {
        // Replace error-prone areas like XSS vulnerabilities first
        if (window.BDOUtils) {
            const { setTextContent } = window.BDOUtils.domUtils;
            // Replace all innerHTML with user data
            document.querySelectorAll('[data-user-content]').forEach(el => {
                const content = el.dataset.userContent;
                setTextContent(el, content);
            });
        }
    },

    // Step 3: Migrate function by function
    step3_migrateGradually: function() {
        // Wrap existing functions with new utilities
        const originalFunction = window.someExistingFunction;
        window.someExistingFunction = async function(...args) {
            const { withErrorHandling } = await import('./error-handling.js');
            const safeFunction = withErrorHandling(originalFunction);
            return safeFunction.apply(this, args);
        };
    }
};

/**
 * Pattern: Toast Notification Integration
 * Shows how to integrate the new error handling system with existing toast code
 */
export const toastIntegrationPattern = {
    // Old toast function
    oldToast: function(message, type = 'info') {
        // Existing toast implementation
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = message; // ❌ XSS vulnerable
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000); // ❌ Magic number
    },

    // Integrated with new utilities
    newToast: async function(message, type = 'info') {
        const [{ createElement, setTextContent }, { UI_CONFIG }] = await Promise.all([
            import('./dom-utils.js'),
            import('./constants.js')
        ]);

        const toast = createElement('div', {
            className: `toast toast-${type}`,
            textContent: message // ✅ XSS safe
        });
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, UI_CONFIG.toast.duration.medium); // ✅ Configurable
    },

    // Using the error handling service directly
    errorServiceToast: async function(error) {
        const { userFeedback } = await import('./error-handling.js');
        userFeedback.showError(error);
    }
};

/**
 * Pattern: Animation Integration
 * Shows how to replace existing animation code with new utilities
 */
export const animationIntegrationPattern = {
    // Old animation approach
    oldAnimation: function(element) {
        if (window.Motion) {
            window.Motion.animate(element, {
                scale: [1, 1.05, 1],
                y: [0, -2, 0]
            }, {
                duration: 0.3,
                easing: "ease-out"
            });
        } else {
            // No fallback
            element.style.transform = 'scale(1.05)';
        }
    },

    // New animation approach
    newAnimation: async function(element) {
        const { animationPresets } = await import('./animation-utils.js');
        animationPresets.card.hover(element);
    },

    // Custom animation with fallbacks
    customAnimation: async function(element) {
        const { animUtils, fallbackAnimations } = await import('./animation-utils.js');
        
        try {
            await animUtils.gooeyHover(element);
        } catch (error) {
            // Graceful fallback
            fallbackAnimations.scale(element, 1.05, 300);
        }
    }
};

// =====================================================
// BEST PRACTICES
// =====================================================

/**
 * Best practices for using the new utility modules
 */
export const bestPractices = {
    // ✅ Import only what you need
    selectiveImporting: function() {
        // Good - specific imports
        import { formatNumber, clamp } from './utils.js';
        import { setTextContent, createElement } from './dom-utils.js';
        
        // Avoid - importing everything
        // import * as utils from './utils.js';
    },

    // ✅ Use async imports for code splitting
    asyncImporting: async function() {
        const { handleError } = await import('./error-handling.js');
        // Use handleError
    },

    // ✅ Combine utilities for complex operations
    combineUtilities: async function(userInput, element) {
        const [
            { setTextContent, createElement },
            { formatNumber },
            { handleError }
        ] = await Promise.all([
            import('./dom-utils.js'),
            import('./utils.js'),
            import('./error-handling.js')
        ]);

        try {
            const value = parseFloat(userInput);
            const formatted = formatNumber(value);
            const span = createElement('span', { textContent: formatted });
            element.appendChild(span);
        } catch (error) {
            handleError(error);
        }
    },

    // ✅ Use constants for configuration
    useConstants: async function() {
        const { ANIMATION_CONFIG, UI_CONFIG } = await import('./constants.js');
        
        // Use configuration values
        const duration = ANIMATION_CONFIG.timing.medium;
        const toastDuration = UI_CONFIG.toast.duration.long;
    },

    // ✅ Wrap existing functions for safety
    wrapForSafety: async function(existingFunction) {
        const { withErrorHandling } = await import('./error-handling.js');
        
        return withErrorHandling(existingFunction, {
            showUser: true,
            category: 'user_input'
        });
    }
};

// =====================================================
// CHECKLIST FOR INTEGRATION
// =====================================================

export const integrationChecklist = {
    security: [
        '□ Replace all innerHTML with user data with setTextContent or setHtmlContent',
        '□ Use createElement instead of manual HTML string building',
        '□ Sanitize any HTML content using the DOM utilities',
        '□ Validate user inputs using utility validation functions'
    ],
    
    maintainability: [
        '□ Replace magic numbers with constants from constants.js',
        '□ Use centralized animation configuration',
        '□ Replace hardcoded storage keys with STORAGE_KEYS',
        '□ Use consistent error handling patterns'
    ],
    
    performance: [
        '□ Use async imports for code splitting',
        '□ Import only needed utilities',
        '□ Use throttle/debounce for expensive operations',
        '□ Implement proper error boundaries'
    ],
    
    userExperience: [
        '□ Use consistent animation presets',
        '□ Implement proper error feedback',
        '□ Add loading states where appropriate',
        '□ Ensure accessibility compliance'
    ]
};

// Export integration helpers
export default {
    domMigrationExamples,
    constantsMigrationExamples,
    animationMigrationExamples,
    errorHandlingMigrationExamples,
    utilityMigrationExamples,
    gradualMigrationPattern,
    toastIntegrationPattern,
    animationIntegrationPattern,
    bestPractices,
    integrationChecklist
};