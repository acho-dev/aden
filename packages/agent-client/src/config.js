import dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import configLoader from "./config-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class Config {
  constructor() {
    this.configPath = join(__dirname, "../config/config.json");
    this.envPath = join(__dirname, "../../../.env"); // Root .env
    this.rootEnvPath = join(__dirname, "../../../.env"); // Explicit root path
    this.templatePath = join(__dirname, "../config/config.template.json");
    this.config = this.loadConfig();
  }

  loadConfig() {
    // Use the new config loader
    try {
      const loadedConfig = configLoader.loadConfig();
      
      // Validate the configuration
      const errors = configLoader.validateConfig(loadedConfig);
      if (errors.length > 0) {
        console.warn('Configuration warnings:', errors.join('\n'));
      }
      
      return loadedConfig;
    } catch (error) {
      console.warn('Failed to load config with new loader, falling back to default:', error.message);
    }
    
    // Fallback to legacy loading
    dotenv.config({ path: this.envPath });

    // Default configuration
    const defaultConfig = {
      llm: {
        provider: process.env.LLM_PROVIDER || "claude", // 'claude', 'openai', 'gemini', or 'groq'
        claude: {
          apiKey: process.env.ANTHROPIC_API_KEY || "",
          model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022",
          maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 4000,
          temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.7,
        },
        openai: {
          apiKey: process.env.OPENAI_API_KEY || "",
          model: process.env.OPENAI_MODEL || "gpt-4o",
          maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 4000,
          temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
        },
        gemini: {
          apiKey: process.env.GOOGLE_AI_API_KEY || "",
          model: process.env.GEMINI_MODEL || "gemini-2.5-pro",
          maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS) || 8192,
          temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.7,
        },
        groq: {
          apiKey: process.env.GROQ_API_KEY || "",
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
          maxTokens: parseInt(process.env.GROQ_MAX_TOKENS) || 4000,
          temperature: parseFloat(process.env.GROQ_TEMPERATURE) || 0.7,
        },
      },
      mcp: {
        serverPath: process.env.MCP_SERVER_PATH || "../mcp-server/src/index.js",
        timeout: parseInt(process.env.MCP_TIMEOUT) || 60000,
      },
      auth: {
        jwtToken: process.env.ADEN_JWT_TOKEN || "",
        adenHost: process.env.ADEN_HOST || "https://your-api-host.com",
      },
      cli: {
        prompt: process.env.CLI_PROMPT || "aden> ",
        historySize: parseInt(process.env.CLI_HISTORY_SIZE) || 100,
        autoSave: process.env.CLI_AUTO_SAVE !== "false",
        colorOutput: process.env.CLI_COLOR_OUTPUT !== "false",
      },
      logging: {
        level: process.env.LOG_LEVEL || "info",
        file: process.env.LOG_FILE || "",
        console: process.env.LOG_CONSOLE !== "false",
      },
      conversationLogging: {
        enabled: process.env.CONVERSATION_LOGGING_ENABLED !== "false",
        logDir: process.env.CONVERSATION_LOG_DIR || "./logs",
        maxLogFileSize: parseInt(process.env.CONVERSATION_MAX_LOG_FILE_SIZE) || 10485760, // 10MB
        maxLogFiles: parseInt(process.env.CONVERSATION_MAX_LOG_FILES) || 50,
        logToolCalls: process.env.CONVERSATION_LOG_TOOL_CALLS !== "false",
        logRawPrompts: process.env.CONVERSATION_LOG_RAW_PROMPTS !== "false",
        logResponses: process.env.CONVERSATION_LOG_RESPONSES !== "false",
      },
      htmlReporting: {
        enabled: process.env.HTML_REPORTING_ENABLED !== "false",
        outputDir: process.env.HTML_OUTPUT_DIR || "./logs/html",
        autoGenerate: process.env.HTML_AUTO_GENERATE !== "false",
        theme: process.env.HTML_THEME || "modern",
        includeRawPrompts: process.env.HTML_INCLUDE_RAW_PROMPTS !== "false",
        includeToolDetails: process.env.HTML_INCLUDE_TOOL_DETAILS !== "false",
        autoOpen: process.env.HTML_AUTO_OPEN === "true",
      },
      agent: {
        execution: {
          maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS) || 10,
          maxReplans: parseInt(process.env.AGENT_MAX_REPLANS) || 3,
          maxTasks: parseInt(process.env.AGENT_MAX_TASKS) || 15,
          consecutiveNoProgressThreshold: parseInt(process.env.AGENT_NO_PROGRESS_THRESHOLD) || 3,
          maxToolCallsPerIteration: parseInt(process.env.AGENT_MAX_TOOL_CALLS) || 25,
          warningThresholdToolCalls: parseInt(process.env.AGENT_WARNING_TOOL_CALLS) || 20,
        },
        retry: {
          maxValidationRetries: parseInt(process.env.AGENT_MAX_VALIDATION_RETRIES) || 3,
          maxFastOptimizerRetries: parseInt(process.env.AGENT_MAX_OPTIMIZER_RETRIES) || 2,
        },
        limits: {
          maxContentLength: parseInt(process.env.AGENT_MAX_CONTENT_LENGTH) || 15000,
          memorySearchLimit: parseInt(process.env.AGENT_MEMORY_SEARCH_LIMIT) || 5,
          recentHistoryLimit: parseInt(process.env.AGENT_RECENT_HISTORY_LIMIT) || 10,
          recentInteractionLimit: parseInt(process.env.AGENT_RECENT_INTERACTION_LIMIT) || 5,
        },
        timeouts: {
          forceExitTimeout: parseInt(process.env.AGENT_FORCE_EXIT_TIMEOUT) || 15000,
          mcpToolTimeout: parseInt(process.env.AGENT_MCP_TOOL_TIMEOUT) || 15000,
          apiTimeout: parseInt(process.env.AGENT_API_TIMEOUT) || 20000,
          groqDefaultTimeout: parseInt(process.env.AGENT_GROQ_TIMEOUT) || 10000,
        },
      },
    };

    // Load from config file if it exists
    if (existsSync(this.configPath)) {
      try {
        const fileConfig = JSON.parse(readFileSync(this.configPath, "utf8"));
        return this.mergeConfig(defaultConfig, fileConfig);
      } catch (error) {
        console.warn(`Warning: Could not load config file: ${error.message}`);
      }
    }

    return defaultConfig;
  }

  mergeConfig(defaultConfig, fileConfig) {
    const merged = { ...defaultConfig };

    for (const [key, value] of Object.entries(fileConfig)) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        merged[key] = { ...defaultConfig[key], ...value };
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  saveConfig() {
    try {
      // Ensure config directory exists
      const configDir = dirname(this.configPath);
      if (!existsSync(configDir)) {
        require("fs").mkdirSync(configDir, { recursive: true });
      }

      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      return true;
    } catch (error) {
      console.error(`Failed to save config: ${error.message}`);
      return false;
    }
  }

  // Getters for specific configurations
  getLLMConfig() {
    return this.config.llm;
  }

  getCurrentLLMConfig() {
    const provider = this.config.llm.provider;
    return {
      provider,
      ...this.config.llm[provider],
    };
  }

  getClaudeConfig() {
    return this.config.llm.claude;
  }

  getOpenAIConfig() {
    return this.config.llm.openai;
  }

  getGeminiConfig() {
    return this.config.llm.gemini;
  }

  getMCPConfig() {
    return this.config.mcp;
  }

  getAuthConfig() {
    return this.config.auth;
  }

  getCLIConfig() {
    return this.config.cli;
  }

  getLoggingConfig() {
    return this.config.logging;
  }

  getAgentConfig() {
    return this.config.agent;
  }

  getAgentExecutionConfig() {
    return this.config.agent.execution;
  }

  getAgentRetryConfig() {
    return this.config.agent.retry;
  }

  getAgentLimitsConfig() {
    return this.config.agent.limits;
  }

  getAgentTimeoutsConfig() {
    return this.config.agent.timeouts;
  }

  // Setters
  setLLMProvider(provider) {
    if (!["claude", "openai", "gemini", "groq"].includes(provider)) {
      throw new Error('Invalid LLM provider. Must be "claude", "openai", "gemini", or "groq"');
    }
    this.config.llm.provider = provider;
    return this.saveConfig();
  }

  setClaudeApiKey(apiKey) {
    this.config.llm.claude.apiKey = apiKey;
    return this.saveConfig();
  }

  setClaudeModel(model) {
    this.config.llm.claude.model = model;
    return this.saveConfig();
  }

  setOpenAIApiKey(apiKey) {
    this.config.llm.openai.apiKey = apiKey;
    return this.saveConfig();
  }

  setOpenAIModel(model) {
    this.config.llm.openai.model = model;
    return this.saveConfig();
  }

  setGeminiApiKey(apiKey) {
    this.config.llm.gemini.apiKey = apiKey;
    return this.saveConfig();
  }

  setGeminiModel(model) {
    this.config.llm.gemini.model = model;
    return this.saveConfig();
  }

  setGroqApiKey(apiKey) {
    this.ensureGroqConfig();
    this.config.llm.groq.apiKey = apiKey;
    return this.saveConfig();
  }

  setGroqModel(model) {
    this.ensureGroqConfig();
    this.config.llm.groq.model = model;
    return this.saveConfig();
  }

  setMCPServerPath(path) {
    this.config.mcp.serverPath = path;
    return this.saveConfig();
  }

  setJWTToken(token) {
    this.config.auth.jwtToken = token;
    return this.saveConfig();
  }

  setAdenHost(host) {
    this.config.auth.adenHost = host;
    return this.saveConfig();
  }

  // Helper method to ensure groq config section exists
  ensureGroqConfig() {
    if (!this.config.llm.groq) {
      this.config.llm.groq = {
        apiKey: process.env.GROQ_API_KEY || "",
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        maxTokens: parseInt(process.env.GROQ_MAX_TOKENS) || 4000,
        temperature: parseFloat(process.env.GROQ_TEMPERATURE) || 0.7,
      };
    }
  }

  // Validation
  validate() {
    const errors = [];
    const provider = this.config.llm.provider;

    if (provider === "claude" && !this.config.llm.claude.apiKey) {
      errors.push(
        "Claude API key is required. Set ANTHROPIC_API_KEY environment variable or configure it."
      );
    }

    if (provider === "openai" && !this.config.llm.openai.apiKey) {
      errors.push(
        "OpenAI API key is required. Set OPENAI_API_KEY environment variable or configure it."
      );
    }

    if (provider === "gemini" && !this.config.llm.gemini.apiKey) {
      errors.push(
        "Gemini API key is required. Set GOOGLE_AI_API_KEY environment variable or configure it."
      );
    }

    if (provider === "groq" && !this.config.llm.groq?.apiKey) {
      errors.push(
        "Groq API key is required. Set GROQ_API_KEY environment variable or configure it."
      );
    }

    if (!this.config.mcp.serverPath) {
      errors.push("MCP server path is required.");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Setup helpers
  async setupInteractive() {
    const inquirer = await import("inquirer");

    console.log("🔧 Aden Client Configuration Setup\n");

    const answers = await inquirer.default.prompt([
      {
        type: "list",
        name: "provider",
        message: "Choose LLM provider:",
        choices: [
          { name: "Claude (Anthropic)", value: "claude" },
          { name: "OpenAI GPT-4", value: "openai" },
          { name: "Gemini (Google)", value: "gemini" },
          { name: "Groq (Ultra-fast & Cost-effective)", value: "groq" },
        ],
        default: this.config.llm.provider,
      },
      {
        type: "password",
        name: "claudeApiKey",
        message: "Enter your Anthropic API key:",
        when: answers => answers.provider === "claude" && !this.config.llm.claude.apiKey,
        validate: input => input.length > 0 || "API key is required",
      },
      {
        type: "list",
        name: "claudeModel",
        message: "Choose Claude model:",
        choices: [
          "claude-3-5-sonnet-20241022",
          "claude-3-5-haiku-20241022",
          "claude-3-opus-20240229",
        ],
        when: answers => answers.provider === "claude",
        default: this.config.llm.claude.model,
      },
      {
        type: "password",
        name: "openaiApiKey",
        message: "Enter your OpenAI API key:",
        when: answers => answers.provider === "openai" && !this.config.llm.openai.apiKey,
        validate: input => input.length > 0 || "API key is required",
      },
      {
        type: "list",
        name: "openaiModel",
        message: "Choose OpenAI model:",
        choices: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
        when: answers => answers.provider === "openai",
        default: this.config.llm.openai.model,
      },
      {
        type: "password",
        name: "geminiApiKey",
        message: "Enter your Google AI API key:",
        when: answers => answers.provider === "gemini" && !this.config.llm.gemini.apiKey,
        validate: input => input.length > 0 || "API key is required",
      },
      {
        type: "list",
        name: "geminiModel",
        message: "Choose Gemini model:",
        choices: [
          "gemini-2.5-pro",
          "gemini-2.5-flash",
          "gemini-1.5-pro",
          "gemini-1.5-flash",
          "gemini-pro",
        ],
        when: answers => answers.provider === "gemini",
        default: this.config.llm.gemini.model,
      },
      {
        type: "password",
        name: "groqApiKey",
        message: "Enter your Groq API key:",
        when: answers => answers.provider === "groq" && !this.config.llm.groq?.apiKey,
        validate: input => input.length > 0 || "API key is required",
      },
      {
        type: "list",
        name: "groqModel",
        message: "Choose Groq model:",
        choices: [
          "llama-3.3-70b-versatile",
          "llama-3.1-70b-versatile", 
          "llama-3.1-8b-instant",
          "mixtral-8x7b-32768",
          "gemma2-9b-it",
          "moonshotai/kimi-k2-instruct",
          "qwen/qwen3-32b",
          "openai/gpt-oss-120b",
        ],
        when: answers => answers.provider === "groq",
        default: this.config.llm?.groq?.model || "llama-3.3-70b-versatile",
      },
      {
        type: "input",
        name: "serverPath",
        message: "MCP Server path (relative to client):",
        default: this.config.mcp.serverPath,
      },
      {
        type: "password",
        name: "jwtToken",
        message: "Enter your Aden JWT token (optional):",
        when: () => !this.config.auth.jwtToken,
      },
      {
        type: "input",
        name: "adenHost",
        message: "Aden API host:",
        default: this.config.auth.adenHost,
      },
      {
        type: "confirm",
        name: "colorOutput",
        message: "Enable colored output?",
        default: this.config.cli.colorOutput,
      },
    ]);

    // Update config with answers
    if (answers.provider) {
      this.config.llm.provider = answers.provider;
    }
    if (answers.claudeApiKey) {
      this.config.llm.claude.apiKey = answers.claudeApiKey;
    }
    if (answers.claudeModel) {
      this.config.llm.claude.model = answers.claudeModel;
    }
    if (answers.openaiApiKey) {
      this.config.llm.openai.apiKey = answers.openaiApiKey;
    }
    if (answers.openaiModel) {
      this.config.llm.openai.model = answers.openaiModel;
    }
    if (answers.geminiApiKey) {
      this.config.llm.gemini.apiKey = answers.geminiApiKey;
    }
    if (answers.geminiModel) {
      this.config.llm.gemini.model = answers.geminiModel;
    }
    if (answers.groqApiKey) {
      this.ensureGroqConfig();
      this.config.llm.groq.apiKey = answers.groqApiKey;
    }
    if (answers.groqModel) {
      this.ensureGroqConfig();
      this.config.llm.groq.model = answers.groqModel;
    }
    if (answers.serverPath) {
      this.config.mcp.serverPath = answers.serverPath;
    }
    if (answers.jwtToken) {
      this.config.auth.jwtToken = answers.jwtToken;
    }
    if (answers.adenHost) {
      this.config.auth.adenHost = answers.adenHost;
    }
    if (answers.colorOutput !== undefined) {
      this.config.cli.colorOutput = answers.colorOutput;
    }

    const saved = this.saveConfig();

    if (saved) {
      console.log("✅ Configuration saved successfully!");
    } else {
      console.log("⚠️  Warning: Could not save configuration to file.");
    }

    return this.config;
  }

  // Environment file helpers
  createEnvFile() {
    const envContent = `# Aden MCP Client Configuration
# Copy this file to .env and fill in your values

# LLM Provider Selection
LLM_PROVIDER=claude

# Anthropic API Configuration
ANTHROPIC_API_KEY=your_api_key_here
CLAUDE_MODEL=claude-3-5-sonnet-20241022
CLAUDE_MAX_TOKENS=4000
CLAUDE_TEMPERATURE=0.7

# OpenAI API Configuration
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o
OPENAI_MAX_TOKENS=4000
OPENAI_TEMPERATURE=0.7

# Gemini API Configuration
GOOGLE_AI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-pro
GEMINI_MAX_TOKENS=8192
GEMINI_TEMPERATURE=0.7


# MCP Server Configuration  
MCP_SERVER_PATH=../mcp-server/src/index.js
MCP_TIMEOUT=60000

# Aden API Configuration
ADEN_JWT_TOKEN=your_jwt_token_here
ADEN_HOST=https://your-api-host.com

# CLI Configuration
CLI_PROMPT=aden> 
CLI_HISTORY_SIZE=100
CLI_AUTO_SAVE=true
CLI_COLOR_OUTPUT=true

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=
LOG_CONSOLE=true
`;

    const envExamplePath = join(__dirname, "../.env.example");

    try {
      writeFileSync(envExamplePath, envContent);
      console.log(`Created example environment file: ${envExamplePath}`);
      console.log("Copy this to .env and update with your actual values.");
      return true;
    } catch (error) {
      console.error(`Failed to create .env.example: ${error.message}`);
      return false;
    }
  }

  // Utility methods
  get(path) {
    return path.split(".").reduce((obj, key) => obj?.[key], this.config);
  }

  set(path, value) {
    const keys = path.split(".");
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => {
      if (!obj[key]) obj[key] = {};
      return obj[key];
    }, this.config);

    target[lastKey] = value;
    return this.saveConfig();
  }

  // Export/Import
  export() {
    return {
      ...this.config,
      claude: {
        ...this.config.claude,
        apiKey: "***hidden***", // Don't export the actual API key
      },
    };
  }

  import(configData) {
    // Don't import API key from external sources for security
    const { claude, ...safeConfig } = configData;
    if (claude) {
      const { apiKey, ...claudeConfig } = claude;
      this.config.claude = { ...this.config.claude, ...claudeConfig };
    }

    this.config = { ...this.config, ...safeConfig };
    return this.saveConfig();
  }
}

export default Config;
