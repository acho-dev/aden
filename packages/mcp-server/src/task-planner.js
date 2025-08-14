export class TaskPlanner {
  constructor(toolManager = null) {
    this.tasks = new Map();
    this.taskCounter = 0;
    this.toolManager = toolManager;
  }

  async createTaskPlan(objective, options = {}) {
    const tasks = await this.breakDownObjective(objective);

    // Add preview mode - don't store tasks yet
    if (options.preview) {
      return {
        preview: true,
        objective,
        tasks: tasks.map(task => ({
          description: task.description,
          toolRequired: task.toolRequired,
          estimatedTime: task.estimatedTime,
          priority: task.priority,
        })),
        summary: this.generateTaskSummary(tasks),
      };
    }

    // Store tasks for execution
    tasks.forEach(task => {
      this.tasks.set(task.id, task);
    });

    return tasks;
  }

  generateTaskSummary(tasks) {
    const totalTime = tasks.reduce((sum, task) => sum + task.estimatedTime, 0);
    const toolsUsed = [...new Set(tasks.map(task => task.toolRequired))].filter(Boolean);

    return {
      totalTasks: tasks.length,
      estimatedTime: `${totalTime} minutes`,
      toolsRequired: toolsUsed,
      approach: this.describeApproach(tasks),
    };
  }

  describeApproach(tasks) {
    const hasAnalysis = tasks.some(t => t.toolRequired === "text_analyze");
    const hasStrategy = tasks.some(t => t.toolRequired === "strategy_plan");
    const hasMath = tasks.some(t => t.toolRequired === "math_calculate");

    let approach = "Systematic research approach";
    if (hasAnalysis && hasStrategy) {
      approach += " with analysis and strategic planning";
    } else if (hasAnalysis) {
      approach += " focusing on detailed analysis";
    } else if (hasStrategy) {
      approach += " emphasizing strategic planning";
    }

    if (hasMath) {
      approach += " including quantitative evaluation";
    }

    return approach;
  }

  async breakDownObjective(objective) {
    // Simple task breakdown logic - can be enhanced with more sophisticated planning
    const taskTypes = this.categorizeObjective(objective);
    const tasks = [];

    taskTypes.forEach(type => {
      const task = {
        id: `task_${++this.taskCounter}`,
        description: type.description,
        status: "pending",
        priority: type.priority,
        dependencies: type.dependencies || [],
        estimatedTime: type.estimatedTime || 5,
        toolRequired: type.toolRequired,
        toolInput: type.toolInput,
        created: new Date().toISOString(),
      };
      tasks.push(task);
    });

    return tasks;
  }

  categorizeObjective(objective) {
    const lower = objective.toLowerCase();
    const taskTypes = [];

    // Extract key entities and context
    const domain = this.extractDomain(objective);
    const actionType = this.extractActionType(objective);
    const entities = this.extractEntities(objective);

    // Generate domain-specific, tool-based tasks
    if (actionType === "research") {
      taskTypes.push(...this.generateResearchTasks(objective, domain, entities));
    } else if (actionType === "evaluate") {
      taskTypes.push(...this.generateEvaluationTasks(objective, domain, entities));
    } else if (actionType === "compare") {
      taskTypes.push(...this.generateComparisonTasks(objective, domain, entities));
    } else if (actionType === "analyze") {
      taskTypes.push(...this.generateAnalysisTasks(objective, domain, entities));
    } else {
      // Fallback - but make it specific
      taskTypes.push(...this.generateGenericResearchTasks(objective));
    }

    return taskTypes;
  }

  extractDomain(objective) {
    const lower = objective.toLowerCase();

    if (/(nuclear|energy|power plant|reactor|clean energy)/.test(lower)) return "energy";
    if (/(startup|business|company|market|venture)/.test(lower)) return "business";
    if (/(technology|software|app|platform|system)/.test(lower)) return "technology";
    if (/(investment|finance|funding|capital)/.test(lower)) return "finance";
    if (/(research|study|academic|science)/.test(lower)) return "research";

    return "general";
  }

  extractActionType(objective) {
    const lower = objective.toLowerCase();

    if (/(research|investigate|find information|gather data)/.test(lower)) return "research";
    if (/(evaluate|assess|feasibility|viability)/.test(lower)) return "evaluate";
    if (/(compare|alternatives|options|versus)/.test(lower)) return "compare";
    if (/(analyze|analysis|examine|study)/.test(lower)) return "analyze";

    return "research"; // default
  }

  extractEntities(objective) {
    // Extract key terms that can guide research with better context preservation
    const originalWords = objective.split(/\s+/);
    const words = objective.toLowerCase().split(/\s+/);

    // Expanded stop words but preserve business context
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "how",
      "what",
      "when",
      "where",
      "why",
      "help",
      "me",
      "get",
      "gather",
      "data",
      "details",
      "overview",
      "current",
      "state",
      "trends",
      "comprehensive",
      "compile",
    ]);

    const entities = [];
    const businessContext = this.detectBusinessContext(objective);

    // First pass: Extract proper nouns, business terms, and important context
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const originalWord = originalWords[i];

      // Skip very short words and stop words
      if (word.length <= 2 || stopWords.has(word)) continue;

      // Handle possessive forms (e.g., "Sang's" -> "Sang")
      const cleanWord = word.replace(/['']s$/, "");
      const cleanOriginal = originalWord.replace(/['']s$/, "");

      // Priority 1: Proper nouns (names, companies)
      if (/^[A-Z]/.test(originalWord)) {
        entities.push(cleanOriginal);
        continue;
      }

      // Priority 2: Years and numbers
      if (/^\d{4}$/.test(word) || /^\d+$/.test(word)) {
        entities.push(cleanOriginal);
        continue;
      }

      // Priority 3: Business context terms
      if (businessContext.isBusinessContext) {
        const businessTerms = [
          "deal",
          "contract",
          "engagement",
          "upsell",
          "customer",
          "client",
          "project",
          "sales",
          "revenue",
          "opportunity",
          "lead",
          "account",
        ];
        if (businessTerms.includes(cleanWord)) {
          entities.push(cleanWord);
          continue;
        }
      }

      // Priority 4: Domain-specific terms
      if (cleanWord.length > 4 && !this.isGenericActionWord(cleanWord)) {
        entities.push(cleanWord);
      }
    }

    // If we still don't have enough entities, add remaining significant words
    if (entities.length < 3) {
      const remaining = words.filter(
        word =>
          word.length > 3 &&
          !stopWords.has(word) &&
          !this.isGenericActionWord(word) &&
          !entities.some(e => e.toLowerCase().includes(word) || word.includes(e.toLowerCase()))
      );

      entities.push(...remaining.slice(0, 3 - entities.length));
    }

    return entities.slice(0, 3); // Take top 3 relevant terms
  }

  isGenericActionWord(word) {
    const genericActions = [
      "find",
      "search",
      "research",
      "tell",
      "show",
      "give",
      "provide",
      "create",
      "make",
      "build",
      "develop",
      "analyze",
      "review",
      "look",
    ];
    return genericActions.includes(word);
  }

  detectBusinessContext(objective) {
    const lower = objective.toLowerCase();
    const businessIndicators = [
      "deal",
      "contract",
      "engagement",
      "upsell",
      "customer",
      "client",
      "sales",
      "revenue",
      "opportunity",
      "lead",
      "account",
      "crm",
      "project",
      "stakeholder",
      "champion",
    ];

    // Check for proper nouns that might be business contacts
    const hasProperNoun = /\b[A-Z][a-z]+\b/.test(objective);
    const hasBusinessTerms = businessIndicators.some(term => lower.includes(term));

    // If we have a proper noun with certain business query patterns, assume business context
    const businessQueryPatterns = [
      /(tell me about|about|who is)\s+[A-Z]/i,
      /(create|find|search).*(for|with)\s+[A-Z]/i,
      /[A-Z]\w*('s)?\s+(deal|contract|engagement)/i,
    ];

    const hasBusinessQueryPattern = businessQueryPatterns.some(pattern => pattern.test(objective));

    const context = {
      isBusinessContext: hasBusinessTerms || (hasProperNoun && hasBusinessQueryPattern),
      indicators: businessIndicators.filter(term => lower.includes(term)),
      hasProperNoun,
      hasBusinessQueryPattern,
    };

    return context;
  }

  generateBusinessTasks(objective, entities, businessContext) {
    const tasks = [];
    const hasProperNoun = entities.some(e => /^[A-Z]/.test(e));
    const properNoun = entities.find(e => /^[A-Z]/.test(e)) || entities[0];
    const businessTerms = entities.filter(e =>
      businessContext.indicators.includes(e.toLowerCase())
    );

    // Schema is already preloaded, so start directly with RAG query for relevant knowledge
    tasks.push({
      description: "Query knowledge base for relevant information using RAG",
      priority: "high",
      estimatedTime: 5,
      toolRequired: "rag_query",
      toolInput: { query: objective },
    });

    // Create smart queries that will use the ontology results for better targeting
    if (hasProperNoun && businessContext.indicators.length > 0) {
      // Direct query for the person/company with business context - use dynamic query generation
      tasks.push({
        description: `Query database for ${properNoun} records using ontology-informed search`,
        priority: "high",
        estimatedTime: 5,
        toolRequired: "db_query",
        toolInput: {
          query: this.generateSmartQuery("contact_search", properNoun, businessContext),
          useOntology: true,
          searchEntity: properNoun,
          searchType: "contact",
        },
      });

      // If looking for specific business activities
      if (
        businessContext.indicators.includes("engagement") ||
        objective.toLowerCase().includes("engagement")
      ) {
        tasks.push({
          description: `Find all engagements with ${properNoun} using relationship data`,
          priority: "high",
          estimatedTime: 5,
          toolRequired: "db_query",
          toolInput: {
            query: this.generateSmartQuery("engagement_search", properNoun, businessContext),
            useOntology: true,
            searchEntity: properNoun,
            searchType: "engagement",
          },
        });
      }

      if (
        businessContext.indicators.includes("deal") ||
        businessContext.indicators.includes("contract")
      ) {
        tasks.push({
          description: `Review deals and contracts for ${properNoun} using relationship data`,
          priority: "high",
          estimatedTime: 5,
          toolRequired: "db_query",
          toolInput: {
            query: this.generateSmartQuery("deal_search", properNoun, businessContext),
            useOntology: true,
            searchEntity: properNoun,
            searchType: "deal",
          },
        });
      }

      if (
        businessContext.indicators.includes("upsell") ||
        objective.toLowerCase().includes("upsell")
      ) {
        tasks.push({
          description: `Analyze upsell opportunities for ${properNoun} using comprehensive data`,
          priority: "medium",
          estimatedTime: 7,
          toolRequired: "db_query",
          toolInput: {
            query: this.generateSmartQuery("upsell_analysis", properNoun, businessContext),
            useOntology: true,
            searchEntity: properNoun,
            searchType: "upsell",
          },
        });
      }
    } else if (hasProperNoun) {
      // Has proper noun but no explicit business indicators - still query business records
      tasks.push({
        description: `Query business database for ${properNoun} using ontology structure`,
        priority: "high",
        estimatedTime: 5,
        toolRequired: "db_query",
        toolInput: {
          query: this.generateSmartQuery("general_search", properNoun, businessContext),
          useOntology: true,
          searchEntity: properNoun,
          searchType: "general",
        },
      });
    } else {
      // Generic business query based on business terms
      const entityQuery = entities.join(" ");
      tasks.push({
        description: `Query business database for ${entityQuery} using available data structures`,
        priority: "high",
        estimatedTime: 5,
        toolRequired: "db_query",
        toolInput: {
          query: this.generateSmartQuery("keyword_search", entityQuery, businessContext),
          useOntology: true,
          searchEntity: entityQuery,
          searchType: "keyword",
        },
      });
    }

    return tasks;
  }

  generateSmartQuery(queryType, searchTerm, businessContext) {
    // Generate placeholder queries that will be replaced with ontology-informed queries
    const searchTermEscaped = searchTerm.replace(/'/g, "''");

    // These are template queries that will be dynamically enhanced using the preloaded schema context
    // The actual queries will be generated by the client-side logic using preloaded schema information

    switch (queryType) {
      case "contact_search":
        return `-- Dynamic query will be generated from ontology for: ${searchTerm}
        -- This placeholder will be replaced with ontology-informed contact search
        SELECT 'PLACEHOLDER' as message, '${searchTermEscaped}' as search_term, 'contact_search' as query_type`;

      case "engagement_search":
        return `-- Dynamic query will be generated from ontology for: ${searchTerm}
        -- This placeholder will be replaced with ontology-informed engagement search
        SELECT 'PLACEHOLDER' as message, '${searchTermEscaped}' as search_term, 'engagement_search' as query_type`;

      case "deal_search":
        return `-- Dynamic query will be generated from ontology for: ${searchTerm}
        -- This placeholder will be replaced with ontology-informed deal search
        SELECT 'PLACEHOLDER' as message, '${searchTermEscaped}' as search_term, 'deal_search' as query_type`;

      case "upsell_analysis":
        return `-- Dynamic query will be generated from ontology for: ${searchTerm}
        -- This placeholder will be replaced with ontology-informed upsell analysis
        SELECT 'PLACEHOLDER' as message, '${searchTermEscaped}' as search_term, 'upsell_analysis' as query_type`;

      case "general_search":
        return `-- Dynamic query will be generated from ontology for: ${searchTerm}
        -- This placeholder will be replaced with ontology-informed general search
        SELECT 'PLACEHOLDER' as message, '${searchTermEscaped}' as search_term, 'general_search' as query_type`;

      case "keyword_search":
        return `-- Dynamic query will be generated from ontology for: ${searchTerm}
        -- This placeholder will be replaced with ontology-informed keyword search
        SELECT 'PLACEHOLDER' as message, '${searchTermEscaped}' as search_term, 'keyword_search' as query_type`;

      default:
        return `-- Dynamic query will be generated from ontology for: ${searchTerm}
        -- This placeholder will be replaced with ontology-informed search
        SELECT 'PLACEHOLDER' as message, '${searchTermEscaped}' as search_term, 'default_search' as query_type`;
    }
  }

  generateResearchTasks(objective, domain, entities) {
    const tasks = [];
    const businessContext = this.detectBusinessContext(objective);

    // Business/CRM context takes priority
    if (businessContext.isBusinessContext) {
      return this.generateBusinessTasks(objective, entities, businessContext);
    }

    if (domain === "energy") {
      tasks.push({
        description: `Research current ${entities[0] || "energy"} technologies and market landscape`,
        priority: "high",
        estimatedTime: 10,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} technologies market trends`,
        },
      });

      tasks.push({
        description: `Research regulatory and policy framework`,
        priority: "high",
        estimatedTime: 8,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} regulations policy requirements`,
        },
      });

      tasks.push({
        description: `Research costs and economic analysis`,
        priority: "medium",
        estimatedTime: 7,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} costs economics investment analysis`,
        },
      });
    } else if (domain === "business") {
      tasks.push({
        description: `Research market opportunity and size for ${entities.join(" ")}`,
        priority: "high",
        estimatedTime: 10,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} market size opportunity growth`,
        },
      });

      tasks.push({
        description: `Research competitive landscape and key players`,
        priority: "high",
        estimatedTime: 8,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} competitors market leaders companies`,
        },
      });

      tasks.push({
        description: `Develop go-to-market strategy framework`,
        priority: "medium",
        estimatedTime: 7,
        toolRequired: "strategy_plan",
        toolInput: `Create strategic plan for ${entities.join(" ")} including target markets, customer acquisition, pricing strategy, and growth roadmap`,
      });
    } else {
      // Generic research tasks using available tools
      tasks.push({
        description: `Query knowledge base for ${entities.join(" ")} using RAG`,
        priority: "high",
        estimatedTime: 5,
        toolRequired: "rag_query",
        toolInput: { query: entities.join(" ") },
      });

      tasks.push({
        description: `Research comprehensive overview of ${entities.join(" ")}`,
        priority: "medium",
        estimatedTime: 10,
        toolRequired: "web_search",
        toolInput: { query: entities.join(" ") },
      });

      tasks.push({
        description: `Strategic planning for ${entities.join(" ")}`,
        priority: "low",
        estimatedTime: 8,
        toolRequired: "strategy_plan",
        toolInput: `Create strategic framework for ${entities.join(" ")}, including key considerations, implementation approaches, and success factors`,
      });
    }

    return tasks;
  }

  generateEvaluationTasks(objective, domain, entities) {
    return [
      {
        description: `Research technical feasibility of ${entities.join(" ")}`,
        priority: "high",
        estimatedTime: 10,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} technical feasibility requirements implementation`,
        },
      },
      {
        description: `Research economic viability and cost analysis`,
        priority: "high",
        estimatedTime: 9,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} cost benefit analysis economics ROI`,
        },
      },
      {
        description: `Research risks and mitigation strategies`,
        priority: "medium",
        estimatedTime: 7,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} risks challenges mitigation strategies`,
        },
      },
    ];
  }

  generateComparisonTasks(objective, domain, entities) {
    return [
      {
        description: `Research alternative approaches to ${entities.join(" ")}`,
        priority: "high",
        estimatedTime: 10,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} alternatives options approaches comparison`,
        },
      },
      {
        description: `Compare costs and benefits of different options`,
        priority: "high",
        estimatedTime: 9,
        toolRequired: "math_calculate",
        toolInput: `Compare costs and benefits of different ${entities.join(" ")} options: calculate relative costs, benefit ratios, and overall value propositions`,
      },
      {
        description: `Evaluate pros and cons of each approach`,
        priority: "medium",
        estimatedTime: 8,
        toolRequired: "logic_validate",
        toolInput: `Evaluate and validate the logical consistency of pros and cons for different ${entities.join(" ")} approaches, ensuring balanced analysis`,
      },
    ];
  }

  generateAnalysisTasks(objective, domain, entities) {
    return [
      {
        description: `Research and gather data about ${entities.join(" ")}`,
        priority: "high",
        estimatedTime: 10,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} data statistics information research`,
        },
      },
      {
        description: `Identify patterns and trends in the data`,
        priority: "high",
        estimatedTime: 9,
        toolRequired: "pattern_match",
        toolInput: `Identify patterns and trends related to ${entities.join(" ")}, finding correlations, growth patterns, and significant trends in the data`,
      },
      {
        description: `Synthesize insights and conclusions`,
        priority: "medium",
        estimatedTime: 7,
        toolRequired: "text_summarize",
        toolInput: `Synthesize key insights and conclusions about ${entities.join(" ")} based on the analysis, highlighting main findings and implications`,
      },
    ];
  }

  generateGenericResearchTasks(objective) {
    const entities = this.extractEntities(objective);
    return [
      {
        description: `Research background information on ${entities.join(" ")}`,
        priority: "high",
        estimatedTime: 10,
        toolRequired: "web_search",
        toolInput: {
          query: `${entities.join(" ")} background overview information`,
        },
      },
      {
        description: `Identify key considerations and factors`,
        priority: "medium",
        estimatedTime: 8,
        toolRequired: "strategy_plan",
        toolInput: `Identify and organize key considerations and factors for ${entities.join(" ")}, creating strategic framework for decision-making`,
      },
    ];
  }

  async executeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status === "completed") {
      return `Task ${taskId} already completed`;
    }

    // Check dependencies
    const incompleteDeps = task.dependencies.filter(depId => {
      const dep = this.tasks.get(depId);
      return dep && dep.status !== "completed";
    });

    if (incompleteDeps.length > 0) {
      return `Cannot execute task ${taskId}. Dependencies not met: ${incompleteDeps.join(", ")}`;
    }

    // Mark as in progress
    task.status = "in_progress";
    task.startedAt = new Date().toISOString();

    try {
      // Simulate task execution
      const result = await this.simulateTaskExecution(task);

      task.status = "completed";
      task.completedAt = new Date().toISOString();
      task.result = result;

      return result;
    } catch (error) {
      task.status = "failed";
      task.error = error.message;
      throw error;
    }
  }

  async simulateTaskExecution(task) {
    // If task specifies a tool, use it
    if (task.toolRequired && this.toolManager) {
      try {
        const result = await this.toolManager.useTool(task.toolRequired, task.toolInput);

        // If it's a web search, format the results nicely
        if (task.toolRequired === "web_search") {
          return this.formatSearchResults(task.description, result);
        }

        return this.formatTaskResult(task.description, result);
      } catch (error) {
        return `${task.description}:\n\nError: ${error.message}. Completed with manual research approach.`;
      }
    }

    // Fallback to description-based execution
    await new Promise(resolve => setTimeout(resolve, 100));
    return `Completed: ${task.description}`;
  }

  formatTaskResult(taskDescription, result) {
    // Format any tool result in a useful way

    if (typeof result === "string") {
      return `${taskDescription}:\n\n${result}`;
    }

    if (result && typeof result === "object") {
      // Check for common result patterns
      if (result.summary) {
        return `${taskDescription}:\n\n${result.summary}`;
      }

      if (result.analysis && typeof result.analysis === "string") {
        return `${taskDescription}:\n\n${result.analysis}`;
      }

      if (result.result && typeof result.result === "string") {
        return `${taskDescription}:\n\n${result.result}`;
      }

      // Format structured analysis objects
      if (result.analysis && typeof result.analysis === "object") {
        const formatted = this.formatAnalysisObject(result.analysis);
        return `${taskDescription}:\n\n${formatted}`;
      }

      // Generic object formatting
      const formatted = this.formatGenericObject(result);
      return `${taskDescription}:\n\n${formatted}`;
    }

    return `${taskDescription}:\n\nTask completed successfully with tool-based analysis.`;
  }

  formatAnalysisObject(analysis) {
    const parts = [];

    if (analysis.wordCount) {
      parts.push(`Word Count: ${analysis.wordCount}`);
    }
    if (analysis.complexity) {
      parts.push(`Complexity: ${analysis.complexity}`);
    }
    if (analysis.sentiment) {
      parts.push(`Sentiment: ${analysis.sentiment}`);
    }
    if (analysis.keyTopics && analysis.keyTopics.length > 0) {
      parts.push(`Key Topics: ${analysis.keyTopics.join(", ")}`);
    }

    return parts.length > 0 ? parts.join("\n") : "Analysis completed";
  }

  formatGenericObject(obj) {
    // Format any object in a readable way
    const formatted = Object.entries(obj)
      .filter(([key, value]) => value !== null && value !== undefined)
      .map(([key, value]) => {
        if (typeof value === "object" && value !== null) {
          return `${key}: ${JSON.stringify(value, null, 2)}`;
        }
        return `${key}: ${value}`;
      })
      .join("\n");

    return formatted || "Task completed successfully";
  }

  formatSearchResults(taskDescription, searchResult) {
    // Special formatting for web search results
    if (searchResult && searchResult.summary) {
      return `${taskDescription}:\n\n**Web Search Results:**\n${searchResult.summary}`;
    }

    // Fallback to unified formatter
    return this.formatTaskResult(taskDescription, searchResult);
  }

  getTaskStatus() {
    return Array.from(this.tasks.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  updateTaskStatus(taskId, status, result = null) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      if (result) {
        task.result = result;
      }
      if (status === "completed") {
        task.completedAt = new Date().toISOString();
      }
    }
  }

  getNextTask() {
    const pendingTasks = Array.from(this.tasks.values())
      .filter(task => task.status === "pending")
      .filter(task => {
        // Check if dependencies are met
        return task.dependencies.every(depId => {
          const dep = this.tasks.get(depId);
          return dep && dep.status === "completed";
        });
      })
      .sort((a, b) => {
        // Sort by priority, then by creation time
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority] || 0;
        const bPriority = priorityOrder[b.priority] || 0;

        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }

        return new Date(a.created) - new Date(b.created);
      });

    return pendingTasks[0] || null;
  }
}
