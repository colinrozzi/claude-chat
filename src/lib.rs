mod bindings;
mod resources;

use crate::bindings::exports::ntwk::theater::actor::Guest;
use crate::bindings::exports::ntwk::theater::http_handlers::Guest as HttpHandlersGuest;
use crate::bindings::exports::ntwk::theater::message_server_client::Guest as MessageServerClient;
use crate::bindings::ntwk::theater::http_framework::{
    add_route, create_server, enable_websocket, register_handler, start_server, ServerConfig,
};
use crate::bindings::ntwk::theater::http_types::{HttpRequest, HttpResponse, MiddlewareResult};
use crate::bindings::ntwk::theater::message_server_host::request;
use crate::bindings::ntwk::theater::runtime::log;
use crate::bindings::ntwk::theater::types::State;
use crate::bindings::ntwk::theater::websocket_types::{MessageType, WebsocketMessage};

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;

// State for our chat actor
#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatState {
    // Actor ID for the anthropic-proxy
    anthropic_proxy_id: String,
    // Map of connection IDs to conversation IDs
    connections: HashMap<u64, String>,
    // Map of conversation IDs to message histories
    conversations: HashMap<String, Vec<ChatMessage>>,
}

// Message format for chat
#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatMessage {
    role: String,
    content: String,
    timestamp: u64,
}

// Request format for the Anthropic API
#[derive(Serialize, Deserialize, Debug, Clone)]
struct AnthropicRequest {
    version: String,
    operation_type: String,
    request_id: String,
    completion_request: Option<CompletionRequest>,
    params: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct CompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    system: Option<String>,
    top_p: Option<f32>,
    anthropic_version: Option<String>,
    additional_params: Option<HashMap<String, serde_json::Value>>,
}

// Response format from the Anthropic API
#[derive(Serialize, Deserialize, Debug, Clone)]
struct AnthropicResponse {
    version: String,
    request_id: String,
    status: String,
    error: Option<String>,
    completion: Option<CompletionResult>,
    models: Option<Vec<ModelInfo>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct CompletionResult {
    content: String,
    id: String,
    model: String,
    stop_reason: String,
    stop_sequence: Option<String>,
    message_type: String,
    usage: Usage,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Usage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ModelInfo {
    id: String,
    display_name: String,
    max_tokens: u32,
    provider: String,
    pricing: Option<ModelPricing>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ModelPricing {
    input_cost_per_million_tokens: f64,
    output_cost_per_million_tokens: f64,
}

// Messages from the frontend
#[derive(Serialize, Deserialize, Debug, Clone)]
struct ClientMessage {
    action: String,
    conversation_id: Option<String>,
    message: Option<String>,
    system: Option<String>,
}

// Messages to the frontend
#[derive(Serialize, Deserialize, Debug, Clone)]
struct ServerMessage {
    message_type: String,
    conversation_id: String,
    content: String,
    error: Option<String>,
    meta: Option<HashMap<String, String>>,
}

struct Component;

impl Guest for Component {
    fn init(_state: State, params: (String,)) -> Result<(State,), String> {
        log("Initializing claude-chat HTTP actor");
        let (param,) = params;
        log(&format!("Init parameter: {}", param));

        // Initialize state (anthropic-proxy not yet connected)
        let chat_state = ChatState {
            anthropic_proxy_id: "placeholder-proxy-id".to_string(), // Will be updated when proxy is ready
            connections: HashMap::new(),
            conversations: HashMap::new(),
        };
        
        log("Note: Using placeholder responses until anthropic-proxy is set up");

        // Serialize state
        let state_bytes = match serde_json::to_vec(&chat_state) {
            Ok(bytes) => bytes,
            Err(e) => return Err(format!("Failed to serialize state: {}", e)),
        };

        // Set up HTTP server
        let config = ServerConfig {
            port: Some(8080),
            host: Some("0.0.0.0".to_string()),
            tls_config: None,
        };

        // Create a new HTTP server
        let server_id = create_server(&config)?;
        log(&format!("Created server with ID: {}", server_id));

        // Register handlers
        let api_handler_id = register_handler("handle_request")?;
        let ws_handler_id = register_handler("handle_websocket")?;

        log(&format!(
            "Registered handlers - API: {}, WebSocket: {}",
            api_handler_id, ws_handler_id
        ));

        // Add routes
        add_route(server_id, "/", "GET", api_handler_id)?;
        add_route(server_id, "/index.html", "GET", api_handler_id)?;
        add_route(server_id, "/styles.css", "GET", api_handler_id)?;
        add_route(server_id, "/bundle.js", "GET", api_handler_id)?;
        add_route(server_id, "/api/conversations", "GET", api_handler_id)?;

        // Enable WebSocket support
        enable_websocket(
            server_id,
            "/ws",
            Some(ws_handler_id), // Connect handler
            ws_handler_id,       // Message handler
            Some(ws_handler_id), // Disconnect handler
        )?;

        // Start the server
        let port = start_server(server_id)?;
        log(&format!("Server started on port {}", port));

        Ok((Some(state_bytes),))
    }
}

impl HttpHandlersGuest for Component {
    fn handle_request(
        state: Option<Vec<u8>>,
        params: (u64, HttpRequest),
    ) -> Result<(Option<Vec<u8>>, (HttpResponse,)), String> {
        let (handler_id, request) = params;
        log(&format!(
            "Handling HTTP request with handler ID: {}",
            handler_id
        ));
        log(&format!("Request URI: {}", request.uri));

        // Parse the URI to get the path and query
        let mut path_parts = request.uri.splitn(2, '?');
        let path = path_parts.next().unwrap_or("/");

        // Parse state
        let chat_state: ChatState = match state.clone() {
            Some(bytes) => match serde_json::from_slice(&bytes) {
                Ok(s) => s,
                Err(e) => return Err(format!("Failed to parse state: {}", e)),
            },
            None => return Err("Missing state".to_string()),
        };

        // Route handling
        let response = match path {
            "/" | "/index.html" => {
                // Serve HTML chat interface using resources module
                let html = resources::INDEX_HTML;
                HttpResponse {
                    status: 200,
                    headers: vec![("Content-Type".to_string(), "text/html".to_string())],
                    body: Some(html.as_bytes().to_vec()),
                }
            }
            "/styles.css" => {
                // Serve CSS file
                let css = resources::STYLES_CSS;
                HttpResponse {
                    status: 200,
                    headers: vec![("Content-Type".to_string(), "text/css".to_string())],
                    body: Some(css.as_bytes().to_vec()),
                }
            }
            "/bundle.js" => {
                // Serve bundled JavaScript
                let js = resources::BUNDLE_JS;
                HttpResponse {
                    status: 200,
                    headers: vec![("Content-Type".to_string(), "application/javascript".to_string())],
                    body: Some(js.as_bytes().to_vec()),
                }
            }
            "/api/conversations" => {
                // Return list of conversations
                let conversations: Vec<String> = chat_state.conversations.keys().cloned().collect();
                let json =
                    serde_json::to_string(&conversations).unwrap_or_else(|_| "[]".to_string());

                HttpResponse {
                    status: 200,
                    headers: vec![("Content-Type".to_string(), "application/json".to_string())],
                    body: Some(json.as_bytes().to_vec()),
                }
            }
            _ => {
                // Not found
                HttpResponse {
                    status: 404,
                    headers: vec![("Content-Type".to_string(), "text/plain".to_string())],
                    body: Some("Not Found".as_bytes().to_vec()),
                }
            }
        };

        Ok((state, (response,)))
    }

    fn handle_middleware(
        state: Option<Vec<u8>>,
        params: (u64, HttpRequest),
    ) -> Result<(Option<Vec<u8>>, (MiddlewareResult,)), String> {
        let (handler_id, request) = params;
        log(&format!(
            "Handling middleware with handler ID: {}",
            handler_id
        ));

        // For now, just pass all requests through
        Ok((
            state,
            (MiddlewareResult {
                proceed: true,
                request,
            },),
        ))
    }

    fn handle_websocket_connect(
        state: Option<Vec<u8>>,
        params: (u64, u64, String, Option<String>),
    ) -> Result<(Option<Vec<u8>>,), String> {
        let (handler_id, connection_id, path, _query) = params;
        log(&format!(
            "WebSocket connected - Handler: {}, Connection: {}, Path: {}",
            handler_id, connection_id, path
        ));

        // Parse state
        let mut chat_state: ChatState = match state {
            Some(bytes) => match serde_json::from_slice(&bytes) {
                Ok(s) => s,
                Err(e) => return Err(format!("Failed to parse state: {}", e)),
            },
            None => return Err("Missing state".to_string()),
        };

        // Save connection in state
        // We'll assign a conversation ID when the client requests one
        chat_state.connections.insert(connection_id, String::new());

        // Serialize updated state
        let updated_state = match serde_json::to_vec(&chat_state) {
            Ok(bytes) => bytes,
            Err(e) => return Err(format!("Failed to serialize state: {}", e)),
        };

        Ok((Some(updated_state),))
    }

    fn handle_websocket_message(
        state: Option<Vec<u8>>,
        params: (u64, u64, WebsocketMessage),
    ) -> Result<(Option<Vec<u8>>, (Vec<WebsocketMessage>,)), String> {
        let (handler_id, connection_id, message) = params;
        log(&format!(
            "WebSocket message received - Handler: {}, Connection: {}",
            handler_id, connection_id
        ));

        // Parse state
        let mut chat_state: ChatState = match state {
            Some(bytes) => match serde_json::from_slice(&bytes) {
                Ok(s) => s,
                Err(e) => return Err(format!("Failed to parse state: {}", e)),
            },
            None => return Err("Missing state".to_string()),
        };

        let content = match message.ty {
            MessageType::Text => {
                String::from_utf8(message.text.expect("Text data is missing").into())
                    .unwrap_or_default()
            }
            MessageType::Binary => {
                String::from_utf8(message.data.expect("Binary data is missing"))
                    .unwrap_or_default()
            }
            _ => String::new(),
        };

        // Handle message
        let response_messages = handle_client_message(&mut chat_state, connection_id, &content)?;

        // Serialize updated state
        let updated_state = match serde_json::to_vec(&chat_state) {
            Ok(bytes) => bytes,
            Err(e) => return Err(format!("Failed to serialize state: {}", e)),
        };

        Ok((Some(updated_state), (response_messages,)))
    }

    fn handle_websocket_disconnect(
        state: Option<Vec<u8>>,
        params: (u64, u64),
    ) -> Result<(Option<Vec<u8>>,), String> {
        let (handler_id, connection_id) = params;
        log(&format!(
            "WebSocket disconnected - Handler: {}, Connection: {}",
            handler_id, connection_id
        ));

        // Parse state
        let mut chat_state: ChatState = match state {
            Some(bytes) => match serde_json::from_slice(&bytes) {
                Ok(s) => s,
                Err(e) => return Err(format!("Failed to parse state: {}", e)),
            },
            None => return Err("Missing state".to_string()),
        };

        // Remove connection from state
        chat_state.connections.remove(&connection_id);

        // Serialize updated state
        let updated_state = match serde_json::to_vec(&chat_state) {
            Ok(bytes) => bytes,
            Err(e) => return Err(format!("Failed to serialize state: {}", e)),
        };

        Ok((Some(updated_state),))
    }
}

impl MessageServerClient for Component {
    fn handle_send(
        state: Option<Vec<u8>>,
        params: (Vec<u8>,),
    ) -> Result<(Option<Vec<u8>>,), String> {
        log("Handling send message");
        let (data,) = params;
        log(&format!("Received data: {:?}", data));
        Ok((state,))
    }

    fn handle_request(
        state: Option<Vec<u8>>,
        params: (String, Vec<u8>),
    ) -> Result<(Option<Vec<u8>>, (Option<Vec<u8>>,)), String> {
        log("Handling request message");
        let (request_id, data) = params;
        log(&format!(
            "[req id] {} [data] {}",
            request_id,
            String::from_utf8(data.clone()).unwrap_or_else(|_| "Invalid UTF-8".to_string())
        ));

        Ok((state, (Some(data),)))
    }

    fn handle_channel_open(
        state: Option<bindings::exports::ntwk::theater::message_server_client::Json>,
        params: (bindings::exports::ntwk::theater::message_server_client::Json,),
    ) -> Result<
        (
            Option<bindings::exports::ntwk::theater::message_server_client::Json>,
            (bindings::exports::ntwk::theater::message_server_client::ChannelAccept,),
        ),
        String,
    > {
        log("Handling channel open message");
        log(&format!("Channel open message: {:?}", params));
        Ok((
            state,
            (
                bindings::exports::ntwk::theater::message_server_client::ChannelAccept {
                    accepted: true,
                    message: None,
                },
            ),
        ))
    }

    fn handle_channel_close(
        state: Option<bindings::exports::ntwk::theater::message_server_client::Json>,
        params: (String,),
    ) -> Result<(Option<bindings::exports::ntwk::theater::message_server_client::Json>,), String>
    {
        log("Handling channel close message");
        log(&format!("Channel close message: {:?}", params));
        Ok((state,))
    }

    fn handle_channel_message(
        state: Option<bindings::exports::ntwk::theater::message_server_client::Json>,
        params: (
            String,
            bindings::exports::ntwk::theater::message_server_client::Json,
        ),
    ) -> Result<(Option<bindings::exports::ntwk::theater::message_server_client::Json>,), String>
    {
        log("Received channel message");
        log(&format!("Channel message: {:?}", params));
        Ok((state,))
    }
}

// Helper function to handle client messages
fn handle_client_message(
    chat_state: &mut ChatState,
    connection_id: u64,
    content: &str,
) -> Result<Vec<WebsocketMessage>, String> {
    // Parse client message
    let client_message: ClientMessage = match serde_json::from_str(content) {
        Ok(msg) => msg,
        Err(e) => {
            log(&format!("Failed to parse client message: {}", e));
            return Ok(vec![WebsocketMessage {
                ty: MessageType::Text,
                text: Some(
                    serde_json::to_string(&ServerMessage {
                        message_type: "error".to_string(),
                        conversation_id: "".to_string(),
                        content: format!("Invalid message format: {}", e),
                        error: Some("PARSE_ERROR".to_string()),
                        meta: None,
                    })
                    .unwrap_or_default()
                    .into(),
                ),
                data: None,
            }]);
        }
    };

    // Handle different actions
    match client_message.action.as_str() {
        "new_conversation" => {
            // Generate a new conversation ID
            let conversation_id = generate_conversation_id(content.to_string());

            // Associate connection with conversation
            chat_state
                .connections
                .insert(connection_id, conversation_id.clone());

            // Create empty conversation history
            chat_state
                .conversations
                .insert(conversation_id.clone(), Vec::new());

            // Send confirmation to client
            Ok(vec![WebsocketMessage {
                ty: MessageType::Text,
                text: Some(
                    serde_json::to_string(&ServerMessage {
                        message_type: "conversation_created".to_string(),
                        conversation_id: conversation_id.clone(),
                        content: "New conversation created".to_string(),
                        error: None,
                        meta: None,
                    })
                    .unwrap_or_default()
                    .into(),
                ),
                data: None,
            }])
        }
        "send_message" => {
            // Get conversation ID
            let conversation_id = match client_message.conversation_id {
                Some(id) if !id.is_empty() => id,
                _ => {
                    // Try to get from connection
                    match chat_state.connections.get(&connection_id) {
                        Some(id) if !id.is_empty() => id.clone(),
                        _ => {
                            return Ok(vec![WebsocketMessage {
                                ty: MessageType::Text,
                                text: Some(
                                    serde_json::to_string(&ServerMessage {
                                        message_type: "error".to_string(),
                                        conversation_id: "".to_string(),
                                        content: "No active conversation".to_string(),
                                        error: Some("NO_CONVERSATION".to_string()),
                                        meta: None,
                                    })
                                    .unwrap_or_default()
                                    .into(),
                                ),
                                data: None,
                            }])
                        }
                    }
                }
            };

            // Get message content
            let message_content = match client_message.message {
                Some(content) if !content.is_empty() => content,
                _ => {
                    return Ok(vec![WebsocketMessage {
                        ty: MessageType::Text,
                        text: Some(
                            serde_json::to_string(&ServerMessage {
                                message_type: "error".to_string(),
                                conversation_id: conversation_id,
                                content: "Empty message".to_string(),
                                error: Some("EMPTY_MESSAGE".to_string()),
                                meta: None,
                            })
                            .unwrap_or_default()
                            .into(),
                        ),
                        data: None,
                    }])
                }
            };

            // Add user message to conversation
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let user_message = ChatMessage {
                role: "user".to_string(),
                content: message_content.clone(),
                timestamp,
            };

            // Get conversation history
            let conversation = chat_state
                .conversations
                .entry(conversation_id.clone())
                .or_insert_with(Vec::new);

            // Add user message to history
            conversation.push(user_message.clone());

            // Send to Anthropic via our proxy
            match send_to_anthropic(
                &chat_state.anthropic_proxy_id,
                &conversation_id,
                conversation,
                client_message.system,
            ) {
                Ok(assistant_message) => {
                    // Add assistant message to conversation history
                    conversation.push(assistant_message.clone());

                    // Send response to client
                    Ok(vec![WebsocketMessage {
                        ty: MessageType::Text,
                        text: Some(
                            serde_json::to_string(&ServerMessage {
                                message_type: "message".to_string(),
                                conversation_id: conversation_id,
                                content: assistant_message.content,
                                error: None,
                                meta: None,
                            })
                            .unwrap_or_default()
                            .into(),
                        ),
                        data: None,
                    }])
                }
                Err(e) => {
                    // Send error to client
                    Ok(vec![WebsocketMessage {
                        ty: MessageType::Text,
                        text: Some(
                            serde_json::to_string(&ServerMessage {
                                message_type: "error".to_string(),
                                conversation_id: conversation_id,
                                content: format!("Failed to get response: {}", e),
                                error: Some("ANTHROPIC_ERROR".to_string()),
                                meta: None,
                            })
                            .unwrap_or_default()
                            .into(),
                        ),
                        data: None,
                    }])
                }
            }
        }
        _ => {
            // Unknown action
            Ok(vec![WebsocketMessage {
                ty: MessageType::Text,
                text: Some(
                    serde_json::to_string(&ServerMessage {
                        message_type: "error".to_string(),
                        conversation_id: "".to_string(),
                        content: format!("Unknown action: {}", client_message.action),
                        error: Some("UNKNOWN_ACTION".to_string()),
                        meta: None,
                    })
                    .unwrap_or_default()
                    .into(),
                ),
                data: None,
            }])
        }
    }
}

// Helper function to send a message to the Anthropic proxy
// Currently using a filler response until the anthropic-proxy connection is set up
fn send_to_anthropic(
    _proxy_id: &str,
    _conversation_id: &str,
    messages: &[ChatMessage],
    _system: Option<String>,
) -> Result<ChatMessage, String> {
    log("Using filler response instead of Anthropic proxy");

    // Get the latest user message for context
    let latest_user_message = messages.iter()
        .filter(|msg| msg.role == "user")
        .last()
        .map(|msg| msg.content.clone())
        .unwrap_or_default();
    
    // Create a simple filler response that acknowledges the message
    let filler_content = format!("This is a temporary filler response. You said: '{}'. Once the anthropic-proxy connection is set up, this will be replaced with actual Claude responses.", latest_user_message);

    // Create assistant message with current timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(ChatMessage {
        role: "assistant".to_string(),
        content: filler_content,
        timestamp,
    })
}

// Generate a unique conversation ID
fn generate_conversation_id(string: String) -> String {
    let mut sha1 = sha1::Sha1::new();
    sha1.update(string.as_bytes());
    let hash = sha1.finalize();
    let hash_str = hex::encode(hash);

    format!("conv-{}", hash_str)
}

bindings::export!(Component with_types_in bindings);
