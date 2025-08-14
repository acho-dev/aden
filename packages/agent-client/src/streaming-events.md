# Multi-Agent Streaming Events

This document defines the structured format for all streaming events emitted during multi-agent execution. These events provide granular real-time updates to frontend applications about the current state and progress of the AI system.

## Event Categories

### Core Streaming Events

#### onTokenReceived
Real-time token streaming during LLM responses.
```javascript
onTokenReceived: (token) => {
  // token: string - Individual token from LLM response
}
```

#### onStatusChange
High-level status updates about current phase.
```javascript
onStatusChange: (status) => {
  // status: string - Human-readable status message
  // Examples: "🎯 Analyzing user intent", "📋 Generating plan", "⚡ Executing tasks"
}
```

### Planning Phase Events

#### onIntentAnalyzed
User intent analysis results.
```javascript
onIntentAnalyzed: (analysis) => {
  understanding: string,        // What the system understood
  primaryIntent: string,        // Primary intent category
  complexity: 'low'|'moderate'|'high',  // Task complexity
  requiredDataSources: string[] // Data sources needed
}
```

#### onPlanGenerated
Complete execution plan with tasks.
```javascript
onPlanGenerated: (plan) => {
  tasks: Array<{
    id: string,
    description: string,
    toolsRequired: string[],
    priority: 'high'|'medium'|'low'
  }>,
  taskCount: number,           // Total number of tasks
  executionOrder: string[],    // Task execution order
  estimatedDuration: string,   // Time estimate
  riskFactors: string[]        // Identified risks
}
```

#### onPlanValidated
Plan validation results.
```javascript
onPlanValidated: (validation) => {
  isValid: boolean,           // Whether plan is valid
  issues: string[],           // Any issues found
  optimizations: string[]     // Suggested optimizations
}
```

### Execution Phase Events

#### onTaskExecutionStart
Task execution initiation.
```javascript
onTaskExecutionStart: (taskInfo) => {
  taskId: string,             // Unique task identifier
  description: string,        // Task description
  toolsRequired: string[],    // Tools needed
  priority: string,           // Task priority
  taskNumber: number,         // Current task number
  totalTasks: number          // Total tasks to execute
}
```

#### onTaskExecutionComplete
Task completion results.
```javascript
onTaskExecutionComplete: (result) => {
  taskId: string,             // Task identifier
  success: boolean,           // Whether task succeeded
  hasData: boolean,           // Whether data was gathered
  toolCallsCount: number,     // Number of tool calls made
  factsGathered: number,      // Number of facts collected
  summary: string             // Summary of results
}
```

#### onToolCall
Individual tool invocation.
```javascript
onToolCall: (toolCall) => {
  name: string,               // Tool name (e.g., 'db_query', 'rag_query')
  input: Object               // Tool input parameters
}
```

#### onToolResult
Tool execution results.
```javascript
onToolResult: (toolCall, result) => {
  // toolCall: Original tool call that was made
  // result: {
  //   is_error: boolean,      // Whether tool failed
  //   content: any            // Tool output content
  // }
}
```

#### onFollowUpGenerated
Intelligent follow-up queries generated.
```javascript
onFollowUpGenerated: (followUp) => {
  queries: string[],          // Generated follow-up queries
  reasoning: string           // Why these queries were generated
}
```

### Analysis Phase Events

#### onAnalysisStart
Analysis phase initiation.
```javascript
onAnalysisStart: (analysisInfo) => {
  phase: string,              // Current analysis phase
  totalTasks: number,         // Total tasks executed
  failedTasks: number,        // Number of failed tasks
  toolCalls: number           // Total tool calls made
}
```

#### onInsightsExtracted
Key insights from execution.
```javascript
onInsightsExtracted: (insights) => {
  keyFindings: string[],      // Main findings
  patterns: string[],         // Patterns identified
  recommendations: string[]   // Actionable recommendations
}
```

#### onResponseGenerationStart
Response generation initiation.
```javascript
onResponseGenerationStart: (responseInfo) => {
  type: 'formatted'|'standard',     // Type of response being generated
  hasFormattedContent: boolean,     // Whether formatted content is included
  dataPoints: number                // Number of data points to include
}
```

### Agent Coordination Events

#### onAgentTransition
Transitions between specialized agents.
```javascript
onAgentTransition: (transition) => {
  fromAgent: string,          // Previous agent (e.g., 'PlannerAgent')
  toAgent: string,            // Next agent (e.g., 'ExecutorAgent')
  reason: string,             // Reason for transition
  transitionNumber: number    // Current transition count
}
```

#### onAgentDecision
Decision-making by agents.
```javascript
onAgentDecision: (decision) => {
  agent: string,              // Agent making the decision
  decision: string,           // The decision made
  reasoning: string,          // Reasoning behind decision
  context: Object             // Decision context
}
```

### Error Handling Events

#### onErrorRecovered
Error recovery actions.
```javascript
onErrorRecovered: (recovery) => {
  phase: string,              // Phase where error occurred
  error: string,              // Error message
  recoveryAction: string      // Action taken to recover
}
```

#### onReplanning
Replanning triggered by failures.
```javascript
onReplanning: (replan) => {
  reason: string,             // Why replanning was needed
  attemptNumber: number,      // Current replanning attempt
  maxAttempts: number         // Maximum replanning attempts
}
```

### Data Processing Events

#### onDataOnboarding
Data onboarding operations.
```javascript
onDataOnboarding: (onboarding) => {
  phase: string,              // Current onboarding phase
  files: string[],            // Files being processed
  mappings: Object,           // Column mappings created
  progress: number            // Progress percentage (0-100)
}
```

### Completion Events

#### onComplete
Final execution completion.
```javascript
onComplete: (result) => {
  response: string,           // Final response (empty if streamed)
  metadata: {
    totalTasks: number,
    agentTransitions: number,
    toolCalls: number,
    executionTime: number,
    streamed: boolean
  },
  responseTime: number        // Total execution time in milliseconds
}
```

## Event Flow Examples

### Typical Multi-Agent Flow

```
onStatusChange("🎯 Analyzing user intent")
onIntentAnalyzed({...})
onAgentTransition({fromAgent: "CoordinatorAgent", toAgent: "PlannerAgent"})
onStatusChange("📋 Generating execution plan")
onPlanGenerated({...})
onAgentTransition({fromAgent: "PlannerAgent", toAgent: "ExecutorAgent"})
onStatusChange("⚡ Executing tasks")
onTaskExecutionStart({taskId: "task_1", ...})
onToolCall({name: "db_query", ...})
onToolResult({...})
onTaskExecutionComplete({taskId: "task_1", success: true, ...})
onAgentTransition({fromAgent: "ExecutorAgent", toAgent: "AnalyzerAgent"})
onStatusChange("🔍 Analyzing results")
onAnalysisStart({...})
onInsightsExtracted({...})
onResponseGenerationStart({type: "formatted", ...})
onTokenReceived("Based") onTokenReceived("on") ...
onComplete({...})
```

### Error Recovery Flow

```
onTaskExecutionStart({...})
onToolCall({name: "db_query", ...})
onToolResult({is_error: true, ...})
onErrorRecovered({phase: "execution", error: "Database timeout", recoveryAction: "Retry with shorter timeout"})
onTaskExecutionComplete({success: true, ...})
```

### Replanning Flow

```
onTaskExecutionComplete({success: false, hasData: false, ...})
onAgentDecision({agent: "CoordinatorAgent", decision: "Replanning needed", reasoning: "No meaningful data gathered"})
onReplanning({reason: "High failure rate", attemptNumber: 1, maxAttempts: 3})
onAgentTransition({fromAgent: "ExecutorAgent", toAgent: "PlannerAgent"})
onPlanGenerated({...}) // New plan
```

## Implementation Notes

- All events are optional and should gracefully handle missing callbacks
- Events should provide enough context for rich frontend experiences
- Streaming should not significantly impact performance
- Events should be emitted consistently across all agents
- Rich data types (objects, arrays) are preferred over primitive types for extensibility