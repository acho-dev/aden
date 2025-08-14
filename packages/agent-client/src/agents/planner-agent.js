import { BaseAgent } from './base-agent.js';
import { getPrompt } from '../prompts/prompt-manager.js';

/**
 * PlannerAgent - Specialized agent for initial planning and task breakdown
 * Focuses on understanding user intent and creating actionable task plans
 */
export class PlannerAgent extends BaseAgent {
  constructor(config = {}) {
    super(config);
    this.agentType = 'PlannerAgent';
  }

  /**
   * Get system prompt specific to planning tasks
   */
  getSystemPrompt() {
    const schemaContext = this.context?.getSchemaContext();
    const ragContext = this.context?.getRagContext();
    const conversationHistory = this.context?.getPlannerContext();
    
    console.log(`🧠 PlannerAgent schema context: ${schemaContext ? `${schemaContext.length} chars` : 'none'}`);
    console.log(`📚 PlannerAgent RAG context: ${ragContext ? `${ragContext.length} chars` : 'none'}`);
    
    // Determine context flags for conditional sections
    const hasBusinessContext = true; // Always show for now
    const hasDataOnboarding = true;
    const hasCodeGeneration = true;
    
    // Get available tools
    const availableTools = this.getAvailableTools();
    
    // Use the prompt manager to get the system prompt
    return getPrompt('agents/planner', {
      schemaContext,
      ragContext,
      conversationHistory,
      hasBusinessContext,
      hasDataOnboarding,
      hasCodeGeneration,
      availableTools
    });
  }

  /**
   * Tools available specifically to the planner agent
   */
  getAvailableTools() {
    return [
      { name: 'think_sequentially', description: 'Structured analysis for complex planning scenarios' },
      { name: 'rag_query', description: 'Query indexed documents to find relevant information using RAG' },
      { name: 'read_file', description: 'Read existing code files to understand current project structure' },
      { name: 'list_directory', description: 'Explore project structure and existing files for better planning' },
    ];
  }

  /**
   * Execute planning phase
   * @param {Object} input - Planning input containing user message and context
   * @returns {Object} Planning result with tasks and analysis
   */
  async execute(input) {
    const stageId = this.startPerformanceTracking('planning', {
      message_length: input.message?.length || 0,
      has_schema: !!this.context?.getSchemaContext()
    });

    try {
      // 🦆 Let the little ducky see what already exists before planning!
      if (this.context) {
        this.debug('🦆 Little ducky exploring existing project structure before planning...');
        const existingStructure = await this.context.seeTheWorld('.');
        
        if (existingStructure) {
          this.debug(`🦆 Found existing structure: ${existingStructure.files.length} files, ${existingStructure.directories.length} directories`);
          
          // If there are existing files, read some to understand patterns
          for (const file of existingStructure.files.slice(0, 3)) {
            if (file.endsWith('.json') || file.endsWith('.js') || file.endsWith('.ts')) {
              const content = await this.context.readAndVerify(file);
              if (content) {
                this.debug(`🦆 Examined existing file: ${file}`);
              }
            }
          }
        }
      }
      this.debug('Starting planning execution');
      
      if (!this.validateInput(input)) {
        throw new Error('Invalid input for planning');
      }

      // Step 1: Analyze user intent
      this.context.callbacks?.onStatusChange?.('🎯 Analyzing user intent and requirements');
      // Check if this is a replanning scenario
    const isReplanning = input.isReplanning || false;
    const failureReason = input.failureReason || null;
    
    if (isReplanning) {
      this.debug(`Replanning due to: ${failureReason}`);
      this.context.callbacks?.onStatusChange?.('🔄 Replanning with better strategy after execution issues');
    }
    
    const intentAnalysis = await this.analyzeUserIntent(input.message);
      
      // Step 2: Search for relevant memories
      this.context.callbacks?.onStatusChange?.('🧠 Searching for relevant context');
      const memoryContext = null; // Memory search removed
      
      // Step 3: Generate initial plan
      this.context.callbacks?.onStatusChange?.('📋 Generating execution plan');
      const initialPlan = await this.generateInitialPlan(input.message, intentAnalysis, memoryContext, isReplanning, input.previousResults);
      
      // Step 4: Validate and refine plan
      this.context.callbacks?.onStatusChange?.('🔍 Validating and refining plan');
      const refinedPlan = await this.refinePlan(initialPlan, input.message);

      const result = {
        understanding: intentAnalysis.understanding,
        contextAnalysis: intentAnalysis.contextAnalysis,
        memoryContext: memoryContext,
        tasks: refinedPlan.tasks,
        needsClarification: refinedPlan.needsClarification,
        clarificationQuestions: refinedPlan.clarificationQuestions,
        estimatedComplexity: this.assessComplexity(refinedPlan.tasks),
        recommendedNextAgent: this.determineNextAgent(refinedPlan)
      };

      // Store plan and original goal in shared context
      this.context.setSharedData('initialPlan', result);
      this.context.setSharedData('userIntent', intentAnalysis);
      this.context.setSharedData('originalGoal', input.message);

      this.endPerformanceTracking(stageId, {
        tasks_generated: result.tasks?.length || 0,
        needs_clarification: result.needsClarification,
        complexity_score: result.estimatedComplexity
      });

      this.debug(`Planning completed: ${result.tasks?.length || 0} tasks generated`);
      return result;

    } catch (error) {
      this.endPerformanceTracking(stageId, { error: error.message });
      this.debug('Planning failed:', error.message);
      throw error;
    }
  }

  /**
   * Analyze user intent and categorize the request
   */
  async analyzeUserIntent(message) {
    const analysisPrompt = `Analyze this user request and determine the intent, complexity, and requirements:

User message: "${message}"

Provide your analysis in markdown format:

## Understanding
Clear description of what the user wants

## Context Analysis  
Analysis of complexity and requirements

## Primary Intent
Main goal category (e.g., data_analysis, report_generation, information_lookup)

## Complexity
**Level**: Simple/Moderate/Complex

## Required Data Sources
- List each data source needed
- Include table names or external sources

## Deliverable Type
Type of expected output (e.g., report, chart, summary, raw_data)

## Potential Ambiguities
- List any unclear aspects
- Note missing information that might be needed`;

    try {
      const response = await this.callLLM([
        { role: 'user', content: analysisPrompt }
      ], [], { 
        timeout: 15000,
        process: 'planning',
        stage: 'intent_analysis'
      });

      const analysisText = this.context.llmClient.extractTextResponse(response);
      const analysis = this.parseMarkdownIntentAnalysis(analysisText);

      // Stream the intent analysis to the frontend
      if (this.context.callbacks?.onIntentAnalyzed) {
        this.context.callbacks.onIntentAnalyzed({
          process: "planning",
          stage: "intent_analysis",
          understanding: analysis.understanding,
          primaryIntent: analysis.primaryIntent,
          complexity: analysis.complexity,
          requiredDataSources: analysis.requiredDataSources
        });
      }

      return analysis;
    } catch (error) {
      this.debug('Intent analysis failed:', error.message);
      return {
        understanding: "Unable to analyze user intent due to processing error",
        contextAnalysis: "Defaulting to moderate complexity handling",
        primaryIntent: "general",
        complexity: "moderate",
        requiredDataSources: [],
        deliverableType: "response",
        ambiguities: ["Intent analysis failed"]
      };
    }
  }


  /**
   * Generate the initial task plan
   */
  async generateInitialPlan(message, intentAnalysis, memoryContext, isReplanning = false, previousResults = null) {
    const memorySection = memoryContext 
      ? `\nRELEVANT CONTEXT FROM PREVIOUS CONVERSATIONS:\n${memoryContext}\n`
      : "";
      
    // Add conversation history context using the context helper
    const conversationSection = this.context?.getPlannerContext() || '';
      
    let replanningSection = "";
    if (isReplanning && previousResults) {
      replanningSection = `\nIMPORTANT - THIS IS A REPLANNING ATTEMPT:\n`;
      replanningSection += `Previous execution failed because most tasks gathered no meaningful data.\n`;
      replanningSection += `Failed queries returned NULL or empty results.\n`;
      replanningSection += `\nCreate a NEW plan with DIFFERENT approaches:\n`;
      replanningSection += `- Try different table joins or relationships\n`;
      replanningSection += `- Use different date ranges or filters\n`;
      replanningSection += `- Check for data in alternative tables\n`;
      replanningSection += `- Consider that the data might not exist in the expected format\n\n`;
    }

    // Get available tools for the prompt
    const availableTools = [
      { name: 'rag_query', description: 'Query indexed documents and knowledge base for relevant information' },
      { name: 'db_query', description: 'Execute database queries for data analysis (USE FOR ALL BUSINESS DATA)' },
      { name: 'think_sequentially', description: 'Structured problem analysis (ONLY for complex analysis, NEVER for creating files/code)' },
      { name: 'mermaid_diagram', description: 'Create process and structural diagrams' },
      { name: 'vega_lite_diagram', description: 'Create data visualization charts' },
      { name: 'markdown_table', description: 'Format data in tables' },
      { name: 'markdown_action_item', description: 'Create task and action item lists' },
      { name: 'remember', description: 'Store important insights and decisions' },
      { name: 'read_file', description: 'Read contents of existing files (USE when examining existing code/files)' },
      { name: 'write_file', description: 'Write content to files (USE FOR ALL CODE GENERATION AND FILE CREATION)' },
      { name: 'execute_command', description: 'Execute shell commands (USE for running tests, builds, npm install)' },
      { name: 'list_directory', description: 'List directory contents (USE when exploring project structure)' }
    ];
    
    // Use the prompt manager for plan generation
    const planningPrompt = getPrompt('tasks/plan-generation', {
      message,
      intentAnalysis,
      conversationHistory: conversationSection,
      memoryContext,
      isReplanning,
      availableTools
    });

    try {
      const response = await this.callLLM([
        { role: 'user', content: planningPrompt }
      ], [], { 
        timeout: 30000,
        process: 'planning',
        stage: 'plan_generation'
      });

      const planText = this.context.llmClient.extractTextResponse(response);
      const planData = this.parseMarkdownTaskPlan(planText);

      // Stream the generated plan with task details
      if (this.context.callbacks?.onPlanGenerated) {
        this.context.callbacks.onPlanGenerated({
          process: "planning",
          stage: "plan_generation",
          understanding: "Generated execution plan",
          tasks: planData.tasks,
          taskCount: planData.tasks.length,
          executionOrder: planData.executionOrder,
          estimatedDuration: planData.estimatedDuration,
          riskFactors: planData.riskFactors
        });
      }

      return planData;
    } catch (error) {
      this.debug('Plan generation failed:', error.message);
      return {
        tasks: [{
          id: "fallback_task",
          description: "Process user request with available tools",
          toolsRequired: ["think_sequentially"],
          priority: "high",
          dependencies: [],
          expectedOutcome: "Address user request",
          dataSourcesNeeded: []
        }],
        executionOrder: ["fallback_task"],
        estimatedDuration: "unknown",
        riskFactors: ["Plan generation failed"]
      };
    }
  }

  /**
   * Refine and validate the generated plan
   */
  async refinePlan(initialPlan, originalMessage) {
    // Check for clarification needs
    const needsClarification = this.checkClarificationNeeds(initialPlan, originalMessage);
    
    if (needsClarification) {
      const clarificationQuestions = await this.generateClarificationQuestions(originalMessage, initialPlan);
      return {
        ...initialPlan,
        needsClarification: true,
        clarificationQuestions
      };
    }

    // Validate task dependencies and execution order
    const validatedTasks = this.validateTaskDependencies(initialPlan.tasks);
    
    return {
      ...initialPlan,
      tasks: validatedTasks,
      needsClarification: false,
      clarificationQuestions: []
    };
  }

  /**
   * Check if the plan needs user clarification
   */
  checkClarificationNeeds(plan, originalMessage) {
    // Simple heuristics for detecting clarification needs
    const message = originalMessage.toLowerCase();
    
    // Check for vague language
    const vaguePatterns = [
      /something like/i,
      /similar to/i,
      /kind of/i,
      /maybe/i,
      /possibly/i,
      /i think/i,
      /not sure/i
    ];

    const hasVagueLanguage = vaguePatterns.some(pattern => pattern.test(message));
    
    // Check for missing specifics
    const lackingSpecifics = plan.tasks.length === 0 || 
                           plan.riskFactors.includes("Insufficient information");

    return hasVagueLanguage || lackingSpecifics;
  }

  /**
   * Generate clarification questions
   */
  async generateClarificationQuestions(message, plan) {
    const clarificationPrompt = `The user request needs clarification for effective execution:

Original message: "${message}"
Generated plan: ${JSON.stringify(plan, null, 2)}

Generate 2-3 specific clarification questions that would help create a better execution plan.
Focus on:
1. Missing specific requirements
2. Ambiguous goals or outcomes
3. Unclear data preferences or constraints

Return as JSON array:
["Question 1?", "Question 2?", "Question 3?"]`;

    try {
      const response = await this.callLLM([
        { role: 'user', content: clarificationPrompt }
      ], [], { 
        timeout: 15000,
        process: 'planning',
        stage: 'clarification_generation'
      });

      const questionsText = this.context.llmClient.extractTextResponse(response);
      const questions = this.context.llmClient.extractJSONFromResponse(questionsText, [
        "Could you provide more specific details about your requirements?",
        "What format would you prefer for the results?",
        "Are there any particular constraints or preferences I should consider?"
      ]);

      return Array.isArray(questions) ? questions : [questions];
    } catch (error) {
      this.debug('Clarification generation failed:', error.message);
      return [
        "Could you provide more specific details about what you're looking for?",
        "What format would you prefer for the results?",
        "Are there any particular constraints I should consider?"
      ];
    }
  }

  /**
   * Validate task dependencies and infer logical dependencies
   */
  validateTaskDependencies(tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return tasks;
    }
    
    const taskIds = new Set(tasks.map(task => task.id));
    
    // First pass: clean existing dependencies
    const cleanedTasks = tasks.map(task => ({
      ...task,
      dependencies: (task.dependencies || []).filter(depId => 
        taskIds.has(depId) && depId !== task.id
      )
    }));
    
    // Second pass: infer logical dependencies if missing
    return cleanedTasks.map(task => {
      const inferredDeps = this.inferTaskDependencies(task, cleanedTasks);
      
      // Merge existing and inferred dependencies (remove duplicates)
      const allDeps = [...new Set([...task.dependencies, ...inferredDeps])];
      
      // Log dependency inference for debugging
      if (inferredDeps.length > 0) {
        this.debug(`Inferred dependencies for task ${task.id}: ${inferredDeps.join(', ')}`);
      }
      
      return {
        ...task,
        dependencies: allDeps
      };
    });
  }

  /**
   * Infer logical dependencies based on task types and tools
   */
  inferTaskDependencies(currentTask, allTasks) {
    const inferredDeps = [];
    const tools = currentTask.toolsRequired || [];
    const description = currentTask.description?.toLowerCase() || '';
    
    // Rule 1: Visualization tasks depend on data query tasks
    if (tools.includes('vega_lite_diagram') || tools.includes('markdown_table')) {
      const dataQueryTasks = allTasks.filter(t => 
        t.id !== currentTask.id && 
        (t.toolsRequired?.includes('db_query') || t.toolsRequired?.includes('rag_query'))
      );
      inferredDeps.push(...dataQueryTasks.map(t => t.id));
    }
    
    // Rule 2: Analysis tasks depend on data gathering tasks
    if (description.includes('analyz') || description.includes('summariz') || 
        description.includes('insight') || tools.includes('think_sequentially')) {
      const dataGatheringTasks = allTasks.filter(t => 
        t.id !== currentTask.id && 
        (t.toolsRequired?.includes('db_query') || t.toolsRequired?.includes('rag_query'))
      );
      inferredDeps.push(...dataGatheringTasks.map(t => t.id));
    }
    
    // Rule 3: Specific queries depend on schema exploration
    if (tools.includes('db_query') && 
        (description.includes('specific') || description.includes('detailed'))) {
      const schemaExploreTasks = allTasks.filter(t => 
        t.id !== currentTask.id && 
        t.toolsRequired?.includes('db_query') &&
        (t.description?.toLowerCase().includes('schema') || 
         t.description?.toLowerCase().includes('explore') ||
         t.description?.toLowerCase().includes('structure'))
      );
      inferredDeps.push(...schemaExploreTasks.map(t => t.id));
    }
    
    return inferredDeps;
  }

  /**
   * Assess plan complexity
   */
  /**
   * Parse markdown intent analysis into structured data
   */
  parseMarkdownIntentAnalysis(markdownText) {
    if (!markdownText) {
      return {
        understanding: "User request analysis",
        contextAnalysis: "Request complexity assessment",
        primaryIntent: "general",
        complexity: "moderate",
        requiredDataSources: [],
        deliverableType: "response",
        ambiguities: [],
        markdownContent: ""
      };
    }

    const analysis = {
      understanding: "",
      contextAnalysis: "",
      primaryIntent: "general",
      complexity: "moderate",
      requiredDataSources: [],
      deliverableType: "response",
      ambiguities: [],
      markdownContent: markdownText
    };

    try {
      // Extract understanding
      const understandingMatch = markdownText.match(/## Understanding\s*\n([\s\S]*?)(?=##|$)/i);
      if (understandingMatch) {
        analysis.understanding = understandingMatch[1].trim();
      }

      // Extract context analysis
      const contextMatch = markdownText.match(/## Context Analysis\s*\n([\s\S]*?)(?=##|$)/i);
      if (contextMatch) {
        analysis.contextAnalysis = contextMatch[1].trim();
      }

      // Extract primary intent
      const intentMatch = markdownText.match(/## Primary Intent\s*\n([\s\S]*?)(?=##|$)/i);
      if (intentMatch) {
        analysis.primaryIntent = intentMatch[1].trim().toLowerCase();
      }

      // Extract complexity
      const complexityMatch = markdownText.match(/\*\*Level\*\*:\s*(\w+)/i);
      if (complexityMatch) {
        analysis.complexity = complexityMatch[1].toLowerCase();
      }

      // Extract required data sources
      const dataSourcesMatch = markdownText.match(/## Required Data Sources\s*\n([\s\S]*?)(?=##|$)/i);
      if (dataSourcesMatch) {
        const sources = dataSourcesMatch[1].match(/^- (.+)$/gm);
        if (sources) {
          analysis.requiredDataSources = sources.map(source => source.replace(/^- /, ''));
        }
      }

      // Extract deliverable type
      const deliverableMatch = markdownText.match(/## Deliverable Type\s*\n([\s\S]*?)(?=##|$)/i);
      if (deliverableMatch) {
        analysis.deliverableType = deliverableMatch[1].trim().toLowerCase();
      }

      // Extract ambiguities
      const ambiguitiesMatch = markdownText.match(/## Potential Ambiguities\s*\n([\s\S]*?)(?=##|$)/i);
      if (ambiguitiesMatch) {
        const ambiguities = ambiguitiesMatch[1].match(/^- (.+)$/gm);
        if (ambiguities) {
          analysis.ambiguities = ambiguities.map(amb => amb.replace(/^- /, ''));
        }
      }

    } catch (error) {
      console.error('Error parsing markdown intent analysis:', error);
    }

    return analysis;
  }

  /**
   * Parse markdown task plan into structured data
   */
  parseMarkdownTaskPlan(markdownText) {
    if (!markdownText) {
      return {
        tasks: [],
        executionOrder: [],
        riskFactors: [],
        markdownContent: ""
      };
    }

    const planData = {
      tasks: [],
      executionOrder: [],
      riskFactors: [],
      markdownContent: markdownText
    };

    try {
      // Extract tasks
      const tasksMatch = markdownText.match(/## Tasks\s*\n([\s\S]*?)(?=## Execution Order|## Risk Factors|$)/i);
      if (tasksMatch) {
        const tasksSection = tasksMatch[1];
        const taskMatches = tasksSection.match(/### Task \d+: (.+?)\n([\s\S]*?)(?=###|##|$)/g);
        
        if (taskMatches) {
          planData.tasks = taskMatches.map((match, index) => {
            const lines = match.split('\n');
            const titleLine = lines[0];
            const taskIdMatch = titleLine.match(/### Task \d+: (.+)/);
            const taskId = taskIdMatch ? taskIdMatch[1].trim() : `task_${index + 1}`;
            
            let description = "";
            let toolsRequired = [];
            let priority = "medium";
            let dependencies = [];
            let expectedOutcome = "";
            let dataSourcesNeeded = [];
            
            for (const line of lines.slice(1)) {
              if (line.includes('**Description**:')) {
                description = line.replace(/.*\*\*Description\*\*:\s*/, '');
              } else if (line.includes('**Tools Required**:')) {
                const toolsText = line.replace(/.*\*\*Tools Required\*\*:\s*/, '');
                toolsRequired = toolsText.split(',').map(tool => tool.trim());
              } else if (line.includes('**Priority**:')) {
                priority = line.replace(/.*\*\*Priority\*\*:\s*/, '').toLowerCase();
              } else if (line.includes('**Dependencies**:')) {
                const depsText = line.replace(/.*\*\*Dependencies\*\*:\s*/, '');
                if (!depsText.toLowerCase().includes('none')) {
                  dependencies = depsText.split(',').map(dep => dep.trim());
                }
              } else if (line.includes('**Expected Outcome**:')) {
                expectedOutcome = line.replace(/.*\*\*Expected Outcome\*\*:\s*/, '');
              } else if (line.includes('**Data Sources Needed**:')) {
                const sourcesText = line.replace(/.*\*\*Data Sources Needed\*\*:\s*/, '');
                dataSourcesNeeded = sourcesText.split(',').map(source => source.trim());
              }
            }
            
            return {
              id: taskId,
              description,
              toolsRequired,
              priority,
              dependencies,
              expectedOutcome,
              dataSourcesNeeded,
              // Dynamic execution context
              executionContext: {
                workingDirectory: null, // Will be set during execution
                filesCreated: [],
                lastToolResults: [],
                adaptable: true, // Allow executor to modify this task
                rewriteCount: 0
              }
            };
          });
        }
      }

      // Extract execution order
      const executionMatch = markdownText.match(/## Execution Order\s*\n([\s\S]*?)(?=##|$)/i);
      if (executionMatch) {
        const orderSection = executionMatch[1];
        const orderItems = orderSection.match(/^\d+\. (.+)$/gm);
        if (orderItems) {
          planData.executionOrder = orderItems.map(item => item.replace(/^\d+\. /, ''));
        }
      }

      // Extract risk factors
      const riskMatch = markdownText.match(/## Risk Factors\s*\n([\s\S]*?)(?=##|$)/i);
      if (riskMatch) {
        const riskItems = riskMatch[1].match(/^- (.+)$/gm);
        if (riskItems) {
          planData.riskFactors = riskItems.map(item => item.replace(/^- /, ''));
        }
      }

    } catch (error) {
      console.error('Error parsing markdown task plan:', error);
    }

    return planData;
  }

  assessComplexity(tasks) {
    if (!Array.isArray(tasks)) return 1;
    
    let complexityScore = tasks.length;
    
    // Add complexity for tool diversity
    const uniqueTools = new Set();
    tasks.forEach(task => {
      if (task.toolsRequired) {
        task.toolsRequired.forEach(tool => uniqueTools.add(tool));
      }
    });
    complexityScore += uniqueTools.size;
    
    // Add complexity for dependencies
    const totalDependencies = tasks.reduce((sum, task) => 
      sum + (task.dependencies?.length || 0), 0);
    complexityScore += totalDependencies;
    
    return Math.min(complexityScore, 10); // Cap at 10
  }

  /**
   * Determine which agent should execute next
   */
  determineNextAgent(plan) {
    if (plan.needsClarification) {
      return 'clarification'; // Special case - return to user
    }
    
    if (!plan.tasks || plan.tasks.length === 0) {
      return 'analyzer'; // Skip to analysis if no tasks
    }
    
    return 'executor'; // Normal flow - execute tasks
  }


  /**
   * Validate planning input
   */
  validateInput(input) {
    return input && 
           typeof input === 'object' && 
           input.message && 
           typeof input.message === 'string' &&
           input.message.trim().length > 0;
  }
}