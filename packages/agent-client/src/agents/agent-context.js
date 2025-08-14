import { ConversationContextBuilder } from './conversation-context-builder.js';

/**
 * AgentContext - Shared context passed between agents in the multi-agent system
 * Contains all necessary data and services for agent execution
 */
export class AgentContext {
  constructor(config = {}) {
    // Core services
    this.llmClient = config.llmClient;
    this.mcpClient = config.mcpClient;
    this.logger = config.logger;
    this.callbacks = config.callbacks;
    this.performanceLogger = config.performanceLogger;

    // Session data
    this.sessionId = config.sessionId;
    this.teamId = config.teamId;
    this.userId = config.userId;
    this.tenantId = config.tenantId;

    // Workspace and file system state
    this.sessionWorkspace = null; // Will be set to actual workspace path
    this.projectStructure = {
      files: [],        // List of all files created
      directories: [],  // List of all directories created
      imports: new Map(), // Track imports between files
      verified: false   // Whether structure has been verified
    };
    this.fileSystemCache = new Map(); // Cache file contents to track what was actually written

    // Conversation state
    this.conversationHistory = config.conversationHistory || [];
    this.originalMessage = config.originalMessage;
    this.userIntent = config.userIntent;

    // Available resources
    this.tools = config.tools || [];
    this.schemaContext = config.schemaContext;
    this.ragContext = config.ragContext;

    // Agent execution state
    this.currentAgent = null;
    this.agentChain = [];
    this.sharedData = new Map();
    this.executionPhase = 'planning';

    // Configuration
    this.maxIterations = config.maxIterations || 10;
    this.maxReplans = config.maxReplans || 3;
    this.maxTasks = config.maxTasks || 10;
    this.stream = config.stream || false;

    // Results tracking
    this.allToolCalls = [];
    this.allToolResults = [];
    this.gatheredFacts = [];
    this.collectedRawPrompts = [];

    this.debug('AgentContext initialized');
    this.debug(`Schema context: ${this.schemaContext ? `${this.schemaContext.length} chars` : 'none'}`);
    this.debug(`RAG context: ${this.ragContext ? `${this.ragContext.length} chars` : 'none'}`);
  }

  /**
   * Set the currently executing agent
   * @param {BaseAgent} agent - The agent that is currently executing
   */
  setCurrentAgent(agent) {
    this.currentAgent = agent;
    this.agentChain.push({
      agentType: agent.agentType,
      timestamp: new Date().toISOString(),
      phase: this.executionPhase
    });
    this.debug(`Current agent set to: ${agent.agentType}`);
  }

  /**
   * Store data that can be shared between agents
   * @param {string} key - Data key
   * @param {any} value - Data value
   */
  setSharedData(key, value) {
    this.sharedData.set(key, value);
    this.debug(`Shared data set: ${key}`);
  }

  /**
   * Retrieve shared data
   * @param {string} key - Data key
   * @returns {any} Stored data or undefined
   */
  getSharedData(key) {
    return this.sharedData.get(key);
  }

  /**
   * Add tool calls to the global collection
   * @param {Array} toolCalls - Tool calls to add
   */
  addToolCalls(toolCalls) {
    this.allToolCalls.push(...toolCalls);
    this.debug(`Added ${toolCalls.length} tool calls, total: ${this.allToolCalls.length}`);
  }

  /**
   * Add tool results to the global collection
   * @param {Array} toolResults - Tool results to add
   */
  addToolResults(toolResults) {
    this.allToolResults.push(...toolResults);
    this.debug(`Added ${toolResults.length} tool results, total: ${this.allToolResults.length}`);
  }

  /**
   * Add facts to the global collection
   * @param {Array} facts - Facts to add
   */
  addFacts(facts) {
    this.gatheredFacts.push(...facts);
    this.debug(`Added ${facts.length} facts, total: ${this.gatheredFacts.length}`);
  }

  /**
   * Add raw prompt data
   * @param {Object} rawPromptData - Raw prompt data to add
   */
  addRawPrompt(rawPromptData) {
    this.collectedRawPrompts.push(rawPromptData);
    this.debug(`Added raw prompt data, total: ${this.collectedRawPrompts.length}`);
  }

  /**
   * Get schema context for database operations
   * @returns {string} Schema context
   */
  getSchemaContext() {
    return this.schemaContext;
  }


  /**
   * Get RAG context from knowledge base
   * @returns {string|null} RAG context or null if not available
   */
  getRagContext() {
    return this.ragContext;
  }

  /**
   * Update execution phase
   * @param {string} phase - New execution phase
   */
  setExecutionPhase(phase) {
    this.executionPhase = phase;
    this.debug(`Execution phase changed to: ${phase}`);
  }

  /**
   * Check if we should continue execution
   * @returns {boolean} Whether to continue
   */
  shouldContinueExecution() {
    const iterationCount = this.agentChain.length;
    if (iterationCount >= this.maxIterations) {
      this.debug(`Max iterations reached: ${iterationCount}/${this.maxIterations}`);
      return false;
    }
    return true;
  }

  /**
   * Get execution summary
   * @returns {Object} Summary of execution state
   */
  getExecutionSummary() {
    return {
      sessionId: this.sessionId,
      currentAgent: this.currentAgent?.agentType,
      executionPhase: this.executionPhase,
      agentChainLength: this.agentChain.length,
      totalToolCalls: this.allToolCalls.length,
      totalToolResults: this.allToolResults.length,
      totalFacts: this.gatheredFacts.length,
      sharedDataKeys: Array.from(this.sharedData.keys())
    };
  }

  /**
   * Create a context clone for agent handoff
   * @returns {AgentContext} Cloned context
   */
  clone() {
    const cloned = new AgentContext({
      llmClient: this.llmClient,
      mcpClient: this.mcpClient,
      logger: this.logger,
      callbacks: this.callbacks,
      performanceLogger: this.performanceLogger,
      sessionId: this.sessionId,
      teamId: this.teamId,
      userId: this.userId,
      tenantId: this.tenantId,
      conversationHistory: [...this.conversationHistory],
      originalMessage: this.originalMessage,
      userIntent: this.userIntent,
      tools: [...this.tools],
      schemaContext: this.schemaContext,
      memoryContext: this.memoryContext,
      ragContext: this.ragContext,
      maxIterations: this.maxIterations,
      maxReplans: this.maxReplans,
      maxTasks: this.maxTasks,
      stream: this.stream
    });

    // Copy execution state
    cloned.currentAgent = this.currentAgent;
    cloned.agentChain = [...this.agentChain];
    cloned.sharedData = new Map(this.sharedData);
    cloned.executionPhase = this.executionPhase;

    // Copy results
    cloned.allToolCalls = [...this.allToolCalls];
    cloned.allToolResults = [...this.allToolResults];
    cloned.gatheredFacts = [...this.gatheredFacts];
    cloned.collectedRawPrompts = [...this.collectedRawPrompts];

    return cloned;
  }

  /**
   * Get conversation context with custom options
   * @param {Object} options - Options for conversation context building
   * @returns {string} Formatted conversation context
   */
  getConversationContext(options = {}) {
    const builder = new ConversationContextBuilder(this.conversationHistory);
    return builder.build(options);
  }

  /**
   * Get conversation context optimized for planning
   * @returns {string} Formatted conversation context for planner agent
   */
  getPlannerContext() {
    return ConversationContextBuilder.forPlanner(this.conversationHistory);
  }

  /**
   * Get conversation context optimized for execution
   * @returns {string} Formatted conversation context for executor agent
   */
  getExecutorContext() {
    return ConversationContextBuilder.forExecutor(this.conversationHistory);
  }

  /**
   * Get conversation context optimized for analysis
   * @returns {string} Formatted conversation context for analyzer agent
   */
  getAnalyzerContext() {
    return ConversationContextBuilder.forAnalyzer(this.conversationHistory);
  }

  /**
   * Get conversation statistics
   * @returns {Object} Statistics about the conversation
   */
  getConversationStats() {
    const builder = new ConversationContextBuilder(this.conversationHistory);
    return builder.getStats();
  }

  /**
   * Set the session workspace path
   * @param {string} workspacePath - The absolute path to the session workspace
   */
  setSessionWorkspace(workspacePath) {
    this.sessionWorkspace = workspacePath;
    this.debug(`Session workspace set to: ${workspacePath}`);
  }

  /**
   * Use list_directory to see what actually exists (like ls!)
   * @param {string} path - Directory path to list (relative to workspace)
   * @returns {Promise<Object>} Directory contents
   */
  async seeTheWorld(path = '.') {
    try {
      if (!this.mcpClient) {
        this.debug('⚠️ No MCP client available to see the world');
        return null;
      }

      this.debug(`🦆 Little ducky looking at: ${path}`);
      
      const response = await this.mcpClient.callTool('list_directory', {
        path: path,
        sessionId: this.sessionId
      });

      if (response && response.content) {
        const contents = this.mcpClient.parseToolResponse(response);
        
        // Ensure contents is a string
        const contentStr = typeof contents === 'string' ? contents : 
                          (contents && typeof contents === 'object' && contents.text) ? contents.text :
                          JSON.stringify(contents);
        
        // Parse the directory listing to understand structure
        const lines = contentStr.split('\n');
        const files = [];
        const directories = [];
        
        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('total')) {
            // Simple parsing - could be enhanced
            if (trimmed.endsWith('/')) {
              directories.push(trimmed.slice(0, -1));
            } else if (!trimmed.startsWith('d') && trimmed.includes('.')) {
              // Likely a file
              const parts = trimmed.split(/\s+/);
              const fileName = parts[parts.length - 1];
              if (fileName && fileName !== '.' && fileName !== '..') {
                files.push(fileName);
              }
            }
          }
        });

        // Update our project structure with reality
        this.projectStructure.verified = true;
        
        // Merge discovered files with tracked ones
        files.forEach(file => {
          const fullPath = path === '.' ? file : `${path}/${file}`;
          if (!this.projectStructure.files.includes(fullPath)) {
            this.projectStructure.files.push(fullPath);
            this.debug(`🦆 Discovered file: ${fullPath}`);
          }
        });

        directories.forEach(dir => {
          const fullPath = path === '.' ? dir : `${path}/${dir}`;
          if (!this.projectStructure.directories.includes(fullPath)) {
            this.projectStructure.directories.push(fullPath);
            this.debug(`🦆 Discovered directory: ${fullPath}`);
          }
        });

        this.debug(`🦆 Little ducky sees: ${files.length} files, ${directories.length} directories`);
        
        return {
          path,
          files,
          directories,
          raw: contentStr
        };
      }
    } catch (error) {
      this.debug(`🦆 Little ducky couldn't see: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Read a file to verify it exists and check its content
   * @param {string} filePath - File path to read
   * @returns {Promise<string|null>} File content or null
   */
  async readAndVerify(filePath) {
    try {
      if (!this.mcpClient) {
        this.debug('⚠️ No MCP client available to read files');
        return null;
      }

      this.debug(`🦆 Little ducky reading: ${filePath}`);
      
      const response = await this.mcpClient.callTool('read_file', {
        path: filePath,
        sessionId: this.sessionId
      });

      if (response && response.content) {
        const content = this.mcpClient.parseToolResponse(response);
        
        // Ensure content is a string
        const contentStr = typeof content === 'string' ? content :
                          (content && typeof content === 'object' && content.text) ? content.text :
                          JSON.stringify(content);
        
        // Update our cache with actual content
        this.fileSystemCache.set(filePath, contentStr);
        
        // Mark file as verified
        if (!this.projectStructure.files.includes(filePath)) {
          this.projectStructure.files.push(filePath);
        }
        
        // Extract and track imports from the real content
        this.extractAndTrackImports(filePath, contentStr);
        
        this.debug(`🦆 Successfully read ${filePath} (${contentStr.length} chars)`);
        return contentStr;
      }
    } catch (error) {
      this.debug(`🦆 File doesn't exist or can't be read: ${filePath}`);
      
      // Remove from tracked files if it doesn't exist
      const index = this.projectStructure.files.indexOf(filePath);
      if (index > -1) {
        this.projectStructure.files.splice(index, 1);
        this.debug(`🦆 Removed non-existent file from tracking: ${filePath}`);
      }
    }
    
    return null;
  }

  /**
   * Verify the entire project structure by checking what actually exists
   * @returns {Promise<Object>} Verification results
   */
  async verifyProjectStructure() {
    this.debug('🦆 Little ducky verifying entire project structure...');
    
    const results = {
      verified: [],
      missing: [],
      discovered: []
    };

    // First, see what's actually in the root
    const rootContents = await this.seeTheWorld('.');
    
    if (rootContents) {
      // Check each tracked file
      for (const file of [...this.projectStructure.files]) {
        const content = await this.readAndVerify(file);
        if (content !== null) {
          results.verified.push(file);
        } else {
          results.missing.push(file);
        }
      }

      // Check subdirectories
      for (const dir of rootContents.directories) {
        const dirContents = await this.seeTheWorld(dir);
        if (dirContents) {
          dirContents.files.forEach(file => {
            const fullPath = `${dir}/${file}`;
            if (!this.projectStructure.files.includes(fullPath)) {
              results.discovered.push(fullPath);
            }
          });
        }
      }
    }

    this.projectStructure.verified = true;
    
    this.debug(`🦆 Verification complete:
      - Verified: ${results.verified.length} files
      - Missing: ${results.missing.length} files  
      - Discovered: ${results.discovered.length} new files`);
    
    return results;
  }

  /**
   * Track a file creation in the project structure
   * @param {string} filePath - Path of the created file (relative to workspace)
   * @param {string} content - Content of the file
   */
  trackFileCreation(filePath, content) {
    if (!this.projectStructure.files.includes(filePath)) {
      this.projectStructure.files.push(filePath);
    }
    
    // Cache the file content
    this.fileSystemCache.set(filePath, content);
    
    // Extract directory from path
    const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
    if (dir !== '.' && !this.projectStructure.directories.includes(dir)) {
      this.projectStructure.directories.push(dir);
    }
    
    // Extract imports from content if it's a code file
    this.extractAndTrackImports(filePath, content);
    
    this.debug(`📝 Tracked file creation: ${filePath}`);
  }

  /**
   * Extract and track imports from file content
   * @param {string} filePath - Path of the file
   * @param {string} content - Content to analyze
   */
  extractAndTrackImports(filePath, content) {
    const imports = [];
    
    // JavaScript/TypeScript imports
    const esImports = content.match(/import\s+.*?\s+from\s+['"](.*?)['"]/g) || [];
    const requireImports = content.match(/require\s*\(['"](.*?)['"]\)/g) || [];
    
    esImports.forEach(imp => {
      const match = imp.match(/from\s+['"](.*?)['"]/);
      if (match) imports.push(match[1]);
    });
    
    requireImports.forEach(imp => {
      const match = imp.match(/\(['"](.*?)['"]\)/);
      if (match) imports.push(match[1]);
    });
    
    if (imports.length > 0) {
      this.projectStructure.imports.set(filePath, imports);
      this.debug(`📦 Tracked imports for ${filePath}: ${imports.join(', ')}`);
    }
  }

  /**
   * Verify that all imports reference existing files
   * @returns {Array} List of import issues found
   */
  verifyImports() {
    const issues = [];
    
    for (const [file, imports] of this.projectStructure.imports) {
      for (const importPath of imports) {
        // Skip node_modules and external packages
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue;
        
        // Resolve relative import
        const resolvedPath = this.resolveImportPath(file, importPath);
        
        // Check if file exists in our tracked files
        if (!this.projectStructure.files.some(f => 
          f === resolvedPath || 
          f === `${resolvedPath}.js` || 
          f === `${resolvedPath}.ts` ||
          f === `${resolvedPath}/index.js` ||
          f === `${resolvedPath}/index.ts`
        )) {
          issues.push({
            file,
            import: importPath,
            issue: `Import "${importPath}" references non-existent file`
          });
        }
      }
    }
    
    return issues;
  }

  /**
   * Resolve a relative import path
   * @param {string} fromFile - File containing the import
   * @param {string} importPath - The import path to resolve
   * @returns {string} Resolved path
   */
  resolveImportPath(fromFile, importPath) {
    if (importPath.startsWith('/')) return importPath.substring(1);
    
    const fromDir = fromFile.includes('/') ? 
      fromFile.substring(0, fromFile.lastIndexOf('/')) : '.';
    
    if (importPath.startsWith('./')) {
      return fromDir === '.' ? importPath.substring(2) : `${fromDir}/${importPath.substring(2)}`;
    }
    
    if (importPath.startsWith('../')) {
      // Handle parent directory navigation
      let path = fromDir;
      let imp = importPath;
      while (imp.startsWith('../')) {
        const lastSlash = path.lastIndexOf('/');
        path = lastSlash > 0 ? path.substring(0, lastSlash) : '.';
        imp = imp.substring(3);
      }
      return path === '.' ? imp : `${path}/${imp}`;
    }
    
    return importPath;
  }

  /**
   * Get a summary of the current project structure
   * @returns {Object} Project structure summary
   */
  getProjectStructureSummary() {
    const importIssues = this.verifyImports();
    
    return {
      workspace: this.sessionWorkspace,
      fileCount: this.projectStructure.files.length,
      directoryCount: this.projectStructure.directories.length,
      files: [...this.projectStructure.files].sort(),
      directories: [...this.projectStructure.directories].sort(),
      importIssues,
      verified: this.projectStructure.verified
    };
  }

  /**
   * Get the actual content of a file from cache
   * @param {string} filePath - Path of the file
   * @returns {string|null} File content or null if not found
   */
  getFileContent(filePath) {
    return this.fileSystemCache.get(filePath) || null;
  }
  
  /**
   * Get all cached file contents
   * @returns {Map} Map of filePath to content
   */
  getAllCachedFiles() {
    return new Map(this.fileSystemCache);
  }
  
  /**
   * Check if a file has been tracked/created
   * @param {string} filePath - Path to check
   * @returns {boolean} True if file is tracked
   */
  hasFile(filePath) {
    return this.projectStructure.files.includes(filePath) || this.fileSystemCache.has(filePath);
  }

  /**
   * Debug logging
   * @param {...any} args - Arguments to log
   */
  debug(...args) {
    if (this.logger) {
      // Handle different logger interfaces
      if (typeof this.logger.log === 'function') {
        this.logger.log('🔄 [AgentContext]', ...args);
      } else if (typeof this.logger.info === 'function') {
        this.logger.info('🔄 [AgentContext]', ...args);
      } else if (typeof this.logger === 'function') {
        this.logger('🔄 [AgentContext]', ...args);
      } else {
        console.log('🔄 [AgentContext]', ...args);
      }
    } else {
      console.log('🔄 [AgentContext]', ...args);
    }
  }
}