mod bindings;

use crate::bindings::exports::ntwk::theater::actor::Guest;
use crate::bindings::exports::ntwk::theater::http_handlers::Guest as HttpHandlersGuest;
use crate::bindings::exports::ntwk::theater::message_server_client::Guest as MessageServerClient;
use crate::bindings::ntwk::theater::http_framework::{
    add_route, create_server, enable_websocket, register_handler, start_server, ServerConfig,
};
use crate::bindings::ntwk::theater::http_types::{
    HttpRequest, HttpResponse, MiddlewareResult,
};
use crate::bindings::ntwk::theater::runtime::log;
use crate::bindings::ntwk::theater::types::State;

struct Component;

impl Guest for Component {
    fn init(_state: State, params: (String,)) -> Result<(State,), String> {
        log("Initializing claude-chat HTTP actor");
        let (param,) = params;
        log(&format!("Init parameter: {}", param));

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
        add_route(server_id, "/api/hello", "GET", api_handler_id)?;
        
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

        Ok((Some(param.as_bytes().to_vec()),))
    }
}

impl HttpHandlersGuest for Component {
    fn handle_request(
        state: Option<Vec<u8>>,
        params: (u64, HttpRequest),
    ) -> Result<(Option<Vec<u8>>, (HttpResponse,)), String> {
        let (handler_id, request) = params;
        log(&format!("Handling HTTP request with handler ID: {}", handler_id));
        log(&format!("Request URI: {}", request.uri));

        // Parse the URI to get the path and query
        let mut path_parts = request.uri.splitn(2, '?');
        let path = path_parts.next().unwrap_or("/");

        // Route handling
        let response = match path {
            "/" => {
                // Serve simple homepage
                HttpResponse {
                    status: 200,
                    headers: vec![("Content-Type".to_string(), "text/html".to_string())],
                    body: Some("<html><body><h1>Welcome to claude-chat</h1><p>A Theater HTTP actor</p></body></html>".as_bytes().to_vec()),
                }
            },
            "/api/hello" => {
                // Simple JSON API response
                let json = serde_json::json!({
                    "message": "Hello from claude-chat HTTP actor!",
                    "timestamp": "2025-04-27T00:00:00Z",
                }).to_string();
                
                HttpResponse {
                    status: 200,
                    headers: vec![("Content-Type".to_string(), "application/json".to_string())],
                    body: Some(json.as_bytes().to_vec()),
                }
            },
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
        log(&format!("Handling middleware with handler ID: {}", handler_id));

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

        Ok((state,))
    }

    fn handle_websocket_message(
        state: Option<Vec<u8>>,
        params: (u64, u64, crate::bindings::ntwk::theater::websocket_types::WebsocketMessage),
    ) -> Result<(Option<Vec<u8>>, (Vec<crate::bindings::ntwk::theater::websocket_types::WebsocketMessage>,)), String> {
        let (handler_id, connection_id, message) = params;
        log(&format!(
            "WebSocket message received - Handler: {}, Connection: {}",
            handler_id, connection_id
        ));

        // Echo the message back to the client
        let response = vec![message];
        
        Ok((state, (response,)))
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

        Ok((state,))
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

bindings::export!(Component with_types_in bindings);
