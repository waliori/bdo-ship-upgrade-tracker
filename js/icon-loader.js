// BDO Ship Upgrade Tracker - Icon Loading System
// Sophisticated icon management with fallbacks and optimization

class IconLoader {
    constructor() {
        this.iconMapping = {};
        this.loadedIcons = new Map();
        this.failedIcons = new Set();
        this.loadingPromises = new Map();
        this.initialized = false;
        
        // Initialize the icon system
        this.init();
    }
    
    async init() {
        try {
            // Load icon mapping
            const response = await fetch('./icon_mapping.json');
            this.iconMapping = await response.json();
            this.initialized = true;
            
        } catch (error) {
            this.initialized = false;
        }
    }
    
    /**
     * Get the icon information (filename and URL) for a given item name
     */
    getIconInfo(itemName) {
        // Direct mapping
        if (this.iconMapping[itemName]) {
            const mapping = this.iconMapping[itemName];
            // Handle both old format (string) and new format (object)
            if (typeof mapping === 'string') {
                return { filename: mapping, url: null };
            } else {
                return { filename: mapping.icon, url: mapping.url };
            }
        }
        
        // Try without +10 prefix for enhanced items
        if (itemName.startsWith('+10 ')) {
            const baseName = itemName.substring(4);
            if (this.iconMapping[baseName]) {
                const mapping = this.iconMapping[baseName];
                if (typeof mapping === 'string') {
                    return { filename: mapping, url: null };
                } else {
                    return { filename: mapping.icon, url: mapping.url };
                }
            }
        }
        
        // Try variations for upgraded items
        const variations = [
            itemName.replace('(Green)', '').trim(),
            itemName.replace('(Blue)', '').trim(),
            itemName.replace('Upgraded Plating', 'Plating').trim(),
            itemName.replace('Black Dragon', 'Dragon').trim(),
            itemName.replace('Stratus Wind', 'Wind').trim()
        ];
        
        for (const variation of variations) {
            if (this.iconMapping[variation]) {
                const mapping = this.iconMapping[variation];
                if (typeof mapping === 'string') {
                    return { filename: mapping, url: null };
                } else {
                    return { filename: mapping.icon, url: mapping.url };
                }
            }
        }
        
        return null;
    }
    
    /**
     * Get the icon filename for a given item name (legacy compatibility)
     */
    getIconFilename(itemName) {
        const info = this.getIconInfo(itemName);
        return info ? info.filename : null;
    }
    
    /**
     * Create an icon element with proper loading and fallback
     */
    async createIcon(itemName, size = "md", options = {}) {
        // Wait for initialization if needed
        if (!this.initialized) {
            await this.init();
        }
        
        // Get icon information (filename and URL)
        const iconInfo = this.getIconInfo(itemName);
        
        // Determine if this should be a clickable link
        const isClickable = options.clickable !== false && iconInfo && iconInfo.url;
        
        // Create container element (link or div)
        const iconElement = document.createElement(isClickable ? 'a' : 'div');
        iconElement.className = `bdo-icon bdo-icon-${size}`;
        
        // Add link properties if clickable
        if (isClickable) {
            iconElement.href = iconInfo.url;
            iconElement.target = '_blank';
            iconElement.rel = 'noopener noreferrer';
            iconElement.style.textDecoration = 'none';
        }
        
        // Size mapping
        const sizes = {
            xs: "16px", sm: "20px", md: "24px", 
            lg: "32px", xl: "40px", xxl: "48px", 
            xxxl: "64px", mega: "96px"
        };
        
        const iconSize = sizes[size] || "24px";
        
        // Base styling
        iconElement.style.cssText += `
            width: ${iconSize};
            height: ${iconSize};
            border-radius: var(--radius-sm, 4px);
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-tertiary, #2a2a2a);
            border: 1px solid var(--bg-quaternary, #333);
            position: relative;
            flex-shrink: 0;
            transition: all var(--transition-fast, 0.15s) ease;
        `;
        
        // Apply custom styling
        if (options.className) {
            iconElement.classList.add(...options.className.split(' '));
        }
        
        if (options.style) {
            Object.assign(iconElement.style, options.style);
        }
        
        // Add hover effects for clickable icons
        if (isClickable) {
            iconElement.style.cursor = 'pointer';
            
            iconElement.addEventListener('mouseenter', () => {
                iconElement.style.transform = 'scale(1.05)';
                iconElement.style.boxShadow = '0 4px 12px rgba(30, 144, 255, 0.3)';
                iconElement.style.borderColor = 'var(--accent-primary, #1e90ff)';
            });
            
            iconElement.addEventListener('mouseleave', () => {
                iconElement.style.transform = 'scale(1)';
                iconElement.style.boxShadow = 'none';
                iconElement.style.borderColor = 'var(--bg-quaternary, #333)';
            });
        }
        
        const filename = iconInfo ? iconInfo.filename : null;
        
        if (filename && !this.failedIcons.has(filename)) {
            try {
                await this.loadIcon(iconElement, filename, itemName, options, iconInfo);
            } catch (error) {
                this.createFallbackIcon(iconElement, itemName, options);
            }
        } else {
            this.createFallbackIcon(iconElement, itemName, options);
        }
        
        return iconElement;
    }
    
    /**
     * Load the actual icon image
     */
    async loadIcon(iconElement, filename, itemName, options = {}, iconInfo = null) {
        const iconPath = `./icons/${filename}`;
        
        // Check if we're already loading this icon
        if (this.loadingPromises.has(iconPath)) {
            await this.loadingPromises.get(iconPath);
        } else {
            // Create loading promise
            const loadingPromise = new Promise((resolve, reject) => {
                const img = new Image();
                
                img.onload = () => {
                    this.loadedIcons.set(iconPath, img);
                    resolve(img);
                };
                
                img.onerror = () => {
                    this.failedIcons.add(filename);
                    reject(new Error(`Failed to load ${iconPath}`));
                };
                
                img.src = iconPath;
            });
            
            this.loadingPromises.set(iconPath, loadingPromise);
            
            try {
                await loadingPromise;
            } catch (error) {
                this.loadingPromises.delete(iconPath);
                throw error;
            }
        }
        
        // Create image element
        const imgElement = document.createElement('img');
        imgElement.src = iconPath;
        imgElement.alt = itemName;
        imgElement.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        `;
        
        // Add hover effects for interactive icons
        if (options.interactive) {
            iconElement.style.cursor = 'pointer';
            iconElement.style.transition = 'all var(--transition-fast, 0.15s) ease';
            
            iconElement.addEventListener('mouseenter', () => {
                iconElement.style.transform = 'scale(1.05)';
                iconElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            });
            
            iconElement.addEventListener('mouseleave', () => {
                iconElement.style.transform = 'scale(1)';
                iconElement.style.boxShadow = 'none';
            });
        }
        
        // Add tooltip if specified
        if (options.tooltip !== false) {
            const hasUrl = iconInfo && iconInfo.url;
            iconElement.title = hasUrl ? `${itemName} (Click to view on BDO Codex)` : itemName;
        }
        
        // Quality indicator for rare items
        if (this.isRareItem(itemName)) {
            const qualityBorder = document.createElement('div');
            qualityBorder.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                border: 2px solid var(--accent-secondary, #ffd700);
                border-radius: inherit;
                pointer-events: none;
                box-shadow: 0 0 8px rgba(255, 215, 0, 0.3);
            `;
            iconElement.appendChild(qualityBorder);
        }
        
        iconElement.appendChild(imgElement);
        
        // Add loading animation completion
        iconElement.classList.add('icon-loaded');
    }
    
    /**
     * Create fallback icon when image loading fails
     */
    createFallbackIcon(iconElement, itemName, options = {}) {
        // Create text-based fallback
        const fallbackText = document.createElement('div');
        const initials = this.getItemInitials(itemName);
        
        fallbackText.textContent = initials;
        fallbackText.style.cssText = `
            font-weight: bold;
            font-size: ${this.getFallbackFontSize(iconElement.style.width)};
            color: var(--text-secondary, #aaa);
            text-align: center;
            line-height: 1;
            user-select: none;
        `;
        
        // Add gradient background for visual appeal
        iconElement.style.background = this.getItemGradient(itemName);
        
        iconElement.appendChild(fallbackText);
        iconElement.classList.add('icon-fallback');
        
        // Add tooltip
        if (options.tooltip !== false) {
            iconElement.title = `${itemName} (Icon not available)`;
        }
    }
    
    /**
     * Get initials for fallback display
     */
    getItemInitials(itemName) {
        // Remove common prefixes and get meaningful initials
        const cleanName = itemName
            .replace(/^\+\d+\s+/, '') // Remove +10 prefix
            .replace(/^(Epheria|Bartali|Carrack)\s+/, '') // Remove ship prefixes
            .replace(/\s+(Old|Upgraded|Enhanced|Supreme)\s+/g, ' ') // Remove quality words
            .trim();
        
        const words = cleanName.split(/\s+/);
        
        if (words.length === 1) {
            return words[0].substring(0, 2).toUpperCase();
        } else if (words.length === 2) {
            return (words[0][0] + words[1][0]).toUpperCase();
        } else {
            return (words[0][0] + words[words.length - 1][0]).toUpperCase();
        }
    }
    
    /**
     * Get appropriate font size for fallback text
     */
    getFallbackFontSize(width) {
        const size = parseInt(width) || 24;
        if (size <= 16) return '8px';
        if (size <= 24) return '10px';
        if (size <= 32) return '12px';
        if (size <= 48) return '14px';
        return '16px';
    }
    
    /**
     * Generate color gradient based on item type
     */
    getItemGradient(itemName) {
        const lowerName = itemName.toLowerCase();
        
        // Color schemes based on item type
        if (lowerName.includes('brilliant') || lowerName.includes('luminous') || lowerName.includes('pure')) {
            return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'; // Blue rare
        } else if (lowerName.includes('enhanced') || lowerName.includes('superior') || lowerName.includes('khan')) {
            return 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'; // Cyan-pink
        } else if (lowerName.includes('ship') || lowerName.includes('permit') || lowerName.includes('carrack')) {
            return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'; // Purple
        } else if (lowerName.includes('coin') || lowerName.includes('gold') || lowerName.includes('seal')) {
            return 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'; // Gold
        } else if (lowerName.includes('stone') || lowerName.includes('ingot') || lowerName.includes('ore')) {
            return 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)'; // Material blue
        } else if (lowerName.includes('sap') || lowerName.includes('bark') || lowerName.includes('plywood')) {
            return 'linear-gradient(135deg, #c3ec52 0%, #0ba360 100%)'; // Green nature
        } else {
            return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'; // Default purple
        }
    }
    
    /**
     * Check if an item is considered rare/special
     */
    isRareItem(itemName) {
        const rarityKeywords = ['brilliant', 'luminous', 'pure', 'khan', 'carrack', 'permit', 'enhanced'];
        const lowerName = itemName.toLowerCase();
        return rarityKeywords.some(keyword => lowerName.includes(keyword));
    }
    
    /**
     * Preload icons for better performance
     */
    async preloadIcons(itemNames) {
        const loadPromises = itemNames.map(async (itemName) => {
            const filename = this.getIconFilename(itemName);
            if (filename && !this.loadedIcons.has(`./icons/${filename}`) && !this.failedIcons.has(filename)) {
                try {
                    const img = new Image();
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = `./icons/${filename}`;
                    });
                    this.loadedIcons.set(`./icons/${filename}`, img);
                } catch (error) {
                    this.failedIcons.add(filename);
                }
            }
        });
        
        await Promise.allSettled(loadPromises);
    }
    
    /**
     * Create ship icon with special styling
     */
    async createShipIcon(shipName, size = "xxl") {
        const options = {
            interactive: true,
            className: 'ship-icon',
            style: {
                borderRadius: 'var(--radius-lg, 8px)',
                border: '2px solid var(--bg-quaternary, #333)',
                background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)'
            }
        };
        
        return await this.createIcon(shipName, size, options);
    }
    
    /**
     * Create material icon with acquisition method styling
     */
    async createMaterialIcon(materialName, size = "lg", acquisitionMethod = null) {
        const options = {
            interactive: false,
            className: 'material-icon',
            clickable: true // Make material icons clickable by default
        };
        
        // Add border color based on acquisition method
        if (acquisitionMethod) {
            const borderColors = {
                vendor: 'var(--warning, #ffa500)',
                recipe: 'var(--info, #33b5e5)',
                barter: 'var(--trade-tier-5, #c89632)',
                coins: '#ffd700'
            };
            
            if (borderColors[acquisitionMethod]) {
                options.style = {
                    borderColor: borderColors[acquisitionMethod],
                    borderWidth: '2px'
                };
            }
        }
        
        return await this.createIcon(materialName, size, options);
    }
    
    /**
     * Create a clickable icon specifically for modals and detail views
     */
    async createClickableIcon(itemName, size = "md", options = {}) {
        const clickableOptions = {
            ...options,
            clickable: true,
            interactive: true,
            className: `clickable-icon ${options.className || ''}`.trim()
        };
        
        return await this.createIcon(itemName, size, clickableOptions);
    }
    
    /**
     * Create an icon with a custom click handler (for non-BDO Codex links)
     */
    async createCustomClickIcon(itemName, size = "md", clickHandler, options = {}) {
        const icon = await this.createIcon(itemName, size, { 
            ...options, 
            clickable: false, // Disable automatic BDO Codex linking
            interactive: true 
        });
        
        icon.style.cursor = 'pointer';
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clickHandler(itemName, e);
        });
        
        return icon;
    }
    
    /**
     * Get item icon URL (legacy compatibility method)
     */
    async getItemIcon(itemName) {
        const iconElement = await this.createIcon(itemName, 'md');
        return iconElement.querySelector('img')?.src || 'icons/00000000_common.webp';
    }
    
    /**
     * Get ship icon URL (legacy compatibility method)
     */
    async getShipIcon(shipName) {
        const iconElement = await this.createShipIcon(shipName, 'md');
        return iconElement.querySelector('img')?.src || 'icons/ship_03.webp';
    }
}

// Create global icon loader instance
const iconLoader = new IconLoader();

// Export for module use
export { IconLoader, iconLoader };