# Aden API Server

HTTP API server that exposes all Aden CLI functionality for web clients with real-time chat capabilities.

## Features

- **RESTful API** for all CLI commands
- **Real-time streaming WebSocket** chat with live response generation
- **Session management** with conversation history
- **Multi-user chat rooms** capability
- **Tool execution visibility** with real-time status updates
- **Automatic session cleanup**
- **Full conversation context** tracking

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Vue Frontend  │◄──►│   API Server     │◄──►│   MCP Server     │
│                 │    │  (Express.js +   │    │  (Aden Core)     │
│  - Chat UI      │    │   Socket.io)     │    │                  │
│  - Real-time    │    │                  │    │  - Tools         │
│  - Sessions     │    │  - Session Mgmt  │    │  - Task Planning │
└─────────────────┘    │  - WebSocket     │    │  - Sequential    │
                       │  - REST API      │    │    Thinking      │
                       └──────────────────┘    └──────────────────┘
```

## Installation

```bash
cd api-server
npm install
```

## Configuration

### 1. Client Configuration

The API server uses the same configuration as the CLI client. Make sure to configure it first:

```bash
cd ../client
node src/cli.js config
```

### 2. API Server Configuration

Create environment file:

```bash
cp .env.example .env
```

Edit `.env` and set:

```bash
# Optional: Server port (defaults to 3001)
PORT=3001
```

**Note**: This server validates JWT token format but does not verify signatures. JWT tokens are issued by external servers that publish the tools.

## Usage

### Start the Server

```bash
npm start              # Production
npm run dev           # Development with auto-reload
```

The server runs on port 3001 by default. You can specify a different port:

```bash
node src/server.js 8080
# or
PORT=8080 npm start
```

### API Documentation

Visit `http://localhost:3001/api` for endpoint documentation.

## REST API Endpoints

### Sessions

- `POST /sessions` - Create new chat session
- `GET /sessions` - List all active sessions
- `GET /sessions/:id` - Get session info
- `DELETE /sessions/:id` - Destroy session

### Chat

- `POST /sessions/:id/chat` - Send message to session
- `GET /sessions/:id/context` - Get conversation context
- `GET /sessions/:id/history` - Get conversation history
- `DELETE /sessions/:id/history` - Clear conversation history

### One-shot Operations

- `POST /ask` - Ask question without session
- `POST /think` - Sequential thinking analysis
- `POST /plan` - Task planning

### System

- `GET /health` - Health check
- `GET /config` - Configuration status
- `GET /logs/sessions` - Conversation logs
- `GET /logs/stats` - Usage statistics

## WebSocket API

Connect to `ws://localhost:3001` and emit these events:

### Client → Server

- `join-session` - Join a chat session
- `chat-message` - Send chat message
- `command` - Execute CLI command

### Server → Client

- `session-joined` - Confirmed session join
- `chat-status` - Status updates (thinking, etc.)
- `tool-call` - Real-time tool invocation events
- `tool-result` - Tool execution completion events with full content and status
- `response-chunk` - Streaming text chunks as response is generated
- `response-complete` - Final response with metadata and usage stats
- `context-update` - Updated conversation context
- `command-result` - Command execution result
- `chat-error` - Error messages during chat processing

## Example Usage

### Create Session and Chat (REST)

```javascript
// Your JWT token (obtained from your authentication system)
const jwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

// Create session
const sessionResponse = await fetch("http://localhost:3001/sessions", {
  method: "POST",
  headers: {
    Authorization: `jwt ${jwtToken}`,
    "Content-Type": "application/json",
  },
});
const { sessionId } = await sessionResponse.json();

// Send message
const chatResponse = await fetch(`http://localhost:3001/sessions/${sessionId}/chat`, {
  method: "POST",
  headers: {
    Authorization: `jwt ${jwtToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "Hello, can you help me?" }),
});
const { response } = await chatResponse.json();
console.log(response);
```

### Real-time Streaming Chat (WebSocket)

```javascript
import { io } from "socket.io-client";

// Your JWT token (obtained from your authentication system)
const jwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

const socket = io("http://localhost:3001", {
  auth: {
    token: jwtToken,
  },
});

// Join session
socket.emit("join-session", { sessionId });

// Send message
socket.emit("chat-message", {
  sessionId,
  message: "Help me research the latest AI developments",
});

// Listen for streaming events
socket.on("chat-status", data => {
  console.log("Status:", data.status); // 'thinking'
});

socket.on("tool-call", data => {
  console.log("🔧 Tool called:", data.name, data.args);
});

socket.on("tool-result", data => {
  console.log("✅ Tool completed:", data.name);
  console.log("📄 Content:", data.content);
  if (data.isError) {
    console.log("❌ Error:", data.content);
  }
});

socket.on("response-chunk", data => {
  // Stream text as it's generated by Claude
  process.stdout.write(data.chunk);
});

socket.on("response-complete", data => {
  console.log("\n📊 Final Response Stats:", {
    response: data.response,
    toolCalls: data.toolCalls.length,
    usage: data.usage,
    responseTime: data.responseTime,
  });
});

socket.on("chat-error", data => {
  console.error("❌ Chat Error:", data.error);
});

// Handle authentication errors
socket.on("connect_error", error => {
  if (error.message.includes("Authentication error")) {
    console.error("WebSocket authentication failed:", error.message);
  }
});
```

### Vue.js Streaming Chat Integration

```vue
<template>
  <div class="chat-room">
    <div class="messages">
      <div v-for="msg in messages" :key="msg.id" :class="msg.role">
        <div class="content">{{ msg.content }}</div>
        <div v-if="msg.toolCalls?.length" class="tools">
          <div v-for="tool in msg.toolCalls" :key="tool.id" class="tool">🔧 {{ tool.name }}</div>
        </div>
      </div>

      <!-- Live streaming message -->
      <div v-if="streamingMessage" class="message assistant streaming">
        <div class="content">{{ streamingMessage }}</div>
        <div v-if="activeTool" class="tool-status">⚙️ {{ activeTool }}</div>
      </div>

      <!-- Thinking indicator -->
      <div v-if="thinking && !streamingMessage" class="thinking">🤔 Thinking...</div>
    </div>

    <input
      v-model="newMessage"
      @keyup.enter="sendMessage"
      :disabled="thinking"
      placeholder="Type your message..."
    />
  </div>
</template>

<script>
import { io } from "socket.io-client";

export default {
  data() {
    return {
      socket: null,
      sessionId: null,
      messages: [],
      newMessage: "",
      thinking: false,
      streamingMessage: "",
      activeTool: null,
      currentToolCalls: [],
    };
  },
  async mounted() {
    // Create session
    const response = await fetch("http://localhost:3001/sessions", {
      method: "POST",
      headers: {
        Authorization: `jwt ${this.jwtToken}`,
        "Content-Type": "application/json",
      },
    });
    const { sessionId } = await response.json();
    this.sessionId = sessionId;

    // Connect WebSocket with authentication
    this.socket = io("http://localhost:3001", {
      auth: { token: this.jwtToken },
    });

    this.socket.emit("join-session", { sessionId });

    // Streaming event handlers
    this.socket.on("chat-status", data => {
      this.thinking = data.status === "thinking";
      if (this.thinking) {
        this.streamingMessage = "";
        this.currentToolCalls = [];
      }
    });

    this.socket.on("tool-call", data => {
      this.activeTool = `Calling ${data.name}...`;
      this.currentToolCalls.push(data);
    });

    this.socket.on("tool-result", data => {
      this.activeTool = data.isError ? `❌ ${data.name} failed` : `✅ ${data.name} completed`;

      // Store tool result content for display if needed
      const lastToolIndex = this.currentToolCalls.findIndex(t => t.id === data.toolUseId);
      if (lastToolIndex >= 0) {
        this.currentToolCalls[lastToolIndex].result = data.content;
        this.currentToolCalls[lastToolIndex].isError = data.isError;
      }

      setTimeout(() => {
        this.activeTool = null;
      }, 1000);
    });

    this.socket.on("response-chunk", data => {
      this.streamingMessage += data.chunk;
    });

    this.socket.on("response-complete", data => {
      // Move streaming message to permanent messages
      this.messages.push({
        id: Date.now(),
        role: "assistant",
        content: data.response,
        toolCalls: data.toolCalls,
        usage: data.usage,
        responseTime: data.responseTime,
      });

      // Reset streaming state
      this.streamingMessage = "";
      this.thinking = false;
      this.activeTool = null;
      this.currentToolCalls = [];
    });

    this.socket.on("chat-error", data => {
      this.messages.push({
        id: Date.now(),
        role: "error",
        content: `Error: ${data.error}`,
      });
      this.thinking = false;
      this.streamingMessage = "";
    });
  },
  methods: {
    sendMessage() {
      if (!this.newMessage.trim()) return;

      this.messages.push({
        id: Date.now(),
        role: "user",
        content: this.newMessage,
      });

      this.socket.emit("chat-message", {
        sessionId: this.sessionId,
        message: this.newMessage,
      });

      this.newMessage = "";
    },
  },
};
</script>

<style scoped>
.streaming {
  border-left: 3px solid #4ade80;
  animation: pulse 1.5s infinite;
}

.tool-status {
  color: #6b7280;
  font-size: 0.9em;
  font-style: italic;
}

.tools {
  margin-top: 0.5rem;
  font-size: 0.9em;
  color: #6b7280;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
```

## Real-time Streaming Architecture

The API server provides true real-time streaming using the Anthropic SDK's streaming capabilities:

### Streaming Flow

1. **`chat-status: thinking`** - User sends message, server indicates processing started
2. **`response-chunk`** - Text streams live as Claude generates it (not chunked after completion)
3. **`tool-call`** - Each tool invocation emitted immediately when detected by Claude
4. **`tool-result`** - Tool execution completion with full content, error status, and metadata
5. **`response-chunk`** - Analysis response streams live as Claude processes tool results
6. **`response-complete`** - Final metadata with usage stats and complete response

### Key Streaming Features

- **Live Text Generation**: See responses appear character-by-character as Claude thinks
- **Real-time Tool Visibility**: Watch tools being called and executed in real-time
- **Multiple Streaming Phases**: Initial response AND tool analysis both stream live
- **No Fake Delays**: Uses Anthropic's native streaming events, not simulated chunks

### Performance Benefits

- **Immediate Feedback**: Users see progress instantly, not after completion
- **Better Perceived Performance**: Streaming feels faster than waiting for full responses
- **Tool Transparency**: Users understand what's happening during longer operations
- **Reduced Waiting**: No more staring at "thinking..." for extended periods

## Session Management

- **Automatic cleanup**: Inactive sessions are cleaned up after 30 minutes
- **Persistent conversation**: History maintained throughout session
- **Multiple clients**: Multiple WebSocket clients can join the same session
- **Resource management**: MCP connections and loggers properly cleaned up

## Security

The API server follows security best practices:

- **JWT Format Validation**: Validates JWT format and expiration (no signature verification)
- **No API Key Exposure**: Configuration endpoint only returns `hasApiKey: boolean`
- **Input Validation**: All request bodies are validated
- **CORS Protection**: Configurable CORS policies
- **Session Isolation**: Each session has isolated resources
- **Automatic Cleanup**: Inactive sessions cleaned up after 30 minutes

**⚠️ Production Deployment:**

- JWT tokens should be issued by trusted external servers
- Configure CORS for your specific frontend domains
- Use HTTPS in production
- Consider rate limiting for public APIs
- The server trusts JWT tokens from external issuers (no signature verification)

## Development

The server automatically reloads when files change in development mode:

```bash
npm run dev
```

## Architecture Notes

- **Separation of Concerns**: API server is separate from CLI client and MCP server
- **Reuses Client Logic**: Imports and reuses all client functionality
- **Session Isolation**: Each session has its own LLM client, MCP connection, and logger
- **Real-time Updates**: WebSocket provides instant feedback and status updates
- **Scalable Design**: Ready for multi-user scenarios and room-based chat
