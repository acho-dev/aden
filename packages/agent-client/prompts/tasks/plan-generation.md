# Task Plan Generation Prompt

Create a detailed execution plan for this user request:

## User Message
"{{message}}"

## Intent Analysis
- **Understanding**: {{intentAnalysis.understanding}}
- **Complexity**: {{intentAnalysis.complexity}}
- **Required data sources**: {{intentAnalysis.requiredDataSources}}
- **Deliverable type**: {{intentAnalysis.deliverableType}}

{{#if conversationHistory}}
## Conversation History
{{conversationHistory}}
{{/if}}

{{#if memoryContext}}
## Relevant Context from Previous Conversations
{{memoryContext}}
{{/if}}

{{#if isReplanning}}
## IMPORTANT - THIS IS A REPLANNING ATTEMPT
Previous execution failed because most tasks gathered no meaningful data.
Failed queries returned NULL or empty results.

Create a NEW plan with DIFFERENT approaches:
- Try different table joins or relationships
- Use different date ranges or filters
- Check for data in alternative tables
- Consider that the data might not exist in the expected format
{{/if}}

## Planning Instructions

Create a comprehensive plan with specific, actionable tasks. Each task should:
1. Have a clear description and expected outcome
2. Specify required tools and data sources
3. Include dependencies on other tasks (follow logical workflow patterns)
4. Estimate execution priority

## Available Tools for Execution

{{#each availableTools}}
- **{{name}}**: {{description}}
{{/each}}

## Response Format

Return your plan in markdown format:

### Tasks

#### Task 1: [Task ID]
- **Description**: Specific task description
- **Tools Required**: tool1, tool2
- **Priority**: High/Medium/Low
- **Dependencies**: List dependent task IDs (or None)
- **Expected Outcome**: What this task should accomplish
- **Data Sources Needed**: List specific data sources

#### Task 2: [Task ID]
[Same format for additional tasks]

### Execution Order
1. task_1
2. task_2
3. [additional tasks in order]

### Risk Factors
- List potential issues or challenges
- Include mitigation strategies if known