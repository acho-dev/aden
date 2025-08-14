/**
 * Tool Display Names Mapping with Variations and Emojis
 * Maps MCP tool names to arrays of human-readable display names with emojis for UI presentation
 * Each tool call will randomly select one of the variations for a more dynamic experience
 */

export const TOOL_DISPLAY_NAMES = {
  // Core thinking and planning tools
  think_sequentially: [
    "🤔 Thinking step by step",
    "🧠 Breaking this down",
    "💭 Working through this",
    "🔍 Analyzing systematically",
    "⚡ Processing thoughts",
  ],
  plan_tasks: [
    "📋 Planning ahead",
    "🗓️ Organizing tasks",
    "📝 Mapping out work",
    "🎯 Setting up plan",
    "📊 Structuring approach",
  ],

  // Memory management tools
  remember: [
    "💾 Storing this insight",
    "🧠 Committing to memory",
    "📝 Taking mental notes",
    "💡 Filing this away",
    "🎯 Remembering this",
  ],

  // File operations
  read_file: [
    "📖 Reading notes",
    "👀 Checking contents",
    "📄 Opening file",
    "🔍 Reviewing document",
    "📋 Scanning text",
  ],
  write_file: [
    "✍️ Writing notes",
    "💾 Saving content",
    "📝 Creating file",
    "🖊️ Documenting",
    "📄 Recording info",
  ],
  list_directory: [
    "👀 Looking around",
    "📁 Browsing files",
    "🗂️ Checking contents",
    "🔍 Exploring folder",
    "📋 Listing items",
  ],

  // System operations
  execute_command: [
    "⚡ Running command",
    "🖥️ Executing system call",
    "⌨️ Terminal work",
    "🔧 System operation",
    "💻 Command execution",
  ],

  // Knowledge and memory (legacy)
  store_knowledge: [
    "🧠 Storing knowledge",
    "📚 Banking information",
    "💾 Saving insights",
    "📖 Recording wisdom",
    "🎓 Knowledge capture",
  ],
  recall_memory: [
    "🔍 Recalling memory",
    "💭 Searching knowledge",
    "📚 Consulting archives",
    "🧠 Memory lookup",
    "💡 Knowledge retrieval",
  ],
  create_project: [
    "🚀 Starting project",
    "📋 Creating workspace",
    "🎯 Project setup",
    "📁 New initiative",
    "🛠️ Project creation",
  ],
  get_memory_stats: [
    "📊 Memory statistics",
    "📈 Usage metrics",
    "🔍 Memory overview",
    "📋 Stats summary",
    "💾 Memory status",
  ],

  // Database and data operations
  db_query: [
    "🔍 Analyzing data",
    "📊 Querying database",
    "💾 Data exploration",
    "🎯 Finding insights",
    "📈 Data investigation",
  ],
  rag_query: [
    "🔍 Searching documents",
    "📚 RAG document search",
    "🤖 AI document query",
    "💡 Finding relevant info",
    "📖 Document retrieval",
  ],

  // User interface tools
  provide_options: [
    "💡 Suggesting options",
    "🎯 Presenting choices",
    "📋 Offering alternatives",
    "🤔 Giving recommendations",
    "⚡ Proposing solutions",
  ],
  mermaid_diagram: [
    "🎨 Drawing diagram",
    "📊 Creating visual",
    "🖼️ Illustrating flow",
    "📈 Generating chart",
    "🗺️ Mapping process",
  ],
  vega_lite_diagram: [
    "📊 Creating data visualization",
    "📈 Building chart",
    "🔍 Visualizing data",
    "📉 Plotting graph",
    "🎯 Data storytelling",
  ],
  markdown_table: [
    "📋 Formatting table",
    "📊 Structuring data",
    "🗂️ Organizing information",
    "📈 Creating layout",
    "🎯 Data presentation",
  ],
  markdown_action_item: [
    "📝 Creating action items",
    "✅ Organizing tasks",
    "📋 Task management",
    "🎯 Planning workflow",
    "📌 Tracking to-dos",
  ],

  // Web and external tools (if they exist)
  web_search: [
    "🔍 Searching the web",
    "🌐 Looking online",
    "🔎 Web investigation",
    "🌍 Internet search",
    "📡 Online research",
  ],
  knowledge_search: [
    "🧠 Internal search",
    "📚 Knowledge lookup",
    "🔍 Consulting database",
    "💡 Finding information",
    "📖 Searching records",
  ],
};

/**
 * Get human-readable display name for a tool with random variation
 * @param {string} toolName - The MCP tool name
 * @returns {string} Human-readable display name with emoji
 */
export function getToolDisplayName(toolName) {
  const variations = TOOL_DISPLAY_NAMES[toolName];

  if (!variations) {
    return toolName;
  }

  if (Array.isArray(variations)) {
    // Randomly select one of the variations
    const randomIndex = Math.floor(Math.random() * variations.length);
    return variations[randomIndex];
  }

  // Fallback for backward compatibility
  return variations;
}

/**
 * Add display name to tool call object (without modifying original)
 * @param {Object} toolCall - Tool call object with name property
 * @returns {Object} Tool call object with displayName added
 */
export function enrichToolCallWithDisplayName(toolCall) {
  if (!toolCall || !toolCall.name) {
    return toolCall;
  }

  return {
    ...toolCall,
    displayName: getToolDisplayName(toolCall.name),
  };
}

/**
 * Add display names to an array of tool calls
 * @param {Array} toolCalls - Array of tool call objects
 * @returns {Array} Array of tool calls with display names added
 */
export function enrichToolCallsWithDisplayNames(toolCalls) {
  if (!Array.isArray(toolCalls)) {
    return toolCalls;
  }

  return toolCalls.map(enrichToolCallWithDisplayName);
}
