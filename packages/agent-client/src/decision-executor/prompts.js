export function generateInitialPlanPrompt(
  message,
  conversationContext,
  tools,
  schemaContext = null
) {
  // Schema context is now included in system prompt, so we ignore the schemaContext parameter

  return `You are a direct and efficient planning agent. Analyze the user's request and create a practical plan.

Current User Request: "${message}"

${conversationContext ? `${conversationContext}\n` : ""}

Available tools: ${tools.map(t => `${t.name}: ${t.description}`).join("\n")}

PLANNING GUIDELINES:
- Database schema is available in your system context - refer to it for data structure when planning database queries
- Be thorough and investigative - don't be lazy on tool use and data discovery
- For greeting/casual messages (hi, hello, thanks), keep response simple with minimal/no tasks
- For specific questions or requests, create focused, actionable tasks

CRITICAL FOR DATA/BUSINESS REQUESTS:
- For business queries about "our data", "our customers", "our deals", "our tasks", etc., you MUST create db_query tasks to access the database
- Database schema is available in your system context - use it to understand available tables and structure data queries
- When user asks for charts, diagrams, or visualizations of data, ALWAYS create tasks to gather the underlying data FIRST
- For data-driven visualizations (bar charts, line graphs, pie charts, Gantt charts, etc.), you MUST include db_query tasks to collect the actual data
- Never attempt to create data visualizations without first gathering the real data from the database
- GANTT CHART RULE: For any chart request, you MUST first query the relevant table (like _aden_tasks) to get actual task data
- Example: "show me a gantt chart of our tasks" should have tasks: 1) Query _aden_tasks table (tools_needed: ["db_query"]), 2) Create chart with that data (tools_needed: ["mermaid_diagram"])
- Only for structural diagrams (flowcharts, org charts, process flows) can you skip data gathering
- ALWAYS specify the correct tools_needed array for each task - this is CRITICAL for proper execution

Create a JSON response:
{
  "understanding": "Direct interpretation of what the user wants",
  "context_analysis": "Brief analysis if context is relevant, otherwise 'Simple request - no complex analysis needed'",
  "tasks": [
    {
      "id": "task_1", 
      "description": "What this task accomplishes",
      "tools_needed": ["tool1", "tool2"],
      "priority": "high|medium|low",
      "dependencies": [],
      "context_reason": "Why this task is needed"
    }
  ],
  "response": "Direct, friendly acknowledgment"
}

TASK SEQUENCING FOR DATA VISUALIZATIONS:
- Always create data gathering tasks BEFORE visualization tasks
- Use dependencies to ensure proper order: visualization tasks depend on data gathering tasks
- MANDATORY: Always populate the tools_needed array with the exact tools required
- Example task sequence:
  Task 1: "Query sales data from database" (tools_needed: ["db_query"], dependencies: [])
  Task 2: "Create bar chart with sales data" (tools_needed: ["vega_lite_diagram"], dependencies: ["task_1"])

TOOLS MAPPING GUIDE:
- For database queries: tools_needed: ["db_query"]
- For bar/line/scatter charts: tools_needed: ["vega_lite_diagram"] 
- For gantt/flowchart/sequence diagrams: tools_needed: ["mermaid_diagram"]
- For formatted tables: tools_needed: ["markdown_table"]

For simple greetings or casual interactions, return minimal tasks or empty task array. Focus on efficiency and user intent.`;
}

export function generateGapAnalysisPrompt(
  message,
  currentTask,
  taskQueue,
  gatheredFacts,
  conversationHistory,
  tools,
  schemaContext = null
) {
  // Schema context is now included in system prompt, so we ignore the schemaContext parameter

  return `The following is a transcript and tool calls between a user and an AI assistant. 
  The user asks the AI a business question, and the AI provides a response, 
  possibly with a tool call to get external data. 
  determining how sufficiently the response addresses the user's original question. Answer with "yes" or "no".

Original User Request: "${message}"

Current Task to Execute: ${
    currentTask ? JSON.stringify(currentTask, null, 2) : "No tasks remaining"
  }

Remaining Task Queue: ${taskQueue.length} tasks
${taskQueue
  .slice(0, 3)
  .map((task, i) => `${i + 1}. ${task.description}`)
  .join("\n")}

Facts Gathered So Far:
${
  gatheredFacts.length > 0
    ? gatheredFacts.map((fact, i) => `${i + 1}. ${fact}`).join("\n")
    : "No facts gathered yet"
}

Available Tools: ${tools.map(t => t.name).join(", ")}

Conversation History: ${conversationHistory.length} messages`;
}

export function generateClarificationQuestionsPrompt(message) {
  return `Generate a helpful response asking for clarification from the user.

Original User Request: "${message}"

Create a friendly, professional response that:
- Acknowledges their request
- Explains why these questions help provide better assistance
- Offers to proceed with assumptions if they prefer
- Keep it brief and direct
- Use a casual, helpful tone
- Focus only on the essential questions
- Avoid sales-like language or excessive politeness
- Don't make assumptions about people, data, or specific details
- Don't mention specific names or entities unless provided by the user

Keep it simple, direct, and human-like rather than overly conversational.`;
}

export function generateExecuteCurrentTaskPrompt(
  task,
  previousResults,
  tools,
  schemaContext = null
) {
  // Schema context is now included in system prompt, so we ignore the schemaContext parameter

  return `Execute this specific task using available tools and leveraging previous execution results.

Task: ${JSON.stringify(task, null, 2)}

CRITICAL TOOL EXECUTION REQUIREMENTS:
- You MUST execute the exact task described above
- You MUST use the tools specified in the "tools_needed" field: ${JSON.stringify(
    task.toolsRequired || []
  )}
- If the task specifies db_query in tools_needed, you MUST call db_query first before any visualization tools
- If the task says "Query the table" or has "db_query" in tools_needed, you MUST use db_query first
- Do NOT skip the required tools or use different tools than specified in tools_needed

Previous Tool Results:
${previousResults}

Available Tools:
${tools
  .map(t => {
    // Enhanced description for db_query to emphasize required parameters (same as API server)
    let enhancedDescription = t.description;
    if (t.name === "db_query") {
      enhancedDescription +=
        ' IMPORTANT: The "query" parameter is REQUIRED - you MUST provide a valid SQL query string.';
    }

    // Include schema information like API server does
    const schemaInfo = t.input_schema
      ? `\n  Schema: ${JSON.stringify(t.input_schema, null, 2)}`
      : "";
    const requiredFields = t.input_schema?.required?.length
      ? `\n  Required Parameters: ${t.input_schema.required.join(", ")}`
      : "";

    return `${t.name}: ${enhancedDescription}${schemaInfo}${requiredFields}`;
  })
  .join("\n\n")}

IMPORTANT EXECUTION GUIDELINES:
1. **Follow Tools Order**: Use the tools in the sequence specified by the tools_needed field
2. **Data First**: For visualization tasks, always gather data first with db_query before creating charts
3. **Leverage Previous Data**: Use information from previous tool results to inform this task
4. **Avoid Duplicate Queries**: If similar data was already fetched, reference it instead of re-querying
5. **Build Upon Previous Results**: Use previous findings to ask more targeted, specific questions
6. **Cross-Reference Information**: Look for patterns and connections with previously gathered data

CRITICAL DATABASE QUERY STRATEGY (PostgreSQL):
When working with databases (db_query tool), leverage the schema context available in your system prompt:
- **Database Type**: ALL queries MUST be valid PostgreSQL syntax with rigorous type casting
- **Use Schema Context**: Refer to the database schema in your system context for table and column names
- **Targeted Queries**: Generate specific queries based on known schema structure
- **Smart Exploration**: Use schema knowledge to craft efficient, focused queries
- **Multiple Queries Recommended**: You can generate up to 15, at least 5 db_query tool calls in a single response for comprehensive data gathering
- **Schema-Aware**: Build queries that leverage known relationships and data types from the schema

POSTGRESQL-SPECIFIC REQUIREMENTS - CRITICAL FOR ERROR PREVENTION:
- **MANDATORY Type Casting**: ALWAYS use explicit PostgreSQL type casting (::operator) to prevent type errors
- **String Comparisons**: Use ILIKE for case-insensitive searches, LIKE for case-sensitive
- **Date Operations**: Cast strings to dates explicitly: '2025-01-01'::date, NOW()::date
- **Numeric Comparisons**: ALWAYS cast to appropriate numeric types: column_name::integer, column_name::numeric
- **Text Concatenation**: Use || operator: first_name || ' ' || last_name
- **JOIN Operations**: Cast keys explicitly: t.owner::text = e.employee_number::text
- **IN Clauses**: Cast subquery results: WHERE owner::text IN (SELECT employee_number::text FROM...)
- **NULL Handling**: Use COALESCE() and IS NULL/IS NOT NULL appropriately
- **SORTING WITH NULLS**: ALWAYS use NULLS LAST when ordering: ORDER BY column_name NULLS LAST, ORDER BY date_column DESC NULLS LAST
- **Common Type Cast Examples**:
  * Text-to-Text: column_name::text
  * Number-to-Text: employee_id::text  
  * Text-to-Number: column_value::integer
  * Ensure both sides of = operator are same type: left_col::text = right_col::text

ENHANCED PEOPLE/PERSON QUERY STRATEGY:
When queries involve people, names, or individuals, be EXTRA thorough:
- **Multi-table Person Search**: People data often spans multiple tables (users, employees, contacts, customers, leads, etc.)
- **Name Variations**: Search for both full names and partial matches (first name, last name separately)
- **Cross-reference Tables**: A person might appear in contracts, meetings, projects, deals, and contact tables
- **Relationship Mapping**: Explore how person data connects across different business entities
- **Examples of comprehensive PostgreSQL person queries**:
  * Search in users/employees table: SELECT * FROM users WHERE name ILIKE '%PersonName%'
  * Check customer/client tables: SELECT * FROM customers WHERE contact_name ILIKE '%PersonName%'
  * Look in deals/contracts: SELECT * FROM deals WHERE assigned_to ILIKE '%PersonName%' OR contact_person ILIKE '%PersonName%'
  * Explore meetings/events: SELECT * FROM meetings WHERE attendees ILIKE '%PersonName%' OR organizer ILIKE '%PersonName%'
  * Check project assignments: SELECT * FROM projects WHERE team_members ILIKE '%PersonName%' OR manager ILIKE '%PersonName%'
  * Look for email references: SELECT * FROM communications WHERE from_email ILIKE '%PersonName%' OR to_email ILIKE '%PersonName%'

COMPREHENSIVE EXPLORATION PATTERNS:
- **Schema Available**: Database schema is available in your system context
- **Direct Queries**: Use schema information from your system context to query tables directly
- **Sample Data**: Get 3-5 sample rows from each table to understand data structure
- **Pattern Recognition**: Look for naming patterns, foreign keys, and relationship indicators
- **Cross-table Queries**: Use JOINs to connect related information across tables
- **Scale Understanding**: Use COUNT(*) to understand data volume in each table

SYSTEMATIC QUERY EXAMPLES WITH PROPER TYPE CASTING:
For person-related queries, generate queries like:
1. Sample data: SELECT * FROM users ORDER BY created_at NULLS LAST LIMIT 3, SELECT * FROM customers ORDER BY name NULLS LAST LIMIT 3
2. Name searches across tables (WITH TYPE CASTING):
  - SELECT * FROM users WHERE CONCAT(first_name, ' ', last_name) ILIKE '%SearchName%' ORDER BY last_name NULLS LAST
  - SELECT * FROM customers WHERE contact_name::text ILIKE '%SearchName%' OR contact_email::text ILIKE '%SearchName%' ORDER BY contact_name NULLS LAST
  - SELECT * FROM deals WHERE assigned_to::text ILIKE '%SearchName%' ORDER BY created_date DESC NULLS LAST
3. JOIN queries with explicit type casting:
  - SELECT * FROM projects p JOIN users u ON p.manager_id::text = u.id::text WHERE u.name::text ILIKE '%SearchName%' ORDER BY p.start_date NULLS LAST
  - SELECT * FROM tasks t JOIN employees e ON t.owner::text = e.employee_number::text WHERE e.first_name::text = 'Frank' ORDER BY t.due_date NULLS LAST
4. IN clause queries with type casting:
  - SELECT * FROM tasks WHERE owner::text IN (SELECT employee_number::text FROM employees WHERE first_name::text = 'Frank') ORDER BY created_at DESC NULLS LAST
  - SELECT * FROM projects WHERE owner::text IN (SELECT employee_id::text FROM users WHERE name::text ILIKE '%Frank%') ORDER BY project_name NULLS LAST

Your goal is to execute this task efficiently while maximizing the value of already-gathered information.

TASK EXECUTION STRATEGY:
1. **MANDATORY**: Use ONLY the tools specified in the task's tools_needed field
2. **SEQUENCE**: If multiple tools are needed, use them in the order that makes logical sense (data gathering before visualization)
3. **NO SUBSTITUTIONS**: Do not use alternative tools not listed in tools_needed
4. **COMPLETE EXECUTION**: Execute all tools listed in tools_needed for this task

Focus on:
1. Using the exact tools specified in tools_needed for this task
2. Referencing and building upon previous execution results
3. Gathering additional factual information that complements existing data
4. Being thorough but efficient through systematic exploration
5. Extracting key insights that connect with previous findings
6. **When uncertain about database content: Query first, analyze second**
7. **For person-related queries: Cast a wide net across multiple tables before concluding**
8. **Generate 8-15 diverse queries when exploring person/people data to ensure comprehensive coverage**

After tool execution, provide a summary of what was accomplished and what facts were gathered.`;
}

export function generateFinalResponsePrompt(
  message,
  gatheredFacts,
  allToolResults,
  initialResponse
) {
  return `You are an expert analyst completing a comprehensive response to the user's request. Synthesize all gathered information into a professional, insightful answer that captures the essence of their question and provides valuable business intelligence.

Original User Request: "${message}"

Facts Gathered:
${
  gatheredFacts.length > 0
    ? gatheredFacts.map((fact, i) => `${i + 1}. ${fact}`).join("\n")
    : "No specific facts gathered"
}

Detailed Tool Results:
${
  allToolResults.length > 0
    ? allToolResults.map(result => `${result.tool_name}: ${result.content}`).join("\n\n")
    : "No tool results available"
}

Initial Response: ${initialResponse}

PROFESSIONAL RESPONSE GUIDELINES:

**Structure & Presentation:**
- Lead with a clear, direct answer to the user's specific question
- Organize information logically with clear sections when appropriate
- Use professional business language while remaining accessible
- Present data and insights with confidence and authority

**Analysis & Insights:**
- Identify clear patterns and relationships in the data when they exist
- Provide meaningful insights only when they add genuine value
- Highlight significant findings or notable exceptions
- Quantify results with specific numbers and metrics
- Only connect to broader implications when directly relevant

**Business Intelligence Focus:**
- Present data in business-relevant context when appropriate
- Focus on answering the specific question asked
- Add insights only when they genuinely matter to the user's query
- Note significant limitations or data quality issues if they affect the answer
- Keep analysis proportional to the complexity of the question

**Professional Communication:**
- Use clear, appropriate business language
- Maintain professional tone without being overly formal
- Structure information clearly and logically
- Include important caveats when they matter
- Be accurate and avoid speculation beyond available data

**Response Completeness:**
- Answer the user's specific question directly and completely
- If data is incomplete, briefly note limitations that affect the answer
- Suggest next steps only when they're directly relevant to the question
- Provide context that helps users understand the answer

Your goal is to deliver a clear, accurate response that directly answers the user's question with appropriate professional insight. Avoid unnecessary elaboration unless the question specifically calls for deeper analysis.`;
}

export function generateShouldReplanPrompt(
  executedTask,
  taskExecution,
  gatheredFacts,
  taskQueue,
  replanCount = 0,
  maxReplans = 3
) {
  return `
Based on the executed task and its results, determine if re-planning is needed.

Executed Task: ${executedTask.description}
Task Results: ${JSON.stringify(taskExecution.facts)}
Current Remaining Tasks: ${JSON.stringify(taskQueue.map(t => t.description))}
Gathered Facts: ${gatheredFacts.length > 0 ? gatheredFacts.join(", ") : "No facts gathered yet"}

Replan Budget: ${replanCount}/${maxReplans} replans used

Analyze if:
1. The results reveal new information that changes the approach
2. The results indicate the current plan is insufficient
3. New tasks are needed based on the discoveries
4. The order of tasks should be changed
5. Whether replanning is worth the remaining budget (${maxReplans - replanCount} replans left)

IMPORTANT: Consider the replan budget carefully. Only replan if:
- Critical new information was discovered that fundamentally changes the approach
- The current plan is clearly insufficient or incorrect
- The benefit of replanning outweighs the cost of using limited replan budget

Respond with JSON:
{
  "needsReplan": boolean,
  "reason": "explanation of why replanning is or isn't needed, considering budget constraints",
  "confidence": number between 0-1
}`;
}

export function generateReplanPrompt(
  originalMessage,
  gatheredFacts,
  executedTask,
  taskExecution,
  remainingTasks,
  tools
) {
  return `
You are an AI assistant that needs to re-plan tasks based on new information discovered during execution.

ORIGINAL USER REQUEST:
${originalMessage}

EXECUTED TASK:
${executedTask.description}

TASK EXECUTION RESULTS:
${JSON.stringify(taskExecution.facts)}

ALL GATHERED FACTS SO FAR:
${JSON.stringify(gatheredFacts)}

CURRENT REMAINING TASKS:
${JSON.stringify(remainingTasks.map(t => t.description))}

AVAILABLE TOOLS:
${tools.map(tool => `- ${tool.name}: ${tool.description}`).join("\n")}

Based on the new information from the executed task, re-analyze the situation and generate an updated plan.

Respond with JSON using this exact schema:
{
  "understanding": "Updated understanding of the user's request based on new discoveries",
  "context_analysis": "Analysis of how the new information changes the approach",
  "tasks": [
    {
      "id": "unique_task_id",
      "description": "clear description of what needs to be done",
      "priority": "high|medium|low",
      "tools_needed": ["tool_name1", "tool_name2"]
    }
  ],
  "response": "Brief explanation of the updated plan"
}

Important:
- Consider what new information was discovered
- Remove tasks that are no longer needed
- Add new tasks if the discoveries reveal additional requirements
- Reorder tasks based on new priorities or dependencies
- Keep successful patterns from the executed task
`;
}

export function generateExplanationForFormattedContentPrompt(
  message,
  gatheredFacts,
  formattedContentSummary,
  initialResponse
) {
  return `User's request: "${message}"

I have successfully generated formatted content to answer the user's question. Please provide a natural, human-like explanation that:
1. Briefly explains what was done to fulfill the user's request
2. Describes what the formatted content shows/contains
3. Provides any relevant insights or context
4. Maintains a conversational and helpful tone

Available context:
- Gathered facts: ${gatheredFacts.join("; ")}
- Tool results summary: ${formattedContentSummary}
- Initial response: ${initialResponse}

Please provide ONLY the human-like explanation text. Do NOT include the formatted content itself - that will be added separately.`;
}
