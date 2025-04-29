import { initWebSocket, setupElements, setupEventHandlers } from './chat.js';

/**
 * Main entry point for the application
 */
function initApp() {
    console.log('Initializing Claude Chat application');
    
    // Set up DOM element references
    setupElements();
    
    // Set up event handlers
    setupEventHandlers();
    
    // Initialize WebSocket connection
    initWebSocket();
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);
