/**
 * Header Animations and Interactions
 * Enhances the BDO Ship Upgrade Tracker header with dynamic effects
 */

class HeaderAnimations {
    constructor() {
        this.init();
    }

    init() {
        this.setupHeaderInteractions();
        this.startShipAnimations();
        this.setupCompassAnimation();
        this.setupStatusIndicator();
        this.setupWaveAnimations();
    }

    setupHeaderInteractions() {
        const headerIcon = document.querySelector('.header-icon');
        const headerStatus = document.querySelector('.header-status');

        if (headerIcon) {
            headerIcon.addEventListener('click', () => {
                this.triggerCompassSpin();
            });
        }

        if (headerStatus) {
            headerStatus.addEventListener('click', () => {
                this.showNavigationStatus();
            });
        }
    }

    async startShipAnimations() {
        const shipsContainer = document.querySelector('.header-ships');
        if (!shipsContainer) return;

        // Get all ship silhouettes with data-ship attributes
        const shipSilhouettes = shipsContainer.querySelectorAll('.ship-silhouette[data-ship]');
        
        // Ship icon mappings based on the available icons
        const shipIcons = {
            'Epheria Sailboat': 'ship_03.webp',
            'Epheria Caravel': 'ship_12.webp', 
            'Carrack (Advance)': 'ship_14.webp',
            'Panokseon': 'ship_18.webp',
            'Epheria Frigate': 'ship_04.webp',
            'Carrack (Balance)': 'ship_15.webp',
            'Epheria Galleass': 'ship_13.webp',
            'Carrack (Volante)': 'ship_16.webp',
            'Bartali Sailboat': 'ship_05.webp',
            'Carrack (Valor)': 'ship_17.webp'
        };

        // Load ship icons for each silhouette
        shipSilhouettes.forEach((silhouette, index) => {
            const shipName = silhouette.getAttribute('data-ship');
            const iconFile = shipIcons[shipName];
            
            if (iconFile) {
                const img = document.createElement('img');
                img.src = `icons/${iconFile}`;
                img.alt = shipName;
                img.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    border-radius: 4px;
                `;
                
                // Handle loading errors gracefully
                img.onerror = () => {
                    silhouette.textContent = '🚢'; // Fallback to emoji
                };
                
                silhouette.appendChild(img);
            }
        });
    }

    setupCompassAnimation() {
        const headerIcon = document.querySelector('.header-icon');
        if (!headerIcon) return;

        // Add special hover effects for different times
        const currentHour = new Date().getHours();
        if (currentHour >= 19 || currentHour <= 6) {
            // Night mode - slower, more mystical
            headerIcon.style.animationDuration = '30s';
            headerIcon.style.filter = 'hue-rotate(30deg)';
        }
    }

    triggerCompassSpin() {
        const headerIcon = document.querySelector('.header-icon');
        if (!headerIcon) return;

        headerIcon.style.animation = 'none';
        setTimeout(() => {
            headerIcon.style.animation = 'compassSpin 2s linear';
            setTimeout(() => {
                headerIcon.style.animation = 'compassSpin 20s linear infinite';
            }, 2000);
        }, 10);

        // Trigger wave animation as well
        this.triggerWaveEffect();
    }

    setupStatusIndicator() {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.header-status span:last-child');
        
        if (!statusIndicator || !statusText) return;

        const statuses = [
            { text: 'Ready to Sail', color: 'var(--success)' },
            { text: 'Charting Course', color: 'var(--treasure)' },
            { text: 'Winds Favorable', color: 'var(--brand-secondary)' },
            { text: 'Maritime Ready', color: 'var(--success)' }
        ];

        let currentStatusIndex = 0;

        // Cycle through statuses every 10 seconds
        setInterval(() => {
            currentStatusIndex = (currentStatusIndex + 1) % statuses.length;
            const newStatus = statuses[currentStatusIndex];
            
            statusText.textContent = newStatus.text;
            statusIndicator.style.background = newStatus.color;
        }, 10000);
    }

    showNavigationStatus() {
        const statusElement = document.querySelector('.header-status');
        if (!statusElement) return;

        // Create a temporary tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'status-tooltip';
        tooltip.innerHTML = `
            <div class="tooltip-content">
                <strong>Navigation Status</strong>
                <div>Course: Chart Your Destiny</div>
                <div>Weather: Fair Winds</div>
                <div>Crew: Ready for Adventure</div>
            </div>
        `;
        
        tooltip.style.cssText = `
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-secondary);
            border: 2px solid var(--treasure);
            border-radius: var(--radius-md);
            padding: var(--space-md);
            z-index: 1000;
            box-shadow: var(--shadow-treasure);
            margin-top: var(--space-sm);
            min-width: 200px;
            animation: fadeIn 0.3s ease-out;
        `;

        statusElement.style.position = 'relative';
        statusElement.appendChild(tooltip);

        // Remove tooltip after 3 seconds
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.remove();
            }
        }, 3000);
    }

    setupWaveAnimations() {
        const headerWaves = document.querySelector('.header-waves');
        if (!headerWaves) return;

        // Add interactive wave effect on scroll
        let ticking = false;
        const updateWaves = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const scrollY = window.scrollY;
                    const waveIntensity = Math.min(scrollY / 100, 1);
                    headerWaves.style.opacity = 0.3 + (waveIntensity * 0.4);
                    headerWaves.style.transform = `scaleX(${1 + waveIntensity * 0.1})`;
                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener('scroll', updateWaves, { passive: true });
    }

    triggerWaveEffect() {
        const headerWaves = document.querySelector('.header-waves');
        if (!headerWaves) return;

        headerWaves.style.animation = 'none';
        setTimeout(() => {
            headerWaves.style.animation = 'waveFlow 2s ease-in-out';
            setTimeout(() => {
                headerWaves.style.animation = 'waveFlow 6s ease-in-out infinite';
            }, 2000);
        }, 10);
    }

    // Method to update header based on user progress
    updateProgressStatus(progressPercentage) {
        const statusText = document.querySelector('.header-status span:last-child');
        const statusIndicator = document.querySelector('.status-indicator');
        
        if (!statusText || !statusIndicator) return;

        let status, color;
        
        if (progressPercentage === 0) {
            status = 'Ready to Begin';
            color = 'var(--brand-secondary)';
        } else if (progressPercentage < 25) {
            status = 'Setting Sail';
            color = 'var(--treasure)';
        } else if (progressPercentage < 50) {
            status = 'Steady Progress';
            color = 'var(--info)';
        } else if (progressPercentage < 75) {
            status = 'Gaining Speed';
            color = 'var(--warning)';
        } else if (progressPercentage < 100) {
            status = 'Almost There';
            color = 'var(--success)';
        } else {
            status = 'Journey Complete';
            color = 'var(--treasure)';
        }

        statusText.textContent = status;
        statusIndicator.style.background = color;
    }

    // Method to add celebration effects
    triggerCelebration() {
        const header = document.querySelector('.app-header');
        if (!header) return;

        // Add temporary celebration class
        header.classList.add('celebration-mode');
        
        // Create particle effect
        this.createParticleEffect();
        
        // Remove celebration mode after animation
        setTimeout(() => {
            header.classList.remove('celebration-mode');
        }, 3000);
    }

    createParticleEffect() {
        const header = document.querySelector('.app-header');
        if (!header) return;

        const particles = ['⭐', '💰', '🎉', '⚓', '🏆'];
        
        for (let i = 0; i < 15; i++) {
            const particle = document.createElement('div');
            particle.textContent = particles[Math.floor(Math.random() * particles.length)];
            particle.style.cssText = `
                position: absolute;
                top: ${Math.random() * 100}%;
                left: ${Math.random() * 100}%;
                font-size: ${Math.random() * 20 + 15}px;
                z-index: 1000;
                pointer-events: none;
                animation: particleFloat 2s ease-out forwards;
            `;
            
            header.appendChild(particle);
            
            // Remove particle after animation
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.remove();
                }
            }, 2000);
        }
    }
}

// Add CSS for particle animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    
    @keyframes particleFloat {
        0% {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
        }
        100% {
            opacity: 0;
            transform: translateY(-50px) rotate(360deg);
        }
    }
    
    .app-header.celebration-mode {
        animation: celebrationPulse 0.5s ease-in-out 3;
    }
    
    @keyframes celebrationPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
    }
    
    .status-tooltip .tooltip-content {
        color: var(--text-primary);
        font-size: var(--font-size-sm);
        line-height: 1.4;
    }
    
    .status-tooltip .tooltip-content strong {
        color: var(--treasure);
        display: block;
        margin-bottom: var(--space-xs);
        border-bottom: 1px solid var(--bg-tertiary);
        padding-bottom: var(--space-xs);
    }
    
    .status-tooltip .tooltip-content div {
        margin: 2px 0;
        color: var(--text-secondary);
    }
`;
document.head.appendChild(style);

// Initialize header animations when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.headerAnimations = new HeaderAnimations();
    });
} else {
    window.headerAnimations = new HeaderAnimations();
}

// Export for use in other modules
export default HeaderAnimations;