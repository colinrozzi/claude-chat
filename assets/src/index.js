import { initWebSocket, setupElements, setupEventHandlers } from './chat.js';

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Claude Chat application');
    
    // Set up DOM element references
    setupElements();
    
    // Set up event handlers
    setupEventHandlers();
    
    // Initialize WebSocket connection
    initWebSocket();
});
