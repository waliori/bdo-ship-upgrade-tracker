/**
 * Safe DOM manipulation utilities for BDO Ship Upgrade Tracker
 * Provides XSS-protected functions to replace unsafe innerHTML usage
 */

import { ERRORS, CSS_CLASSES, ACCESSIBILITY } from './constants.js';

/**
 * Sanitizes text content by escaping HTML entities
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Sanitizes HTML content allowing only safe tags and attributes
 * @param {string} html - HTML to sanitize
 * @returns {string} Sanitized HTML
 */
export function sanitizeHTML(html) {
    if (typeof html !== 'string') return '';
    
    // Allow only safe tags and attributes
    const allowedTags = ['p', 'br', 'strong', 'em', 'span', 'div', 'a'];
    const allowedAttributes = ['href', 'target', 'class', 'id'];
    
    const div = document.createElement('div');
    div.innerHTML = html;
    
    // Remove dangerous elements and attributes
    const walker = document.createTreeWalker(
        div,
        NodeFilter.SHOW_ELEMENT,
        null,
        false
    );
    
    const nodesToRemove = [];
    let node = walker.nextNode();
    
    while (node) {
        const tagName = node.tagName.toLowerCase();
        
        if (!allowedTags.includes(tagName)) {
            nodesToRemove.push(node);
        } else {
            // Remove dangerous attributes
            const attributes = Array.from(node.attributes);
            attributes.forEach(attr => {
                if (!allowedAttributes.includes(attr.name.toLowerCase())) {
                    node.removeAttribute(attr.name);
                }
            });
            
            // Validate href attributes
            if (node.hasAttribute('href')) {
                const href = node.getAttribute('href');
                if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('#')) {
                    node.removeAttribute('href');
                }
            }
        }
        
        node = walker.nextNode();
    }
    
    // Remove dangerous nodes
    nodesToRemove.forEach(node => node.remove());
    
    return div.innerHTML;
}

/**
 * Safely creates a DOM element with attributes and children
 * @param {string} tagName - HTML tag name
 * @param {Object} attributes - Element attributes
 * @param {Array|string} children - Child elements or text content
 * @returns {HTMLElement} Created element
 */
export function createElement(tagName, attributes = {}, children = []) {
    try {
        const element = document.createElement(tagName);
        
        // Set attributes safely
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'textContent') {
                element.textContent = String(value);
            } else if (key === 'innerHTML') {
                element.innerHTML = sanitizeHTML(String(value));
            } else if (key === 'className' || key === 'class') {
                element.className = String(value);
            } else if (key.startsWith('data-') || key.startsWith('aria-')) {
                element.setAttribute(key, String(value));
            } else if (['id', 'type', 'href', 'src', 'alt', 'title'].includes(key)) {
                element.setAttribute(key, String(value));
            } else if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else if (key === 'style' && typeof value === 'string') {
                element.style.cssText = value;
            }
        });
        
        // Add children safely
        if (typeof children === 'string') {
            element.textContent = children;
        } else if (Array.isArray(children)) {
            children.forEach(child => {
                if (typeof child === 'string') {
                    element.appendChild(document.createTextNode(child));
                } else if (child instanceof HTMLElement) {
                    element.appendChild(child);
                }
            });
        }
        
        return element;
    } catch (error) {
        console.error(`[DOM Utils] Failed to create element ${tagName}:`, error);
        return document.createElement('div'); // Fallback
    }
}

/**
 * Safely queries for a DOM element with error handling
 * @param {string} selector - CSS selector
 * @param {HTMLElement} parent - Parent element (optional)
 * @returns {HTMLElement|null} Found element or null
 */
export function safeQuerySelector(selector, parent = document) {
    try {
        return parent.querySelector(selector);
    } catch (error) {
        console.error(`[DOM Utils] Invalid selector "${selector}":`, error);
        return null;
    }
}

/**
 * Safely queries for multiple DOM elements
 * @param {string} selector - CSS selector
 * @param {HTMLElement} parent - Parent element (optional)
 * @returns {NodeList} Found elements
 */
export function safeQuerySelectorAll(selector, parent = document) {
    try {
        return parent.querySelectorAll(selector);
    } catch (error) {
        console.error(`[DOM Utils] Invalid selector "${selector}":`, error);
        return [];
    }
}

/**
 * Safely sets innerHTML with sanitization
 * @param {HTMLElement} element - Target element
 * @param {string} html - HTML content to set
 */
export function safeSetInnerHTML(element, html) {
    if (!element || !element.nodeType) {
        console.warn('[DOM Utils] Invalid element provided to safeSetInnerHTML');
        return;
    }
    
    element.innerHTML = sanitizeHTML(html);
}

/**
 * Safely sets text content
 * @param {HTMLElement} element - Target element
 * @param {string} text - Text content to set
 */
export function safeSetTextContent(element, text) {
    if (!element || !element.nodeType) {
        console.warn('[DOM Utils] Invalid element provided to safeSetTextContent');
        return;
    }
    
    element.textContent = String(text || '');
}

/**
 * Adds CSS classes safely with validation
 * @param {HTMLElement} element - Target element
 * @param {...string} classNames - CSS class names to add
 */
export function addClasses(element, ...classNames) {
    if (!element || !element.classList) {
        console.warn('[DOM Utils] Invalid element provided to addClasses');
        return;
    }
    
    classNames.forEach(className => {
        if (typeof className === 'string' && className.trim()) {
            element.classList.add(className.trim());
        }
    });
}

/**
 * Removes CSS classes safely
 * @param {HTMLElement} element - Target element
 * @param {...string} classNames - CSS class names to remove
 */
export function removeClasses(element, ...classNames) {
    if (!element || !element.classList) {
        console.warn('[DOM Utils] Invalid element provided to removeClasses');
        return;
    }
    
    classNames.forEach(className => {
        if (typeof className === 'string' && className.trim()) {
            element.classList.remove(className.trim());
        }
    });
}

/**
 * Toggles CSS classes safely
 * @param {HTMLElement} element - Target element
 * @param {string} className - CSS class name to toggle
 * @param {boolean} force - Force add or remove
 */
export function toggleClass(element, className, force) {
    if (!element || !element.classList) {
        console.warn('[DOM Utils] Invalid element provided to toggleClass');
        return false;
    }
    
    if (typeof className === 'string' && className.trim()) {
        return element.classList.toggle(className.trim(), force);
    }
    
    return false;
}

/**
 * Safely adds event listener with error handling
 * @param {HTMLElement} element - Target element
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 * @param {Object} options - Event options
 */
export function safeAddEventListener(element, event, handler, options = {}) {
    if (!element || !element.addEventListener) {
        console.warn('[DOM Utils] Invalid element provided to safeAddEventListener');
        return;
    }
    
    if (typeof handler !== 'function') {
        console.warn('[DOM Utils] Invalid handler provided to safeAddEventListener');
        return;
    }
    
    const safeHandler = (e) => {
        try {
            handler(e);
        } catch (error) {
            console.error(`[DOM Utils] Error in event handler for ${event}:`, error);
        }
    };
    
    element.addEventListener(event, safeHandler, options);
    
    // Return cleanup function
    return () => element.removeEventListener(event, safeHandler, options);
}

/**
 * Creates an element with ARIA attributes for accessibility
 * @param {string} tagName - HTML tag name
 * @param {Object} ariaAttributes - ARIA attributes
 * @param {Object} otherAttributes - Other attributes
 * @returns {HTMLElement} Created element
 */
export function createAccessibleElement(tagName, ariaAttributes = {}, otherAttributes = {}) {
    const attributes = { ...otherAttributes };
    
    // Add ARIA attributes
    Object.entries(ariaAttributes).forEach(([key, value]) => {
        const ariaKey = key.startsWith('aria-') ? key : `aria-${key}`;
        attributes[ariaKey] = value;
    });
    
    return createElement(tagName, attributes);
}

/**
 * Creates a button with proper accessibility attributes
 * @param {string} text - Button text
 * @param {Object} options - Button options
 * @returns {HTMLElement} Button element
 */
export function createAccessibleButton(text, options = {}) {
    const {
        className = CSS_CLASSES.BUTTON_PRIMARY,
        ariaLabel = text,
        onClick,
        disabled = false,
        type = 'button'
    } = options;
    
    const button = createElement('button', {
        type,
        className,
        textContent: text,
        'aria-label': ariaLabel,
        disabled
    });
    
    if (onClick) {
        safeAddEventListener(button, 'click', onClick);
    }
    
    return button;
}

/**
 * Creates a DocumentFragment for efficient batch DOM operations
 * @param {Array} elements - Elements to add to fragment
 * @returns {DocumentFragment} Document fragment
 */
export function createFragment(elements = []) {
    const fragment = document.createDocumentFragment();
    
    elements.forEach(element => {
        if (element instanceof HTMLElement) {
            fragment.appendChild(element);
        } else if (typeof element === 'string') {
            fragment.appendChild(document.createTextNode(element));
        }
    });
    
    return fragment;
}

/**
 * Safely removes all children from an element
 * @param {HTMLElement} element - Target element
 */
export function removeAllChildren(element) {
    if (!element || !element.nodeType) {
        console.warn('[DOM Utils] Invalid element provided to removeAllChildren');
        return;
    }
    
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

/**
 * Creates a live region for screen reader announcements
 * @param {string} message - Message to announce
 * @param {string} priority - aria-live priority ('polite' or 'assertive')
 */
export function announceToScreenReader(message, priority = 'polite') {
    let liveRegion = document.getElementById(ACCESSIBILITY.SCREEN_READER.LIVE_REGION_ID);
    
    if (!liveRegion) {
        liveRegion = createElement('div', {
            id: ACCESSIBILITY.SCREEN_READER.LIVE_REGION_ID,
            'aria-live': priority,
            'aria-atomic': 'true',
            style: {
                position: 'absolute',
                left: '-10000px',
                width: '1px',
                height: '1px',
                overflow: 'hidden'
            }
        });
        document.body.appendChild(liveRegion);
    }
    
    // Clear and set new message
    liveRegion.textContent = '';
    setTimeout(() => {
        liveRegion.textContent = message;
    }, 10);
}

/**
 * Validates that an element exists and logs error if not
 * @param {HTMLElement} element - Element to validate
 * @param {string} context - Context for error message
 * @returns {boolean} Whether element is valid
 */
export function validateElement(element, context = 'operation') {
    if (!element || !element.nodeType) {
        console.error(`[DOM Utils] Element validation failed for ${context}: element is null or invalid`);
        return false;
    }
    return true;
}

// Export convenience functions for common patterns
export const dom = {
    create: createElement,
    query: safeQuerySelector,
    queryAll: safeQuerySelectorAll,
    setText: safeSetTextContent,
    setHTML: safeSetInnerHTML,
    addClass: addClasses,
    removeClass: removeClasses,
    toggle: toggleClass,
    listen: safeAddEventListener,
    fragment: createFragment,
    clear: removeAllChildren,
    announce: announceToScreenReader,
    validate: validateElement
};