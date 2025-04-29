import { safeJsonParse } from './utils.js';

// State management
export const state = {
    websocket: null,
    conversations: [],
    activeConversationId: null,
    messages: {},
    connected: false
};

// DOM elements
export let elements = {};

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
        typingIndicator: document.getElementById('typing-indicator')
    };
}

/**
 * Set up event handlers for the chat interface
 */
export function setupEventHandlers() {
    elements.sendButton.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    elements.newConversationButton.addEventListener('click', createNewConversation);
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
        
        // Try to reconnect after a delay
        setTimeout(initWebSocket, 3000);
    };
    
    state.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
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
        
        // Format ID for display (remove the "conv-" prefix and timestamp)
        const displayId = id.split('-').pop();
        button.textContent = `Conversation ${displayId}`;
        
        button.addEventListener('click', () => setActiveConversation(id));
        elements.conversationList.appendChild(button);
    });
}

/**
 * Update the chat messages UI
 */
export function updateChatMessages() {
    elements.chatMessages.innerHTML = '';
    
    if (!state.activeConversationId || !state.messages[state.activeConversationId]) return;
    
    state.messages[state.activeConversationId].forEach(msg => {
        appendMessage(msg.role, msg.content);
    });
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

/**
 * Append a message to the chat UI
 * @param {string} role - Role of the message sender (user or assistant)
 * @param {string} content - Content of the message
 */
export function appendMessage(role, content) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', role);
    
    const header = document.createElement('div');
    header.classList.add('message-header');
    header.textContent = role === 'user' ? 'You' : 'Claude';
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    messageContent.textContent = content;
    
    messageElement.appendChild(header);
    messageElement.appendChild(messageContent);
    
    elements.chatMessages.appendChild(messageElement);
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
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
