/**
 * Comprehensive Streaming Callbacks for Multi-Agent System
 * 
 * This file defines all available streaming callbacks that can be used
 * to provide real-time updates to the frontend during multi-agent execution.
 */

/**
 * Create comprehensive streaming callbacks with all event handlers
 * @returns {Object} Callbacks object with all streaming event handlers
 */
export function createStreamingCallbacks() {
  return {
    // ============ Core Streaming ============
    /**
     * Called when a token is received during LLM streaming
     * @param {string} token - The token received
     */
    onTokenReceived: (token) => {},

    /**
     * Called when status changes during execution
     * @param {string} status - Status message
     */
    onStatusChange: (status) => {},

    // ============ Planning Phase ============
    /**
     * Called when user intent has been analyzed
     * @param {Object} analysis - Intent analysis results
     * @param {string} analysis.understanding - What the system understood
     * @param {string} analysis.primaryIntent - The primary intent identified
     * @param {string} analysis.complexity - Task complexity (low/moderate/high)
     * @param {Array} analysis.requiredDataSources - Data sources needed
     */
    onIntentAnalyzed: (analysis) => {},

    /**
     * Called when a plan has been generated
     * @param {Object} plan - The generated plan
     * @param {Array} plan.tasks - Array of planned tasks
     * @param {number} plan.taskCount - Number of tasks
     * @param {Array} plan.executionOrder - Order of task execution
     * @param {string} plan.estimatedDuration - Estimated time to complete
     * @param {Array} plan.riskFactors - Identified risk factors
     */
    onPlanGenerated: (plan) => {},

    /**
     * Called when plan validation completes
     * @param {Object} validation - Validation results
     * @param {boolean} validation.isValid - Whether plan is valid
     * @param {Array} validation.issues - Any issues found
     * @param {Array} validation.optimizations - Suggested optimizations
     */
    onPlanValidated: (validation) => {},

    // ============ Execution Phase ============
    /**
     * Called when a task execution starts
     * @param {Object} taskInfo - Task information
     * @param {string} taskInfo.taskId - Unique task ID
     * @param {string} taskInfo.description - Task description
     * @param {Array} taskInfo.toolsRequired - Tools needed for this task
     * @param {string} taskInfo.priority - Task priority
     * @param {number} taskInfo.taskNumber - Current task number
     * @param {number} taskInfo.totalTasks - Total number of tasks
     */
    onTaskExecutionStart: (taskInfo) => {},

    /**
     * Called when a task execution completes
     * @param {Object} result - Task execution result
     * @param {string} result.taskId - Task ID
     * @param {boolean} result.success - Whether task succeeded
     * @param {boolean} result.hasData - Whether data was gathered
     * @param {number} result.toolCallsCount - Number of tool calls made
     * @param {number} result.factsGathered - Number of facts gathered
     * @param {string} result.summary - Summary of results
     */
    onTaskExecutionComplete: (result) => {},

    /**
     * Called when a tool is being called
     * @param {Object} toolCall - Tool call information
     * @param {string} toolCall.name - Tool name
     * @param {Object} toolCall.input - Tool input parameters
     */
    onToolCall: (toolCall) => {},

    /**
     * Called when a tool returns results
     * @param {Object} toolCall - The tool call that was made
     * @param {Object} result - Tool execution result
     * @param {boolean} result.is_error - Whether tool failed
     * @param {any} result.content - Tool output content (supports rich types: tables, charts, diagrams)
     * @param {Object} result.metadata - Additional metadata about the result
     * @param {string} result.contentType - Type of content: 'text', 'json', 'table', 'chart', 'diagram'
     */
    onToolResult: (toolCall, result) => {},

    /**
     * Called when intelligent follow-up queries are generated
     * @param {Object} followUp - Follow-up information
     * @param {Array} followUp.queries - Generated queries
     * @param {string} followUp.reasoning - Why these queries were generated
     */
    onFollowUpGenerated: (followUp) => {},

    // ============ Analysis Phase ============
    /**
     * Called when analysis phase starts
     * @param {Object} analysisInfo - Analysis information
     * @param {string} analysisInfo.phase - Current analysis phase
     * @param {number} analysisInfo.totalTasks - Total tasks executed
     * @param {number} analysisInfo.failedTasks - Number of failed tasks
     * @param {number} analysisInfo.toolCalls - Total tool calls made
     */
    onAnalysisStart: (analysisInfo) => {},

    /**
     * Called when insights are extracted
     * @param {Object} insights - Extracted insights
     * @param {Array} insights.keyFindings - Key findings from execution
     * @param {Array} insights.patterns - Patterns identified
     * @param {Array} insights.recommendations - Recommendations
     */
    onInsightsExtracted: (insights) => {},

    /**
     * Called when response generation starts
     * @param {Object} responseInfo - Response generation info
     * @param {string} responseInfo.type - Type of response being generated
     * @param {boolean} responseInfo.hasFormattedContent - Whether formatted content is included
     * @param {number} responseInfo.dataPoints - Number of data points to include
     * @param {Array} responseInfo.contentTypes - Types of rich content included: ['table', 'chart', 'diagram']
     * @param {Object} responseInfo.formatDetails - Details about formatted content structure
     */
    onResponseGenerationStart: (responseInfo) => {},

    // ============ Agent Coordination ============
    /**
     * Called when transitioning between agents
     * @param {Object} transition - Transition information
     * @param {string} transition.fromAgent - Previous agent
     * @param {string} transition.toAgent - Next agent
     * @param {string} transition.reason - Reason for transition
     * @param {number} transition.transitionNumber - Current transition count
     */
    onAgentTransition: (transition) => {},

    /**
     * Called when an agent makes a decision
     * @param {Object} decision - Decision information
     * @param {string} decision.agent - Agent making the decision
     * @param {string} decision.decision - The decision made
     * @param {string} decision.reasoning - Reasoning behind decision
     * @param {Object} decision.context - Decision context
     */
    onAgentDecision: (decision) => {},

    // ============ Error Handling ============
    /**
     * Called when an error occurs but is recovered
     * @param {Object} recovery - Recovery information
     * @param {string} recovery.phase - Phase where error occurred
     * @param {string} recovery.error - Error message
     * @param {string} recovery.recoveryAction - Action taken to recover
     */
    onErrorRecovered: (recovery) => {},

    /**
     * Called when replanning is triggered
     * @param {Object} replan - Replanning information
     * @param {string} replan.reason - Why replanning was needed
     * @param {number} replan.attemptNumber - Current replanning attempt
     * @param {number} replan.maxAttempts - Maximum replanning attempts
     */
    onReplanning: (replan) => {},

    // ============ Data Onboarding ============
    /**
     * Called during data onboarding operations
     * @param {Object} onboarding - Onboarding information
     * @param {string} onboarding.phase - Current onboarding phase
     * @param {Array} onboarding.files - Files being processed
     * @param {Object} onboarding.mappings - Column mappings created
     * @param {number} onboarding.progress - Progress percentage
     * @param {Object} onboarding.preview - Rich preview of data transformations
     * @param {Array} onboarding.validationResults - Data validation results with rich formatting
     */
    onDataOnboarding: (onboarding) => {},

    // ============ Rich Content Events ============
    /**
     * Called when rich content is generated (tables, charts, diagrams)
     * @param {Object} content - Rich content information
     * @param {string} content.type - Content type: 'table', 'chart', 'diagram', 'actionItems'
     * @param {Object} content.data - Structured data for the content
     * @param {Object} content.formatting - Formatting specifications
     * @param {string} content.title - Content title/caption
     * @param {Object} content.metadata - Additional metadata about the content
     */
    onRichContentGenerated: (content) => {},

    /**
     * Called when structured data is extracted
     * @param {Object} dataExtraction - Data extraction information
     * @param {string} dataExtraction.source - Source of the data (tool name)
     * @param {Object} dataExtraction.schema - Data schema/structure
     * @param {Array} dataExtraction.records - Extracted data records
     * @param {Object} dataExtraction.summary - Statistical summary of the data
     * @param {Array} dataExtraction.insights - Auto-generated insights about the data
     */
    onDataExtracted: (dataExtraction) => {},

    /**
     * Called when visualizations are being prepared
     * @param {Object} visualization - Visualization information
     * @param {string} visualization.type - Chart type: 'bar', 'line', 'pie', 'scatter', etc.
     * @param {Object} visualization.data - Chart data
     * @param {Object} visualization.config - Chart configuration
     * @param {Array} visualization.annotations - Chart annotations/highlights
     * @param {string} visualization.narrative - Narrative description of the chart
     */
    onVisualizationPrepared: (visualization) => {},

    // ============ Completion ============
    /**
     * Called when entire execution completes
     * @param {Object} result - Final execution result
     * @param {string} result.response - Final response (empty if streamed)
     * @param {Object} result.metadata - Execution metadata
     * @param {number} result.responseTime - Total execution time
     * @param {Array} result.richContent - Array of rich content items generated
     * @param {Object} result.contentSummary - Summary of all content types generated
     */
    onComplete: (result) => {}
  };
}

/**
 * Example implementation showing how to use streaming callbacks
 */
export function createExampleCallbacks() {
  return {
    onTokenReceived: (token) => {
      process.stdout.write(token);
    },
    
    onStatusChange: (status) => {
      console.log(`\n💭 ${status}\n`);
    },
    
    onIntentAnalyzed: (analysis) => {
      console.log(`\n🎯 Intent: ${analysis.primaryIntent} (${analysis.complexity} complexity)`);
      console.log(`   Understanding: ${analysis.understanding}`);
    },
    
    onPlanGenerated: (plan) => {
      console.log(`\n📋 Plan Generated: ${plan.taskCount} tasks`);
      plan.tasks.forEach((task, i) => {
        console.log(`   ${i + 1}. ${task.description}`);
      });
    },
    
    onTaskExecutionStart: (taskInfo) => {
      console.log(`\n⚡ Task ${taskInfo.taskNumber}/${taskInfo.totalTasks}: ${taskInfo.description}`);
      if (taskInfo.toolsRequired && taskInfo.toolsRequired.length > 0) {
        console.log(`   Tools: ${taskInfo.toolsRequired.join(', ')}`);
      }
    },
    
    onTaskExecutionComplete: (result) => {
      const icon = result.success ? '✅' : '❌';
      console.log(`${icon} Task ${result.taskId} complete: ${result.summary}`);
      if (result.factsGathered > 0) {
        console.log(`   Gathered ${result.factsGathered} facts`);
      }
      if (result.hasData) {
        console.log(`   📊 Data collected from ${result.toolCallsCount} tool calls`);
      }
    },

    onRichContentGenerated: (content) => {
      const icons = {
        table: '📊',
        chart: '📈',
        diagram: '📋',
        actionItems: '✅'
      };
      const icon = icons[content.type] || '📄';
      console.log(`\n${icon} ${content.type}: ${content.title || 'Generated content'}`);
      if (content.data && Array.isArray(content.data)) {
        console.log(`   Records: ${content.data.length}`);
      }
    },

    onDataExtracted: (dataExtraction) => {
      console.log(`\n🔍 Data extracted from ${dataExtraction.source}`);
      console.log(`   Schema: ${Object.keys(dataExtraction.schema || {}).length} fields`);
      console.log(`   Records: ${dataExtraction.records?.length || 0}`);
      if (dataExtraction.insights && dataExtraction.insights.length > 0) {
        console.log(`   Insights: ${dataExtraction.insights.length} auto-generated`);
      }
    },

    onVisualizationPrepared: (visualization) => {
      console.log(`\n📈 ${visualization.type} chart prepared: ${visualization.narrative || 'Data visualization'}`);
      if (visualization.annotations && visualization.annotations.length > 0) {
        console.log(`   Annotations: ${visualization.annotations.length}`);
      }
    },
    
    onAnalysisStart: (analysisInfo) => {
      console.log(`\n🔍 Analyzing results: ${analysisInfo.totalTasks} tasks, ${analysisInfo.toolCalls} tool calls`);
    },
    
    onInsightsExtracted: (insights) => {
      if (insights.keyFindings.length > 0) {
        console.log(`\n💡 Key Insights:`);
        insights.keyFindings.forEach(finding => {
          console.log(`   • ${finding}`);
        });
      }
    },
    
    onAgentTransition: (transition) => {
      console.log(`\n🤖 Agent transition ${transition.transitionNumber}: ${transition.fromAgent} → ${transition.toAgent}`);
      console.log(`   Reason: ${transition.reason}`);
    },
    
    onComplete: (result) => {
      console.log(`\n✨ Execution complete in ${result.responseTime}ms`);
      if (result.metadata.streamed) {
        console.log(`   Response was streamed in real-time`);
      }
      if (result.richContent && result.richContent.length > 0) {
        console.log(`   Rich content generated: ${result.richContent.length} items`);
        const contentTypes = result.contentSummary || {};
        Object.entries(contentTypes).forEach(([type, count]) => {
          if (count > 0) {
            console.log(`   - ${type}: ${count}`);
          }
        });
      }
    }
  };
}