export class SequentialThinker {
  constructor() {
    this.thinkingHistory = [];
    this.currentThinkingSession = null;
  }

  async think(problem) {
    const session = {
      id: `thinking_${Date.now()}`,
      problem,
      steps: [],
      startTime: new Date().toISOString(),
      status: "in_progress",
    };

    this.currentThinkingSession = session;
    this.thinkingHistory.push(session);

    try {
      const steps = await this.generateThinkingSteps(problem);
      session.steps = steps;
      session.status = "completed";
      session.endTime = new Date().toISOString();

      return steps;
    } catch (error) {
      session.status = "failed";
      session.error = error.message;
      session.endTime = new Date().toISOString();
      throw error;
    }
  }

  async generateThinkingSteps(problem) {
    const steps = [];

    // Step 1: Problem Analysis
    steps.push(await this.analyzeProblem(problem));

    // Step 2: Context Gathering
    steps.push(await this.gatherContext(problem));

    // Step 3: Approach Planning
    steps.push(await this.planApproach(problem));

    // Step 4: Solution Development
    steps.push(await this.developSolution(problem));

    // Step 5: Validation and Review
    steps.push(await this.validateSolution(problem));

    return steps;
  }

  async analyzeProblem(problem) {
    const analysis = {
      step: "Problem Analysis",
      content: this.performProblemAnalysis(problem),
      timestamp: new Date().toISOString(),
    };

    return `${analysis.step}: ${analysis.content}`;
  }

  performProblemAnalysis(problem) {
    const lower = problem.toLowerCase();
    let analysis = `Analyzing the problem: "${problem}"\n`;

    // Identify problem type
    const problemTypes = [];
    if (lower.includes("create") || lower.includes("build") || lower.includes("develop")) {
      problemTypes.push("creative/constructive");
    }
    if (lower.includes("fix") || lower.includes("debug") || lower.includes("solve")) {
      problemTypes.push("diagnostic/corrective");
    }
    if (lower.includes("analyze") || lower.includes("understand") || lower.includes("explain")) {
      problemTypes.push("analytical/investigative");
    }
    if (lower.includes("optimize") || lower.includes("improve")) {
      problemTypes.push("optimization/enhancement");
    }

    analysis += `Problem type(s): ${problemTypes.length > 0 ? problemTypes.join(", ") : "general problem-solving"}\n`;

    // Identify key components
    const keyWords = this.extractKeywords(problem);
    analysis += `Key components: ${keyWords.join(", ")}\n`;

    // Identify complexity level
    const complexity = this.assessComplexity(problem);
    analysis += `Estimated complexity: ${complexity}`;

    return analysis;
  }

  extractKeywords(text) {
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
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
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
      "can",
      "shall",
    ]);

    return text
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10); // Limit to top 10 keywords
  }

  assessComplexity(problem) {
    const indicators = {
      high: ["multiple", "complex", "system", "integrate", "architecture", "scale"],
      medium: ["analyze", "implement", "design", "optimize", "refactor"],
      low: ["simple", "basic", "quick", "fix", "update"],
    };

    const lower = problem.toLowerCase();

    for (const [level, keywords] of Object.entries(indicators)) {
      if (keywords.some(keyword => lower.includes(keyword))) {
        return level;
      }
    }

    // Default complexity based on length and word count
    const wordCount = problem.split(/\s+/).length;
    if (wordCount > 20) return "high";
    if (wordCount > 10) return "medium";
    return "low";
  }

  async gatherContext(problem) {
    const context = {
      step: "Context Gathering",
      content: this.performContextGathering(problem),
      timestamp: new Date().toISOString(),
    };

    return `${context.step}: ${context.content}`;
  }

  performContextGathering(problem) {
    let context = `Gathering relevant context for: "${problem}"\n`;

    // Identify domain
    const domain = this.identifyDomain(problem);
    context += `Domain: ${domain}\n`;

    // Identify required resources
    const resources = this.identifyRequiredResources(problem);
    context += `Required resources: ${resources.join(", ")}\n`;

    // Identify constraints
    const constraints = this.identifyConstraints(problem);
    context += `Potential constraints: ${constraints.join(", ")}`;

    return context;
  }

  identifyDomain(problem) {
    const lower = problem.toLowerCase();
    const domains = {
      "software development": [
        "code",
        "program",
        "software",
        "app",
        "system",
        "development",
        "algorithm",
      ],
      "data analysis": ["data", "analysis", "statistics", "analytics", "dataset", "metrics"],
      design: ["design", "ui", "ux", "interface", "visual", "layout"],
      business: ["business", "strategy", "market", "customer", "revenue", "process"],
      research: ["research", "study", "investigate", "explore", "understand"],
      technical: ["technical", "engineering", "infrastructure", "architecture", "technology"],
    };

    for (const [domain, keywords] of Object.entries(domains)) {
      if (keywords.some(keyword => lower.includes(keyword))) {
        return domain;
      }
    }

    return "general";
  }

  identifyRequiredResources(problem) {
    const lower = problem.toLowerCase();
    const resources = [];

    if (lower.includes("code") || lower.includes("program") || lower.includes("develop")) {
      resources.push("development tools", "documentation", "testing framework");
    }
    if (lower.includes("data") || lower.includes("analysis")) {
      resources.push("data sources", "analysis tools", "visualization tools");
    }
    if (lower.includes("research") || lower.includes("investigate")) {
      resources.push("information sources", "research tools", "documentation");
    }

    return resources.length > 0 ? resources : ["time", "focus", "systematic approach"];
  }

  identifyConstraints(problem) {
    const constraints = ["time limitations", "resource availability", "complexity management"];

    const lower = problem.toLowerCase();
    if (lower.includes("quick") || lower.includes("fast") || lower.includes("urgent")) {
      constraints.unshift("time pressure");
    }
    if (lower.includes("simple") || lower.includes("basic")) {
      constraints.push("simplicity requirement");
    }
    if (lower.includes("budget") || lower.includes("cost")) {
      constraints.push("budget constraints");
    }

    return constraints.slice(0, 3); // Limit to 3 main constraints
  }

  async planApproach(problem) {
    const approach = {
      step: "Approach Planning",
      content: this.developApproachPlan(problem),
      timestamp: new Date().toISOString(),
    };

    return `${approach.step}: ${approach.content}`;
  }

  developApproachPlan(problem) {
    let plan = `Planning approach for: "${problem}"\n`;

    const methodology = this.selectMethodology(problem);
    plan += `Methodology: ${methodology}\n`;

    const phases = this.definePhases(problem);
    plan += `Execution phases:\n${phases.map((phase, i) => `  ${i + 1}. ${phase}`).join("\n")}\n`;

    const riskMitigation = this.identifyRisks(problem);
    plan += `Risk mitigation: ${riskMitigation.join(", ")}`;

    return plan;
  }

  selectMethodology(problem) {
    const lower = problem.toLowerCase();

    if (lower.includes("analyze") || lower.includes("research")) {
      return "analytical approach";
    }
    if (lower.includes("create") || lower.includes("build")) {
      return "iterative development";
    }
    if (lower.includes("fix") || lower.includes("debug")) {
      return "systematic debugging";
    }
    if (lower.includes("optimize")) {
      return "performance optimization cycle";
    }

    return "general problem-solving methodology";
  }

  definePhases(problem) {
    const lower = problem.toLowerCase();

    if (lower.includes("create") || lower.includes("build")) {
      return [
        "Requirements gathering",
        "Design and planning",
        "Implementation",
        "Testing and validation",
        "Deployment and monitoring",
      ];
    }
    if (lower.includes("analyze")) {
      return [
        "Data collection",
        "Initial analysis",
        "Deep investigation",
        "Pattern identification",
        "Conclusion and recommendations",
      ];
    }
    if (lower.includes("fix") || lower.includes("debug")) {
      return [
        "Problem reproduction",
        "Root cause analysis",
        "Solution development",
        "Testing and validation",
        "Deployment and monitoring",
      ];
    }

    return ["Preparation", "Execution", "Review and refinement", "Finalization"];
  }

  identifyRisks(problem) {
    return ["scope creep", "technical complexity", "resource constraints", "time management"];
  }

  async developSolution(problem) {
    const solution = {
      step: "Solution Development",
      content: this.createSolutionFramework(problem),
      timestamp: new Date().toISOString(),
    };

    return `${solution.step}: ${solution.content}`;
  }

  createSolutionFramework(problem) {
    let framework = `Developing solution framework for: "${problem}"\n`;

    const components = this.identifySolutionComponents(problem);
    framework += `Solution components:\n${components.map((comp, i) => `  ${i + 1}. ${comp}`).join("\n")}\n`;

    const implementation = this.outlineImplementation(problem);
    framework += `Implementation outline: ${implementation}\n`;

    const success = this.defineSuccessMetrics(problem);
    framework += `Success metrics: ${success.join(", ")}`;

    return framework;
  }

  identifySolutionComponents(problem) {
    const lower = problem.toLowerCase();

    if (lower.includes("system") || lower.includes("software")) {
      return [
        "Architecture design",
        "Core functionality",
        "User interface",
        "Data management",
        "Error handling",
      ];
    }
    if (lower.includes("analysis")) {
      return ["Data processing", "Analysis algorithms", "Visualization", "Reporting", "Validation"];
    }

    return ["Core logic", "Input handling", "Processing", "Output generation", "Error management"];
  }

  outlineImplementation(problem) {
    const complexity = this.assessComplexity(problem);

    switch (complexity) {
      case "high":
        return "Phased implementation with milestone reviews and iterative refinement";
      case "medium":
        return "Structured implementation with testing at each stage";
      case "low":
        return "Direct implementation with final validation";
      default:
        return "Adaptive implementation based on emerging requirements";
    }
  }

  defineSuccessMetrics(problem) {
    const lower = problem.toLowerCase();
    const metrics = [];

    if (lower.includes("performance") || lower.includes("optimize")) {
      metrics.push("performance improvement", "efficiency gains");
    }
    if (lower.includes("fix") || lower.includes("solve")) {
      metrics.push("problem resolution", "stability improvement");
    }
    if (lower.includes("create") || lower.includes("build")) {
      metrics.push("functionality completion", "requirements satisfaction");
    }

    metrics.push("quality standards", "user satisfaction");
    return metrics;
  }

  async validateSolution(problem) {
    const validation = {
      step: "Validation and Review",
      content: this.performValidation(problem),
      timestamp: new Date().toISOString(),
    };

    return `${validation.step}: ${validation.content}`;
  }

  performValidation(problem) {
    let validation = `Validating solution approach for: "${problem}"\n`;

    const checks = this.defineValidationChecks(problem);
    validation += `Validation checks:\n${checks.map((check, i) => `  ${i + 1}. ${check}`).join("\n")}\n`;

    const improvements = this.identifyImprovements();
    validation += `Potential improvements: ${improvements.join(", ")}\n`;

    validation += `Next steps: Begin implementation following the planned approach`;

    return validation;
  }

  defineValidationChecks(problem) {
    return [
      "Solution addresses core problem requirements",
      "Approach is feasible with available resources",
      "Risk mitigation strategies are adequate",
      "Success metrics are measurable and relevant",
      "Implementation plan is realistic and actionable",
    ];
  }

  identifyImprovements() {
    return [
      "iterative refinement",
      "stakeholder feedback integration",
      "continuous monitoring",
      "adaptive optimization",
    ];
  }

  getThinkingHistory() {
    return this.thinkingHistory;
  }

  getCurrentSession() {
    return this.currentThinkingSession;
  }
}
