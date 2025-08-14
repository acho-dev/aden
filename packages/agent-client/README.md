# Aden MCP Client

A powerful command line client that connects to the Aden MCP Server and uses Claude API for intelligent conversation with access to specialized tools.

## Features

- **Interactive Chat**: Natural conversation with Claude enhanced by MCP tools
- **Team Memory**: Persistent context across sessions when authenticated with JWT tokens
- **Sequential Thinking**: Step-by-step problem analysis using the MCP server
- **Task Planning**: Intelligent task breakdown and management
- **Tool Integration**: Seamless access to all MCP server capabilities
- **Multiple Modes**: Interactive chat, one-shot commands, and direct tool access
- **Authentication**: JWT-based team authentication for memory and data isolation
- **Configuration Management**: Easy setup and customization

## Installation

```bash
# From the client directory
cd client
npm install

# Optional: Install globally for system-wide access
npm run install-global
```

## Configuration

### Quick Setup

```bash
# Initialize configuration interactively
npm start config

# Or create from example
cp .env.example .env
# Edit .env with your settings
```

### Required Configuration

1. **Anthropic API Key**: Get from [Anthropic Console](https://console.anthropic.com/)
2. **MCP Server Path**: Path to the Aden MCP server (default: `../src/index.js`)

### Optional: Team Authentication (for Memory Features)

3. **JWT Token**: Get from your Aden team administrator for team memory access
4. **Aden Host**: API endpoint for your Aden instance (default: `https://your-api-host.com`)

### Environment Variables

Create a `.env` file with your configuration:

```bash
# Required
ANTHROPIC_API_KEY=your_api_key_here

# Optional: Team Authentication (for memory features)
ADEN_JWT_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
ADEN_HOST=https://your-api-host.com

# Optional (with defaults)
CLAUDE_MODEL=claude-3-5-sonnet-20241022
CLAUDE_MAX_TOKENS=4000
CLAUDE_TEMPERATURE=0.7
MCP_SERVER_PATH=../mcp-server/src/index.js
CLI_PROMPT=aden>
CLI_COLOR_OUTPUT=true
```

## Usage

### Interactive Chat Mode

Start an interactive conversation with Aden:

```bash
# Basic chat (no team memory)
npm start
# or
node src/cli.js chat

# Authenticated chat with team memory
node src/cli.js chat -t "your_jwt_token"
```

**Example interaction:**

```
aden> Help me design a user authentication system

🤖 Aden: I'll help you design a user authentication system. Let me think through this systematically and create a comprehensive plan.

[Uses sequential thinking and task planning tools automatically]

🔧 Used 2 tool(s): think_sequentially, plan_tasks

Step 1: Problem Analysis: Analyzing the problem: "design a user authentication system"
...
```

### One-Shot Commands

Ask single questions without starting a full conversation:

```bash
# Ask a question
node src/cli.js ask "What are the best practices for API security?"

# Ask with team context
node src/cli.js ask "What did we decide about the API redesign?" -t "your_jwt_token"

# Think through a problem
node src/cli.js think "How to optimize database queries for a social media app"

# Create a task plan with team memory
node src/cli.js plan "Build a React dashboard with real-time analytics" -t "your_jwt_token"
```

### Interactive Commands

While in chat mode, use these commands:

- `/help` - Show available commands
- `/status` - Show system status and connection info
- `/tools` - List available MCP tools
- `/clear` - Clear conversation history
- `/history` - Show conversation history
- `/config` - Show current configuration
- `/think <problem>` - Direct sequential thinking
- `/plan <objective>` - Direct task planning
- `/tasks` - Show current task status
- `/execute <taskId>` - Execute a specific task
- `/quit` - Exit the application

### Authentication Commands

Set up team authentication for memory features:

```bash
# Interactive authentication setup
node src/cli.js auth

# Set JWT token via command line
node src/cli.js auth -t "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."

# Set token with custom host
node src/cli.js auth -t "your_token" -h "https://your-aden-host.com"

# Check authentication status
node src/cli.js chat
# Then use /status command to see auth info
```

### Team Memory Features

When authenticated with a valid JWT token:

- **Persistent Context**: Aden remembers previous conversations across all team sessions
- **Shared Knowledge**: Team members share the same memory context
- **Business Continuity**: Decisions and insights are retained across sessions
- **Data Isolation**: Each team's data is completely separate and secure

**Example team workflow:**

```bash
# Day 1: Team member sets up authentication
node src/cli.js auth -t "team_jwt_token"

# Day 1: Discussion about project architecture
node src/cli.js chat
aden> We need to design a microservices architecture for our e-commerce platform

# Day 2: Different team member continues the conversation
node src/cli.js ask "What architecture decisions did we make yesterday?" -t "team_jwt_token"
# Aden will recall and reference the previous team discussion
```

## Architecture

The client consists of several key components:

### AdenMCPClient

Handles connection to the MCP server and tool execution:

```javascript
const mcpClient = new AdenMCPClient("../src/index.js");
await mcpClient.connect();

// Use MCP tools directly
const result = await mcpClient.thinkSequentially("Design problem");
const tasks = await mcpClient.planTasks("Build app");
```

### ClaudeClient

Manages Claude API integration with tool calling:

```javascript
const claudeClient = new ClaudeClient(apiKey, {
  model: "claude-3-5-sonnet-20241022",
  maxTokens: 4000,
  temperature: 0.7,
});

// Chat with tool integration
const response = await claudeClient.chat("Help me solve this", mcpClient);
```

### Configuration System

Centralized configuration management:

```javascript
const config = new Config();
config.setClaudeApiKey("your-key");
config.setClaudeModel("claude-3-opus-20240229");
```

## Advanced Usage

### Custom System Prompts

Modify Claude's behavior by updating the system prompt:

```javascript
claudeClient.setSystemPrompt(`
You are a specialized coding assistant with access to MCP tools.
Focus on providing practical, implementable solutions.
`);
```

### Tool-Specific Operations

Access MCP tools directly without full conversation:

```javascript
// Sequential thinking
const thinking = await mcpClient.thinkSequentially("Complex problem");

// Task planning
const tasks = await mcpClient.planTasks("Project objective");

// Task execution with loop detection
const result = await mcpClient.executeTask("task_1");

// Status monitoring
const status = await mcpClient.getTaskStatus();
```

### Conversation Management

Control conversation flow and history:

```javascript
// Clear history
claudeClient.clearHistory();

// Export conversation
const conversation = claudeClient.exportConversation();

// Import previous conversation
claudeClient.importConversation(conversation);

// Get statistics
const stats = claudeClient.getStats();
```

## Examples

### Example 1: Problem Solving Session

```bash
aden> I need to optimize the performance of a React application that's running slowly

🤖 Aden: I'll help you optimize your React application's performance. Let me analyze this systematically.

🔧 Used 1 tool(s): think_sequentially

Step 1: Problem Analysis: Analyzing React performance optimization...
- Problem type: optimization/enhancement
- Key components: react, performance, application, optimize
- Estimated complexity: medium

Step 2: Context Gathering:
- Domain: software development
- Required resources: development tools, profiling tools, testing framework
- Potential constraints: time limitations, resource availability

[Continues with detailed analysis and recommendations]
```

### Example 2: Task Planning

```bash
aden> /plan Build a REST API for a blog platform

📋 Task Plan:
- [pending] task_1: Plan implementation approach (Priority: high)
- [pending] task_2: Implement: Build a REST API for a blog platform (Priority: high)
- [pending] task_3: Test and validate implementation (Priority: medium)
```

### Example 3: Direct Tool Usage

```bash
aden> /think How to implement JWT authentication securely

🧠 Sequential Thinking Result:
Step 1: Problem Analysis: Analyzing the problem: "How to implement JWT authentication securely"
Problem type(s): analytical/investigative, optimization/enhancement
Key components: implement, jwt, authentication, securely
Estimated complexity: medium

[Continues with detailed security analysis...]
```

## Configuration Options

### Claude API Settings

```javascript
{
  "claude": {
    "apiKey": "your-key",
    "model": "claude-3-5-sonnet-20241022",  // or claude-3-opus-20240229
    "maxTokens": 4000,
    "temperature": 0.7
  }
}
```

### MCP Server Settings

```javascript
{
  "mcp": {
    "serverPath": "../src/index.js",
    "timeout": 60000
  }
}
```

### CLI Settings

```javascript
{
  "cli": {
    "prompt": "aden> ",
    "historySize": 100,
    "autoSave": true,
    "colorOutput": true
  }
}
```

## Error Handling

The client includes comprehensive error handling:

- **Connection Errors**: Automatic retry and clear error messages
- **API Errors**: Graceful handling of Claude API issues
- **Tool Errors**: Safe tool execution with error reporting
- **Configuration Errors**: Guided setup for missing configuration

## Troubleshooting

### Common Issues

**"Claude API key is required"**

- Set your API key in `.env` or run `node src/cli.js config`

**"Failed to connect to MCP server"**

- Ensure the MCP server path is correct
- Check that Node.js can execute the server script
- Verify the server dependencies are installed

**"Tool call failed"**

- Check MCP server is running and responding
- Verify tool availability with `/tools` command
- Check server logs for detailed error information

**Connection timeout**

- Increase timeout in configuration
- Check system resources and server performance

### Debug Mode

Enable detailed logging by setting environment variables:

```bash
LOG_LEVEL=debug node src/cli.js chat
```

### Health Check

Check system status:

```bash
aden> /status

📊 System Status:
  MCP Server: Connected
  Tools Available: 4
  Claude Model: claude-3-5-sonnet-20241022
  Conversation Messages: 12
  Temperature: 0.7
  Max Tokens: 4000
```

## Development

### Project Structure

```
client/
├── src/
│   ├── cli.js           # Main CLI interface
│   ├── mcp-client.js    # MCP server connection
│   ├── claude-client.js # Claude API integration
│   └── config.js        # Configuration management
├── config/              # Configuration files
├── package.json         # Dependencies and scripts
├── .env.example         # Example environment file
└── README.md           # This documentation
```

### Building and Testing

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm start

# Test configuration
node src/cli.js config
```

### Adding Features

The client is designed to be extensible:

1. **New Commands**: Add to the Commander.js program in `cli.js`
2. **Tool Integration**: Extend `mcp-client.js` for new MCP tools
3. **Claude Features**: Enhance `claude-client.js` for new API features
4. **Configuration**: Update `config.js` for new settings

## Security

- **API Keys**: Never commit API keys to version control
- **Environment Variables**: Use `.env` files for sensitive configuration
- **Tool Execution**: All tool calls are validated and sandboxed
- **Connection Security**: MCP connections use local stdio transport

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Support

For issues and questions:

- Check the troubleshooting section
- Review the MCP server documentation
- Check Claude API documentation for API-related issues
