# Intent Analysis Prompt

Analyze this user request and determine the intent, complexity, and requirements:

## User Message
"{{message}}"

## Analysis Required

Provide your analysis in markdown format:

### Understanding
Clear description of what the user wants

### Context Analysis  
Analysis of complexity and requirements

### Primary Intent
Main goal category (e.g., data_analysis, report_generation, information_lookup, code_generation, file_operations)

### Complexity
**Level**: Simple/Moderate/Complex

### Required Data Sources
{{#if hasDatabase}}
- Database tables needed
{{/if}}
{{#if hasFiles}}
- Files to read/write
{{/if}}
{{#if hasExternal}}
- External sources required
{{/if}}
- List each data source needed

### Deliverable Type
Type of expected output (e.g., report, chart, summary, raw_data, code_files, configuration)

### Potential Ambiguities
- List any unclear aspects
- Note missing information that might be needed
- Identify assumptions that need validation