/**
 * @fileoverview Theme management system with dark/light mode support
 * @author BRADSEC
 */

import { DOMCache } from './dom-cache.js';

// Theme constants
const THEMES = {
  LIGHT: 'light',
  DARK: 'dark'
};

const THEME_COLORS = {
  [THEMES.LIGHT]: '#ffffff',
  [THEMES.DARK]: '#1d1d1d'
};

/**
 * Theme Manager Class
 * Handles theme switching, persistence, and UI updates
 */
class ThemeManager {
  constructor() {
    this.currentTheme = this.getInitialTheme();
    this.init();
  }

  /**
   * Gets the initial theme from localStorage, cookies, or system preference
   * @returns {string} Theme name
   */
  getInitialTheme() {
    try {
      // Check localStorage first
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme && Object.values(THEMES).includes(savedTheme)) {
        return savedTheme;
      }

      // Check cookies
      const cookieTheme = this.getCookieTheme();
      if (cookieTheme && Object.values(THEMES).includes(cookieTheme)) {
        return cookieTheme;
      }

      // Check system preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return THEMES.DARK;
      }

      return THEMES.LIGHT;
    } catch (error) {
      console.warn('Error getting initial theme:', error);
      return THEMES.LIGHT;
    }
  }

  /**
   * Extracts theme from document cookies
   * @returns {string|null} Theme from cookie or null
   */
  getCookieTheme() {
    try {
      const cookie = document.cookie
        .split('; ')
        .find(row => row.startsWith('theme='));
      return cookie ? cookie.split('=')[1] : null;
    } catch (error) {
      console.warn('Error reading theme cookie:', error);
      return null;
    }
  }

  /**
   * Sets the theme and updates UI elements
   * @param {string} theme - Theme to set
   */
  setTheme(theme) {
    if (!Object.values(THEMES).includes(theme)) {
      console.warn('Invalid theme:', theme);
      return;
    }

    try {
      const body = document.body;
      const themeColorMeta = DOMCache.querySelector('meta[name="theme-color"]');
      const sunIcon = DOMCache.getElementById('sun-icon');
      const moonIcon = DOMCache.getElementById('moon-icon');

      // Update body attribute
      body.setAttribute('data-theme', theme);

      // Update meta theme color
      if (themeColorMeta) {
        themeColorMeta.content = THEME_COLORS[theme];
      }

      // Update icons
      if (theme === THEMES.DARK) {
        if (sunIcon) sunIcon.style.display = 'none';
        if (moonIcon) moonIcon.style.display = 'block';
      } else {
        if (sunIcon) sunIcon.style.display = 'block';
        if (moonIcon) moonIcon.style.display = 'none';
      }

      this.currentTheme = theme;
      this.saveTheme(theme);
    } catch (error) {
      console.error('Error setting theme:', error);
    }
  }

  /**
   * Saves theme to localStorage and cookies
   * @param {string} theme - Theme to save
   */
  saveTheme(theme) {
    try {
      localStorage.setItem('theme', theme);
      document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Strict`;
    } catch (error) {
      console.warn('Error saving theme:', error);
    }
  }

  /**
   * Toggles between light and dark themes
   */
  toggleTheme() {
    const newTheme = this.currentTheme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
    this.setTheme(newTheme);
  }

  /**
   * Initializes the theme system
   */
  init() {
    // Set initial theme immediately
    this.setTheme(this.currentTheme);

    // Setup theme switcher when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupThemeSwitcher());
    } else {
      this.setupThemeSwitcher();
    }
  }

  /**
   * Sets up the theme switcher button event listener
   */
  setupThemeSwitcher() {
    const themeSwitcher = DOMCache.getElementById('theme-switcher');
    if (themeSwitcher) {
      themeSwitcher.addEventListener('click', () => this.toggleTheme());
      
      // Add keyboard support
      themeSwitcher.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.toggleTheme();
        }
      });
    }
  }
}

// Initialize theme manager immediately
const themeManager = new ThemeManager();

// No exports needed - theme manager is self-contained