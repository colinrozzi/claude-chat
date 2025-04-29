/**
 * Format a timestamp into a human-readable date string
 * @param {number} timestamp - The timestamp to format
 * @returns {string} Formatted date string
 */
export function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    
    // Within the last minute
    if (diffSecs < 60) {
        return 'Just now';
    }
    
    // Within the last hour
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) {
        return `${diffMins}m ago`;
    }
    
    // Within the last day
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }
    
    // Within the last week
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
        return `${diffDays}d ago`;
    }
    
    // Default to formatted date
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

/**
 * Generates a unique ID for new conversations
 * @returns {string} A unique ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Safely parse JSON with error handling
 * @param {string} jsonString - The JSON string to parse
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed object or fallback value
 */
export function safeJsonParse(jsonString, fallback = null) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error('JSON parsing error:', e);
        return fallback;
    }
}

/**
 * Create and show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of toast (error, success, info)
 * @param {number} duration - How long to show the toast in ms
 */
export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    
    // Create toast element
    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    
    // Add icon based on type
    let icon;
    switch (type) {
        case 'error':
            icon = 'fa-circle-exclamation';
            break;
        case 'success':
            icon = 'fa-circle-check';
            break;
        default:
            icon = 'fa-circle-info';
    }
    
    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    container.appendChild(toast);
    
    // Remove toast after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, duration);
}

/**
 * Truncate text to specified length and add ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 30) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export function copyToClipboard(text) {
    return navigator.clipboard.writeText(text)
        .then(() => {
            showToast('Copied to clipboard', 'success');
            return true;
        })
        .catch(err => {
            console.error('Failed to copy text: ', err);
            showToast('Failed to copy text', 'error');
            return false;
        });
}

/**
 * Format a conversation ID for display
 * @param {string} id - Conversation ID
 * @returns {string} Formatted ID for display
 */
export function formatConversationId(id) {
    if (!id) return 'New Chat';
    
    // Check if we have a timestamp in the ID (conv-timestamp-hash format)
    const parts = id.split('-');
    if (parts.length >= 3) {
        // Try to extract timestamp
        const timestamp = parseInt(parts[1]);
        if (!isNaN(timestamp)) {
            const date = new Date(timestamp);
            // Format a readable name with date
            return `Chat ${date.toLocaleDateString()}`;
        }
    }
    
    // Fallback to original format
    const lastPart = id.split('-').pop();
    return lastPart ? `Chat ${lastPart.substring(0, 6)}` : 'Chat';
}

/**
 * Extract and format the creation time from a conversation ID
 * @param {string} id - Conversation ID
 * @returns {string} Formatted creation time or empty string
 */
export function getConversationCreationTime(id) {
    if (!id) return '';
    
    // Check if we have a timestamp in the ID (conv-timestamp-hash format)
    const parts = id.split('-');
    if (parts.length >= 3) {
        // Try to extract timestamp
        const timestamp = parseInt(parts[1]);
        if (!isNaN(timestamp)) {
            const date = new Date(timestamp);
            // Format a readable datetime
            return date.toLocaleString();
        }
    }
    
    return '';
}

/**
 * Parse markdown content to HTML
 * @param {string} text - Markdown text
 * @returns {string} HTML string
 */
export const md = window.markdownit({
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, { language: lang }).value;
            } catch (__) {}
        }
        return ''; // use external default escaping
    },
    breaks: true,
    linkify: true
});

/**
 * Toggle between light and dark mode
 */
export function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update theme toggle icon
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.innerHTML = newTheme === 'light' 
            ? '<i class="fas fa-moon"></i>' 
            : '<i class="fas fa-sun"></i>';
    }
}

/**
 * Initialize theme from stored preference
 */
export function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Update theme toggle icon
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.innerHTML = savedTheme === 'light' 
                ? '<i class="fas fa-moon"></i>' 
                : '<i class="fas fa-sun"></i>';
        }
    }
}