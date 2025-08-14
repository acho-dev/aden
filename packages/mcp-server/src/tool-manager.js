import fetch from "node-fetch";
import * as cheerio from "cheerio";

export class ToolManager {
  constructor() {
    this.tools = new Map();
    this.toolUsageHistory = [];
    this.registerBuiltinTools();
  }

  registerBuiltinTools() {
    // Text processing tools
    this.registerTool({
      name: "text_analyze",
      description: "Analyze text for patterns, sentiment, or structure",
      category: "text",
      execute: this.analyzeText.bind(this),
    });

    this.registerTool({
      name: "text_summarize",
      description: "Summarize long text into key points",
      category: "text",
      execute: this.summarizeText.bind(this),
    });

    // Data processing tools
    this.registerTool({
      name: "data_validate",
      description: "Validate data structure and content",
      category: "data",
      execute: this.validateData.bind(this),
    });

    this.registerTool({
      name: "data_transform",
      description: "Transform data from one format to another",
      category: "data",
      execute: this.transformData.bind(this),
    });

    // Logic and reasoning tools
    this.registerTool({
      name: "logic_validate",
      description: "Validate logical consistency of arguments or reasoning",
      category: "logic",
      execute: this.validateLogic.bind(this),
    });

    this.registerTool({
      name: "pattern_match",
      description: "Find patterns in data or text",
      category: "analysis",
      execute: this.findPatterns.bind(this),
    });

    // Math and calculation tools
    this.registerTool({
      name: "math_calculate",
      description: "Perform mathematical calculations",
      category: "math",
      execute: this.performCalculation.bind(this),
    });

    // Planning and strategy tools
    this.registerTool({
      name: "strategy_plan",
      description: "Create strategic plans for complex objectives",
      category: "planning",
      execute: this.createStrategicPlan.bind(this),
    });

    // Web search and data retrieval tools
    this.registerTool({
      name: "web_search",
      description: "Search the web for current information and data",
      category: "research",
      execute: this.searchWeb.bind(this),
    });

    this.registerTool({
      name: "data_fetch",
      description: "Fetch and analyze data from web sources",
      category: "research",
      execute: this.fetchWebData.bind(this),
    });

    this.registerTool({
      name: "knowledge_search",
      description: "Search internal knowledge base for relevant information",
      category: "research",
      execute: this.searchKnowledgeBase.bind(this),
    });

    // RAG Query tool
    this.registerTool({
      name: "rag_query",
      description: "Query indexed documents to find relevant information using RAG (Retrieval Augmented Generation) system",
      category: "research",
      execute: this.ragQuery.bind(this),
    });
  }

  registerTool(tool) {
    if (!tool.name || !tool.execute) {
      throw new Error("Tool must have name and execute function");
    }

    this.tools.set(tool.name, {
      ...tool,
      registeredAt: new Date().toISOString(),
      usageCount: 0,
    });
  }

  async useTool(toolName, input, context = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    const usage = {
      toolName,
      input,
      context,
      startTime: new Date().toISOString(),
      status: "running",
    };

    this.toolUsageHistory.push(usage);
    tool.usageCount++;

    try {
      const result = await tool.execute(input, context);
      usage.result = result;
      usage.status = "completed";
      usage.endTime = new Date().toISOString();
      usage.duration = new Date(usage.endTime) - new Date(usage.startTime);

      return result;
    } catch (error) {
      usage.error = error.message;
      usage.status = "failed";
      usage.endTime = new Date().toISOString();
      throw error;
    }
  }

  getAvailableTools() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      usageCount: tool.usageCount,
    }));
  }

  getToolsByCategory(category) {
    return Array.from(this.tools.values()).filter(tool => tool.category === category);
  }

  recommendTools(objective) {
    const lower = objective.toLowerCase();
    const recommendations = [];

    // Text-related objectives
    if (lower.includes("text") || lower.includes("content") || lower.includes("document")) {
      recommendations.push(...this.getToolsByCategory("text"));
    }

    // Data-related objectives
    if (lower.includes("data") || lower.includes("information") || lower.includes("process")) {
      recommendations.push(...this.getToolsByCategory("data"));
    }

    // Analysis objectives
    if (lower.includes("analyze") || lower.includes("pattern") || lower.includes("find")) {
      recommendations.push(...this.getToolsByCategory("analysis"));
    }

    // Planning objectives
    if (lower.includes("plan") || lower.includes("strategy") || lower.includes("organize")) {
      recommendations.push(...this.getToolsByCategory("planning"));
    }

    // Logic and reasoning
    if (lower.includes("logic") || lower.includes("reason") || lower.includes("validate")) {
      recommendations.push(...this.getToolsByCategory("logic"));
    }

    // Math and calculations
    if (lower.includes("calculate") || lower.includes("math") || lower.includes("compute")) {
      recommendations.push(...this.getToolsByCategory("math"));
    }

    // Research and documentation queries
    if (lower.includes("rag") || lower.includes("document") || lower.includes("indexed") || lower.includes("search")) {
      recommendations.push(...this.getToolsByCategory("research"));
    }

    return recommendations.length > 0 ? recommendations : this.getPopularTools();
  }

  getPopularTools() {
    return Array.from(this.tools.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5);
  }

  // Built-in tool implementations
  async analyzeText(input, context) {
    const text = input.text || input;
    const analysis = {
      wordCount: text.split(/\s+/).length,
      characterCount: text.length,
      sentences: text.split(/[.!?]+/).filter(s => s.trim().length > 0).length,
      paragraphs: text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length,
      complexity: this.assessTextComplexity(text),
      sentiment: this.analyzeSentiment(text),
      keyTopics: this.extractKeyTopics(text),
    };

    return {
      analysis,
      summary: this.formatTextAnalysis(analysis),
    };
  }

  assessTextComplexity(text) {
    const avgWordsPerSentence = text.split(/\s+/).length / Math.max(1, text.split(/[.!?]+/).length);
    const longWords = text.split(/\s+/).filter(word => word.length > 6).length;
    const totalWords = text.split(/\s+/).length;
    const longWordRatio = longWords / totalWords;

    if (avgWordsPerSentence > 20 || longWordRatio > 0.3) return "high";
    if (avgWordsPerSentence > 15 || longWordRatio > 0.2) return "medium";
    return "low";
  }

  analyzeSentiment(text) {
    const positiveWords = [
      "good",
      "great",
      "excellent",
      "positive",
      "success",
      "achievement",
      "happy",
      "wonderful",
    ];
    const negativeWords = [
      "bad",
      "poor",
      "terrible",
      "negative",
      "failure",
      "problem",
      "sad",
      "awful",
    ];

    const words = text.toLowerCase().split(/\W+/);
    const positiveCount = words.filter(word => positiveWords.includes(word)).length;
    const negativeCount = words.filter(word => negativeWords.includes(word)).length;

    if (positiveCount > negativeCount) return "positive";
    if (negativeCount > positiveCount) return "negative";
    return "neutral";
  }

  extractKeyTopics(text) {
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3)
      .filter(
        word =>
          ![
            "this",
            "that",
            "with",
            "have",
            "will",
            "from",
            "they",
            "been",
            "were",
            "said",
            "each",
            "which",
            "their",
            "time",
            "would",
            "there",
            "could",
            "other",
          ].includes(word)
      );

    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  formatTextAnalysis(analysis) {
    return `Text Analysis Results:
- ${analysis.wordCount} words, ${analysis.sentences} sentences, ${analysis.paragraphs} paragraphs
- Complexity: ${analysis.complexity}
- Sentiment: ${analysis.sentiment}
- Key topics: ${analysis.keyTopics.join(", ")}`;
  }

  async summarizeText(input, context) {
    const text = input.text || input;
    const maxLength = context.maxLength || 200;

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const keyTopics = this.extractKeyTopics(text);

    // Simple extractive summarization
    const scoredSentences = sentences.map(sentence => ({
      sentence: sentence.trim(),
      score: this.scoreSentence(sentence, keyTopics),
    }));

    scoredSentences.sort((a, b) => b.score - a.score);

    let summary = "";
    let currentLength = 0;

    for (const item of scoredSentences) {
      if (currentLength + item.sentence.length > maxLength) break;
      if (summary) summary += ". ";
      summary += item.sentence;
      currentLength = summary.length;
    }

    return {
      summary: summary || sentences[0] || "Unable to generate summary",
      originalLength: text.length,
      summaryLength: summary.length,
      compressionRatio: Math.round((summary.length / text.length) * 100),
    };
  }

  scoreSentence(sentence, keyTopics) {
    const words = sentence.toLowerCase().split(/\W+/);
    let score = 0;

    // Score based on key topic presence
    keyTopics.forEach(topic => {
      if (words.includes(topic)) score += 2;
    });

    // Prefer sentences that are not too short or too long
    if (sentence.length > 20 && sentence.length < 150) score += 1;

    // Boost sentences with numbers or specific indicators
    if (/\d+/.test(sentence)) score += 0.5;
    if (/important|key|main|primary|significant/.test(sentence.toLowerCase())) score += 1;

    return score;
  }

  async validateData(input, context) {
    const data = input.data || input;
    const schema = context.schema;

    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      statistics: {},
    };

    // Basic data structure validation
    if (Array.isArray(data)) {
      validation.statistics.type = "array";
      validation.statistics.length = data.length;
      validation.statistics.isEmpty = data.length === 0;
    } else if (typeof data === "object" && data !== null) {
      validation.statistics.type = "object";
      validation.statistics.keys = Object.keys(data);
      validation.statistics.isEmpty = Object.keys(data).length === 0;
    } else {
      validation.statistics.type = typeof data;
      validation.statistics.value = data;
    }

    // Schema validation if provided
    if (schema) {
      try {
        this.validateAgainstSchema(data, schema, validation);
      } catch (error) {
        validation.errors.push(`Schema validation error: ${error.message}`);
        validation.isValid = false;
      }
    }

    return validation;
  }

  validateAgainstSchema(data, schema, validation) {
    // Simple schema validation implementation
    if (schema.type && typeof data !== schema.type) {
      validation.errors.push(`Expected type ${schema.type}, got ${typeof data}`);
      validation.isValid = false;
    }

    if (schema.required && Array.isArray(schema.required)) {
      schema.required.forEach(field => {
        if (!(field in data)) {
          validation.errors.push(`Required field '${field}' is missing`);
          validation.isValid = false;
        }
      });
    }
  }

  async transformData(input, context) {
    const data = input.data || input;
    const transformation = context.transformation || "normalize";

    switch (transformation) {
      case "normalize":
        return this.normalizeData(data);
      case "flatten":
        return this.flattenData(data);
      case "group":
        return this.groupData(data, context.groupBy);
      default:
        throw new Error(`Unknown transformation: ${transformation}`);
    }
  }

  normalizeData(data) {
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeItem(item));
    }
    return this.normalizeItem(data);
  }

  normalizeItem(item) {
    if (typeof item === "string") {
      return item.trim().toLowerCase();
    }
    if (typeof item === "object" && item !== null) {
      const normalized = {};
      Object.keys(item).forEach(key => {
        normalized[key.toLowerCase()] = this.normalizeItem(item[key]);
      });
      return normalized;
    }
    return item;
  }

  flattenData(data, prefix = "") {
    const flattened = {};

    Object.keys(data).forEach(key => {
      const value = data[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenData(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    });

    return flattened;
  }

  groupData(data, groupBy) {
    if (!Array.isArray(data)) {
      throw new Error("Data must be an array for grouping");
    }

    const grouped = {};
    data.forEach(item => {
      const key = item[groupBy] || "undefined";
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(item);
    });

    return grouped;
  }

  async validateLogic(input, context) {
    const statements = input.statements || input;
    const validation = {
      isValid: true,
      contradictions: [],
      gaps: [],
      strength: "medium",
    };

    // Simple logical consistency checking
    if (Array.isArray(statements)) {
      validation.contradictions = this.findContradictions(statements);
      validation.gaps = this.findLogicalGaps(statements);
      validation.isValid = validation.contradictions.length === 0;
      validation.strength = this.assessLogicalStrength(statements, validation);
    }

    return validation;
  }

  findContradictions(statements) {
    const contradictions = [];
    const normalized = statements.map(s => s.toLowerCase().trim());

    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        if (this.areContradictory(normalized[i], normalized[j])) {
          contradictions.push({
            statement1: statements[i],
            statement2: statements[j],
            reason: "Potential logical contradiction detected",
          });
        }
      }
    }

    return contradictions;
  }

  areContradictory(stmt1, stmt2) {
    // Simple contradiction detection
    const negationWords = ["not", "no", "never", "cannot", "impossible"];
    const hasNegation1 = negationWords.some(word => stmt1.includes(word));
    const hasNegation2 = negationWords.some(word => stmt2.includes(word));

    // If one has negation and they share similar content, might be contradictory
    if (hasNegation1 !== hasNegation2) {
      const words1 = stmt1.split(/\W+/).filter(w => w.length > 2 && !negationWords.includes(w));
      const words2 = stmt2.split(/\W+/).filter(w => w.length > 2 && !negationWords.includes(w));
      const commonWords = words1.filter(w => words2.includes(w));
      return commonWords.length >= 2;
    }

    return false;
  }

  findLogicalGaps(statements) {
    // Simple gap detection - look for missing connecting statements
    const gaps = [];

    if (statements.length > 2) {
      gaps.push({
        type: "missing_connection",
        description: "Consider adding connecting statements to strengthen logical flow",
      });
    }

    return gaps;
  }

  assessLogicalStrength(statements, validation) {
    if (validation.contradictions.length > 0) return "weak";
    if (statements.length < 2) return "insufficient";
    if (statements.length > 5 && validation.gaps.length === 0) return "strong";
    return "medium";
  }

  async findPatterns(input, context) {
    const data = input.data || input;
    const patternType = context.patternType || "auto";

    const patterns = {
      found: [],
      type: patternType,
      confidence: 0,
    };

    if (typeof data === "string") {
      patterns.found = this.findTextPatterns(data);
    } else if (Array.isArray(data)) {
      patterns.found = this.findArrayPatterns(data);
    } else {
      patterns.found = this.findObjectPatterns(data);
    }

    patterns.confidence = this.calculatePatternConfidence(patterns.found);
    return patterns;
  }

  findTextPatterns(text) {
    const patterns = [];

    // Email patterns
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex);
    if (emails) {
      patterns.push({ type: "email", matches: emails, count: emails.length });
    }

    // URL patterns
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex);
    if (urls) {
      patterns.push({ type: "url", matches: urls, count: urls.length });
    }

    // Date patterns
    const dateRegex = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
    const dates = text.match(dateRegex);
    if (dates) {
      patterns.push({ type: "date", matches: dates, count: dates.length });
    }

    return patterns;
  }

  findArrayPatterns(data) {
    const patterns = [];

    // Check for sequence patterns
    if (data.every(item => typeof item === "number")) {
      const isSequential = this.isSequential(data);
      if (isSequential) {
        patterns.push({
          type: "sequential",
          description: "Sequential numeric pattern detected",
        });
      }
    }

    // Check for repeated values
    const frequency = {};
    data.forEach(item => {
      const key = JSON.stringify(item);
      frequency[key] = (frequency[key] || 0) + 1;
    });

    const repeatedItems = Object.entries(frequency).filter(([, count]) => count > 1);
    if (repeatedItems.length > 0) {
      patterns.push({ type: "repetition", items: repeatedItems });
    }

    return patterns;
  }

  isSequential(numbers) {
    if (numbers.length < 2) return false;
    const diff = numbers[1] - numbers[0];
    for (let i = 2; i < numbers.length; i++) {
      if (numbers[i] - numbers[i - 1] !== diff) return false;
    }
    return true;
  }

  findObjectPatterns(data) {
    const patterns = [];

    if (typeof data === "object" && data !== null) {
      const keys = Object.keys(data);
      patterns.push({
        type: "structure",
        keyCount: keys.length,
        keys: keys,
        dataTypes: keys.map(key => ({ key, type: typeof data[key] })),
      });
    }

    return patterns;
  }

  calculatePatternConfidence(patterns) {
    if (patterns.length === 0) return 0;
    if (patterns.length === 1) return 0.7;
    if (patterns.length >= 3) return 0.9;
    return 0.8;
  }

  async performCalculation(input, context) {
    const expression = input.expression || input;
    const operation = context.operation || "auto";

    try {
      // Simple math evaluation (in real implementation, use a proper math parser)
      const result = this.evaluateExpression(expression);

      return {
        expression,
        result,
        operation,
        isValid: true,
      };
    } catch (error) {
      return {
        expression,
        result: null,
        operation,
        isValid: false,
        error: error.message,
      };
    }
  }

  evaluateExpression(expr) {
    // Simple math evaluation - in production, use a proper math parser library
    const sanitized = expr.replace(/[^0-9+\-*/().\s]/g, "");

    if (sanitized !== expr) {
      throw new Error("Invalid characters in expression");
    }

    try {
      // This is a simplified approach - use a proper math library in production
      return Function(`"use strict"; return (${sanitized})`)();
    } catch (error) {
      throw new Error("Invalid mathematical expression");
    }
  }

  async createStrategicPlan(input, context) {
    const objective = input.objective || input;
    const timeframe = context.timeframe || "medium";

    const plan = {
      objective,
      timeframe,
      phases: this.generateStrategicPhases(objective, timeframe),
      resources: this.identifyRequiredResources(objective),
      risks: this.identifyStrategicRisks(objective),
      success_metrics: this.defineSuccessMetrics(objective),
    };

    return plan;
  }

  generateStrategicPhases(objective, timeframe) {
    const basePhases = [
      "Analysis and Planning",
      "Resource Allocation",
      "Implementation",
      "Monitoring and Adjustment",
      "Evaluation and Optimization",
    ];

    const timeMultipliers = {
      short: 0.5,
      medium: 1,
      long: 1.5,
    };

    const multiplier = timeMultipliers[timeframe] || 1;

    return basePhases.map((phase, index) => ({
      name: phase,
      order: index + 1,
      estimatedDuration: Math.ceil((index + 2) * multiplier),
      dependencies: index > 0 ? [basePhases[index - 1]] : [],
    }));
  }

  identifyRequiredResources(objective) {
    const lower = objective.toLowerCase();
    const resources = ["time", "focus"];

    if (lower.includes("develop") || lower.includes("build") || lower.includes("create")) {
      resources.push("development tools", "technical expertise");
    }
    if (lower.includes("research") || lower.includes("analyze")) {
      resources.push("information sources", "analytical tools");
    }
    if (lower.includes("team") || lower.includes("collaborate")) {
      resources.push("team coordination", "communication tools");
    }

    return resources;
  }

  identifyStrategicRisks(objective) {
    return [
      { risk: "Scope creep", probability: "medium", impact: "high" },
      { risk: "Resource constraints", probability: "medium", impact: "medium" },
      { risk: "Technical complexity", probability: "low", impact: "high" },
      { risk: "Timeline pressure", probability: "high", impact: "medium" },
    ];
  }

  defineSuccessMetrics(objective) {
    return [
      "Objective completion within timeline",
      "Quality standards met",
      "Resource utilization efficiency",
      "Stakeholder satisfaction",
    ];
  }

  getToolUsageHistory() {
    return this.toolUsageHistory;
  }

  getToolUsageStats() {
    const stats = {
      totalUsage: this.toolUsageHistory.length,
      successRate: 0,
      mostUsedTools: [],
      averageDuration: 0,
    };

    if (this.toolUsageHistory.length > 0) {
      const successful = this.toolUsageHistory.filter(usage => usage.status === "completed");
      stats.successRate = (successful.length / this.toolUsageHistory.length) * 100;

      const durations = this.toolUsageHistory
        .filter(usage => usage.duration)
        .map(usage => usage.duration);

      if (durations.length > 0) {
        stats.averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      }

      const toolFrequency = {};
      this.toolUsageHistory.forEach(usage => {
        toolFrequency[usage.toolName] = (toolFrequency[usage.toolName] || 0) + 1;
      });

      stats.mostUsedTools = Object.entries(toolFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
    }

    return stats;
  }

  // Web search and data retrieval implementations
  async searchWeb(input, context) {
    const query = input.query || input;

    try {
      // Perform real web search
      const searchResults = await this.performRealWebSearch(query);

      return {
        query,
        results: searchResults,
        summary: this.summarizeSearchResults(searchResults),
        timestamp: new Date().toISOString(),
        searchType: "real",
      };
    } catch (error) {
      return {
        query,
        error: error.message,
        summary: `Unable to search for "${query}": ${error.message}`,
        searchType: "error",
      };
    }
  }

  async fetchWebData(input, context) {
    const url = input.url || input;

    try {
      // Perform real web data fetching
      const data = await this.performRealDataFetch(url);

      return {
        url,
        data,
        analysis: this.analyzeWebData(data),
        timestamp: new Date().toISOString(),
        fetchType: "real",
      };
    } catch (error) {
      return {
        url,
        error: error.message,
        summary: `Unable to fetch data from "${url}": ${error.message}`,
        fetchType: "error",
      };
    }
  }

  async searchKnowledgeBase(input, context) {
    const query = input.query || input;
    const k = input.k || 10;

    // Get configuration from environment variables
    const adenHost = process.env.ADEN_HOST || "http://localhost:8888";
    const adenApiToken = process.env.ADEN_API_TOKEN;

    if (!adenApiToken) {
      return {
        query,
        error: "ADEN_API_TOKEN environment variable not set",
        summary: `Unable to search knowledge base for "${query}": API token not configured`,
        searchType: "error",
      };
    }

    try {
      // Extract keywords from the query
      const keywords = this.extractKeywords(query);

      // If only one keyword or short query, use original behavior
      if (keywords.length <= 1 || query.length < 10) {
        return await this.performSingleKnowledgeSearch(adenHost, adenApiToken, query, k);
      }

      // Perform individual searches for each keyword
      const keywordResults = await Promise.all(
        keywords.map(keyword =>
          this.performSingleKnowledgeSearch(
            adenHost,
            adenApiToken,
            keyword,
            Math.max(3, Math.floor(k / keywords.length))
          )
        )
      );

      // Combine and deduplicate results
      const combinedResults = this.combineAndDeduplicateResults(keywordResults, query, k);

      return {
        query,
        results: combinedResults.results,
        total_results: combinedResults.total_results,
        summary: this.summarizeKnowledgeResults(combinedResults.results, query),
        timestamp: new Date().toISOString(),
        searchType: "multi_keyword_knowledge_base",
        search_metadata: {
          keywords_used: keywords,
          individual_searches: keywordResults.length,
          original_total_results: keywordResults.reduce((sum, r) => sum + r.total_results, 0),
        },
      };
    } catch (error) {
      return {
        query,
        error: error.message,
        summary: `Unable to search knowledge base for "${query}": ${error.message}`,
        searchType: "error",
      };
    }
  }

  extractKeywords(query) {
    // Remove common stop words and extract meaningful keywords
    const stopWords = new Set([
      "the",
      "is",
      "at",
      "which",
      "on",
      "and",
      "or",
      "but",
      "in",
      "with",
      "a",
      "an",
      "as",
      "are",
      "was",
      "were",
      "been",
      "be",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "can",
      "to",
      "of",
      "for",
      "by",
      "from",
      "up",
      "about",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "between",
      "among",
      "within",
      "without",
      "under",
      "over",
    ]);

    // Split by whitespace and punctuation, filter out stop words and short terms
    return query
      .toLowerCase()
      .split(/[\s\-_,\.;:!?\(\)\[\]{}'"]+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter((word, index, arr) => arr.indexOf(word) === index); // deduplicate
  }

  async performSingleKnowledgeSearch(adenHost, adenApiToken, searchQuery, k) {
    const apiUrl = `${adenHost}/erp/vector-store/search`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `jwt ${adenApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        k: k,
      }),
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`Knowledge base API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      query: searchQuery,
      results: data.results || [],
      total_results: data.total_results || 0,
      search_metadata: data.search_metadata || {},
    };
  }

  combineAndDeduplicateResults(keywordResults, originalQuery, maxResults) {
    const allResults = [];
    const seenIds = new Set();

    // Combine all results from keyword searches
    keywordResults.forEach(searchResult => {
      if (searchResult.results) {
        searchResult.results.forEach(result => {
          // Use a combination of fields to create a unique identifier
          const uniqueId =
            result._aden_id ||
            result.original_row_id ||
            result.original_table_name + "_" + (result.id || JSON.stringify(result).slice(0, 50));

          if (!seenIds.has(uniqueId)) {
            seenIds.add(uniqueId);
            // Add keyword relevance boost based on original query
            const relevanceBoost = this.calculateQueryRelevance(result, originalQuery);
            allResults.push({
              ...result,
              combined_relevance: (result.relevance || 0.5) + relevanceBoost,
            });
          }
        });
      }
    });

    // Sort by combined relevance and limit results
    const sortedResults = allResults
      .sort((a, b) => (b.combined_relevance || 0) - (a.combined_relevance || 0))
      .slice(0, maxResults);

    return {
      results: sortedResults,
      total_results: allResults.length,
    };
  }

  calculateQueryRelevance(result, originalQuery) {
    const queryLower = originalQuery.toLowerCase();
    let relevanceBoost = 0;

    // Check if result content contains query terms
    const contentText = (result.content || result.text || "").toLowerCase();
    const titleText = (result.original_table_name || result.title || "").toLowerCase();

    // Boost for exact phrase matches
    if (contentText.includes(queryLower)) {
      relevanceBoost += 0.3;
    }

    // Boost for individual word matches
    const queryWords = queryLower.split(/\s+/);
    const matchingWords = queryWords.filter(
      word => contentText.includes(word) || titleText.includes(word)
    );
    relevanceBoost += (matchingWords.length / queryWords.length) * 0.2;

    return relevanceBoost;
  }

  async performRealWebSearch(query) {
    try {
      // Use DuckDuckGo Instant Answer API (free, no key required)
      const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 10000,
      });

      if (!response.ok) {
        throw new Error(`Search API returned ${response.status}`);
      }

      const data = await response.json();
      const results = [];

      // Parse DuckDuckGo results
      if (data.Abstract) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || "#",
          snippet: data.Abstract,
          relevance: 0.9,
          source: data.AbstractSource || "DuckDuckGo",
        });
      }

      // Add related topics
      if (data.RelatedTopics) {
        data.RelatedTopics.slice(0, 4).forEach((topic, index) => {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(" - ")[0] || `Related: ${query}`,
              url: topic.FirstURL,
              snippet: topic.Text,
              relevance: 0.8 - index * 0.1,
              source: "DuckDuckGo Related",
            });
          }
        });
      }

      // If no results from DuckDuckGo, try alternate search
      if (results.length === 0) {
        return await this.fallbackSearch(query);
      }

      return results;
    } catch (error) {
      console.warn(`Real web search failed: ${error.message}`);
      return await this.fallbackSearch(query);
    }
  }

  async fallbackSearch(query) {
    // Fallback to web scraping of search engines
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 15000,
      });

      if (!response.ok) {
        throw new Error(`Fallback search returned ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const results = [];

      // Parse DuckDuckGo HTML results
      $(".result").each((index, element) => {
        if (index >= 5) return false; // Limit to 5 results

        const $el = $(element);
        const title = $el.find(".result__title a").text().trim();
        const url = $el.find(".result__title a").attr("href");
        const snippet = $el.find(".result__snippet").text().trim();

        if (title && url) {
          results.push({
            title,
            url: url.startsWith("//") ? `https:${url}` : url,
            snippet: snippet || "No description available",
            relevance: 0.8 - index * 0.1,
            source: "Web Search",
          });
        }
      });

      return results.length > 0 ? results : this.generateFallbackResults(query);
    } catch (error) {
      console.warn(`Fallback search failed: ${error.message}`);
      return this.generateFallbackResults(query);
    }
  }

  generateFallbackResults(query) {
    // Generate informative fallback when real search fails
    return [
      {
        title: `Search Results for: ${query}`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: `Real-time web search is temporarily unavailable. You can search manually for "${query}" using the provided link.`,
        relevance: 0.5,
        source: "Fallback",
        note: "Manual search required",
      },
    ];
  }

  summarizeSearchResults(results) {
    if (!results || results.length === 0) {
      return "No search results found.";
    }

    const summary = results
      .map((result, index) => `${index + 1}. **${result.title}**\n   ${result.snippet}`)
      .join("\n\n");

    return `Found ${results.length} relevant results:\n\n${summary}`;
  }

  summarizeKnowledgeResults(results, query) {
    if (!results || results.length === 0) {
      return `No internal knowledge found for "${query}".`;
    }

    const summary = results
      .map((result, index) => {
        const content = result.chunk_content;
        const tableName = result.original_table_name;
        const adenId = result.original_row_id; // This will be used as _aden_id in db queries
        const similarity = Math.round(result.cosine_similarity * 100);

        // Extract key information from chunk content
        let displayContent = "";
        if (typeof content === "object" && content !== null) {
          // Format object content nicely
          const keys = Object.keys(content);
          const relevantFields = keys.slice(0, 3); // Show first 3 fields
          displayContent = relevantFields
            .map(key => {
              const value = content[key];
              if (typeof value === "string" && value.length > 100) {
                return `${key}: ${value.substring(0, 100)}...`;
              }
              return `${key}: ${value}`;
            })
            .join(", ");

          if (keys.length > 3) {
            displayContent += ` (and ${keys.length - 3} more fields)`;
          }
        } else {
          displayContent = String(content).substring(0, 200);
          if (String(content).length > 200) {
            displayContent += "...";
          }
        }

        // Include metadata for intelligent follow-up queries - use _aden_id naming
        const metadata = `original_table_name: ${tableName}, _aden_id: ${adenId}`;

        return `${index + 1}. **${tableName}** (${similarity}% match)\n   ${displayContent}\n   Metadata: ${metadata}`;
      })
      .join("\n\n");

    return `Found ${results.length} internal records for "${query}":\n\n${summary}`;
  }

  async performRealDataFetch(url) {
    try {
      // Validate URL
      const urlObj = new URL(url);
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        throw new Error("Only HTTP and HTTPS URLs are supported");
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 15000,
        follow: 5, // Follow up to 5 redirects
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const contentLength = response.headers.get("content-length") || "unknown";

      let extractedData = {};

      if (contentType.includes("application/json")) {
        // Handle JSON data
        const jsonData = await response.json();
        extractedData = {
          type: "json",
          data: jsonData,
          structure: this.analyzeJSONStructure(jsonData),
        };
      } else if (contentType.includes("text/html")) {
        // Handle HTML data - extract key information
        const html = await response.text();
        const $ = cheerio.load(html);

        extractedData = {
          type: "html",
          title: $("title").text() || "No title",
          description: $('meta[name="description"]').attr("content") || "",
          headings: $("h1, h2, h3")
            .map((_, el) => $(el).text().trim())
            .get(),
          links: $("a[href]")
            .map((_, el) => ({
              text: $(el).text().trim(),
              href: $(el).attr("href"),
            }))
            .get()
            .slice(0, 10), // Limit to first 10 links
          textContent: $("body").text().replace(/\s+/g, " ").trim().slice(0, 1000),
        };
      } else if (contentType.includes("text/")) {
        // Handle plain text
        const text = await response.text();
        extractedData = {
          type: "text",
          content: text.slice(0, 2000), // Limit to first 2000 chars
          length: text.length,
          lines: text.split("\n").length,
        };
      } else {
        // Handle other content types
        extractedData = {
          type: "binary",
          message: `Binary content detected: ${contentType}`,
          size: contentLength,
        };
      }

      return {
        url,
        status: "success",
        statusCode: response.status,
        contentType,
        contentLength,
        extractedData,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to fetch data from ${url}: ${error.message}`);
    }
  }

  analyzeJSONStructure(data) {
    if (Array.isArray(data)) {
      return {
        type: "array",
        length: data.length,
        sampleItem: data.length > 0 ? this.analyzeJSONStructure(data[0]) : null,
      };
    } else if (typeof data === "object" && data !== null) {
      const keys = Object.keys(data);
      return {
        type: "object",
        keyCount: keys.length,
        keys: keys.slice(0, 10), // First 10 keys
        sampleValues: keys.slice(0, 3).map(key => ({
          key,
          type: typeof data[key],
          value: Array.isArray(data[key])
            ? `Array(${data[key].length})`
            : typeof data[key] === "object"
              ? "Object"
              : String(data[key]).slice(0, 50),
        })),
      };
    } else {
      return {
        type: typeof data,
        value: String(data).slice(0, 100),
      };
    }
  }

  analyzeWebData(data) {
    if (data.status !== "success") {
      return {
        summary: "Failed to fetch data",
        quality: "Failed",
        insights: ["Data fetch unsuccessful"],
      };
    }

    const { extractedData, contentType, contentLength } = data;

    let summary = `Successfully fetched ${contentLength} bytes of ${extractedData.type} data`;
    let quality = "Good";
    let insights = [];

    switch (extractedData.type) {
      case "json":
        summary = `Retrieved JSON data with ${extractedData.structure.type} structure`;
        if (extractedData.structure.type === "array") {
          insights.push(`Contains ${extractedData.structure.length} items`);
        } else if (extractedData.structure.type === "object") {
          insights.push(`Object with ${extractedData.structure.keyCount} properties`);
          insights.push(`Key fields: ${extractedData.structure.keys.slice(0, 3).join(", ")}`);
        }
        quality = "High - structured JSON data";
        break;

      case "html":
        summary = `Extracted content from HTML page: "${extractedData.title}"`;
        insights.push(`Found ${extractedData.headings.length} headings`);
        insights.push(`Contains ${extractedData.links.length} links`);
        if (extractedData.description) {
          insights.push(`Description: ${extractedData.description.slice(0, 100)}...`);
        }
        quality = "Good - structured web content";
        break;

      case "text":
        summary = `Retrieved plain text content (${extractedData.length} characters)`;
        insights.push(`${extractedData.lines} lines of text`);
        insights.push(`Preview: ${extractedData.content.slice(0, 100)}...`);
        quality = "Medium - plain text format";
        break;

      default:
        summary = `Retrieved ${extractedData.type} content`;
        insights.push("Binary or unsupported format");
        quality = "Limited - non-text content";
    }

    return {
      summary,
      structure: `${extractedData.type} data from ${contentType}`,
      quality,
      insights,
    };
  }

  async ragQuery(input, context) {
    const query = input.query || input;
    
    // Get configuration from environment variables
    const adenHost = process.env.ADEN_HOST || "http://localhost:8888";
    const adenApiToken = process.env.ADEN_API_TOKEN;

    if (!adenApiToken) {
      return {
        query,
        error: "ADEN_API_TOKEN environment variable not set",
        summary: `Unable to query RAG system for "${query}": API token not configured`,
        queryType: "error",
      };
    }

    try {
      const apiUrl = `${adenHost}/ai/rag/query`;
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `jwt ${adenApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        timeout: 60000, // 60 seconds timeout as recommended
      });

      if (!response.ok) {
        throw new Error(`RAG query API returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Format the response for MCP
      return {
        query,
        answer: result.content,
        sources: result.sources.map(s => ({
          source: s.source,
          loaderId: s.loaderId,
        })),
        responseId: result.id,
        timestamp: result.timestamp,
        tokenUsage: result.tokenUse,
        summary: this.formatRagResponse(result),
        queryType: "rag_search",
      };
    } catch (error) {
      return {
        query,
        error: error.message,
        summary: `Unable to query RAG system for "${query}": ${error.message}`,
        queryType: "error",
      };
    }
  }

  formatRagResponse(result) {
    if (!result || !result.content) {
      return "No response from RAG system.";
    }

    let summary = `**RAG Response:**\n${result.content}\n\n`;
    
    if (result.sources && result.sources.length > 0) {
      summary += `**Sources (${result.sources.length}):**\n`;
      result.sources.forEach((source, index) => {
        summary += `${index + 1}. ${source.source}\n`;
      });
    }

    if (result.tokenUse) {
      summary += `\n**Token Usage:** ${result.tokenUse.inputTokens} input, ${result.tokenUse.outputTokens} output`;
    }

    return summary;
  }
}
