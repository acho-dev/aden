# Prompt Templates

This directory contains all the prompt templates used by the Aden MCP multi-agent system. The prompts are written in Markdown format with template variable support, making them easy to read, modify, and extend.

## 📁 Directory Structure

```
prompts/
├── agents/           # Agent-specific system prompts
│   ├── planner.md    # PlannerAgent system prompt
│   ├── executor.md   # ExecutorAgent system prompt
│   └── analyzer.md   # AnalyzerAgent system prompt
├── tasks/            # Task-specific prompts
│   ├── intent-analysis.md    # User intent analysis
│   ├── plan-generation.md    # Task plan generation
│   └── ...
├── prompt-config.json  # Prompt configuration
└── README.md          # This file
```

## 🎯 Quick Start

### Customizing Prompts

1. **Edit any `.md` file** in the `agents/` or `tasks/` directories
2. Changes are loaded automatically (if hot reload is enabled)
3. Use template variables for dynamic content

### Template Variables

Variables are enclosed in `{{variable}}` brackets:

```markdown
You are analyzing the request: "{{message}}"

{{#if hasDatabase}}
Database schema is available:
{{schemaContext}}
{{/if}}
```

## 📝 Template Syntax

### Basic Variables
```markdown
{{variableName}}           # Simple variable
{{user.name}}             # Nested property
{{variable|default text}}  # With default value
```

### Conditional Sections
```markdown
{{#if condition}}
This content appears if condition is truthy
{{/if}}
```

### Loops
```markdown
{{#each items}}
- {{name}}: {{description}}
{{/each}}
```

### Special Variables in Loops
```markdown
{{#each tasks}}
Task {{@index}}: {{this}}
{{/each}}
```

## 🔧 Available Variables

### Agent Prompts

#### PlannerAgent (`agents/planner.md`)
- `schemaContext` - Database schema information
- `ragContext` - RAG knowledge base context
- `conversationHistory` - Previous conversation context
- `availableTools` - List of available tools
- `hasBusinessContext` - Flag for business queries
- `hasDataOnboarding` - Flag for data import tasks
- `hasCodeGeneration` - Flag for code generation

#### ExecutorAgent (`agents/executor.md`)
- `task` - Current task to execute
  - `task.id` - Task identifier
  - `task.description` - Task description
  - `task.toolsRequired` - Required tools
  - `task.expectedOutcome` - Expected result
- `schemaContext` - Database schema
- `ragContext` - Knowledge base context
- `conversationHistory` - Conversation context
- `previousResults` - Previous execution results
- `availableTools` - Available tools

#### AnalyzerAgent (`agents/analyzer.md`)
- `originalMessage` - User's original request
- `conversationHistory` - Conversation context
- `executionResults` - Task execution results
- `keyInsights` - Extracted insights
- `recommendations` - Suggested actions
- `dataQuality` - Data quality metrics
- `formattedContent` - Pre-formatted results
- `hasFormattedContent` - Flag for formatted content

### Task Prompts

#### Intent Analysis (`tasks/intent-analysis.md`)
- `message` - User message to analyze
- `hasDatabase` - Database context available
- `hasFiles` - File operations needed
- `hasExternal` - External sources required

#### Plan Generation (`tasks/plan-generation.md`)
- `message` - User request
- `intentAnalysis` - Analysis results
  - `intentAnalysis.understanding`
  - `intentAnalysis.complexity`
  - `intentAnalysis.requiredDataSources`
  - `intentAnalysis.deliverableType`
- `conversationHistory` - Previous context
- `memoryContext` - Memory from past sessions
- `isReplanning` - Replanning flag
- `availableTools` - Tool list

## 🚀 Advanced Usage

### Creating New Prompts

1. Create a new `.md` file in the appropriate directory
2. Add the prompt key to `prompt-config.json`
3. Use in code:

```javascript
import { getPrompt } from '../prompts/prompt-manager.js';

const prompt = getPrompt('agents/my-agent', {
  variable1: 'value1',
  variable2: 'value2'
});
```

### Dynamic Sections

Use conditionals for context-specific content:

```markdown
{{#if isCodeGeneration}}
## Code Generation Guidelines
- Always use write_file to create actual files
- Include test cases
{{/if}}

{{#if isDatabaseQuery}}
## Database Query Guidelines
- Use JOIN operations for comprehensive data
- Include ORDER BY and LIMIT clauses
{{/if}}
```

### Tool Lists

Dynamically render available tools:

```markdown
## Available Tools

{{#each availableTools}}
- **{{name}}**: {{description}}
{{/each}}
```

## 🔄 Hot Reload

When `enableHotReload` is set to `true` in `prompt-config.json`, prompts are automatically reloaded when files change. This allows for rapid iteration during development.

## 🎨 Best Practices

1. **Keep prompts focused** - Each prompt should have a single, clear purpose
2. **Use meaningful variable names** - Make templates self-documenting
3. **Add comments** - Use markdown comments for developer notes
4. **Test changes** - Verify prompt changes with actual agent execution
5. **Version control** - Track prompt changes in git
6. **Document variables** - List all variables used in each prompt

## 📊 Monitoring

The PromptManager provides statistics and debugging:

```javascript
const promptManager = getPromptManager();

// Get all available prompts
const prompts = promptManager.getAvailablePrompts();

// Export prompts with variable analysis
const exports = promptManager.exportPrompts();

// Clear cache after changes
promptManager.clearCache();
```

## 🤝 Contributing

When contributing new prompts:

1. Follow the existing structure and naming conventions
2. Document all template variables
3. Include examples in this README
4. Test with various input scenarios
5. Ensure backward compatibility

## 📄 License

These prompt templates are part of the Aden project and follow the same license terms.