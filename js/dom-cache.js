/**
 * @fileoverview DOM Element Caching System
 * Provides efficient DOM element caching to avoid repeated getElementById/querySelector calls
 * @author BRADSEC
 */

/**
 * DOM element cache to avoid repeated queries
 */
const DOMCache = {
    cache: new Map(),
    
    /**
     * Gets an element by ID with caching
     * @param {string} id - The element ID
     * @returns {HTMLElement|null} The cached or freshly queried element
     */
    getElementById(id) {
        if (this.cache.has(id)) {
            const cached = this.cache.get(id);
            // Verify element is still in DOM
            if (cached && cached.isConnected) {
                return cached;
            }
            // Remove stale cache entry
            this.cache.delete(id);
        }
        
        const element = document.getElementById(id);
        if (element) {
            this.cache.set(id, element);
        }
        return element;
    },
    
    /**
     * Gets an element by selector with caching
     * @param {string} selector - The CSS selector
     * @returns {HTMLElement|null} The cached or freshly queried element
     */
    querySelector(selector) {
        if (this.cache.has(selector)) {
            const cached = this.cache.get(selector);
            // Verify element is still in DOM
            if (cached && cached.isConnected) {
                return cached;
            }
            // Remove stale cache entry
            this.cache.delete(selector);
        }
        
        const element = document.querySelector(selector);
        if (element) {
            this.cache.set(selector, element);
        }
        return element;
    },
    
    /**
     * Clears the entire cache
     */
    clear() {
        this.cache.clear();
    },
    
    /**
     * Removes a specific element from cache
     * @param {string} key - The element key (ID or selector)
     */
    remove(key) {
        this.cache.delete(key);
    },
    
    /**
     * Gets cache statistics
     * @returns {Object} Cache stats
     */
    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
};

export { DOMCache };