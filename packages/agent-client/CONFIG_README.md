# Configuration Guide

This guide explains how to configure the Aden MCP client with secure credential handling and customizable agent parameters.

## Security Notice

**IMPORTANT**: Never commit API keys or JWT tokens to version control. The `config.json` file is now excluded from git tracking to prevent accidental credential exposure.

## Configuration Priority

Configuration values are loaded in the following priority order (highest to lowest):
1. Environment variables
2. `config.json` file
3. Default values

## Quick Start

1. Copy the environment template:
   ```bash
   cp .env.template .env
   ```

2. Add your API keys to `.env`:
   ```bash
   # Required based on your chosen provider
   ANTHROPIC_API_KEY=your_key_here
   OPENAI_API_KEY=your_key_here
   GOOGLE_AI_API_KEY=your_key_here
   
   # For team features
   ADEN_JWT_TOKEN=your_jwt_token_here
   ```

3. The `config.json` file will be created automatically from the template on first run.

## Configuration Options

### LLM Settings

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `LLM_PROVIDER` | LLM provider: claude, openai, gemini | claude |
| `ANTHROPIC_API_KEY` | Claude API key | - |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `GOOGLE_AI_API_KEY` | Google AI API key | - |
| `CLAUDE_MODEL` | Claude model name | claude-3-5-sonnet-20241022 |
| `CLAUDE_MAX_TOKENS` | Max tokens for Claude | 4000 |
| `CLAUDE_TEMPERATURE` | Claude temperature | 0.7 |

### Agent Execution Settings

| Environment Variable | Description | Default | Range |
|---------------------|-------------|---------|-------|
| `AGENT_MAX_ITERATIONS` | Max iterations per task | 10 | 1-15 |
| `AGENT_MAX_REPLANS` | Max replanning attempts | 3 | 0-10 |
| `AGENT_MAX_TASKS` | Max concurrent tasks | 15 | 1-50 |
| `AGENT_NO_PROGRESS_THRESHOLD` | Consecutive no-progress limit | 3 | 1-10 |
| `AGENT_MAX_TOOL_CALLS` | Max tool calls per iteration | 25 | 1-50 |

### Agent Retry Settings

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `AGENT_MAX_VALIDATION_RETRIES` | Max validation retry attempts | 3 |
| `AGENT_MAX_OPTIMIZER_RETRIES` | Max optimizer retry attempts | 2 |

### Agent Limits

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `AGENT_MAX_CONTENT_LENGTH` | Max content length (chars) | 15000 |
| `AGENT_MEMORY_SEARCH_LIMIT` | Memory search result limit | 5 |
| `AGENT_RECENT_HISTORY_LIMIT` | Recent history entries | 10 |
| `AGENT_RECENT_INTERACTION_LIMIT` | Recent interactions limit | 5 |

### Agent Timeouts (milliseconds)

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `AGENT_FORCE_EXIT_TIMEOUT` | Force exit timeout | 15000 |
| `AGENT_MCP_TOOL_TIMEOUT` | MCP tool timeout | 15000 |
| `AGENT_API_TIMEOUT` | API call timeout | 20000 |

### Logging Settings

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `LOG_LEVEL` | Log level: debug, info, warn, error | info |
| `CONVERSATION_LOGGING_ENABLED` | Enable conversation logs | true |
| `CONVERSATION_LOG_DIR` | Log directory | ./logs |
| `CONVERSATION_MAX_LOG_FILE_SIZE` | Max log file size (bytes) | 10485760 |
| `CONVERSATION_MAX_LOG_FILES` | Max number of log files | 50 |

## Best Practices

1. **Use Environment Variables for Secrets**: Always use environment variables for API keys and tokens
2. **Never Commit Credentials**: The `config.json` file should never contain actual API keys
3. **Use `.env` Files**: Keep your credentials in `.env` files (which are gitignored)
4. **Tune Agent Parameters**: Adjust agent parameters based on your use case:
   - Increase `maxIterations` for complex tasks
   - Decrease `maxToolCallsPerIteration` to prevent runaway tool usage
   - Adjust timeouts based on your network conditions

## Migrating from Old Configuration

If you have an existing `config.json` with credentials:

1. Copy your credentials to `.env` file
2. Delete the old `config.json`
3. Let the system create a new one from the template
4. Your credentials will be loaded from environment variables

## Troubleshooting

- **Config not loading**: Check that `config.json` exists and is valid JSON
- **API keys not working**: Ensure they're set in environment variables, not in config.json
- **Agent hitting limits**: Increase the relevant limits in environment variables
- **Timeouts**: Increase timeout values if you have slow network or API responses