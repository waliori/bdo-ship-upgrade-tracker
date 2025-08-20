/**
 * Centralized constants for BDO Ship Upgrade Tracker
 * Eliminates magic numbers and provides single source of truth for configuration
 */

// Storage configuration
export const STORAGE = {
    KEY_PREFIX: "bdo_ship_upgrade",
    KEYS: {
        CURRENT_SHIP: "current_ship",
        SEARCH_QUERY: "search_query", 
        ACTIVE_FILTER: "active_filter",
        ACTIVE_TAB: "active_tab",
        TUTORIAL_COMPLETED: "tutorial_completed"
    }
};

// Animation configuration - Professional timing and easing
export const ANIMATIONS = {
    EASING: {
        GOOEY: "cubic-bezier(0.34, 1.26, 0.64, 1)",           // Subtle gooey bounce
        SMOOTH: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",       // Ultra smooth
        ELASTIC: "cubic-bezier(0.68, -0.15, 0.265, 1.15)",    // Gentle elastic
        MORPHING: "cubic-bezier(0.23, 1, 0.32, 1)"            // Fluid morphing
    },
    TIMING: {
        MICRO: 150,     // Quick feedback (ms)
        FAST: 250,      // Button interactions (ms)
        MEDIUM: 400,    // Card hovers (ms)
        SLOW: 600,      // Modal transitions (ms)
        STAGGER: 60     // List animations (ms)
    },
    SCALE: {
        MICRO: 1.01,    // Barely noticeable
        SMALL: 1.03,    // Subtle hover
        MEDIUM: 1.05,   // Card interactions
        LARGE: 1.08     // Modal emphasis
    }
};

// UI Configuration
export const UI = {
    TOAST: {
        DURATION: 4000,
        MAX_VISIBLE: 3,
        POSITIONS: {
            TOP_RIGHT: 'top-right',
            TOP_LEFT: 'top-left',
            BOTTOM_RIGHT: 'bottom-right',
            BOTTOM_LEFT: 'bottom-left'
        }
    },
    MODAL: {
        OVERLAY_OPACITY: 0.8,
        MIN_WIDTH: 300,
        MAX_WIDTH: 800,
        PADDING: 24
    },
    TOOLTIP: {
        DELAY: 500,
        MAX_WIDTH: 300,
        OFFSET: 10
    },
    DEBOUNCE: {
        SEARCH: 300,
        RESIZE: 100,
        SCROLL: 16
    }
};

// Canvas and graphics
export const GRAPHICS = {
    CANVAS: {
        DEFAULT_WIDTH: 800,
        DEFAULT_HEIGHT: 400,
        DPI_SCALE: window.devicePixelRatio || 1
    },
    WATER: {
        WAVE_HEIGHT: 20,
        WAVE_SPEED: 0.02,
        RIPPLE_RADIUS: 50
    },
    PROGRESS: {
        CIRCLE_RADIUS: 30,
        STROKE_WIDTH: 3,
        ANIMATION_DURATION: 1000
    }
};

// Icon configuration
export const ICONS = {
    SIZES: {
        SMALL: 16,
        MEDIUM: 24,
        LARGE: 32,
        XLARGE: 48
    },
    FALLBACKS: {
        SHIP: '⛵',
        MATERIAL: '📦',
        COIN: '🪙',
        ENHANCEMENT: '⭐',
        BARTER: '🔄',
        INFO: 'ℹ️',
        WARNING: '⚠️',
        ERROR: '❌',
        SUCCESS: '✅'
    }
};

// Validation limits
export const VALIDATION = {
    QUANTITY: {
        MIN: 0,
        MAX: 999999,
        DEFAULT: 0
    },
    SEARCH: {
        MIN_LENGTH: 1,
        MAX_LENGTH: 100
    },
    ENHANCEMENT: {
        MIN_LEVEL: 0,
        MAX_LEVEL: 10
    }
};

// CSS Classes for consistent styling
export const CSS_CLASSES = {
    MATERIAL_CARD: 'material-card',
    PROGRESS_BAR: 'progress-bar',
    BUTTON_PRIMARY: 'btn-primary',
    BUTTON_SECONDARY: 'btn-secondary',
    TOAST_SUCCESS: 'toast-success',
    TOAST_ERROR: 'toast-error',
    TOAST_INFO: 'toast-info',
    MODAL_OVERLAY: 'modal-overlay',
    MODAL_CONTENT: 'modal-content',
    LOADING: 'loading',
    HIDDEN: 'hidden',
    FADE_IN: 'fade-in',
    SLIDE_UP: 'slide-up'
};

// Error types and messages
export const ERRORS = {
    TYPES: {
        VALIDATION: 'ValidationError',
        STORAGE: 'StorageError',
        ANIMATION: 'AnimationError',
        NETWORK: 'NetworkError',
        RUNTIME: 'RuntimeError'
    },
    MESSAGES: {
        INVALID_SHIP: 'Invalid ship name provided',
        INVALID_QUANTITY: 'Quantity must be a positive number',
        STORAGE_FAILED: 'Failed to save data to local storage',
        ANIMATION_FAILED: 'Animation could not be started',
        ELEMENT_NOT_FOUND: 'Required DOM element not found'
    }
};

// Feature flags
export const FEATURES = {
    WATER_EFFECTS: true,
    GUIDED_TOUR: true,
    ADVANCED_ANIMATIONS: true,
    DEBUG_MODE: false,
    PERFORMANCE_MONITORING: false
};

// Default values
export const DEFAULTS = {
    SHIP: "Epheria Sailboat",
    SEARCH_QUERY: "",
    ACTIVE_FILTER: "all",
    ACTIVE_TAB: "all",
    THEME: "dark",
    LANGUAGE: "en"
};

// Accessibility configuration
export const ACCESSIBILITY = {
    ARIA_LABELS: {
        SHIP_SELECTOR: 'Select ship type',
        MATERIAL_CARD: 'Material requirement card',
        PROGRESS_BAR: 'Progress indicator',
        MODAL_CLOSE: 'Close modal',
        QUANTITY_INPUT: 'Enter quantity'
    },
    KEYBOARD: {
        FOCUS_VISIBLE_CLASS: 'focus-visible',
        SKIP_LINK_ID: 'skip-to-content'
    },
    SCREEN_READER: {
        LIVE_REGION_ID: 'sr-live-region',
        STATUS_ROLE: 'status',
        ALERT_ROLE: 'alert'
    }
};