/**
 * Error handling service for BDO Ship Upgrade Tracker
 * Provides centralized error management, user feedback, and recovery strategies
 */

import { ERRORS, UI } from './constants.js';
import { createElement, safeAddEventListener } from './dom-utils.js';

/**
 * Custom error class for BDO application errors
 */
export class BDOError extends Error {
    constructor(message, type = ERRORS.TYPES.RUNTIME, context = {}) {
        super(message);
        this.name = 'BDOError';
        this.type = type;
        this.context = context;
        this.timestamp = new Date().toISOString();
        this.severity = this.determineSeverity(type);
    }

    determineSeverity(type) {
        const severityMap = {
            [ERRORS.TYPES.VALIDATION]: 'low',
            [ERRORS.TYPES.STORAGE]: 'medium',
            [ERRORS.TYPES.ANIMATION]: 'low',
            [ERRORS.TYPES.NETWORK]: 'medium',
            [ERRORS.TYPES.RUNTIME]: 'high'
        };
        return severityMap[type] || 'medium';
    }

    toString() {
        return `[${this.type}] ${this.message} (${this.timestamp})`;
    }
}

/**
 * Error logger with console output and listener system
 */
export class ErrorLogger {
    constructor() {
        this.listeners = new Set();
        this.errorHistory = [];
        this.maxHistorySize = 100;
    }

    /**
     * Log an error with context
     * @param {Error|BDOError} error - Error to log
     * @param {string} context - Additional context
     */
    log(error, context = '') {
        const errorEntry = {
            error,
            context,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        // Add to history
        this.errorHistory.unshift(errorEntry);
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory.pop();
        }

        // Console logging
        if (error instanceof BDOError) {
            console.error(`[BDO Ship Tracker] ${context}:`, error.toString(), error.context);
        } else {
            console.error(`[BDO Ship Tracker] ${context}:`, error);
        }

        // Notify listeners
        this.listeners.forEach(listener => {
            try {
                listener(errorEntry);
            } catch (listenerError) {
                console.error('[Error Logger] Listener failed:', listenerError);
            }
        });
    }

    /**
     * Add error listener
     * @param {Function} listener - Error listener function
     * @returns {Function} Cleanup function
     */
    addListener(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Get error history
     * @param {number} limit - Maximum number of errors to return
     * @returns {Array} Error history
     */
    getHistory(limit = 10) {
        return this.errorHistory.slice(0, limit);
    }

    /**
     * Clear error history
     */
    clearHistory() {
        this.errorHistory = [];
    }
}

/**
 * User feedback service for displaying errors to users
 */
export class UserFeedback {
    constructor() {
        this.toastContainer = null;
        this.activeToasts = new Set();
        this.initializeContainer();
    }

    /**
     * Initialize toast container
     */
    initializeContainer() {
        this.toastContainer = createElement('div', {
            id: 'error-toast-container',
            className: 'toast-container',
            style: {
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: '10000',
                pointerEvents: 'none'
            }
        });
        document.body.appendChild(this.toastContainer);
    }

    /**
     * Show error message to user
     * @param {string} message - Error message
     * @param {string} type - Message type (error, warning, info)
     * @param {number} duration - Display duration in ms
     */
    showError(message, type = 'error', duration = UI.TOAST.DURATION) {
        const toast = this.createToast(message, type, duration);
        this.toastContainer.appendChild(toast);
        this.activeToasts.add(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });

        // Auto remove
        setTimeout(() => {
            this.removeToast(toast);
        }, duration);

        // Manual close
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            safeAddEventListener(closeBtn, 'click', () => {
                this.removeToast(toast);
            });
        }

        return toast;
    }

    /**
     * Create toast element
     * @param {string} message - Toast message
     * @param {string} type - Toast type
     * @param {number} duration - Display duration
     * @returns {HTMLElement} Toast element
     */
    createToast(message, type, duration) {
        const typeIcons = {
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️',
            success: '✅'
        };

        const toast = createElement('div', {
            className: `toast toast-${type}`,
            role: 'alert',
            'aria-live': 'assertive',
            style: {
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                marginBottom: '8px',
                backgroundColor: type === 'error' ? '#dc2626' : 
                              type === 'warning' ? '#d97706' : 
                              type === 'success' ? '#059669' : '#2563eb',
                color: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                maxWidth: '400px',
                transform: 'translateX(100%)',
                opacity: '0',
                transition: 'all 0.3s ease',
                pointerEvents: 'auto',
                wordBreak: 'break-word'
            }
        });

        const icon = createElement('span', {
            textContent: typeIcons[type] || 'ℹ️',
            style: { fontSize: '16px', flexShrink: '0' }
        });

        const messageEl = createElement('span', {
            textContent: message,
            style: { flex: '1' }
        });

        const closeBtn = createElement('button', {
            className: 'toast-close',
            textContent: '×',
            'aria-label': 'Close notification',
            style: {
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '0',
                marginLeft: '8px',
                flexShrink: '0'
            }
        });

        toast.appendChild(icon);
        toast.appendChild(messageEl);
        toast.appendChild(closeBtn);

        return toast;
    }

    /**
     * Remove toast from display
     * @param {HTMLElement} toast - Toast element to remove
     */
    removeToast(toast) {
        if (!this.activeToasts.has(toast)) return;

        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            this.activeToasts.delete(toast);
        }, 300);
    }

    /**
     * Clear all active toasts
     */
    clearAll() {
        this.activeToasts.forEach(toast => {
            this.removeToast(toast);
        });
    }
}

/**
 * Error recovery strategies
 */
export class ErrorRecovery {
    constructor() {
        this.retryStrategies = new Map();
        this.maxRetries = 3;
        this.retryDelay = 1000;
    }

    /**
     * Register a retry strategy for a specific operation
     * @param {string} operationId - Unique operation identifier
     * @param {Function} operation - Operation to retry
     * @param {Object} options - Retry options
     */
    registerRetryStrategy(operationId, operation, options = {}) {
        this.retryStrategies.set(operationId, {
            operation,
            maxRetries: options.maxRetries || this.maxRetries,
            delay: options.delay || this.retryDelay,
            exponentialBackoff: options.exponentialBackoff || false,
            attempts: 0
        });
    }

    /**
     * Execute operation with retry logic
     * @param {string} operationId - Operation identifier
     * @param {...any} args - Operation arguments
     * @returns {Promise} Operation result
     */
    async executeWithRetry(operationId, ...args) {
        const strategy = this.retryStrategies.get(operationId);
        if (!strategy) {
            throw new BDOError(`No retry strategy found for operation: ${operationId}`, ERRORS.TYPES.RUNTIME);
        }

        let lastError;
        for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
            try {
                const result = await strategy.operation(...args);
                strategy.attempts = 0; // Reset on success
                return result;
            } catch (error) {
                lastError = error;
                strategy.attempts++;

                if (attempt < strategy.maxRetries) {
                    const delay = strategy.exponentialBackoff 
                        ? strategy.delay * Math.pow(2, attempt)
                        : strategy.delay;
                    
                    await this.delay(delay);
                }
            }
        }

        throw new BDOError(
            `Operation ${operationId} failed after ${strategy.maxRetries + 1} attempts: ${lastError.message}`,
            ERRORS.TYPES.RUNTIME,
            { originalError: lastError, attempts: strategy.attempts }
        );
    }

    /**
     * Delay utility for retry logic
     * @param {number} ms - Delay in milliseconds
     * @returns {Promise} Delay promise
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Create global instances
export const errorLogger = new ErrorLogger();
export const userFeedback = new UserFeedback();
export const errorRecovery = new ErrorRecovery();

/**
 * Global error handler setup
 */
export function setupGlobalErrorHandling() {
    // Handle unhandled errors
    window.addEventListener('error', (event) => {
        const error = new BDOError(
            event.message || 'Unknown error occurred',
            ERRORS.TYPES.RUNTIME,
            {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error ? event.error.stack : null
            }
        );
        
        errorLogger.log(error, 'Global error handler');
        userFeedback.showError('An unexpected error occurred. Please refresh the page if problems persist.');
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        const error = new BDOError(
            event.reason ? event.reason.toString() : 'Unhandled promise rejection',
            ERRORS.TYPES.RUNTIME,
            { reason: event.reason }
        );
        
        errorLogger.log(error, 'Unhandled promise rejection');
        userFeedback.showError('A network or processing error occurred. Please try again.');
        
        // Prevent default browser handling
        event.preventDefault();
    });
}

/**
 * Convenience functions for common error scenarios
 */
export const errorUtils = {
    /**
     * Wrap a function with error handling
     * @param {Function} fn - Function to wrap
     * @param {string} context - Error context
     * @returns {Function} Wrapped function
     */
    wrap: (fn, context = 'Operation') => {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                const bdoError = error instanceof BDOError ? error : 
                    new BDOError(error.message, ERRORS.TYPES.RUNTIME, { originalError: error });
                
                errorLogger.log(bdoError, context);
                throw bdoError;
            }
        };
    },

    /**
     * Handle async operation with user feedback
     * @param {Promise} operation - Async operation
     * @param {string} errorMessage - User-friendly error message
     * @returns {Promise} Operation result
     */
    handleAsync: async (operation, errorMessage = 'Operation failed') => {
        try {
            return await operation;
        } catch (error) {
            const bdoError = error instanceof BDOError ? error :
                new BDOError(error.message, ERRORS.TYPES.RUNTIME);
            
            errorLogger.log(bdoError, 'Async operation');
            userFeedback.showError(errorMessage);
            throw bdoError;
        }
    },

    /**
     * Validate and handle user input
     * @param {any} value - Value to validate
     * @param {Function} validator - Validation function
     * @param {string} errorMessage - Error message
     * @returns {any} Validated value
     */
    validateInput: (value, validator, errorMessage) => {
        try {
            if (!validator(value)) {
                throw new BDOError(errorMessage, ERRORS.TYPES.VALIDATION, { value });
            }
            return value;
        } catch (error) {
            userFeedback.showError(errorMessage, 'warning');
            throw error;
        }
    }
};

// Initialize global error handling
setupGlobalErrorHandling();