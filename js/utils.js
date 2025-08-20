/**
 * Utility functions for BDO Ship Upgrade Tracker
 * Common formatting, validation, and helper functions
 */

import { STORAGE, VALIDATION } from './constants.js';
import { BDOError, ERRORS } from './error-handling.js';

/**
 * Number formatting utilities
 */
export const formatNumber = {
    /**
     * Format number with thousand separators
     * @param {number} num - Number to format
     * @returns {string} Formatted number
     */
    withCommas: (num) => {
        if (typeof num !== 'number' || isNaN(num)) return '0';
        return new Intl.NumberFormat().format(num);
    },

    /**
     * Format percentage
     * @param {number} value - Current value
     * @param {number} total - Total value
     * @param {number} decimals - Decimal places
     * @returns {string} Formatted percentage
     */
    percentage: (value, total, decimals = 0) => {
        if (total === 0) return '0%';
        const percent = (value / total) * 100;
        return `${percent.toFixed(decimals)}%`;
    },

    /**
     * Format compact numbers (1K, 1M, etc.)
     * @param {number} num - Number to format
     * @returns {string} Compact format
     */
    compact: (num) => {
        if (typeof num !== 'number' || isNaN(num)) return '0';
        
        const units = [
            { value: 1e9, suffix: 'B' },
            { value: 1e6, suffix: 'M' },
            { value: 1e3, suffix: 'K' }
        ];
        
        for (const unit of units) {
            if (num >= unit.value) {
                return (num / unit.value).toFixed(1) + unit.suffix;
            }
        }
        
        return num.toString();
    },

    /**
     * Format file size
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size
     */
    fileSize: (bytes) => {
        if (bytes === 0) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    }
};

/**
 * String utilities
 */
export const stringUtils = {
    /**
     * Capitalize first letter
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    capitalize: (str) => {
        if (typeof str !== 'string') return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Truncate string with ellipsis
     * @param {string} str - String to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated string
     */
    truncate: (str, maxLength) => {
        if (typeof str !== 'string') return '';
        if (str.length <= maxLength) return str;
        return str.slice(0, maxLength - 3) + '...';
    },

    /**
     * Strip HTML tags from string
     * @param {string} html - HTML string
     * @returns {string} Plain text
     */
    stripHTML: (html) => {
        if (typeof html !== 'string') return '';
        return html.replace(/<[^>]*>/g, '');
    },

    /**
     * Convert to kebab-case
     * @param {string} str - String to convert
     * @returns {string} Kebab-case string
     */
    kebabCase: (str) => {
        if (typeof str !== 'string') return '';
        return str
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/\s+/g, '-')
            .toLowerCase();
    },

    /**
     * Generate a random ID
     * @param {number} length - ID length
     * @returns {string} Random ID
     */
    randomId: (length = 8) => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
};

/**
 * Array utilities
 */
export const arrayUtils = {
    /**
     * Get unique values from array
     * @param {Array} arr - Input array
     * @returns {Array} Array with unique values
     */
    unique: (arr) => {
        if (!Array.isArray(arr)) return [];
        return [...new Set(arr)];
    },

    /**
     * Chunk array into smaller arrays
     * @param {Array} arr - Input array
     * @param {number} size - Chunk size
     * @returns {Array} Array of chunks
     */
    chunk: (arr, size) => {
        if (!Array.isArray(arr) || size <= 0) return [];
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    },

    /**
     * Shuffle array
     * @param {Array} arr - Input array
     * @returns {Array} Shuffled array (new array)
     */
    shuffle: (arr) => {
        if (!Array.isArray(arr)) return [];
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    /**
     * Group array by key
     * @param {Array} arr - Input array
     * @param {string|Function} key - Grouping key or function
     * @returns {Object} Grouped object
     */
    groupBy: (arr, key) => {
        if (!Array.isArray(arr)) return {};
        
        return arr.reduce((groups, item) => {
            const group = typeof key === 'function' ? key(item) : item[key];
            if (!groups[group]) {
                groups[group] = [];
            }
            groups[group].push(item);
            return groups;
        }, {});
    }
};

/**
 * Object utilities
 */
export const objectUtils = {
    /**
     * Deep clone object
     * @param {any} obj - Object to clone
     * @returns {any} Cloned object
     */
    deepClone: (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => objectUtils.deepClone(item));
        if (typeof obj === 'object') {
            const cloned = {};
            Object.keys(obj).forEach(key => {
                cloned[key] = objectUtils.deepClone(obj[key]);
            });
            return cloned;
        }
        return obj;
    },

    /**
     * Deep merge objects
     * @param {Object} target - Target object
     * @param {...Object} sources - Source objects
     * @returns {Object} Merged object
     */
    deepMerge: (target, ...sources) => {
        if (!sources.length) return target;
        const source = sources.shift();

        if (objectUtils.isObject(target) && objectUtils.isObject(source)) {
            for (const key in source) {
                if (objectUtils.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    objectUtils.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }

        return objectUtils.deepMerge(target, ...sources);
    },

    /**
     * Check if value is object
     * @param {any} item - Value to check
     * @returns {boolean} True if object
     */
    isObject: (item) => {
        return item && typeof item === 'object' && !Array.isArray(item);
    },

    /**
     * Get nested property safely
     * @param {Object} obj - Source object
     * @param {string} path - Property path (e.g., 'a.b.c')
     * @param {any} defaultValue - Default value if not found
     * @returns {any} Property value or default
     */
    get: (obj, path, defaultValue = undefined) => {
        if (!obj || typeof path !== 'string') return defaultValue;
        
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current[key] === undefined || current[key] === null) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current;
    },

    /**
     * Set nested property safely
     * @param {Object} obj - Target object
     * @param {string} path - Property path
     * @param {any} value - Value to set
     */
    set: (obj, path, value) => {
        if (!obj || typeof path !== 'string') return;
        
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
    }
};

/**
 * Safe localStorage operations
 */
export const storage = {
    /**
     * Get item from localStorage
     * @param {string} key - Storage key
     * @param {any} defaultValue - Default value
     * @returns {any} Stored value or default
     */
    get: (key, defaultValue = null) => {
        try {
            const fullKey = `${STORAGE.KEY_PREFIX}-${key}`;
            const item = localStorage.getItem(fullKey);
            if (item === null) return defaultValue;
            return JSON.parse(item);
        } catch (error) {
            console.warn(`[Storage] Failed to get key "${key}":`, error);
            return defaultValue;
        }
    },

    /**
     * Set item in localStorage
     * @param {string} key - Storage key
     * @param {any} value - Value to store
     */
    set: (key, value) => {
        try {
            const fullKey = `${STORAGE.KEY_PREFIX}-${key}`;
            localStorage.setItem(fullKey, JSON.stringify(value));
        } catch (error) {
            console.error(`[Storage] Failed to set key "${key}":`, error);
            throw new BDOError(`Failed to save data: ${error.message}`, ERRORS.TYPES.STORAGE);
        }
    },

    /**
     * Remove item from localStorage
     * @param {string} key - Storage key
     */
    remove: (key) => {
        try {
            const fullKey = `${STORAGE.KEY_PREFIX}-${key}`;
            localStorage.removeItem(fullKey);
        } catch (error) {
            console.warn(`[Storage] Failed to remove key "${key}":`, error);
        }
    },

    /**
     * Clear all app data from localStorage
     */
    clear: () => {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(STORAGE.KEY_PREFIX)) {
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.error('[Storage] Failed to clear data:', error);
        }
    },

    /**
     * Get storage usage statistics
     * @returns {Object} Storage statistics
     */
    getStats: () => {
        try {
            let totalSize = 0;
            let appSize = 0;
            let appKeys = 0;

            for (const key in localStorage) {
                const value = localStorage[key];
                const size = new Blob([value]).size;
                totalSize += size;

                if (key.startsWith(STORAGE.KEY_PREFIX)) {
                    appSize += size;
                    appKeys++;
                }
            }

            return {
                totalSize,
                appSize,
                appKeys,
                totalKeys: Object.keys(localStorage).length
            };
        } catch (error) {
            console.warn('[Storage] Failed to get stats:', error);
            return { totalSize: 0, appSize: 0, appKeys: 0, totalKeys: 0 };
        }
    }
};

/**
 * Date and time utilities
 */
export const dateUtils = {
    /**
     * Format date as readable string
     * @param {Date|string|number} date - Date to format
     * @param {Object} options - Intl.DateTimeFormat options
     * @returns {string} Formatted date
     */
    format: (date, options = {}) => {
        try {
            const d = new Date(date);
            if (isNaN(d.getTime())) return 'Invalid Date';
            
            const defaultOptions = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };
            
            return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(d);
        } catch (error) {
            return 'Invalid Date';
        }
    },

    /**
     * Get time elapsed since date
     * @param {Date|string|number} date - Start date
     * @returns {string} Elapsed time string
     */
    timeAgo: (date) => {
        try {
            const now = new Date();
            const past = new Date(date);
            const seconds = Math.floor((now - past) / 1000);

            const intervals = [
                { label: 'year', seconds: 31536000 },
                { label: 'month', seconds: 2592000 },
                { label: 'day', seconds: 86400 },
                { label: 'hour', seconds: 3600 },
                { label: 'minute', seconds: 60 }
            ];

            for (const interval of intervals) {
                const count = Math.floor(seconds / interval.seconds);
                if (count > 0) {
                    return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
                }
            }

            return 'just now';
        } catch (error) {
            return 'unknown';
        }
    },

    /**
     * Check if date is today
     * @param {Date|string|number} date - Date to check
     * @returns {boolean} True if today
     */
    isToday: (date) => {
        try {
            const today = new Date();
            const check = new Date(date);
            return today.toDateString() === check.toDateString();
        } catch (error) {
            return false;
        }
    }
};

/**
 * Validation utilities
 */
export const validate = {
    /**
     * Validate email address
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     */
    email: (email) => {
        if (typeof email !== 'string') return false;
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    /**
     * Validate quantity input
     * @param {any} value - Value to validate
     * @returns {boolean} True if valid
     */
    quantity: (value) => {
        const num = Number(value);
        return !isNaN(num) && 
               num >= VALIDATION.QUANTITY.MIN && 
               num <= VALIDATION.QUANTITY.MAX &&
               Number.isInteger(num);
    },

    /**
     * Validate enhancement level
     * @param {any} level - Level to validate
     * @returns {boolean} True if valid
     */
    enhancementLevel: (level) => {
        const num = Number(level);
        return !isNaN(num) && 
               num >= VALIDATION.ENHANCEMENT.MIN_LEVEL && 
               num <= VALIDATION.ENHANCEMENT.MAX_LEVEL &&
               Number.isInteger(num);
    },

    /**
     * Validate search query
     * @param {string} query - Search query
     * @returns {boolean} True if valid
     */
    searchQuery: (query) => {
        if (typeof query !== 'string') return false;
        return query.length >= VALIDATION.SEARCH.MIN_LENGTH && 
               query.length <= VALIDATION.SEARCH.MAX_LENGTH;
    },

    /**
     * Validate ship name
     * @param {string} shipName - Ship name to validate
     * @param {Array} validShips - Array of valid ship names
     * @returns {boolean} True if valid
     */
    shipName: (shipName, validShips = []) => {
        if (typeof shipName !== 'string') return false;
        return validShips.length === 0 || validShips.includes(shipName);
    }
};

/**
 * Performance utilities
 */
export const performance = {
    /**
     * Debounce function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @param {boolean} immediate - Execute immediately
     * @returns {Function} Debounced function
     */
    debounce: (func, wait, immediate = false) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    },

    /**
     * Throttle function calls
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} Throttled function
     */
    throttle: (func, limit) => {
        let lastFunc;
        let lastRan;
        return function(...args) {
            if (!lastRan) {
                func(...args);
                lastRan = Date.now();
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(() => {
                    if ((Date.now() - lastRan) >= limit) {
                        func(...args);
                        lastRan = Date.now();
                    }
                }, limit - (Date.now() - lastRan));
            }
        };
    },

    /**
     * Measure function execution time
     * @param {Function} func - Function to measure
     * @param {...any} args - Function arguments
     * @returns {Object} Result and timing information
     */
    measure: async (func, ...args) => {
        const start = performance.now();
        try {
            const result = await func(...args);
            const duration = performance.now() - start;
            return { result, duration, success: true };
        } catch (error) {
            const duration = performance.now() - start;
            return { error, duration, success: false };
        }
    }
};

/**
 * Math utilities
 */
export const mathUtils = {
    /**
     * Linear interpolation
     * @param {number} start - Start value
     * @param {number} end - End value
     * @param {number} t - Time parameter (0-1)
     * @returns {number} Interpolated value
     */
    lerp: (start, end, t) => {
        return start + (end - start) * Math.max(0, Math.min(1, t));
    },

    /**
     * Map value from one range to another
     * @param {number} value - Input value
     * @param {number} inMin - Input minimum
     * @param {number} inMax - Input maximum
     * @param {number} outMin - Output minimum
     * @param {number} outMax - Output maximum
     * @returns {number} Mapped value
     */
    mapRange: (value, inMin, inMax, outMin, outMax) => {
        return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    },

    /**
     * Clamp value between min and max
     * @param {number} value - Value to clamp
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Clamped value
     */
    clamp: (value, min, max) => {
        return Math.min(Math.max(value, min), max);
    },

    /**
     * Round to specified decimal places
     * @param {number} value - Value to round
     * @param {number} decimals - Number of decimal places
     * @returns {number} Rounded value
     */
    round: (value, decimals = 0) => {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }
};

// Export convenience object with all utilities
export const utils = {
    format: formatNumber,
    string: stringUtils,
    array: arrayUtils,
    object: objectUtils,
    storage,
    date: dateUtils,
    validate,
    performance,
    math: mathUtils
};