# claude-chat

A Theater HTTP server actor.

## Features

- HTTP server running on port 8080
- REST API endpoints
- WebSocket support

## Building

To build the actor:

```bash
cargo build --target wasm32-unknown-unknown --release
```

## Running

To run the actor with Theater:

```bash
theater start manifest.toml
```

## API Endpoints

- GET / - Returns a simple HTML welcome page
- GET /api/hello - Returns a JSON greeting message
- WS /ws - WebSocket endpoint that echoes messages
