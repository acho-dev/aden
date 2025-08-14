export class PlanTask {
  constructor(data = {}) {
    this.id = data.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.description = data.description || "";
    this.type = data.type || "general";
    this.priority = data.priority || "medium";
    this.dependencies = Array.isArray(data.dependencies) ? data.dependencies : [];
    this.estimatedDuration = data.estimatedDuration || null;
    // Handle both toolsRequired and tools_needed field names for compatibility
    this.toolsRequired = Array.isArray(data.toolsRequired) 
      ? data.toolsRequired 
      : Array.isArray(data.tools_needed) 
      ? data.tools_needed 
      : [];
  }

  static fromJSON(json) {
    return new PlanTask(json);
  }

  toJSON() {
    return {
      id: this.id,
      description: this.description,
      type: this.type,
      priority: this.priority,
      dependencies: this.dependencies,
      estimatedDuration: this.estimatedDuration,
      toolsRequired: this.toolsRequired,
    };
  }

  isValid() {
    return this.description && this.description.trim().length > 0;
  }
}

export class InitialPlan {
  constructor(data = {}) {
    this.understanding = data.understanding || "Simple user interaction";
    this.contextAnalysis =
      data.context_analysis ||
      data.contextAnalysis ||
      "Simple request - no complex analysis needed";
    this.tasks = this._parseTasks(data.tasks || []);
    this.response = data.response || "Hello! How can I help you today?";
    this.memorySearchResults = data.memorySearchResults || [];
    this.confidence = data.confidence || 0.5;
    this.estimatedComplexity = data.estimatedComplexity || "low";
  }

  _parseTasks(tasksData) {
    if (!Array.isArray(tasksData)) {
      return [];
    }

    return tasksData
      .map(taskData => {
        if (taskData instanceof PlanTask) {
          return taskData;
        }
        return PlanTask.fromJSON(taskData);
      })
      .filter(task => task.isValid());
  }

  static fromJSON(json) {
    if (!json || typeof json !== "object") {
      return new InitialPlan();
    }
    return new InitialPlan(json);
  }

  static fromLLMResponse(llmResponse, fallbackData = {}) {
    try {
      if (typeof llmResponse === "object") {
        return InitialPlan.fromJSON(llmResponse);
      }

      if (typeof llmResponse === "string") {
        const parsed = JSON.parse(llmResponse);
        return InitialPlan.fromJSON(parsed);
      }

      throw new Error("Invalid LLM response format");
    } catch (error) {
      console.warn("Failed to parse LLM response as InitialPlan:", error.message);
      return new InitialPlan(fallbackData);
    }
  }

  toJSON() {
    return {
      understanding: this.understanding,
      context_analysis: this.contextAnalysis,
      tasks: this.tasks.map(task => task.toJSON()),
      response: this.response,
      memorySearchResults: this.memorySearchResults,
      confidence: this.confidence,
      estimatedComplexity: this.estimatedComplexity,
    };
  }
}

export class GapAnalysis {
  constructor(data = {}) {
    this.action = data.action || "ASK_CLARIFICATION";
    this.confidence = data.confidence || 0.5;
    this.understanding = data.understanding || "No understanding provided";
    this.reasoning = data.reasoning || "No reasoning provided";
    this.questions = Array.isArray(data.questions) ? data.questions : [];
  }

  static fromJSON(json) {
    if (!json || typeof json !== "object") {
      return new GapAnalysis();
    }
    return new GapAnalysis(json);
  }

  toJSON() {
    return {
      action: this.action,
      confidence: this.confidence,
      understanding: this.understanding,
      reasoning: this.reasoning,
      questions: this.questions,
    };
  }
}

export class TaskExecution {
  constructor(data = {}) {
    this.toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls : [];
    this.toolResults = Array.isArray(data.toolResults) ? data.toolResults : [];
    this.facts = Array.isArray(data.facts) ? data.facts : [];
    this.taskCompleted = data.taskCompleted || false;
  }

  static fromJSON(json) {
    if (!json || typeof json !== "object") {
      return new TaskExecution();
    }
    return new TaskExecution(json);
  }
}

export class ExecutionResult {
  constructor(data = {}) {
    this.response = data.response;
    this.rawPrompts = data.rawPrompts || [];
    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    this.toolCalls = data.toolCalls || [];
    this.toolResults = data.toolResults || [];
    this.knowledgeGraph = data.knowledgeGraph || {};
    this.dataOnboardingResults = data.dataOnboardingResults || null;
    this.metadata = data.metadata || {};

    this._calculateUsage();
  }

  _calculateUsage() {
    for (const rawPrompt of this.rawPrompts) {
      this.usage.inputTokens += rawPrompt.response.usage.inputTokens || 0;
      this.usage.outputTokens += rawPrompt.response.usage.outputTokens || 0;
      this.usage.totalTokens += rawPrompt.response.usage.totalTokens || 0;
    }
  }
}
