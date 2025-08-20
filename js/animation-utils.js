/**
 * Animation Utilities
 * Professional animation system for the BDO Ship Upgrade Tracker
 * 
 * @file animation-utils.js
 * @description Centralized animation utilities with Motion.js integration and fallbacks
 * @version 1.0.0
 */

import { ANIMATION_CONFIG } from './constants.js';

// =====================================================
// MOTION LIBRARY INTEGRATION
// =====================================================

/**
 * Safe animate function that checks for Motion availability
 * @param {HTMLElement} element - Element to animate
 * @param {Object} keyframes - Animation keyframes
 * @param {Object} options - Animation options
 * @returns {Promise} Animation promise
 */
export const animate = (element, keyframes, options = {}) => {
    if (window.Motion && window.Motion.animate) {
        return window.Motion.animate(element, keyframes, options);
    }
    // Fallback: return resolved promise if Motion isn't available
    return Promise.resolve();
};

/**
 * Safe stagger function for Motion.js
 * @param {...any} args - Stagger arguments
 * @returns {number|Function} Stagger value or function
 */
export const stagger = (...args) => {
    if (window.Motion && window.Motion.stagger) {
        return window.Motion.stagger(...args);
    }
    return 0;
};

/**
 * Checks if Motion.js is available
 * @returns {boolean} True if Motion.js is loaded
 */
export function isMotionAvailable() {
    return window.Motion && 
           typeof window.Motion.animate === 'function' && 
           typeof window.Motion.stagger === 'function';
}

// =====================================================
// ANIMATION UTILITY FUNCTIONS
// =====================================================

/**
 * Professional animation utilities with elegant motion
 * @type {Object}
 */
export const animUtils = {
    /**
     * Elegant gooey hover animation - subtle and professional
     * @param {HTMLElement} element - Element to animate
     * @param {Object} options - Animation options
     * @param {number} options.scale - Scale value for hover
     * @param {string} options.intensity - Animation intensity (micro, fast, medium, slow)
     */
    gooeyHover: (element, options = {}) => {
        const { scale = ANIMATION_CONFIG.scale.small, intensity = 'medium' } = options;
        const duration = ANIMATION_CONFIG.timing[intensity];
        
        element.addEventListener('mouseenter', () => {
            animate(element, {
                scale,
                filter: ["brightness(1)", "brightness(1.02)"],
                y: [0, -ANIMATION_CONFIG.distance.subtle],
                boxShadow: [
                    "0 2px 8px rgba(0,0,0,0.08)", 
                    "0 8px 32px rgba(74, 158, 255, 0.12)"
                ]
            }, {
                duration,
                easing: ANIMATION_CONFIG.easing.gooey
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
                easing: ANIMATION_CONFIG.easing.smooth
            });
        });
    },

    /**
     * Smooth fade-in animation for dynamic content
     * @param {HTMLElement} element - Element to animate
     * @param {Object} options - Animation options
     * @param {number} options.delay - Animation delay
     * @param {string} options.intensity - Animation intensity
     */
    fadeIn: (element, options = {}) => {
        const { delay = 0, intensity = 'medium' } = options;
        
        return animate(element, {
            opacity: [0, 1],
            y: [ANIMATION_CONFIG.distance.medium, 0],
            filter: ["blur(4px)", "blur(0px)"]
        }, {
            duration: ANIMATION_CONFIG.timing[intensity],
            delay,
            easing: ANIMATION_CONFIG.easing.smooth
        });
    },

    /**
     * Micro feedback animation for buttons and interactions
     * @param {HTMLElement} element - Element to animate
     * @param {Object} options - Animation options
     * @param {number} options.scale - Scale value
     */
    microFeedback: (element, options = {}) => {
        const { scale = ANIMATION_CONFIG.scale.micro } = options;
        
        return animate(element, {
            scale: [1, scale, 1]
        }, {
            duration: ANIMATION_CONFIG.timing.micro,
            easing: ANIMATION_CONFIG.easing.elastic
        });
    },

    /**
     * Elegant stagger animation for lists and grids
     * @param {NodeList|Array} elements - Elements to animate
     * @param {Object} options - Animation options
     * @param {string} options.intensity - Animation intensity
     */
    staggerIn: (elements, options = {}) => {
        const { intensity = 'medium' } = options;
        const staggerDelay = ANIMATION_CONFIG.timing.stagger;
        
        return animate(elements, {
            opacity: [0, 1],
            y: [ANIMATION_CONFIG.distance.medium, 0],
            scale: [0.95, 1]
        }, {
            duration: ANIMATION_CONFIG.timing[intensity],
            delay: stagger(staggerDelay),
            easing: ANIMATION_CONFIG.easing.morphing
        });
    },

    /**
     * Smooth slide animation with direction control
     * @param {HTMLElement} element - Element to animate
     * @param {string} direction - Slide direction ('up', 'down', 'left', 'right')
     * @param {Object} options - Animation options
     * @param {number} options.distance - Slide distance
     * @param {string} options.intensity - Animation intensity
     */
    slide: (element, direction = 'up', options = {}) => {
        const { distance = ANIMATION_CONFIG.distance.large, intensity = 'medium' } = options;
        
        let keyframes = {};
        switch (direction) {
            case 'up':
                keyframes = { y: [distance, 0] };
                break;
            case 'down':
                keyframes = { y: [-distance, 0] };
                break;
            case 'left':
                keyframes = { x: [distance, 0] };
                break;
            case 'right':
                keyframes = { x: [-distance, 0] };
                break;
            default:
                keyframes = { y: [distance, 0] };
        }
        
        return animate(element, {
            opacity: [0, 1],
            ...keyframes
        }, {
            duration: ANIMATION_CONFIG.timing[intensity],
            easing: ANIMATION_CONFIG.easing.smooth
        });
    },

    /**
     * Morphing animation for dynamic content changes
     * @param {HTMLElement} element - Element to animate
     * @param {Object} options - Animation options
     * @param {string} options.intensity - Animation intensity
     */
    morph: (element, options = {}) => {
        const { intensity = 'medium' } = options;
        
        return animate(element, {
            scale: [1, 1.02, 1],
            rotate: [0, 1, 0],
            filter: [
                "brightness(1) saturate(1)",
                "brightness(1.05) saturate(1.1)",
                "brightness(1) saturate(1)"
            ]
        }, {
            duration: ANIMATION_CONFIG.timing[intensity],
            easing: ANIMATION_CONFIG.easing.morphing
        });
    },

    /**
     * Pulse animation for notifications and alerts
     * @param {HTMLElement} element - Element to animate
     * @param {Object} options - Animation options
     * @param {number} options.iterations - Number of pulses
     * @param {string} options.intensity - Animation intensity
     */
    pulse: (element, options = {}) => {
        const { iterations = 2, intensity = 'fast' } = options;
        
        return animate(element, {
            scale: [1, ANIMATION_CONFIG.scale.small, 1],
            opacity: [1, 0.8, 1]
        }, {
            duration: ANIMATION_CONFIG.timing[intensity],
            iterations,
            easing: ANIMATION_CONFIG.easing.elastic
        });
    }
};

// =====================================================
// FALLBACK ANIMATIONS
// =====================================================

/**
 * CSS-based fallback animations when Motion.js is not available
 * @type {Object}
 */
export const fallbackAnimations = {
    /**
     * Applies CSS transition fallback
     * @param {HTMLElement} element - Element to animate
     * @param {string} property - CSS property to transition
     * @param {string} duration - Transition duration
     * @param {string} easing - Transition easing
     */
    transition: (element, property = 'all', duration = '0.3s', easing = 'ease') => {
        if (!element) return;
        
        element.style.transition = `${property} ${duration} ${easing}`;
        
        // Return cleanup function
        return () => {
            element.style.transition = '';
        };
    },

    /**
     * Simple fade in using CSS
     * @param {HTMLElement} element - Element to fade in
     * @param {number} duration - Animation duration in milliseconds
     */
    fadeIn: (element, duration = 300) => {
        if (!element) return Promise.resolve();
        
        return new Promise((resolve) => {
            element.style.opacity = '0';
            element.style.transition = `opacity ${duration}ms ease`;
            
            requestAnimationFrame(() => {
                element.style.opacity = '1';
                setTimeout(() => {
                    element.style.transition = '';
                    resolve();
                }, duration);
            });
        });
    },

    /**
     * Simple scale animation using CSS
     * @param {HTMLElement} element - Element to scale
     * @param {number} scale - Scale value
     * @param {number} duration - Animation duration in milliseconds
     */
    scale: (element, scale = 1.05, duration = 200) => {
        if (!element) return Promise.resolve();
        
        return new Promise((resolve) => {
            element.style.transition = `transform ${duration}ms ease`;
            element.style.transform = `scale(${scale})`;
            
            setTimeout(() => {
                element.style.transform = 'scale(1)';
                setTimeout(() => {
                    element.style.transition = '';
                    resolve();
                }, duration);
            }, duration);
        });
    }
};

// =====================================================
// ANIMATION PRESETS
// =====================================================

/**
 * Pre-configured animation presets for common UI patterns
 * @type {Object}
 */
export const animationPresets = {
    // Button interactions
    button: {
        hover: (element) => animUtils.gooeyHover(element, { scale: ANIMATION_CONFIG.scale.small }),
        click: (element) => animUtils.microFeedback(element, { scale: ANIMATION_CONFIG.scale.micro })
    },
    
    // Card animations
    card: {
        hover: (element) => animUtils.gooeyHover(element, { 
            scale: ANIMATION_CONFIG.scale.medium, 
            intensity: 'medium' 
        }),
        entrance: (element) => animUtils.fadeIn(element, { intensity: 'medium' })
    },
    
    // Modal animations
    modal: {
        open: (element) => animUtils.slide(element, 'up', { 
            distance: ANIMATION_CONFIG.distance.large, 
            intensity: 'slow' 
        }),
        close: (element) => animUtils.slide(element, 'down', { 
            distance: ANIMATION_CONFIG.distance.large, 
            intensity: 'fast' 
        })
    },
    
    // List animations
    list: {
        stagger: (elements) => animUtils.staggerIn(elements, { intensity: 'medium' }),
        item: (element) => animUtils.fadeIn(element, { intensity: 'fast' })
    },
    
    // Notification animations
    notification: {
        show: (element) => animUtils.slide(element, 'down', { intensity: 'fast' }),
        pulse: (element) => animUtils.pulse(element, { iterations: 1, intensity: 'fast' })
    }
};

// =====================================================
// ANIMATION MANAGER
// =====================================================

/**
 * Animation manager for coordinating complex animations
 */
export class AnimationManager {
    constructor() {
        this.activeAnimations = new Map();
        this.animationQueue = [];
    }

    /**
     * Registers an animation with the manager
     * @param {string} id - Unique identifier for the animation
     * @param {Promise} animation - Animation promise
     */
    register(id, animation) {
        this.activeAnimations.set(id, animation);
        
        animation.finally(() => {
            this.activeAnimations.delete(id);
        });
    }

    /**
     * Cancels an animation by ID
     * @param {string} id - Animation ID to cancel
     */
    cancel(id) {
        const animation = this.activeAnimations.get(id);
        if (animation && animation.cancel) {
            animation.cancel();
        }
        this.activeAnimations.delete(id);
    }

    /**
     * Cancels all active animations
     */
    cancelAll() {
        this.activeAnimations.forEach((animation, id) => {
            this.cancel(id);
        });
    }

    /**
     * Waits for all active animations to complete
     * @returns {Promise} Promise that resolves when all animations are done
     */
    async waitForAll() {
        await Promise.all(this.activeAnimations.values());
    }
}

// Global animation manager instance
export const globalAnimationManager = new AnimationManager();

// =====================================================
// PERFORMANCE MONITORING
// =====================================================

/**
 * Performance monitor for animations
 */
export class AnimationPerformanceMonitor {
    constructor() {
        this.metrics = {
            totalAnimations: 0,
            droppedFrames: 0,
            averageDuration: 0
        };
    }

    /**
     * Starts monitoring an animation
     * @param {string} animationId - Animation identifier
     * @returns {Function} Stop monitoring function
     */
    startMonitoring(animationId) {
        const startTime = performance.now();
        this.metrics.totalAnimations++;

        return () => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Update average duration
            this.metrics.averageDuration = 
                (this.metrics.averageDuration + duration) / 2;
        };
    }

    /**
     * Gets current performance metrics
     * @returns {Object} Performance metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Resets performance metrics
     */
    reset() {
        this.metrics = {
            totalAnimations: 0,
            droppedFrames: 0,
            averageDuration: 0
        };
    }
}

// Global performance monitor instance
export const animationPerformanceMonitor = new AnimationPerformanceMonitor();