export class LoopDetector {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.timeWindow = options.timeWindow || 300000; // 5 minutes
    this.executionHistory = [];
    this.loopPatterns = new Map();
    this.userHelpRequests = [];
    this.currentLoops = new Set();
  }

  recordExecution(taskId, context = {}) {
    const execution = {
      taskId,
      timestamp: Date.now(),
      context: JSON.stringify(context),
      id: `${taskId}_${Date.now()}`,
    };

    this.executionHistory.push(execution);
    this.cleanupOldExecutions();
    this.analyzeForLoops(taskId);
  }

  cleanupOldExecutions() {
    const cutoff = Date.now() - this.timeWindow;
    this.executionHistory = this.executionHistory.filter(exec => exec.timestamp > cutoff);
  }

  isInLoop(taskId, context = {}) {
    const recentExecutions = this.getRecentExecutions(taskId);

    if (recentExecutions.length >= this.maxRetries) {
      const isLoop = this.detectLoopPattern(recentExecutions);

      if (isLoop) {
        this.currentLoops.add(taskId);
        this.recordLoopPattern(taskId, recentExecutions);
        return true;
      }
    }

    return this.currentLoops.has(taskId);
  }

  getRecentExecutions(taskId) {
    const cutoff = Date.now() - this.timeWindow;
    return this.executionHistory
      .filter(exec => exec.taskId === taskId && exec.timestamp > cutoff)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.maxRetries);
  }

  detectLoopPattern(executions) {
    if (executions.length < 2) return false;

    // Check for exact repetition
    const contexts = executions.map(exec => exec.context);
    const uniqueContexts = new Set(contexts);

    // If we have fewer unique contexts than executions, we have repetition
    if (uniqueContexts.size < executions.length) {
      return true;
    }

    // Check for time-based patterns (rapid successive executions)
    const timeDiffs = [];
    for (let i = 0; i < executions.length - 1; i++) {
      timeDiffs.push(executions[i].timestamp - executions[i + 1].timestamp);
    }

    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;

    // If executions are happening too rapidly (less than 1 second apart on average)
    if (avgTimeDiff < 1000) {
      return true;
    }

    // Check for oscillating patterns
    return this.detectOscillation(executions);
  }

  detectOscillation(executions) {
    if (executions.length < 4) return false;

    // Simple oscillation detection: A -> B -> A -> B pattern
    const contexts = executions.map(exec => exec.context);

    for (let i = 0; i < contexts.length - 3; i++) {
      if (
        contexts[i] === contexts[i + 2] &&
        contexts[i + 1] === contexts[i + 3] &&
        contexts[i] !== contexts[i + 1]
      ) {
        return true;
      }
    }

    return false;
  }

  recordLoopPattern(taskId, executions) {
    const pattern = {
      taskId,
      executions: executions.map(exec => ({
        timestamp: exec.timestamp,
        context: exec.context,
      })),
      detectedAt: Date.now(),
      type: this.classifyLoopType(executions),
      severity: this.assessLoopSeverity(executions),
    };

    this.loopPatterns.set(taskId, pattern);
  }

  classifyLoopType(executions) {
    const contexts = executions.map(exec => exec.context);
    const uniqueContexts = new Set(contexts);

    if (uniqueContexts.size === 1) {
      return "exact_repetition";
    } else if (uniqueContexts.size === 2) {
      return "oscillation";
    } else if (this.detectProgressionLoop(executions)) {
      return "progression_loop";
    } else {
      return "complex_pattern";
    }
  }

  detectProgressionLoop(executions) {
    // Check if there's a pattern of progression that repeats
    // This is a simplified implementation
    return (
      executions.length >= 3 &&
      JSON.stringify(executions[0].context) === JSON.stringify(executions[2].context)
    );
  }

  assessLoopSeverity(executions) {
    const timeSpan = executions[0].timestamp - executions[executions.length - 1].timestamp;
    const frequency = executions.length;

    if (timeSpan < 60000 && frequency >= 3) {
      // Less than 1 minute, 3+ executions
      return "high";
    } else if (timeSpan < 300000 && frequency >= 2) {
      // Less than 5 minutes, 2+ executions
      return "medium";
    } else {
      return "low";
    }
  }

  async requestUserHelp(taskId, loopInfo = null) {
    const request = {
      id: `help_${Date.now()}`,
      taskId,
      timestamp: Date.now(),
      loopInfo: loopInfo || this.loopPatterns.get(taskId),
      status: "pending",
      requestReason: this.generateHelpRequestReason(taskId, loopInfo),
      suggestedActions: this.generateSuggestedActions(taskId, loopInfo),
    };

    this.userHelpRequests.push(request);
    return request;
  }

  generateHelpRequestReason(taskId, loopInfo) {
    if (!loopInfo) {
      return `Task ${taskId} appears to be stuck and requires guidance to proceed.`;
    }

    const pattern = this.loopPatterns.get(taskId) || loopInfo;

    switch (pattern.type) {
      case "exact_repetition":
        return `Task ${taskId} is repeating the same action multiple times without progress. The system may be stuck in an infinite loop.`;

      case "oscillation":
        return `Task ${taskId} is oscillating between two states without making progress. Manual intervention is needed to break the cycle.`;

      case "progression_loop":
        return `Task ${taskId} appears to be making some progress but is cycling through a repetitive pattern. Guidance needed on next steps.`;

      case "complex_pattern":
        return `Task ${taskId} has detected a complex repetitive pattern that suggests it may be unable to proceed automatically.`;

      default:
        return `Task ${taskId} has been attempted multiple times without success and requires user guidance.`;
    }
  }

  generateSuggestedActions(taskId, loopInfo) {
    const pattern = this.loopPatterns.get(taskId) || loopInfo;
    const suggestions = [];

    // General suggestions
    suggestions.push("Review the task requirements and constraints");
    suggestions.push("Provide additional context or clarification");
    suggestions.push("Break down the task into smaller, more specific steps");

    if (pattern) {
      switch (pattern.type) {
        case "exact_repetition":
          suggestions.push("Check if the task parameters need to be modified");
          suggestions.push("Verify that the task is actually achievable with current resources");
          break;

        case "oscillation":
          suggestions.push("Choose a specific direction or approach to follow");
          suggestions.push("Add constraints to prevent switching between alternatives");
          break;

        case "progression_loop":
          suggestions.push("Define clearer success criteria");
          suggestions.push("Set a specific end condition for the task");
          break;

        case "complex_pattern":
          suggestions.push("Simplify the task or approach");
          suggestions.push("Provide step-by-step guidance");
          break;
      }
    }

    suggestions.push("Cancel the task if it is no longer needed");
    suggestions.push("Restart the task with modified parameters");

    return suggestions;
  }

  resolveLoop(taskId, resolution) {
    this.currentLoops.delete(taskId);

    // Mark any pending help requests as resolved
    this.userHelpRequests
      .filter(request => request.taskId === taskId && request.status === "pending")
      .forEach(request => {
        request.status = "resolved";
        request.resolution = resolution;
        request.resolvedAt = Date.now();
      });

    // Clear the loop pattern
    this.loopPatterns.delete(taskId);

    // Remove recent executions for this task to allow fresh attempts
    this.executionHistory = this.executionHistory.filter(exec => exec.taskId !== taskId);
  }

  getLoopStatus(taskId = null) {
    if (taskId) {
      return {
        isInLoop: this.currentLoops.has(taskId),
        pattern: this.loopPatterns.get(taskId),
        recentExecutions: this.getRecentExecutions(taskId),
        helpRequests: this.userHelpRequests.filter(req => req.taskId === taskId),
      };
    }

    return {
      activeLoops: Array.from(this.currentLoops),
      totalPatterns: this.loopPatterns.size,
      pendingHelpRequests: this.userHelpRequests.filter(req => req.status === "pending").length,
      executionHistory: this.executionHistory.length,
    };
  }

  analyzeForLoops(taskId) {
    const recentExecutions = this.getRecentExecutions(taskId);

    if (recentExecutions.length >= 2) {
      // Predictive loop detection - try to catch loops before they complete
      const pattern = this.detectEarlyLoopSignals(recentExecutions);

      if (pattern.risk === "high") {
        // Pre-emptively mark as potential loop
        this.recordPotentialLoop(taskId, pattern);
      }
    }
  }

  detectEarlyLoopSignals(executions) {
    const pattern = {
      risk: "low",
      indicators: [],
      confidence: 0,
    };

    // Check for rapid execution frequency
    if (executions.length >= 2) {
      const timeDiff = executions[0].timestamp - executions[1].timestamp;
      if (timeDiff < 5000) {
        // Less than 5 seconds apart
        pattern.indicators.push("rapid_execution");
        pattern.confidence += 0.3;
      }
    }

    // Check for identical contexts
    const contexts = executions.map(exec => exec.context);
    const uniqueContexts = new Set(contexts);

    if (uniqueContexts.size < contexts.length) {
      pattern.indicators.push("repeated_context");
      pattern.confidence += 0.4;
    }

    // Assess overall risk
    if (pattern.confidence >= 0.7) {
      pattern.risk = "high";
    } else if (pattern.confidence >= 0.4) {
      pattern.risk = "medium";
    }

    return pattern;
  }

  recordPotentialLoop(taskId, pattern) {
    // Store potential loop for monitoring
    const potentialLoop = {
      taskId,
      pattern,
      recordedAt: Date.now(),
      status: "monitoring",
    };

    // Add to a separate tracking system for potential loops
    if (!this.potentialLoops) {
      this.potentialLoops = new Map();
    }

    this.potentialLoops.set(taskId, potentialLoop);
  }

  getPendingHelpRequests() {
    return this.userHelpRequests.filter(request => request.status === "pending");
  }

  respondToHelpRequest(requestId, userResponse) {
    const request = this.userHelpRequests.find(req => req.id === requestId);

    if (request) {
      request.status = "responded";
      request.userResponse = userResponse;
      request.respondedAt = Date.now();

      // If user provides guidance, resolve the loop
      if (userResponse.action === "resolve") {
        this.resolveLoop(request.taskId, userResponse);
      } else if (userResponse.action === "modify") {
        // Clear the loop but keep monitoring
        this.currentLoops.delete(request.taskId);
      } else if (userResponse.action === "cancel") {
        // Cancel the task entirely
        this.resolveLoop(request.taskId, {
          cancelled: true,
          reason: userResponse.reason,
        });
      }

      return true;
    }

    return false;
  }

  getStatistics() {
    const now = Date.now();
    const recentWindow = now - this.timeWindow;

    return {
      totalExecutions: this.executionHistory.length,
      recentExecutions: this.executionHistory.filter(exec => exec.timestamp > recentWindow).length,
      activeLoops: this.currentLoops.size,
      totalLoopsDetected: this.loopPatterns.size,
      pendingHelpRequests: this.userHelpRequests.filter(req => req.status === "pending").length,
      resolvedHelpRequests: this.userHelpRequests.filter(req => req.status === "resolved").length,
      averageLoopDetectionTime: this.calculateAverageDetectionTime(),
      mostProblematicTasks: this.identifyProblematicTasks(),
    };
  }

  calculateAverageDetectionTime() {
    const detectionTimes = Array.from(this.loopPatterns.values()).map(pattern => {
      const firstExecution = Math.min(...pattern.executions.map(exec => exec.timestamp));
      return pattern.detectedAt - firstExecution;
    });

    if (detectionTimes.length === 0) return 0;

    return detectionTimes.reduce((a, b) => a + b, 0) / detectionTimes.length;
  }

  identifyProblematicTasks() {
    const taskFrequency = {};

    this.executionHistory.forEach(exec => {
      taskFrequency[exec.taskId] = (taskFrequency[exec.taskId] || 0) + 1;
    });

    return Object.entries(taskFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([taskId, count]) => ({
        taskId,
        executionCount: count,
        hasLoop: this.loopPatterns.has(taskId),
        loopType: this.loopPatterns.get(taskId)?.type,
      }));
  }

  reset() {
    this.executionHistory = [];
    this.loopPatterns.clear();
    this.currentLoops.clear();
    this.userHelpRequests = [];

    if (this.potentialLoops) {
      this.potentialLoops.clear();
    }
  }
}
