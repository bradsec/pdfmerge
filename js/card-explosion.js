/**
 * @fileoverview Custom card explosion animation system
 * Creates particle explosion effect when cards are deleted
 * @author BRADSEC
 */

class CardExplosion {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.animationId = null;
    }

    /**
     * Creates particles from a DOM element and animates explosion
     * @param {HTMLElement} element - The element to explode
     * @param {Function} callback - Callback when animation completes
     */
    explodeElement(element, callback) {
        // Add pre-explosion animation
        element.classList.add('card-pre-explode');
        
        // Wait for pre-animation, then start explosion
        setTimeout(() => {
            // Get element position and size more accurately
            const rect = element.getBoundingClientRect();
            
            // Create canvas overlay
            this.createCanvas();
            
            // Capture element as image data using DOM-to-Canvas technique
            this.captureElementAsParticles(element, rect)
                .then(() => {
                    // Hide original element
                    element.style.visibility = 'hidden';
                    element.classList.add('card-exploding');
                    
                    // Start particle animation
                    this.animate(callback);
                })
                .catch(error => {
                    console.error('Error creating explosion:', error);
                    if (callback) callback();
                });
        }, 200); // Pre-animation duration
    }

    /**
     * Creates a canvas overlay for particle rendering
     */
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '9999';
        this.canvas.style.margin = '0';
        this.canvas.style.padding = '0';
        
        // Set canvas size to match viewport exactly
        this.canvas.width = window.innerWidth * window.devicePixelRatio;
        this.canvas.height = window.innerHeight * window.devicePixelRatio;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        document.body.appendChild(this.canvas);
    }

    /**
     * Captures element and creates particles using DOM-to-Canvas technique with performance budgeting
     */
    async captureElementAsParticles(element, rect) {
        // Performance budgeting: Adjust particle count based on viewport and device performance
        const performanceBudget = this.calculatePerformanceBudget(rect);
        
        const baseParticleSize = performanceBudget.particleSize;
        const density = performanceBudget.density;
        const maxParticles = performanceBudget.maxParticles;
        
        // Use the full card dimensions
        const rows = Math.floor(rect.height / baseParticleSize);
        const cols = Math.floor(rect.width / baseParticleSize);
        
        // Create color palette from element (cached for performance)
        const colors = this.extractColorsFromElement(element);
        
        this.particles = [];
        
        // Pre-calculate center point for explosion origin (card center)
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Batch particle creation for better performance
        const startTime = performance.now();
        let particleCount = 0;
        
        for (let row = 0; row < rows && particleCount < maxParticles; row++) {
            for (let col = 0; col < cols && particleCount < maxParticles; col++) {
                // Skip some particles based on density
                if (Math.random() > density) continue;
                
                // Calculate particle position to fill entire card
                const x = rect.left + (col * baseParticleSize) + (baseParticleSize / 2);
                const y = rect.top + (row * baseParticleSize) + (baseParticleSize / 2);
                
                // Calculate distance and angle from card center
                const dx = x - centerX;
                const dy = y - centerY;
                const angle = Math.atan2(dy, dx);
                
                // Vary particle size
                const size = 3 + Math.random() * 3;
                
                // Calculate explosion velocity - stronger for card-sized explosion
                const baseForce = 3 + Math.random() * 4;
                const velocityX = Math.cos(angle) * baseForce + (Math.random() - 0.5) * 2;
                const velocityY = Math.sin(angle) * baseForce + (Math.random() - 0.5) * 2;
                
                // Create particle with optimized properties
                const particle = {
                    x: x,
                    y: y,
                    startX: x,
                    startY: y,
                    size: size,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    velocityX: velocityX,
                    velocityY: velocityY,
                    life: 1.0,
                    decay: 0.018 + Math.random() * 0.015,
                    gravity: 0.12 + Math.random() * 0.08,
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.25,
                    bounceY: 0.15 + Math.random() * 0.15
                };
                
                this.particles.push(particle);
                particleCount++;
            }
        }
        
        const totalTime = performance.now() - startTime;
        console.debug(`Particle generation: ${particleCount} particles in ${totalTime.toFixed(2)}ms`);
    }
    
    /**
     * Calculates performance budget based on device capabilities and element size
     * @param {DOMRect} rect - The element's bounding rectangle
     * @returns {Object} Performance budget configuration
     */
    calculatePerformanceBudget(rect) {
        const area = rect.width * rect.height;
        const isLowPowerDevice = navigator.hardwareConcurrency <= 4;
        const isSmallViewport = window.innerWidth < 768;
        
        // Base configuration
        let config = {
            particleSize: 5,
            density: 0.6,
            maxParticles: 200
        };
        
        // Adjust for device performance
        if (isLowPowerDevice) {
            config.maxParticles = Math.min(100, config.maxParticles);
            config.density *= 0.7;
            config.particleSize = 6;
        }
        
        // Adjust for viewport size
        if (isSmallViewport) {
            config.maxParticles = Math.min(150, config.maxParticles);
            config.density *= 0.8;
        }
        
        // Adjust for element size
        if (area > 50000) { // Large elements
            config.maxParticles = Math.min(150, config.maxParticles);
            config.particleSize = 6;
        } else if (area < 10000) { // Small elements
            config.maxParticles = Math.max(50, Math.min(100, config.maxParticles));
            config.particleSize = 4;
        }
        
        return config;
    }

    /**
     * Extracts colors from an element for particle rendering
     */
    extractColorsFromElement(element) {
        const colors = [];
        const computedStyle = window.getComputedStyle(element);
        
        // Add background color
        if (computedStyle.backgroundColor && computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
            colors.push(computedStyle.backgroundColor);
        }
        
        // Add border color
        if (computedStyle.borderColor && computedStyle.borderColor !== 'rgba(0, 0, 0, 0)') {
            colors.push(computedStyle.borderColor);
        }
        
        // Add text color
        if (computedStyle.color) {
            colors.push(computedStyle.color);
        }
        
        // Look for child elements with different colors
        const childElements = element.querySelectorAll('*');
        childElements.forEach(child => {
            const childStyle = window.getComputedStyle(child);
            if (childStyle.backgroundColor && childStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                colors.push(childStyle.backgroundColor);
            }
        });
        
        // Default colors if none found
        if (colors.length === 0) {
            colors.push('#ffffff', '#f0f0f0', '#e0e0e0', '#d0d0d0');
        }
        
        return colors;
    }

    /**
     * Animates particles
     */
    animate(callback) {
        const animateFrame = () => {
            // Clear the entire canvas using viewport dimensions
            this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            
            let aliveParticles = 0;
            
            this.particles.forEach(particle => {
                if (particle.life <= 0) return;
                
                aliveParticles++;
                
                // Update particle physics
                particle.velocityY += particle.gravity;
                particle.x += particle.velocityX;
                particle.y += particle.velocityY;
                particle.life -= particle.decay;
                particle.rotation += particle.rotationSpeed;
                
                // Add some drag
                particle.velocityX *= 0.98;
                particle.velocityY *= 0.98;
                
                // Render particle
                this.ctx.save();
                this.ctx.translate(particle.x, particle.y);
                this.ctx.rotate(particle.rotation);
                
                this.ctx.globalAlpha = Math.max(0, particle.life);
                this.ctx.fillStyle = particle.color;
                
                // Draw particle as small rectangle with slight variation
                const halfSize = particle.size / 2;
                this.ctx.fillRect(-halfSize, -halfSize, particle.size, particle.size);
                
                // Add some glow effect for bigger particles
                if (particle.size > 3) {
                    this.ctx.globalAlpha = Math.max(0, particle.life * 0.3);
                    this.ctx.fillRect(-halfSize - 1, -halfSize - 1, particle.size + 2, particle.size + 2);
                }
                
                this.ctx.restore();
            });
            
            if (aliveParticles > 0) {
                this.animationId = requestAnimationFrame(animateFrame);
            } else {
                this.cleanup();
                if (callback) callback();
            }
        };
        
        animateFrame();
    }

    /**
     * Cleans up canvas and particles
     */
    cleanup() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
    }
}

// Export the class
export { CardExplosion };