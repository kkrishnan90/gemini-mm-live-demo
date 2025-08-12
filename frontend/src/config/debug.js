/**
 * Debug configuration for the frontend application
 */

// Check for debug flag in environment variables or localStorage
const isDebugEnabled = () => {
  // Check environment variable first
  if (process.env.REACT_APP_DEBUG === 'true') {
    return true;
  }
  
  // Check localStorage for runtime debug toggle
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('debug') === 'true';
  }
  
  return false;
};

export const DEBUG = isDebugEnabled();

// Debug logger functions
export const debugLog = (...args) => {
  if (DEBUG) {
    console.log('[DEBUG]', ...args);
  }
};

export const debugWarn = (...args) => {
  if (DEBUG) {
    console.warn('[DEBUG]', ...args);
  }
};

export const debugError = (...args) => {
  if (DEBUG) {
    console.error('[DEBUG]', ...args);
  }
};

// Helper to enable/disable debug at runtime
export const setDebug = (enabled) => {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('debug', enabled.toString());
    window.location.reload(); // Reload to apply changes
  }
};