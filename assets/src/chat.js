import { 
    safeJsonParse, 
    formatTimestamp, 
    showToast, 
    truncateText, 
    copyToClipboard, 
    formatConversationId,
    getConversationCreationTime,
    md,
    toggleTheme,
    initTheme,
    toggleLeftSidebar,
    toggleRightSidebar
} from './utils.js';

// State management
export const state = {
    websocket: null,
    conversations: [],
    conversationNames: {}, // Store custom names for conversations
    activeConversationId: null,
    messages: {},
    connected: false
};

// DOM elements
export let elements = {};

// Layout state is declared globally in index.html

/**
 * Initialize DOM element references
 */
export function setupElements() {
    elements = {
        conversationList: document.getElementById('conversation-list'),
        chatMessages: document.getElementById('chat-messages'),
        messageInput: document.getElementById('message-input'),
        systemPromptInput: document.getElementById('system-prompt-input'),
        sendButton: document.getElementById('send-button'),
        newConversationButton: document.getElementById('new-conversation'),
        typingIndicator: document.getElementById('typing-indicator'),
        currentChatTitle: document.getElementById('current-chat-title'),
        themeToggle: document.getElementById('theme-toggle'),
        renameDialog: document.getElementById('rename-dialog'),
        renameInput: document.getElementById('rename-input'),
        renameCancel: document.getElementById('rename-cancel'),
        renameConfirm: document.getElementById('rename-confirm'),
        // New elements in right sidebar
        chatCreatedTime: document.getElementById('chat-created-time'),
        chatMessageCount: document.getElementById('chat-message-count'),
        renameChatBtn: document.getElementById('rename-chat-btn'),
        clearChatBtn: document.getElementById('clear-chat-btn'),
        // Sidebar elements
        appLayout: document.querySelector('.app-layout'),
        conversationsSidebar: document.getElementById('conversations-sidebar'),
        controlsSidebar: document.getElementById('controls-sidebar'),
        toggleLeftSidebar: document.getElementById('toggle-left-sidebar'),
        toggleRightSidebar: document.getElementById('toggle-right-sidebar')
    };
}

/**
 * Set up event handlers for the chat interface
 */
export function setupEventHandlers() {
    // Message sending
    elements.sendButton.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Conversation management
    elements.newConversationButton.addEventListener('click', createNewConversation);
    
    // Theme toggling
    elements.themeToggle.addEventListener('click', toggleTheme);
    
    // Rename dialog handlers
    elements.renameCancel.addEventListener('click', () => {
        elements.renameDialog.classList.remove('active');
    });
    
    elements.renameConfirm.addEventListener('click', confirmRename);
    
    // Close dialog when clicking outside
    elements.renameDialog.addEventListener('click', (e) => {
        if (e.target === elements.renameDialog) {
            elements.renameDialog.classList.remove('active');
        }
    });
    
    // Right sidebar controls
    elements.renameChatBtn.addEventListener('click', () => {
        if (state.activeConversationId) {
            openRenameDialog(state.activeConversationId);
        }
    });
    
    elements.clearChatBtn.addEventListener('click', () => {
        if (state.activeConversationId) {
            if (confirm('Are you sure you want to clear all messages in this chat?')) {
                clearCurrentChat();
            }
        }
    });
    
    // Initialize theme
    initTheme();
    
    // Initialize sidebar state
    const savedLeftCollapsed = localStorage.getItem('leftSidebarCollapsed') === 'true';
    const savedRightCollapsed = localStorage.getItem('rightSidebarCollapsed') === 'true';
    
    // Set initial state
    layoutState.leftSidebarCollapsed = savedLeftCollapsed;
    layoutState.rightSidebarCollapsed = savedRightCollapsed;
    
    // Apply initial classes
    if (savedLeftCollapsed) {
        elements.appLayout.classList.add('left-collapsed');
    }
    if (savedRightCollapsed) {
        elements.appLayout.classList.add('right-collapsed');
    }
    if (savedLeftCollapsed && savedRightCollapsed) {
        elements.appLayout.classList.add('both-collapsed');
    }
    
    // Sidebar toggles
    elements.toggleLeftSidebar.addEventListener('click', toggleLeftSidebar);
    elements.toggleRightSidebar.addEventListener('click', toggleRightSidebar);
    initTheme();
    
    // Load data from localStorage
    loadStateFromStorage();
}

/**
 * Load saved state from localStorage
 */
function loadStateFromStorage() {
    try {
        const savedState = localStorage.getItem('claudeChatState');
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            
            // Restore conversation names
            if (parsedState.conversationNames) {
                state.conversationNames = parsedState.conversationNames;
            }
        }
    } catch (error) {
        console.error('Error loading state from localStorage:', error);
    }
}

/**
 * Save state to localStorage
 */
function saveStateToStorage() {
    try {
        const stateToSave = {
            conversationNames: state.conversationNames
        };
        
        localStorage.setItem('claudeChatState', JSON.stringify(stateToSave));
    } catch (error) {
        console.error('Error saving state to localStorage:', error);
    }
}

/**
 * Initialize WebSocket connection
 */
export function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws`;
    
    state.websocket = new WebSocket(wsUrl);
    
    state.websocket.onopen = () => {
        console.log('WebSocket connection established');
        state.connected = true;
        elements.newConversationButton.disabled = false;
        showToast('Connected to server', 'success');
    };
    
    state.websocket.onmessage = (event) => {
        handleServerMessage(safeJsonParse(event.data, {}));
    };
    
    state.websocket.onclose = () => {
        console.log('WebSocket connection closed');
        state.connected = false;
        elements.messageInput.disabled = true;
        elements.systemPromptInput.disabled = true;
        elements.sendButton.disabled = true;
        elements.newConversationButton.disabled = true;
        
        showToast('Connection lost. Reconnecting...', 'error');
        
        // Try to reconnect after a delay
        setTimeout(initWebSocket, 3000);
    };
    
    state.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        showToast('Connection error', 'error');
    };
}

/**
 * Handle messages from the server
 * @param {Object} message - Message from the server
 */
export function handleServerMessage(message) {
    console.log('Received message:', message);
    
    switch (message.message_type) {
        case 'conversation_created':
            handleConversationCreated(message);
            break;
            
        case 'message':
            handleIncomingMessage(message);
            break;
            
        case 'error':
            handleError(message);
            break;
            
        default:
            console.warn('Unknown message type:', message.message_type);
    }
}

/**
 * Handle conversation created message
 * @param {Object} message - Conversation created message
 */
export function handleConversationCreated(message) {
    const conversationId = message.conversation_id;
    
    // Add to list of conversations
    if (!state.conversations.includes(conversationId)) {
        state.conversations.push(conversationId);
        state.messages[conversationId] = [];
    }
    
    // Set as active conversation
    setActiveConversation(conversationId);
    
    // Update UI
    updateConversationList();
    
    // Enable chat inputs
    elements.messageInput.disabled = false;
    elements.systemPromptInput.disabled = false;
    elements.sendButton.disabled = false;
    elements.messageInput.focus();
    
    showToast('New conversation created', 'success');
}

/**
 * Handle incoming message
 * @param {Object} message - Incoming message
 */
export function handleIncomingMessage(message) {
    const { conversation_id, content } = message;
    
    // Hide typing indicator
    elements.typingIndicator.classList.remove('active');
    
    // Add message to state
    if (!state.messages[conversation_id]) {
        state.messages[conversation_id] = [];
    }
    
    state.messages[conversation_id].push({
        role: 'assistant',
        content: content,
        timestamp: Date.now()
    });
    
    // Update UI if this is the active conversation
    if (conversation_id === state.activeConversationId) {
        appendMessage('assistant', content);
        // Update chat info to show new message count
        updateChatInfo();
    }
    
    // Enable inputs
    elements.messageInput.disabled = false;
    elements.sendButton.disabled = false;
}

/**
 * Handle error message
 * @param {Object} message - Error message
 */
export function handleError(message) {
    console.error('Error:', message);
    
    // Hide typing indicator
    elements.typingIndicator.classList.remove('active');
    
    // Show error in chat if associated with a conversation
    if (message.conversation_id && message.conversation_id === state.activeConversationId) {
        appendSystemMessage(`Error: ${message.content}`);
    } else {
        appendSystemMessage(`Error: ${message.content}`);
    }
    
    // Enable inputs
    elements.messageInput.disabled = false;
    elements.sendButton.disabled = false;
    
    showToast(`Error: ${message.content}`, 'error');
}

/**
 * Send message to server
 */
export function sendMessage() {
    if (!state.connected || !state.activeConversationId) return;
    
    const content = elements.messageInput.value.trim();
    const systemPrompt = elements.systemPromptInput.value.trim();
    
    if (!content) return;
    
    // Disable inputs while waiting for response
    elements.messageInput.disabled = true;
    elements.sendButton.disabled = true;
    
    // Add message to UI
    appendMessage('user', content);
    
    // Add to state
    state.messages[state.activeConversationId].push({
        role: 'user',
        content: content,
        timestamp: Date.now()
    });
    
    // Update chat info to show new message count
    updateChatInfo();
    
    // Clear input
    elements.messageInput.value = '';
    
    // Show typing indicator
    elements.typingIndicator.classList.add('active');
    
    // Send to server
    const message = {
        action: 'send_message',
        conversation_id: state.activeConversationId,
        message: content,
        system: systemPrompt || undefined
    };
    
    state.websocket.send(JSON.stringify(message));
}

/**
 * Create a new conversation
 */
export function createNewConversation() {
    if (!state.connected) return;
    
    const message = {
        action: 'new_conversation'
    };
    
    state.websocket.send(JSON.stringify(message));
}

/**
 * Set active conversation
 * @param {string} conversationId - ID of the conversation to activate
 */
export function setActiveConversation(conversationId) {
    state.activeConversationId = conversationId;
    
    // Update UI
    updateConversationList();
    updateChatMessages();
    updateChatTitle();
    updateChatInfo();
    
    // Enable inputs
    elements.messageInput.disabled = false;
    elements.systemPromptInput.disabled = false;
    elements.sendButton.disabled = false;
}

/**
 * Update the conversation list UI
 */
export function updateConversationList() {
    elements.conversationList.innerHTML = '';
    
    state.conversations.forEach(id => {
        const button = document.createElement('button');
        button.classList.add('conversation-btn');
        if (id === state.activeConversationId) {
            button.classList.add('active');
        }
        
        // Get display name (custom or default)
        const displayName = state.conversationNames[id] || formatConversationId(id);
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = displayName;
        button.appendChild(nameSpan);
        
        // Add action buttons
        const actionsDiv = document.createElement('div');
        
        // Edit button
        const editBtn = document.createElement('button');
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.classList.add('edit-icon');
        editBtn.title = 'Rename conversation';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openRenameDialog(id);
        });
        actionsDiv.appendChild(editBtn);
        
        button.appendChild(actionsDiv);
        
        // Set click handler for conversation selection
        button.addEventListener('click', () => setActiveConversation(id));
        elements.conversationList.appendChild(button);
    });
}

/**
 * Update the chat title
 */
export function updateChatTitle() {
    if (!state.activeConversationId) {
        elements.currentChatTitle.textContent = 'New Conversation';
        return;
    }
    
    const displayName = state.conversationNames[state.activeConversationId] || 
                        formatConversationId(state.activeConversationId);
    elements.currentChatTitle.textContent = displayName;
}

/**
 * Update chat information in the sidebar
 */
export function updateChatInfo() {
    // Update creation time
    if (state.activeConversationId) {
        const creationTime = getConversationCreationTime(state.activeConversationId);
        elements.chatCreatedTime.textContent = creationTime || 'Unknown';
        
        // Update message count
        const messageCount = state.messages[state.activeConversationId]?.length || 0;
        elements.chatMessageCount.textContent = messageCount.toString();
        
        // Enable controls
        elements.renameChatBtn.disabled = false;
        elements.clearChatBtn.disabled = false;
    } else {
        // Reset values when no active conversation
        elements.chatCreatedTime.textContent = '-';
        elements.chatMessageCount.textContent = '0';
        elements.renameChatBtn.disabled = true;
        elements.clearChatBtn.disabled = true;
    }
}

/**
 * Update the chat messages UI
 */
export function updateChatMessages() {
    elements.chatMessages.innerHTML = '';
    
    if (!state.activeConversationId || !state.messages[state.activeConversationId]) return;
    
    state.messages[state.activeConversationId].forEach(msg => {
        appendMessage(msg.role, msg.content, msg.timestamp);
    });
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

/**
 * Append a message to the chat UI
 * @param {string} role - Role of the message sender (user or assistant)
 * @param {string} content - Content of the message
 * @param {number} timestamp - When the message was sent
 */
export function appendMessage(role, content, timestamp = Date.now()) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', role);
    
    // Create message header with role and timestamp
    const header = document.createElement('div');
    header.classList.add('message-header');
    
    const roleText = document.createElement('span');
    roleText.textContent = role === 'user' ? 'You' : 'Claude';
    header.appendChild(roleText);
    
    const timeText = document.createElement('span');
    timeText.classList.add('message-timestamp');
    timeText.textContent = formatTimestamp(timestamp);
    header.appendChild(timeText);
    
    messageElement.appendChild(header);
    
    // Parse content as markdown for assistant messages
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    
    if (role === 'assistant') {
        messageContent.innerHTML = md.render(content);
    } else {
        messageContent.textContent = content;
    }
    
    messageElement.appendChild(messageContent);
    
    // Add message action buttons for copying
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('message-actions');
    
    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    copyBtn.classList.add('message-action-btn');
    copyBtn.title = 'Copy message';
    copyBtn.addEventListener('click', () => copyToClipboard(content));
    actionsDiv.appendChild(copyBtn);
    
    messageElement.appendChild(actionsDiv);
    
    elements.chatMessages.appendChild(messageElement);
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    
    // Initialize syntax highlighting
    if (role === 'assistant') {
        document.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
}

/**
 * Append a system message to the chat UI
 * @param {string} content - Content of the system message
 */
export function appendSystemMessage(content) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'system');
    messageElement.style.background = '#ffe0e0';
    messageElement.style.color = '#d32f2f';
    messageElement.style.padding = '0.5rem 1rem';
    messageElement.style.borderRadius = '8px';
    messageElement.style.marginBottom = '1rem';
    messageElement.style.fontStyle = 'italic';
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    messageContent.textContent = content;
    
    messageElement.appendChild(messageContent);
    
    elements.chatMessages.appendChild(messageElement);
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

/**
 * Open the rename dialog for a conversation
 * @param {string} conversationId - ID of the conversation to rename
 */
export function openRenameDialog(conversationId) {
    // Set current name in input
    const currentName = state.conversationNames[conversationId] || '';
    elements.renameInput.value = currentName;
    
    // Store the conversation ID being renamed
    elements.renameDialog.dataset.conversationId = conversationId;
    
    // Show dialog
    elements.renameDialog.classList.add('active');
    elements.renameInput.focus();
}

/**
 * Confirm and process the conversation rename
 */
export function confirmRename() {
    const conversationId = elements.renameDialog.dataset.conversationId;
    const newName = elements.renameInput.value.trim();
    
    if (conversationId) {
        if (newName) {
            // Store new name
            state.conversationNames[conversationId] = newName;
        } else {
            // If empty, remove custom name
            delete state.conversationNames[conversationId];
        }
        
        // Save to localStorage
        saveStateToStorage();
        
        // Update UI
        updateConversationList();
        if (conversationId === state.activeConversationId) {
            updateChatTitle();
        }
        
        showToast('Conversation renamed', 'success');
    }
    
    // Close dialog
    elements.renameDialog.classList.remove('active');
}

/**
 * Clear all messages in the current chat
 */
export function clearCurrentChat() {
    if (!state.activeConversationId) return;
    
    // Clear messages for this conversation
    state.messages[state.activeConversationId] = [];
    
    // Update UI
    updateChatMessages();
    updateChatInfo();
    
    showToast('Chat cleared', 'success');
}
