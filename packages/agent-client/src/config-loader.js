import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ConfigLoader {
  constructor() {
    this.configPath = join(__dirname, '../config/config.json');
    this.templatePath = join(__dirname, '../config/config.template.json');
    this.envPath = join(__dirname, '../.env');
    this.rootEnvPath = join(__dirname, '../../../.env'); // Root .env
    
    // Load environment variables - prioritize root .env
    if (existsSync(this.rootEnvPath)) {
      dotenv.config({ path: this.rootEnvPath });
    } else if (existsSync(this.envPath)) {
      dotenv.config({ path: this.envPath });
    }
  }

  loadConfig() {
    // If config doesn't exist, create from template
    if (!existsSync(this.configPath)) {
      this.createConfigFromTemplate();
    }

    // Load the config file
    const config = JSON.parse(readFileSync(this.configPath, 'utf8'));

    // Override with environment variables
    return this.applyEnvironmentOverrides(config);
  }

  createConfigFromTemplate() {
    if (!existsSync(this.templatePath)) {
      throw new Error('Config template not found');
    }

    const template = readFileSync(this.templatePath, 'utf8');
    writeFileSync(this.configPath, template);
    console.log('Created config.json from template. Please configure your API keys.');
  }

  applyEnvironmentOverrides(config) {
    // LLM API Keys (never store in config file)
    if (process.env.ANTHROPIC_API_KEY) {
      config.llm.claude.apiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.OPENAI_API_KEY) {
      config.llm.openai.apiKey = process.env.OPENAI_API_KEY;
    }
    if (process.env.GOOGLE_AI_API_KEY) {
      config.llm.gemini.apiKey = process.env.GOOGLE_AI_API_KEY;
    }
    if (process.env.MISTRAL_API_KEY) {
      config.llm.mistral.apiKey = process.env.MISTRAL_API_KEY;
    }

    // Auth tokens (never store in config file)
    if (process.env.ADEN_JWT_TOKEN) {
      config.auth.jwtToken = process.env.ADEN_JWT_TOKEN;
    }
    if (process.env.ADEN_HOST) {
      config.auth.adenHost = process.env.ADEN_HOST;
    }

    // LLM settings
    if (process.env.LLM_PROVIDER) {
      config.llm.provider = process.env.LLM_PROVIDER;
    }
    if (process.env.CLAUDE_MODEL) {
      config.llm.claude.model = process.env.CLAUDE_MODEL;
    }
    if (process.env.CLAUDE_MAX_TOKENS) {
      config.llm.claude.maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS);
    }
    if (process.env.CLAUDE_TEMPERATURE) {
      config.llm.claude.temperature = parseFloat(process.env.CLAUDE_TEMPERATURE);
    }

    // MCP settings
    if (process.env.MCP_SERVER_PATH) {
      config.mcp.serverPath = process.env.MCP_SERVER_PATH;
    }
    if (process.env.MCP_TIMEOUT) {
      config.mcp.timeout = parseInt(process.env.MCP_TIMEOUT);
    }

    // Agent execution settings
    if (process.env.AGENT_MAX_ITERATIONS) {
      config.agent.execution.maxIterations = parseInt(process.env.AGENT_MAX_ITERATIONS);
    }
    if (process.env.AGENT_MAX_REPLANS) {
      config.agent.execution.maxReplans = parseInt(process.env.AGENT_MAX_REPLANS);
    }
    if (process.env.AGENT_MAX_TASKS) {
      config.agent.execution.maxTasks = parseInt(process.env.AGENT_MAX_TASKS);
    }
    if (process.env.AGENT_NO_PROGRESS_THRESHOLD) {
      config.agent.execution.consecutiveNoProgressThreshold = parseInt(process.env.AGENT_NO_PROGRESS_THRESHOLD);
    }
    if (process.env.AGENT_MAX_TOOL_CALLS) {
      config.agent.execution.maxToolCallsPerIteration = parseInt(process.env.AGENT_MAX_TOOL_CALLS);
    }

    // Agent retry settings
    if (process.env.AGENT_MAX_VALIDATION_RETRIES) {
      config.agent.retry.maxValidationRetries = parseInt(process.env.AGENT_MAX_VALIDATION_RETRIES);
    }
    if (process.env.AGENT_MAX_OPTIMIZER_RETRIES) {
      config.agent.retry.maxFastOptimizerRetries = parseInt(process.env.AGENT_MAX_OPTIMIZER_RETRIES);
    }

    // Agent limits
    if (process.env.AGENT_MAX_CONTENT_LENGTH) {
      config.agent.limits.maxContentLength = parseInt(process.env.AGENT_MAX_CONTENT_LENGTH);
    }
    if (process.env.AGENT_MEMORY_SEARCH_LIMIT) {
      config.agent.limits.memorySearchLimit = parseInt(process.env.AGENT_MEMORY_SEARCH_LIMIT);
    }
    if (process.env.AGENT_RECENT_HISTORY_LIMIT) {
      config.agent.limits.recentHistoryLimit = parseInt(process.env.AGENT_RECENT_HISTORY_LIMIT);
    }

    // Agent timeouts
    if (process.env.AGENT_FORCE_EXIT_TIMEOUT) {
      config.agent.timeouts.forceExitTimeout = parseInt(process.env.AGENT_FORCE_EXIT_TIMEOUT);
    }
    if (process.env.AGENT_MCP_TOOL_TIMEOUT) {
      config.agent.timeouts.mcpToolTimeout = parseInt(process.env.AGENT_MCP_TOOL_TIMEOUT);
    }
    if (process.env.AGENT_API_TIMEOUT) {
      config.agent.timeouts.apiTimeout = parseInt(process.env.AGENT_API_TIMEOUT);
    }

    // Logging settings
    if (process.env.LOG_LEVEL) {
      config.logging.level = process.env.LOG_LEVEL;
    }
    if (process.env.CONVERSATION_LOGGING_ENABLED !== undefined) {
      config.conversationLogging.enabled = process.env.CONVERSATION_LOGGING_ENABLED === 'true';
    }
    if (process.env.CONVERSATION_LOG_DIR) {
      config.conversationLogging.logDir = process.env.CONVERSATION_LOG_DIR;
    }
    if (process.env.CONVERSATION_MAX_LOG_FILE_SIZE) {
      config.conversationLogging.maxLogFileSize = parseInt(process.env.CONVERSATION_MAX_LOG_FILE_SIZE);
    }
    if (process.env.CONVERSATION_MAX_LOG_FILES) {
      config.conversationLogging.maxLogFiles = parseInt(process.env.CONVERSATION_MAX_LOG_FILES);
    }

    // CLI settings
    if (process.env.CLI_HISTORY_SIZE) {
      config.cli.historySize = parseInt(process.env.CLI_HISTORY_SIZE);
    }
    if (process.env.CLI_COLOR_OUTPUT !== undefined) {
      config.cli.colorOutput = process.env.CLI_COLOR_OUTPUT === 'true';
    }

    return config;
  }

  validateConfig(config) {
    const errors = [];

    // Validate agent execution limits
    const { execution } = config.agent;
    if (execution.maxIterations < 1 || execution.maxIterations > 15) {
      errors.push('agent.execution.maxIterations must be between 1 and 15');
    }
    if (execution.maxReplans < 0 || execution.maxReplans > 10) {
      errors.push('agent.execution.maxReplans must be between 0 and 10');
    }
    if (execution.maxTasks < 1 || execution.maxTasks > 50) {
      errors.push('agent.execution.maxTasks must be between 1 and 50');
    }

    // Check for API keys in config file (security warning)
    if (config.llm.claude.apiKey && !process.env.ANTHROPIC_API_KEY) {
      errors.push('WARNING: Claude API key found in config file. Use ANTHROPIC_API_KEY environment variable instead.');
    }
    if (config.llm.openai.apiKey && !process.env.OPENAI_API_KEY) {
      errors.push('WARNING: OpenAI API key found in config file. Use OPENAI_API_KEY environment variable instead.');
    }
    if (config.llm.gemini.apiKey && !process.env.GOOGLE_AI_API_KEY) {
      errors.push('WARNING: Gemini API key found in config file. Use GOOGLE_AI_API_KEY environment variable instead.');
    }
    if (config.auth.jwtToken && !process.env.ADEN_JWT_TOKEN) {
      errors.push('WARNING: JWT token found in config file. Use ADEN_JWT_TOKEN environment variable instead.');
    }

    return errors;
  }
}

export default new ConfigLoader();