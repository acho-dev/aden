# Aden Client Usage Examples

## Quick Commands (All exit automatically)

### 1. Ask Questions

```bash
node src/cli.js ask "How do I optimize a React application?"
node src/cli.js ask "What are the best practices for API design?"
node src/cli.js ask "Help me design a database schema for a blog"
```

### 2. Sequential Thinking

```bash
node src/cli.js think "How to implement microservices architecture"
node src/cli.js think "Optimize database performance for large datasets"
node src/cli.js think "Design a scalable authentication system"
```

### 3. Task Planning

```bash
node src/cli.js plan "Build a real-time chat application"
node src/cli.js plan "Create a machine learning pipeline"
node src/cli.js plan "Set up CI/CD for a Node.js project"
```

### 4. Configuration

```bash
node src/cli.js config    # Interactive configuration setup
node src/cli.js init      # Create config files and setup
```

## Interactive Chat Mode

For longer conversations with back-and-forth dialogue:

```bash
node src/cli.js chat
```

**Chat Features:**

- ✅ Multi-turn conversations with full context
- ✅ **COMPLETELY FIXED: No hanging ever** - Fresh readline approach
- ✅ **Instant input response** - Always ready for next message
- ✅ Error recovery and automatic reconnection
- ✅ Graceful Ctrl+C handling
- ✅ Real-time progress indicators
- ✅ Fast tool execution with direct responses

**Available commands in chat mode:**

- `/help` - Show all commands
- `/status` - System health check
- `/tools` - List available MCP tools
- `/think <problem>` - Direct sequential thinking
- `/plan <objective>` - Direct task planning
- `/tasks` - Show current tasks
- `/execute <taskId>` - Execute a task
- `/clear` - Clear conversation history
- `/quit` - Exit chat

**Example Chat Session:**

```
aden> Help me design a REST API for a blog

🤖 Aden: I'll help you design a REST API for a blog. Let me think through this systematically...

aden> What about authentication?

🤖 Aden: Great question! For authentication in your blog API...

aden> /quit
👋 Goodbye!
```

## Example Workflows

### Problem Solving Workflow

```bash
# 1. First, think through the problem
node src/cli.js think "How to scale a web application"

# 2. Then create a task plan
node src/cli.js plan "Scale web application to handle 10x traffic"

# 3. Have a conversation about implementation
node src/cli.js ask "Based on the scaling plan, what should I prioritize first?"
```

### Development Planning

```bash
# Plan a new project
node src/cli.js plan "Build a task management app with React and Node.js"

# Think through architecture decisions
node src/cli.js think "Choose between REST API vs GraphQL for task management"

# Get specific guidance
node src/cli.js ask "What database schema would work best for this task app?"
```

### Learning and Research

```bash
# Understand a concept deeply
node src/cli.js think "How do microservices handle data consistency"

# Get practical guidance
node src/cli.js ask "Show me how to implement JWT authentication in Node.js"

# Plan learning path
node src/cli.js plan "Learn Docker and Kubernetes for production deployment"
```

## Tips

1. **Commands exit automatically** - No need to Ctrl+C after one-shot commands
2. **Use quotes** - Wrap multi-word arguments in quotes
3. **Interactive mode** - Use `chat` command for back-and-forth conversations
4. **Rich responses** - Aden automatically uses tools when helpful
5. **Configuration** - Set up your API key once with `node src/cli.js config`

## Troubleshooting

**Commands work perfectly:**

- ✅ One-shot commands (`ask`, `think`, `plan`) exit automatically
- ✅ Interactive chat (`chat`) stays open until `/quit`
- ✅ **HANGING ISSUE COMPLETELY SOLVED** - Fresh readline approach
- ✅ Input always responsive after every response
- ✅ Fast responses even with complex tool usage

**Interactive chat now:**

- ✅ **Never hangs** - Creates fresh input interface each time
- ✅ **Always responsive** - Ready for input immediately after response
- ✅ **Multi-turn conversations** - Works perfectly for extended sessions
- ✅ **Tool integration** - Sequential thinking and planning work flawlessly

**"API key required" error:**

- Run `node src/cli.js config` to set up your Anthropic API key
- Or edit `.env` file directly with `ANTHROPIC_API_KEY=your_key`

**Connection errors:**

- Ensure you're in the `client` directory
- Check that the MCP server path is correct (`../src/index.js`)
- Verify Node.js can find the server script
- Try: `node src/cli.js ask "test"` to verify basic connectivity

**Timeout errors:**

- Normal for very complex requests
- Try breaking down your request into smaller parts
- Use direct commands like `/think` for complex analysis
