#!/usr/bin/env node

import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TaskPlanner } from "./task-planner.js";
import { SequentialThinker } from "./sequential-thinker.js";
import { ToolManager } from "./tool-manager.js";
import { LoopDetector } from "./loop-detector.js";
import { TeamGraphSync } from "./team-graph-sync.js";
import { createRagTool } from "./tools/rag-tool.js";
import { Neo4jSchemaService } from "../../agent-client/src/decision-executor/neo4j-schema-service.js";
import { fileDownloadManager } from "./file-providers/file-download-manager.js";
import { createAdenOrgTenantId } from "../../agent-client/src/utils/tenant-utils.js";
import {
  KNOWLEDGE_TO_KNOWLEDGE_RELATIONSHIPS,
  isValidRelationshipType,
  sanitizeRelationshipType,
} from "./relationship-types.js";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

// Read mermaid reference documentation
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mermaidReferenceContent = await fs.readFile(
  path.join(__dirname, "reference", "mermaid_diagram.txt"),
  "utf-8"
);

// Load environment variables from root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

class AdenMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "aden-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.toolManager = new ToolManager();
    this.taskPlanner = new TaskPlanner(this.toolManager);
    this.sequentialThinker = new SequentialThinker();
    this.loopDetector = new LoopDetector();

    // Initialize Neo4j knowledge graph service
    this.neo4jService = null;
    if (process.env.NEO4J_PASSWORD) {
      try {
        this.neo4jService = new Neo4jSchemaService({
          uri: process.env.NEO4J_URI || "bolt://localhost:7687",
          username: process.env.NEO4J_USERNAME || "neo4j",
          password: process.env.NEO4J_PASSWORD,
          database: process.env.NEO4J_DATABASE || "contextdb",
        });
        console.error("✅ Neo4j knowledge graph service initialized");
      } catch (error) {
        console.error("⚠️  Failed to initialize Neo4j knowledge graph service:", error.message);
      }
    }

    this.execAsync = promisify(exec);

    // Initialize tools
    this.ragTool = createRagTool();

    // Session state for analytics workflow
    this.sessionState = {};

    // Store current session context for tool access
    this.currentSessionContext = null;

    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "think_sequentially",
            description: "Think through a problem sequentially, step by step",
            inputSchema: {
              type: "object",
              properties: {
                problem: {
                  type: "string",
                  description: "The problem or task to think through",
                },
              },
              required: ["problem"],
            },
          },
          {
            name: "plan_tasks",
            description: "Create a to-do list and plan tasks for a given objective",
            inputSchema: {
              type: "object",
              properties: {
                objective: {
                  type: "string",
                  description: "The main objective to plan tasks for",
                },
              },
              required: ["objective"],
            },
          },
          {
            name: "read_file",
            description: "Read the contents of a file from the session workspace",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The file path relative to session workspace (e.g., 'src/index.js')",
                },
                sessionId: {
                  type: "string",
                  description: "Session ID for workspace isolation",
                },
              },
              required: ["path", "sessionId"],
            },
          },
          {
            name: "write_file",
            description: "Write content to a file in the session workspace",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The file path relative to session workspace (e.g., 'src/index.js')",
                },
                content: {
                  type: "string",
                  description: "The content to write to the file",
                },
                sessionId: {
                  type: "string",
                  description: "Session ID for workspace isolation",
                },
              },
              required: ["path", "content", "sessionId"],
            },
          },
          {
            name: "execute_command",
            description: "Execute a shell command in the session workspace",
            inputSchema: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  description: "The shell command to execute",
                },
                workingDirectory: {
                  type: "string",
                  description: "Working directory relative to session workspace (optional)",
                },
                sessionId: {
                  type: "string",
                  description: "Session ID for workspace isolation",
                },
              },
              required: ["command", "sessionId"],
            },
          },
          {
            name: "list_directory",
            description: "List the contents of a directory in the session workspace",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The directory path relative to session workspace (e.g., 'src' or '.')",
                },
                sessionId: {
                  type: "string",
                  description: "Session ID for workspace isolation",
                },
              },
              required: ["path", "sessionId"],
            },
          },
          {
            name: "store_knowledge",
            description: "Store knowledge in persistent memory",
            inputSchema: {
              type: "object",
              properties: {
                domain: {
                  type: "string",
                  description: 'The knowledge domain (e.g., "nuclear_energy", "ateez_music")',
                },
                data: {
                  type: "object",
                  description: "The knowledge data to store",
                },
              },
              required: ["domain", "data"],
            },
          },
          {
            name: "recall_memory",
            description: "Search and recall information from memory",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "What to search for in memory",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "create_project",
            description: "Create a new project in memory to track work over time",
            inputSchema: {
              type: "object",
              properties: {
                projectId: {
                  type: "string",
                  description: "Unique identifier for the project",
                },
                objective: {
                  type: "string",
                  description: "The main objective of the project",
                },
              },
              required: ["projectId", "objective"],
            },
          },
          {
            name: "get_memory_stats",
            description: "Get statistics about stored memory",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "remember",
            description:
              "Store knowledge in the Neo4j knowledge graph with explicit relationships. The LLM should specify which schema entities this knowledge relates to and how.",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Session ID for context",
                },
                content: {
                  type: "string",
                  description:
                    "Knowledge content to store - decisions, facts, insights, business rules, or domain knowledge",
                },
                category: {
                  type: "string",
                  description:
                    "Knowledge category: 'business_decision', 'technical_insight', 'user_preference', 'domain_knowledge', 'process_insight', 'data_relationship'",
                  default: "business_decision",
                },
                confidence: {
                  type: "number",
                  description:
                    "Use 0.9+ only for explicit user statements, never for analysis or assumptions",
                  default: 0.95,
                },
                relationships: {
                  type: "array",
                  description: "Optional explicit relationships to schema entities",
                  items: {
                    type: "object",
                    properties: {
                      targetEntity: {
                        type: "string",
                        description:
                          "Schema entity ID (e.g., 'customers.email', '_aden_orders.total')",
                      },
                      relationshipType: {
                        type: "string",
                        description:
                          "Valid relationship types: Knowledge-to-Schema: 'INFLUENCES', 'RELATES_TO_SCHEMA', 'AFFECTS_USAGE', 'PROVIDES_CONTEXT', 'GUIDES_PROCESS', 'DESCRIBES_RELATIONSHIP'. Knowledge-to-Knowledge: 'SIMILAR_TO', 'CONTRADICTS', 'BUILDS_ON', 'SUPERSEDES'",
                      },
                      reason: {
                        type: "string",
                        description: "Why this relationship exists (optional)",
                      },
                    },
                    required: ["targetEntity", "relationshipType"],
                  },
                  default: [],
                },
              },
              required: ["sessionId", "content"],
            },
          },
          // knowledge_search is demoted - now start with graph_export instead
          // {
          //   name: 'knowledge_search',
          //   description: 'Search internal knowledge base for relevant information',
          //   inputSchema: {
          //     type: 'object',
          //     properties: {
          //       query: {
          //         type: 'string',
          //         description: 'The search query for the knowledge base'
          //       },
          //       k: {
          //         type: 'number',
          //         description: 'Number of results to return (default: 10)'
          //       }
          //     },
          //     required: ['query']
          //   }
          // },
          {
            name: "provide_options",
            description: "Present multiple options to the user in a selectable format",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Title or context for the options",
                },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: {
                        type: "string",
                        description: "The option text/description",
                      },
                      action: {
                        type: "string",
                        description: "The action to take if selected (optional)",
                      },
                    },
                    required: ["text"],
                  },
                  description: "Array of options to present",
                },
              },
              required: ["options"],
            },
          },
          {
            name: "db_query",
            description:
              "Execute SQL queries against the database using table names from the preloaded schema context. The database schema is already available in the system context - use actual table names from the schema. Do not apply arbitrary filters when values are unknown - let users specify explicit conditions.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description:
                    "SQL query to execute. Use actual table names from the preloaded schema context (like _aden_deals, _aden_companies, etc.). Use _aden_id column to filter specific records. Do not add WHERE clauses with unknown values.",
                },
                params: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: "Parameters for the SQL query (optional)",
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results to return (default: 100)",
                  default: 100,
                },
              },
              required: ["query"],
            },
          },
          {
            name: "duckdb_query",
            description:
              "Execute SQL queries against a DuckDB database file in the session workspace. Use this tool when working with local DuckDB files (.duckdb, .db) that have been created or loaded with data. Supports all DuckDB SQL syntax including CSV imports and analytical queries.",
            inputSchema: {
              type: "object",
              properties: {
                db_path: {
                  type: "string",
                  description:
                    "Path to the DuckDB database file relative to session workspace (e.g., 'analytics.duckdb', 'data/tickets.db'). If not provided, uses ':memory:' for in-memory database.",
                },
                query: {
                  type: "string",
                  description:
                    "SQL query to execute. Supports full DuckDB SQL syntax including CREATE TABLE, COPY, SELECT, analytical functions, etc.",
                },
                sessionId: {
                  type: "string",
                  description: "Session ID to locate the workspace containing the DuckDB file",
                },
                create_if_missing: {
                  type: "boolean",
                  description: "If true, creates the database file if it doesn't exist (default: true)",
                  default: true,
                },
              },
              required: ["query", "sessionId"],
            },
          },
          {
            name: "file_download",
            description:
              "Download files from various sources using URI schemes. Supports: aden:// (Aden assets), file:// (local files), http[s]:// (web URLs). Future: gcs:// (Google Cloud Storage), s3:// (Amazon S3).",
            inputSchema: {
              type: "object",
              properties: {
                uri: {
                  type: "string",
                  description:
                    "File URI with scheme prefix. Examples: 'aden://documents/report.pdf', 'file:///home/user/data.csv', 'https://example.com/file.json'",
                },
                format: {
                  type: "string",
                  enum: ["buffer", "base64", "text"],
                  description: "Output format for the file data (default: base64)",
                },
                saveToPath: {
                  type: "string",
                  description: "Optional local path to save the downloaded file",
                },
                customFilename: {
                  type: "string",
                  description: "Optional custom filename for the download (only supported for aden:// URIs)",
                },
              },
              required: ["uri"],
            },
          },
          {
            name: this.ragTool.name,
            description: this.ragTool.description,
            inputSchema: this.ragTool.inputSchema,
          },
          {
            name: "sync_team_graph",
            description:
              "Synchronize current team's database schema to Neo4j knowledge graph with proper tenant isolation. Requires JWT authentication.",
            inputSchema: {
              type: "object",
              properties: {
                jwtToken: {
                  type: "string",
                  description: "JWT token for team authentication (required)",
                },
                format: {
                  type: "string",
                  enum: ["json", "xml", "graph"],
                  default: "graph",
                  description: "Graph export format from Aden API",
                },
                verify: {
                  type: "boolean",
                  default: true,
                  description: "Verify tenant isolation after sync",
                },
              },
              required: ["jwtToken"],
            },
          },
          {
            name: "mermaid_diagram",
            description:
              "Generate Mermaid diagrams for visualizing workflows, relationships, and processes",
            inputSchema: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  description: `Type of diagram (Flowchart, Sequence, Class, State, Entity Relationship, User Journey, Gantt, Pie Chart, Git graph, etc.). For comprehensive syntax reference, see below:\n\n${mermaidReferenceContent} `,
                  default: "flowchart",
                },
                code: {
                  type: "string",
                  description: `Mermaid diagram code to render.  For comprehensive syntax reference, see below:\n\n${mermaidReferenceContent}`,
                },
                title: {
                  type: "string",
                  description: "Optional title for the diagram",
                },
              },
              required: ["code"],
            },
          },
          {
            name: "vega_lite_diagram",
            description:
              "Generate Vega-Lite diagrams for creating interactive data visualizations and charts. IMPORTANT: Use only actual data arrays in the 'data' field, never SQL queries or URLs. Execute db_query first to get the data, then use the results.",
            inputSchema: {
              type: "object",
              properties: {
                specification: {
                  type: "string",
                  description:
                    "Vega-Lite specification in JSON format. CRITICAL: The 'data' field must contain actual data arrays, not SQL queries. Use format: {'data': {'values': [{'field1': value1, 'field2': value2}, ...]}}",
                },
                title: {
                  type: "string",
                  description: "Optional title for the diagram",
                },
              },
              required: ["specification"],
            },
          },
          {
            name: "markdown_table",
            description:
              "Generate Markdown tables for displaying structured data in a readable format",
            inputSchema: {
              type: "object",
              properties: {
                headers: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: "Array of column headers for the table",
                },
                rows: {
                  type: "array",
                  items: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                  description: "Array of rows, where each row is an array of cell values",
                },
                alignment: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["left", "center", "right"],
                  },
                  description:
                    "Array of alignment options for each column (left, center, right). Defaults to left alignment.",
                },
                title: {
                  type: "string",
                  description: "Optional title for the table",
                },
              },
              required: ["headers", "rows"],
            },
          },
          {
            name: "markdown_action_item",
            description:
              "Generate Markdown action item lists for task management and to-do organization",
            inputSchema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: {
                        type: "string",
                        description: "The action item text/description",
                      },
                      completed: {
                        type: "boolean",
                        description: "Whether the item is completed (default: false)",
                        default: false,
                      },
                      priority: {
                        type: "string",
                        enum: ["low", "medium", "high"],
                        description: "Priority level of the action item (optional)",
                      },
                      assignee: {
                        type: "string",
                        description: "Person assigned to the action item (optional)",
                      },
                      dueDate: {
                        type: "string",
                        description: "Due date for the action item (optional)",
                      },
                    },
                    required: ["text"],
                  },
                  description: "Array of action items to format",
                },
                title: {
                  type: "string",
                  description: "Optional title for the action item list",
                },
                numbered: {
                  type: "boolean",
                  description:
                    "Whether to use numbered list instead of checkboxes (default: false)",
                  default: false,
                },
                showMetadata: {
                  type: "boolean",
                  description:
                    "Whether to show priority, assignee, and due date metadata (default: true)",
                  default: true,
                },
              },
              required: ["items"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      // Validate required parameters before processing
      const validationError = this.validateToolParameters(name, args);
      if (validationError) {
        console.log(`❌ Tool validation failed for ${name}: ${validationError}`);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${validationError}`,
            },
          ],
          isError: true,
        };
      }

      try {
        switch (name) {
          case "think_sequentially":
            return await this.handleSequentialThinking(args.problem);

          case "plan_tasks":
            return await this.handleTaskPlanning(args.objective);

          case "read_file":
            return await this.handleReadFile(args.path, args.sessionId);

          case "write_file":
            return await this.handleWriteFile(args.path, args.content, args.sessionId);

          case "execute_command":
            return await this.handleExecuteCommand(args.command, args.workingDirectory, args.sessionId);

          case "list_directory":
            return await this.handleListDirectory(args.path, args.sessionId);

          case "store_knowledge":
            return await this.handleStoreKnowledge(args.domain, args.data);

          case "recall_memory":
            return await this.handleRecallMemory(args.query);

          case "create_project":
            return await this.handleCreateProject(args.projectId, args.objective);

          case "get_memory_stats":
            return await this.handleGetMemoryStats();

          case "remember":
            console.log(`🐛 DEBUG remember MCP tool called with args:`, args);
            return await this.handleRemember(
              args.sessionId,
              args.content,
              args.category,
              args.confidence,
              args.relationships
            );

          // knowledge_search is demoted - use graph_export + db_query instead
          // case 'knowledge_search':
          //   return await this.handleKnowledgeSearch(args.query, args.k);

          case "provide_options":
            return await this.handleProvideOptions(args.title, args.options);

          case "db_query":
            console.log(
              `🐛 DEBUG db_query MCP tool called with args:`,
              JSON.stringify(args, null, 2)
            );
            return await this.handleDbQuery(args.query, args.params, args.limit);

          case "duckdb_query":
            console.log(
              `🦆 DEBUG duckdb_query MCP tool called with args:`,
              JSON.stringify(args, null, 2)
            );
            return await this.handleDuckDbQuery(args.db_path, args.query, args.sessionId, args.create_if_missing);

          case "file_download":
            console.log(
              `📥 DEBUG file_download MCP tool called with args:`,
              JSON.stringify(args, null, 2)
            );
            return await this.handleFileDownload(args.uri, args.format, args.saveToPath, args.customFilename);

          case "rag_query":
            console.log(
              `🔍 DEBUG rag_query MCP tool called with args:`,
              JSON.stringify(args, null, 2)
            );
            return await this.ragTool.execute(args);

          case "sync_team_graph":
            return await this.handleSyncTeamGraph(args.jwtToken, args.format, args.verify);

          case "mermaid_diagram":
            return await this.handleMermaidDiagram(args.type, args.code, args.title);

          case "vega_lite_diagram":
            return await this.handleVegaLiteDiagram(args.specification, args.title);

          case "markdown_table":
            return await this.handleMarkdownTable(
              args.headers,
              args.rows,
              args.alignment,
              args.title
            );

          case "markdown_action_item":
            return await this.handleMarkdownActionItem(
              args.items,
              args.title,
              args.numbered,
              args.showMetadata
            );

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`❌ MCP tool error for ${name}:`, error.message);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  // Validate tool parameters against their schemas
  validateToolParameters(toolName, args) {
    const toolSchemas = {
      db_query: {
        required: ["query"],
        properties: {
          query: { type: "string" },
          params: { type: "array" },
          limit: { type: "number" },
        },
      },
      think_sequentially: {
        required: ["problem"],
        properties: {
          problem: { type: "string" },
        },
      },
      plan_tasks: {
        required: ["objective"],
        properties: {
          objective: { type: "string" },
        },
      },
      read_file: {
        required: ["path"],
        properties: {
          path: { type: "string" },
        },
      },
      write_file: {
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
      },
      remember: {
        required: ["sessionId", "content"],
        properties: {
          sessionId: { type: "string" },
          content: { type: "string" },
          category: { type: "string" },
          confidence: { type: "number" },
        },
      },
    };

    const schema = toolSchemas[toolName];
    if (!schema) {
      // No validation for unknown tools, let them through
      return null;
    }

    // Check required parameters
    for (const requiredParam of schema.required) {
      if (args[requiredParam] === undefined || args[requiredParam] === null) {
        return `Missing required parameter: ${requiredParam}`;
      }

      // Basic type validation
      const paramType = typeof args[requiredParam];
      const expectedType = schema.properties[requiredParam]?.type;

      if (expectedType === "array" && !Array.isArray(args[requiredParam])) {
        return `Parameter ${requiredParam} must be an array, got ${paramType}`;
      } else if (expectedType !== "array" && paramType !== expectedType) {
        return `Parameter ${requiredParam} must be ${expectedType}, got ${paramType}`;
      }
    }

    return null; // No validation errors
  }

  async handleSequentialThinking(problem) {
    const steps = await this.sequentialThinker.think(problem);

    return {
      content: [
        {
          type: "text",
          text: `Sequential thinking for: "${problem}"\n\n${steps
            .map((step, i) => `Step ${i + 1}: ${step}`)
            .join("\n")}`,
        },
      ],
    };
  }

  async handleTaskPlanning(objective) {
    const tasks = await this.taskPlanner.createTaskPlan(objective);

    return {
      content: [
        {
          type: "text",
          text: `Task plan for: "${objective}"\n\n${tasks
            .map(task => `- [${task.status}] ${task.id}: ${task.description}`)
            .join("\n")}`,
        },
      ],
    };
  }

  /**
   * Get or create the session workspace directory
   * @param {string} sessionId - The session ID
   * @returns {string} The absolute path to the session workspace
   */
  async getSessionWorkspace(sessionId) {
    if (!sessionId) {
      throw new Error("Session ID is required for file operations");
    }

    // Sanitize sessionId to prevent directory traversal
    const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
    
    // Create session workspace directory under MCP project root
    const projectRoot = path.resolve(__dirname, '..', '..', '..'); // Go up to aden-mcp root
    const workspaceRoot = path.join(projectRoot, 'sessions');
    const sessionWorkspace = path.join(workspaceRoot, sanitizedSessionId);

    // Ensure the workspace directory exists
    await fs.mkdir(sessionWorkspace, { recursive: true });
    
    console.error(`📁 Session workspace: ${sessionWorkspace}`);
    return sessionWorkspace;
  }

  async handleReadFile(filePath, sessionId) {
    try {
      // Get session workspace
      const sessionWorkspace = await this.getSessionWorkspace(sessionId);
      
      // Resolve path relative to session workspace
      const resolvedPath = path.resolve(sessionWorkspace, filePath);
      
      // Security: Ensure the resolved path is within the session workspace
      if (!resolvedPath.startsWith(sessionWorkspace)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Access denied. File path must be within the session workspace: ${filePath}`,
            },
          ],
          isError: true,
        };
      }

      const content = await fs.readFile(resolvedPath, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: `File: ${filePath}\n\n${content}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error reading file ${filePath}: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async handleWriteFile(filePath, content, sessionId) {
    try {
      // Get session workspace
      const sessionWorkspace = await this.getSessionWorkspace(sessionId);
      
      // Resolve path relative to session workspace
      const resolvedPath = path.resolve(sessionWorkspace, filePath);
      
      // Security: Ensure the resolved path is within the session workspace
      if (!resolvedPath.startsWith(sessionWorkspace)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Access denied. File path must be within the session workspace: ${filePath}`,
            },
          ],
          isError: true,
        };
      }

      // Ensure directory exists
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(resolvedPath, content, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: `Successfully wrote ${content.length} characters to ${filePath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error writing file ${filePath}: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async handleExecuteCommand(command, workingDirectory, sessionId) {
    try {
      // Security: Restrict to safe commands only
      const safeCommands = [
        'ls', 'pwd', 'echo', 'cat', 'grep', 'find', 'wc', 'head', 'tail',
        'npm', 'node', 'python', 'python3', 'git', 'mkdir', 'cp', 'mv',
        'test', 'jest', 'mocha', 'eslint', 'prettier', 'tsc', 'babel'
      ];
      
      const commandParts = command.trim().split(/\s+/);
      const baseCommand = commandParts[0];
      
      if (!safeCommands.includes(baseCommand)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Command '${baseCommand}' is not allowed. Only safe development commands are permitted.`,
            },
          ],
          isError: true,
        };
      }

      // Get session workspace
      const sessionWorkspace = await this.getSessionWorkspace(sessionId);
      
      const options = {};
      if (workingDirectory) {
        // Resolve working directory relative to session workspace
        const resolvedCwd = path.resolve(sessionWorkspace, workingDirectory);
        
        // Security: Ensure working directory is within session workspace
        if (!resolvedCwd.startsWith(sessionWorkspace)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Access denied. Working directory must be within the session workspace: ${workingDirectory}`,
              },
            ],
            isError: true,
          };
        }
        
        options.cwd = resolvedCwd;
      } else {
        // Default to session workspace as working directory
        options.cwd = sessionWorkspace;
      }

      const { stdout, stderr } = await this.execAsync(command, options);

      let result = `Command: ${command}\n`;
      if (workingDirectory) {
        result += `Working directory: ${workingDirectory}\n`;
      }
      result += `\nOutput:\n${stdout}`;

      if (stderr) {
        result += `\nErrors:\n${stderr}`;
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error executing command "${command}": ${error.message}`,
          },
        ],
      };
    }
  }

  async handleListDirectory(dirPath, sessionId) {
    try {
      // Get session workspace
      const sessionWorkspace = await this.getSessionWorkspace(sessionId);
      
      // Resolve path relative to session workspace (default to workspace root if path is '.' or empty)
      const relativePath = dirPath === '.' || !dirPath ? '' : dirPath;
      const resolvedPath = path.resolve(sessionWorkspace, relativePath);
      
      // Security: Ensure the resolved path is within the session workspace
      if (!resolvedPath.startsWith(sessionWorkspace)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Access denied. Directory path must be within the session workspace: ${dirPath}`,
            },
          ],
          isError: true,
        };
      }

      const items = await fs.readdir(resolvedPath, { withFileTypes: true });

      const formatted = items
        .map(item => {
          const type = item.isDirectory() ? "[DIR]" : "[FILE]";
          return `${type} ${item.name}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Directory: ${dirPath}\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing directory ${dirPath}: ${error.message}`,
          },
        ],
      };
    }
  }

  async handleStoreKnowledge(domain, data) {
    return {
      content: [
        {
          type: "text",
          text: "Knowledge storage via store_knowledge is deprecated. Use the 'remember' tool for team-scoped knowledge storage instead.",
        },
      ],
    };
  }

  async handleRecallMemory(query) {
    return {
      content: [
        {
          type: "text",
          text: "Memory recall via recall_memory is deprecated.",
        },
      ],
    };
  }

  async handleCreateProject(projectId, objective) {
    return {
      content: [
        {
          type: "text",
          text: "Project creation via create_project is deprecated. Use the 'plan_tasks' tool for task-based project management instead.",
        },
      ],
    };
  }

  async handleGetMemoryStats() {
    return {
      content: [
        {
          type: "text",
          text: "Memory statistics via get_memory_stats is deprecated.",
        },
      ],
    };
  }

  async handleRemember(
    sessionId,
    content,
    category = "business_decision",
    confidence = 0.95,
    relationships = []
  ) {
    // Get teamId from environment variable set by MCP client
    const teamId = process.env.CURRENT_TEAM_ID;
    console.log(`🧠 DEBUG handleRemember called with:`, {
      sessionId,
      content,
      category,
      confidence,
      relationships: relationships.length,
    });
    console.log(`🧠 DEBUG teamId from environment: ${teamId}`);

    if (!this.neo4jService) {
      return {
        content: [
          {
            type: "text",
            text: "Neo4j knowledge graph service is not available. Please configure NEO4J_PASSWORD environment variable to use knowledge storage.",
          },
        ],
      };
    }

    if (!teamId) {
      return {
        content: [
          {
            type: "text",
            text: "Error: teamId is not available in session context. Please ensure the user is properly authenticated and the session has team information.",
          },
        ],
      };
    }

    try {
      // Convert teamId to proper tenantId format
      const tenantId = createAdenOrgTenantId(teamId);
      console.log(
        `💾 Storing knowledge in Neo4j graph for teamId: ${teamId} -> tenantId: ${tenantId}`
      );

      // Create knowledge node with explicit relationships atomically
      console.log(`💾 Creating knowledge with ${relationships.length} explicit relationships...`);
      const result = await this.createKnowledgeWithExplicitRelationships(
        content,
        category,
        confidence,
        sessionId,
        tenantId,
        relationships
      );

      const { knowledgeId, relationshipsCreated, targetEntities } = result;

      let response = `**Knowledge Stored Successfully in Neo4j Graph!**\n\n`;
      response += `**Content:** ${content}\n`;
      response += `**Category:** ${category}\n`;
      response += `**Confidence:** ${confidence}\n`;
      response += `**Team:** ${teamId}\n`;
      response += `**Knowledge ID:** ${knowledgeId}\n`;

      if (targetEntities.length > 0) {
        response += `**Connected Entities:** ${targetEntities.join(", ")}\n`;
      }

      if (relationshipsCreated > 0) {
        response += `**Relationships Created:** ${relationshipsCreated}\n`;
      }

      response += `\nThis knowledge is now connected to your team's knowledge graph and schema, enabling rich contextual queries.`;

      return {
        content: [
          {
            type: "text",
            text: response,
          },
        ],
      };
    } catch (error) {
      console.error("❌ Failed to store knowledge in Neo4j:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error storing knowledge: ${error.message}`,
          },
        ],
      };
    }
  }

  /**
   * Create knowledge node with explicit relationships in a single atomic transaction
   * @param {string} content - The knowledge content
   * @param {string} category - Knowledge category
   * @param {number} confidence - Confidence level
   * @param {string} sessionId - Session identifier
   * @param {string} tenantId - Tenant identifier
   * @param {Array} relationships - Array of {targetEntity, relationshipType, reason} objects
   */
  async createKnowledgeWithExplicitRelationships(
    content,
    category,
    confidence,
    sessionId,
    tenantId,
    relationships = []
  ) {
    const driver = this.neo4jService.driver;
    const session = driver.session({ database: this.neo4jService.database });

    try {
      // Generate unique knowledge node ID
      const knowledgeId = `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Validate relationships with detailed logging
      const validRelationships = [];
      const invalidRelationships = [];

      for (const rel of relationships) {
        if (!rel.targetEntity) {
          invalidRelationships.push({ ...rel, reason: "missing targetEntity" });
        } else if (!rel.relationshipType) {
          invalidRelationships.push({ ...rel, reason: "missing relationshipType" });
        } else if (!isValidRelationshipType(rel.relationshipType)) {
          invalidRelationships.push({
            ...rel,
            reason: `invalid relationshipType: ${rel.relationshipType}`,
          });
        } else {
          validRelationships.push(rel);
        }
      }

      console.log(
        `🔗 Creating knowledge node with ${validRelationships.length} validated relationships`
      );
      if (invalidRelationships.length > 0) {
        console.warn(
          `⚠️ Rejected ${invalidRelationships.length} invalid relationships:`,
          invalidRelationships
        );
      }

      // First create the knowledge node
      const createNodeQuery = `
        CREATE (k:Knowledge {
          id: $knowledgeId,
          tenantId: $tenantId,
          data: $content,
          description: $description,
          category: $category,
          confidence: $confidence,
          timestamp: $timestamp,
          session_id: $sessionId,
          source: "remember_tool",
          created_at: datetime(),
          updated_at: datetime()
        })
        RETURN k.id as knowledgeId
      `;

      await session.run(createNodeQuery, {
        knowledgeId,
        tenantId,
        content,
        description: `${category}: ${content.substring(0, 100)}...`,
        category,
        confidence,
        timestamp: new Date().toISOString(),
        sessionId: sessionId.substring(0, 8),
      });

      let relationshipsCreated = 0;
      const targetEntities = [];

      // Create relationships for each type separately (since we can't use dynamic relationship types)
      for (const rel of validRelationships) {
        const relType = sanitizeRelationshipType(rel.relationshipType);

        console.log(`🔗 Attempting to create ${relType} relationship to ${rel.targetEntity}`);

        const relationshipQuery = `
          MATCH (k:Knowledge {id: $knowledgeId, tenantId: $tenantId})
          MATCH (target {id: $targetEntity, tenantId: $tenantId})
          WHERE (target:Table OR target:Column OR target:Knowledge)
          MERGE (k)-[r:${relType}]->(target)
          SET r.created_at = COALESCE(r.created_at, datetime()),
              r.updated_at = datetime(),
              r.tenantId = $tenantId,
              r.source = "explicit_llm",
              r.reason = $reason,
              r.confidence = $confidence
          RETURN count(r) as created, $targetEntity as targetEntity
        `;

        const namespacedTargetEntity = `${tenantId}:${rel.targetEntity}`;

        try {
          const relResult = await session.run(relationshipQuery, {
            knowledgeId,
            tenantId,
            targetEntity: namespacedTargetEntity,
            reason: rel.reason || "LLM specified relationship",
            confidence,
          });

          const created = relResult.records[0]?.get("created")?.toNumber() || 0;
          if (created > 0) {
            relationshipsCreated += created;
            targetEntities.push(rel.targetEntity);
            console.log(`✅ Successfully created ${relType} relationship to ${rel.targetEntity}`);
          } else {
            console.warn(
              `⚠️ No relationship created - target entity ${rel.targetEntity} may not exist in tenant ${tenantId}`
            );
          }
        } catch (relError) {
          console.warn(
            `⚠️ Failed to create ${relType} relationship to ${rel.targetEntity}:`,
            relError.message
          );
        }
      }

      console.log(`✅ Created knowledge ${knowledgeId} with ${relationshipsCreated} relationships`);

      return {
        knowledgeId,
        relationshipsCreated,
        targetEntities,
      };
    } finally {
      await session.close();
    }
  }

  async handleProvideOptions(title, options) {
    try {
      // Format options as numbered list for the CLI to detect
      let optionsText = "";

      if (title) {
        optionsText += `${title}\n\n`;
      }

      options.forEach((option, index) => {
        optionsText += `${index + 1}. ${option.text}\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: optionsText.trim(),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error providing options: ${error.message}`,
          },
        ],
      };
    }
  }

  async handleFileDownload(uri, format = 'base64', saveToPath = null, customFilename = null) {
    try {
      // Initialize the download manager if needed
      if (!fileDownloadManager.initialized) {
        await fileDownloadManager.initialize();
      }

      // Validate URI
      const validation = fileDownloadManager.validateUri(uri);
      if (!validation.valid) {
        throw new Error(`Invalid URI: ${validation.error}`);
      }

      console.log(`📥 Downloading via ${validation.provider}: ${uri}`);

      // Download the file
      const downloadOptions = {
        format: format || 'base64',
        saveToPath: saveToPath
      };
      
      if (customFilename) {
        downloadOptions.customFilename = customFilename;
      }
      
      const result = await fileDownloadManager.download(uri, downloadOptions);

      // Format response for MCP
      const response = {
        success: result.success,
        provider: result.provider,
        uri: result.uri,
        filename: result.filename,
        path: result.path || null,
        contentType: result.contentType,
        size: result.size,
        encoding: result.encoding,
        metadata: result.metadata
      };

      // Include data based on format
      if (format === 'base64' || result.encoding === 'base64') {
        response.data = result.data.toString('base64');
      } else if (format === 'text' || result.encoding === 'text') {
        response.data = result.data.toString('utf-8');
      } else {
        // For buffer format, convert to base64 for JSON serialization
        response.data = result.data.toString('base64');
        response.encoding = 'base64';
      }

      if (saveToPath) {
        response.savedTo = saveToPath;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`❌ File download error:`, error.message);
      return {
        content: [
          {
            type: "text",
            text: `Error downloading file: ${error.message}`,
          },
        ],
      };
    }
  }


  async handleDbQuery(query, params = [], limit = 100) {
    try {
      // Validate input parameters
      if (!query || typeof query !== "string") {
        throw new Error(
          `Invalid query parameter: ${typeof query}. Query must be a non-empty string.`
        );
      }

      if (query.trim().length === 0) {
        throw new Error("Query parameter cannot be empty or contain only whitespace.");
      }

      // Validate params parameter
      if (params !== null && params !== undefined && !Array.isArray(params)) {
        throw new Error(
          `Invalid params parameter: ${typeof params}. Params must be an array or undefined.`
        );
      }

      // Validate limit parameter
      if (limit !== null && limit !== undefined) {
        if (typeof limit !== "number" || limit < 0 || !Number.isInteger(limit)) {
          throw new Error(
            `Invalid limit parameter: ${limit}. Limit must be a non-negative integer.`
          );
        }
      }

      // IMPORTANT: Do not apply arbitrary filters when values are unknown
      // Let the user provide explicit query conditions rather than making assumptions

      // Get JWT token and API endpoint from environment variables
      const JWT_TOKEN = process.env.ADEN_API_TOKEN;
      const ADEN_HOST = process.env.ADEN_HOST || "https://your-api-host.com";
      const API_ENDPOINT = `${ADEN_HOST}/erp/object/open-query`;

      if (!JWT_TOKEN) {
        throw new Error(
          "ADEN_API_TOKEN environment variable is not set. Please configure your JWT token for database access."
        );
      }

      // Debug logging - show token prefix for verification
      const tokenPrefix = JWT_TOKEN.substring(0, 20);
      console.log(`🔍 MCP Server using token: ${tokenPrefix}... for db_query`);

      const requestBody = {
        query: query,
        params: params,
        options: {
          limit: limit,
        },
      };

      const headers = {
        Authorization: `jwt ${JWT_TOKEN}`,
        "Content-Type": "application/json",
      };

      // Log the actual headers being sent
      console.log(`🌐 API Request to: ${API_ENDPOINT}`);
      console.log(`🔑 Authorization header: jwt ${tokenPrefix}...`);
      console.log(`📋 Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      console.log(`📡 API Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        // Try to get structured error message from response body
        let errorDetails = `HTTP error! status: ${response.status} - ${response.statusText}`;
        console.error(
          `❌ DB Query failed with status ${response.status} using token: ${tokenPrefix}...`
        );
        console.error(
          `❌ Failed query: ${query ? query.substring(0, 200) + "..." : "undefined query"}`
        );
        try {
          const errorData = await response.text(); // Get raw text first
          console.error(`❌ Raw error response:`, errorData);

          // Try to parse as JSON
          try {
            const parsedError = JSON.parse(errorData);
            if (parsedError.message) {
              errorDetails = parsedError.message;

              // Add hint if available
              if (parsedError.originalError?.hint) {
                errorDetails += `\nHint: ${parsedError.originalError.hint}`;
              }

              // Add error code if available
              if (parsedError.originalError?.code) {
                errorDetails += `\nError Code: ${parsedError.originalError.code}`;
              }
            }
            console.error(`❌ Parsed error details:`, parsedError);
          } catch (parseError) {
            // If not JSON, use the raw text
            errorDetails = errorData || errorDetails;
            console.error(`❌ Non-JSON error response: ${errorData}`);
          }
        } catch (e) {
          console.error(`❌ Failed to read error response:`, e.message);
        }
        throw new Error(errorDetails);
      }

      const data = await response.json();

      // Return clean structured response - just the data with minimal metadata
      const cleanResult = {
        recordCount: data.rows ? data.rows.length : 0,
        isEmpty: !data.rows || data.rows.length === 0,
        rows: data.rows || [],
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(cleanResult, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`❌ handleDbQuery error:`, error.message);

      // Return clean error response
      const errorResult = {
        recordCount: 0,
        isEmpty: true,
        rows: [],
        error: error.message,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(errorResult, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  async handleDuckDbQuery(dbPath, query, sessionId, createIfMissing = true) {
    try {
      // Validate required parameters
      if (!query || typeof query !== "string") {
        throw new Error("Query parameter is required and must be a string");
      }

      if (!sessionId || typeof sessionId !== "string") {
        throw new Error("SessionId parameter is required to locate the workspace");
      }

      // Get the session workspace path
      const workspacePath = this.getSessionWorkspace(sessionId);
      
      // Determine the full database path
      let fullDbPath;
      if (!dbPath || dbPath === ':memory:') {
        // Use in-memory database
        fullDbPath = ':memory:';
        console.log(`🦆 Using in-memory DuckDB database`);
      } else {
        // Resolve the database path relative to session workspace
        fullDbPath = path.join(workspacePath, dbPath);
        console.log(`🦆 Using DuckDB database at: ${fullDbPath}`);
        
        // Check if database exists
        try {
          await fs.access(fullDbPath);
          console.log(`🦆 Found existing DuckDB database: ${fullDbPath}`);
        } catch {
          if (createIfMissing) {
            console.log(`🦆 Database doesn't exist, will be created: ${fullDbPath}`);
            // Ensure directory exists
            const dbDir = path.dirname(fullDbPath);
            await fs.mkdir(dbDir, { recursive: true });
          } else {
            throw new Error(`DuckDB database not found: ${dbPath}`);
          }
        }
      }

      // Execute the query using DuckDB CLI
      // We'll use the duckdb command-line tool which should be available
      const duckdbCommand = `duckdb ${fullDbPath !== ':memory:' ? `"${fullDbPath}"` : ''} -json "${query.replace(/"/g, '\\"')}"`;
      
      console.log(`🦆 Executing DuckDB query: ${query.substring(0, 100)}...`);
      
      const { stdout, stderr } = await this.execAsync(duckdbCommand, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large results
        timeout: 30000, // 30 second timeout
      });

      if (stderr && !stderr.includes('100%') && !stderr.includes('Progress')) {
        console.error(`⚠️ DuckDB stderr: ${stderr}`);
      }

      // Parse the JSON output from DuckDB
      let result;
      try {
        result = JSON.parse(stdout);
      } catch (parseError) {
        // If not JSON, might be a non-SELECT query result
        console.log(`🦆 Non-JSON response from DuckDB (likely DDL/DML statement)`);
        result = { message: stdout || "Query executed successfully" };
      }

      // Format the response
      const cleanResult = {
        recordCount: Array.isArray(result) ? result.length : 0,
        isEmpty: !result || (Array.isArray(result) && result.length === 0),
        rows: Array.isArray(result) ? result : [],
        message: !Array.isArray(result) ? (result.message || stdout) : undefined,
        dbPath: dbPath || ':memory:',
        sessionWorkspace: workspacePath,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(cleanResult, null, 2),
          },
        ],
      };
      
    } catch (error) {
      console.error(`❌ duckdb_query error:`, error.message);
      
      // Provide helpful error messages
      if (error.code === 'ENOENT' && error.message.includes('duckdb')) {
        return {
          content: [
            {
              type: "text",
              text: `Error: DuckDB CLI not found. Please ensure DuckDB is installed.\nInstall with: pip install duckdb or download from https://duckdb.org/docs/installation`,
            },
          ],
          isError: true,
        };
      }
      
      if (error.message.includes('Catalog Error')) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}\n\nThis usually means a table or column doesn't exist. Check your table names and schema.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Error executing DuckDB query: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async handleSyncTeamGraph(jwtToken, format = "graph", verify = true) {
    try {
      console.log("🔄 Starting team graph synchronization via MCP tool...");

      // Validate JWT token
      if (!jwtToken || typeof jwtToken !== "string") {
        throw new Error("Valid JWT token is required for team graph synchronization");
      }

      // Check Neo4j configuration
      if (!process.env.NEO4J_URI || !process.env.NEO4J_PASSWORD) {
        throw new Error(
          "Neo4j configuration missing: NEO4J_URI and NEO4J_PASSWORD environment variables are required"
        );
      }

      const sync = new TeamGraphSync();

      try {
        const result = await sync.syncTeamGraph(jwtToken, { format, verify });

        // Format success response
        const { extraction, transformation, upsert, verification } = result;

        let responseText = "✅ **Team Graph Synchronization Completed**\n\n";

        // Extraction summary
        responseText += "**📥 Data Extraction:**\n";
        responseText += `- Team ID: ${extraction.teamId}\n`;
        responseText += `- User: ${extraction.userEmail}\n`;
        responseText += `- Extracted: ${extraction.extractedAt}\n\n`;

        // Transformation summary
        responseText += "**🔄 Data Transformation:**\n";
        responseText += `- Tenant ID: ${transformation.tenantId}\n`;
        responseText += `- Nodes Created: ${transformation.nodeCount}\n`;
        responseText += `- Relationships Created: ${transformation.relationshipCount}\n\n`;

        // Upsert summary
        responseText += "**💾 Neo4j Upsert:**\n";
        responseText += `- Nodes Upserted: ${upsert.nodesUpserted}\n`;
        responseText += `- Relationships Upserted: ${upsert.relationshipsUpserted}\n`;
        responseText += `- Synced: ${upsert.syncedAt}\n`;

        // Verification summary
        if (verification) {
          responseText += "\n**🔍 Tenant Isolation Verification:**\n";
          responseText += `- Status: ${verification.exists ? "✅ Verified" : "❌ Failed"}\n`;
          responseText += `- ${verification.message}\n`;

          if (verification.exists) {
            responseText += `- Last Sync: ${verification.lastSyncAt}\n`;
          }
        }

        responseText += "\n🎯 **Next Steps:**\n";
        responseText += "- Use remember tool to store insights with team context\n";
        responseText += "- Query Neo4j directly for advanced graph analysis\n";
        responseText += "- Re-run this sync when schema changes occur";

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } finally {
        await sync.close();
      }
    } catch (error) {
      console.error("❌ Team graph sync failed:", error.message);

      let errorText = `❌ **Team Graph Synchronization Failed**\n\n`;
      errorText += `**Error:** ${error.message}\n\n`;

      if (error.message.includes("JWT")) {
        errorText += "💡 **JWT Token Issues:**\n";
        errorText += "- Ensure token is valid and not expired\n";
        errorText += "- Check token has team access permissions\n";
        errorText += "- Verify ADEN_HOST is correct\n";
      } else if (error.message.includes("Neo4j")) {
        errorText += "💡 **Neo4j Connection Issues:**\n";
        errorText += "- Verify NEO4J_URI is accessible\n";
        errorText += "- Check NEO4J_USERNAME and NEO4J_PASSWORD\n";
        errorText += "- Ensure Neo4j instance is running\n";
      } else if (error.message.includes("Graph export")) {
        errorText += "💡 **API Access Issues:**\n";
        errorText += "- Verify team has database access permissions\n";
        errorText += "- Check ADEN_HOST endpoint is reachable\n";
        errorText += "- Ensure graph-export API is available\n";
      }

      return {
        content: [
          {
            type: "text",
            text: errorText,
          },
        ],
        isError: true,
      };
    }
  }

  async handleMermaidDiagram(type = "flowchart", code, title) {
    try {
      // Validate required parameters
      if (!code || typeof code !== "string") {
        throw new Error("Missing or invalid 'code' parameter - diagram code is required");
      }

      // Format the response with the Mermaid diagram
      let resultText = "";

      if (title) {
        resultText += `${title}\n\n`;
      }

      // Format the Mermaid code block
      resultText += `\`\`\`mermaid\n`;

      // Clean and validate the code input
      const trimmedCode = code.trim();

      // Define diagram types that need special handling
      const diagramTypeMap = {
        flowchart: ["flowchart", "graph"],
        sequence: ["sequenceDiagram"],
        gantt: ["gantt"],
        class: ["classDiagram"],
        state: ["stateDiagram", "stateDiagram-v2"],
        pie: ["pie"],
        er: ["erDiagram"],
        journey: ["journey"],
        gitgraph: ["gitGraph"],
        c4context: ["C4Context"],
        c4container: ["C4Container"],
        c4component: ["C4Component"],
        c4dynamic: ["C4Dynamic"],
        c4deployment: ["C4Deployment"],
        mindmap: ["mindmap"],
        timeline: ["timeline"],
        quadrant: ["quadrantChart"],
        requirement: ["requirementDiagram"],
        zenuml: ["zenuml"],
        sankey: ["sankey-beta"],
        xy: ["xychart-beta"],
        block: ["block-beta"],
        packet: ["packet-beta"],
        kanban: ["kanban"],
        architecture: ["architecture-beta"],
        radar: ["radar-beta"],
      };

      // Check if code already starts with a valid diagram type declaration
      const hasValidPrefix = Object.values(diagramTypeMap)
        .flat()
        .some(prefix => trimmedCode.startsWith(prefix));

      if (!hasValidPrefix) {
        // Add appropriate prefix based on diagram type
        const typeKey = type.toLowerCase();
        const validPrefixes = diagramTypeMap[typeKey];

        if (validPrefixes) {
          // Use the first (preferred) prefix for the type
          const preferredPrefix = validPrefixes[0];

          // Special handling for flowchart - use 'graph TD' as default
          if (typeKey === "flowchart") {
            resultText += `graph TD\n`;
          } else {
            resultText += `${preferredPrefix}\n`;
          }
        } else {
          // Fallback for unknown types - use the type as-is
          resultText += `${type}\n`;
        }
      }

      resultText += `${trimmedCode}\n`;
      resultText += `\`\`\`\n\n`;

      // Basic mermaid syntax validation
      const validationResult = this.validateMermaidSyntax(resultText);
      if (!validationResult.isValid) {
        throw new Error(`⚠️ MERMAID VALIDATION FAILED: ${validationResult.error}

The generated mermaid diagram contains syntax errors that would prevent it from rendering properly. Please regenerate the diagram with the following corrections:

1. Fix the syntax errors mentioned above
2. Ensure proper diagram type declaration (flowchart, graph, sequenceDiagram, etc.)
3. Check for balanced quotes, parentheses, brackets, and braces
4. Verify arrow syntax and node connections are correct
5. Follow mermaid.js syntax guidelines

Please try again with a corrected version of the mermaid diagram.`);
      }

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error generating Mermaid diagram: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async handleVegaLiteDiagram(specification, title) {
    try {
      // Validate the specification contains actual data, not SQL
      let spec;
      try {
        spec = JSON.parse(specification);
      } catch (parseError) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Invalid Vega-Lite specification: Not valid JSON. Error: ${parseError.message}`,
            },
          ],
        };
      }

      // Check if data contains SQL instead of actual data
      if (spec.data && spec.data.url && spec.data.url.sql) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Invalid Vega-Lite specification: Found SQL query in data field. You must execute db_query first to get the actual data, then use that data in the chart.\n\nSQL found: ${spec.data.url.sql}\n\nCorrect workflow:\n1. Use db_query to execute: ${spec.data.url.sql}\n2. Take the results and put them in data.values: {"data": {"values": [your_query_results]}}`,
            },
          ],
        };
      }

      // Check if data field exists and has actual values
      if (spec.data && !spec.data.values && !spec.data.url) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Invalid Vega-Lite specification: Data field must contain actual values. Use format: {"data": {"values": [{"field1": value1, "field2": value2}, ...]}}`,
            },
          ],
        };
      }

      // Format the response with the Vega-Lite diagram
      let resultText = "";

      if (title) {
        resultText += `${title}\n\n`;
      }

      // Format the Vega-Lite specification as a JSON code block
      resultText += `\`\`\`json\n`;
      resultText += `${specification}\n`;
      resultText += `\`\`\`\n\n`;

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error generating Vega-Lite diagram: ${error.message}`,
          },
        ],
      };
    }
  }

  /**
   * Validate mermaid diagram syntax using comprehensive validation rules
   */
  validateMermaidSyntax(mermaidContent) {
    try {
      // Extract the mermaid code from the markdown
      const mermaidMatch = mermaidContent.match(/```mermaid\n([\s\S]*?)\n```/);
      if (!mermaidMatch) {
        return { isValid: false, error: "No mermaid code block found" };
      }

      const mermaidCode = mermaidMatch[1].trim();

      // Check if code is empty
      if (!mermaidCode || mermaidCode.length === 0) {
        return { isValid: false, error: "Empty mermaid diagram code" };
      }

      // Comprehensive validation checks
      const validationErrors = [];

      // Check for valid diagram type declaration
      const diagramTypes = [
        "flowchart",
        "graph",
        "sequenceDiagram",
        "gantt",
        "classDiagram",
        "stateDiagram",
        "stateDiagram-v2",
        "pie",
        "erDiagram",
        "journey",
        "gitGraph",
        "C4Context",
        "C4Container",
        "C4Component",
        "C4Dynamic",
        "C4Deployment",
        "mindmap",
        "timeline",
        "quadrantChart",
        "requirementDiagram",
        "zenuml",
        "sankey-beta",
        "xychart-beta",
        "block-beta",
        "packet-beta",
        "kanban",
        "architecture-beta",
        "radar-beta",
      ];

      const hasValidType = diagramTypes.some(type => mermaidCode.startsWith(type));
      if (!hasValidType) {
        validationErrors.push("No valid diagram type declaration found");
      }

      // Check for balanced quotes
      const singleQuotes = (mermaidCode.match(/'/g) || []).length;
      const doubleQuotes = (mermaidCode.match(/"/g) || []).length;
      if (singleQuotes % 2 !== 0) {
        validationErrors.push("Unbalanced single quotes");
      }
      if (doubleQuotes % 2 !== 0) {
        validationErrors.push("Unbalanced double quotes");
      }

      // Check for balanced parentheses
      const openParens = (mermaidCode.match(/\(/g) || []).length;
      const closeParens = (mermaidCode.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        validationErrors.push("Unbalanced parentheses");
      }

      // Check for balanced square brackets
      const openBrackets = (mermaidCode.match(/\[/g) || []).length;
      const closeBrackets = (mermaidCode.match(/\]/g) || []).length;
      if (openBrackets !== closeBrackets) {
        validationErrors.push("Unbalanced square brackets");
      }

      // Check for balanced curly braces
      const openBraces = (mermaidCode.match(/\{/g) || []).length;
      const closeBraces = (mermaidCode.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        validationErrors.push("Unbalanced curly braces");
      }

      // Check for common syntax errors
      if (mermaidCode.includes("--")) {
        // Check for proper arrow syntax
        const invalidArrows = mermaidCode.match(/--[^>-]|--$/g);
        if (invalidArrows) {
          validationErrors.push("Invalid arrow syntax found");
        }
      }

      // Check for flowchart specific issues
      if (mermaidCode.startsWith("graph") || mermaidCode.startsWith("flowchart")) {
        // Check for proper direction
        const firstLine = mermaidCode.split("\n")[0];
        if (firstLine.startsWith("graph") && !firstLine.match(/graph\s+(TD|TB|BT|RL|LR)/)) {
          validationErrors.push("Graph direction not specified or invalid");
        }
      }

      // Check for sequence diagram specific issues
      if (mermaidCode.startsWith("sequenceDiagram")) {
        // Check for proper participant syntax
        const lines = mermaidCode.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.includes("->") || line.includes("-->")) {
            // Check for proper sequence syntax
            if (!line.match(/\w+\s*-[->]+\s*\w+\s*:\s*.+/)) {
              validationErrors.push(`Invalid sequence syntax on line ${i + 1}`);
            }
          }
        }
      }

      // Check for invalid characters or malformed syntax
      if (mermaidCode.includes("undefined") || mermaidCode.includes("null")) {
        validationErrors.push("Contains undefined or null values");
      }

      // Check for proper node definitions
      const lines = mermaidCode.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) continue;

        // Skip diagram type declaration and comments
        if (i === 0 || line.startsWith("%%")) continue;

        // Check for malformed node definitions
        if (line.includes("-->") || line.includes("->")) {
          // Arrow connections should have nodes on both sides
          const arrowMatch = line.match(/(.+?)(-+>|-->)(.+)/);
          if (arrowMatch) {
            const [, leftSide, , rightSide] = arrowMatch;
            if (!leftSide.trim() || !rightSide.trim()) {
              validationErrors.push(`Malformed arrow connection on line ${i + 1}`);
            }
          }
        }
      }

      if (validationErrors.length > 0) {
        return { isValid: false, error: validationErrors.join("; ") };
      }

      return { isValid: true, error: null };
    } catch (error) {
      return { isValid: false, error: `Validation error: ${error.message}` };
    }
  }

  async handleMarkdownTable(headers, rows, alignment = [], title) {
    try {
      // Format the response with the Markdown table
      let resultText = "";

      if (title) {
        resultText += `${title}\n\n`;
      }

      // Validate inputs
      if (!headers || !Array.isArray(headers) || headers.length === 0) {
        throw new Error("Headers must be a non-empty array");
      }

      if (!rows || !Array.isArray(rows)) {
        throw new Error("Rows must be an array");
      }

      // Ensure all rows have the same number of columns as headers
      const numColumns = headers.length;
      const processedRows = rows.map((row, index) => {
        if (!Array.isArray(row)) {
          throw new Error(`Row ${index + 1} must be an array`);
        }

        // Pad or truncate row to match header length
        const processedRow = [...row];
        while (processedRow.length < numColumns) {
          processedRow.push("");
        }
        return processedRow.slice(0, numColumns);
      });

      // Set default alignment if not provided
      const columnAlignment = [...alignment];
      while (columnAlignment.length < numColumns) {
        columnAlignment.push("left");
      }

      // Create the header row
      resultText += "| " + headers.join(" | ") + " |\n";

      // Create the separator row with alignment
      const separators = columnAlignment.map(align => {
        switch (align) {
          case "center":
            return ":---:";
          case "right":
            return "---:";
          default:
            return "---";
        }
      });
      resultText += "| " + separators.join(" | ") + " |\n";

      // Create data rows
      processedRows.forEach(row => {
        // Escape pipe characters in cell content
        const escapedRow = row.map(cell => String(cell).replace(/\|/g, "\\|"));
        resultText += "| " + escapedRow.join(" | ") + " |\n";
      });

      resultText += "\n";

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error generating Markdown table: ${error.message}`,
          },
        ],
      };
    }
  }

  async handleMarkdownActionItem(items, title, numbered = false, showMetadata = true) {
    try {
      // Format the response with the Markdown action item list
      let resultText = "";

      if (title) {
        resultText += `${title}\n\n`;
      }

      // Validate inputs
      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error("Items must be a non-empty array");
      }

      // Process each action item
      items.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          throw new Error(`Item ${index + 1} must be an object`);
        }

        if (!item.text || typeof item.text !== "string") {
          throw new Error(`Item ${index + 1} must have a valid text property`);
        }

        const text = item.text.trim();
        const completed = item.completed === true;
        const priority = item.priority;
        const assignee = item.assignee;
        const dueDate = item.dueDate;

        // Create the list item
        if (numbered) {
          // Numbered list format
          resultText += `${index + 1}. ${completed ? "~~" : ""}${text}${completed ? "~~" : ""}`;
        } else {
          // Checkbox format
          const checkbox = completed ? "[x]" : "[ ]";
          resultText += `- ${checkbox} ${text}`;
        }

        // Add metadata if enabled and available
        if (showMetadata && (priority || assignee || dueDate)) {
          const metadata = [];

          if (priority) {
            const priorityEmoji = priority === "high" ? "🔴" : priority === "medium" ? "🟡" : "🟢";
            metadata.push(
              `${priorityEmoji} ${priority.charAt(0).toUpperCase() + priority.slice(1)}`
            );
          }

          if (assignee) {
            metadata.push(`👤 ${assignee}`);
          }

          if (dueDate) {
            metadata.push(`📅 ${dueDate}`);
          }

          if (metadata.length > 0) {
            resultText += ` *(${metadata.join(" | ")})*`;
          }
        }

        resultText += "\n";
      });

      resultText += "\n";

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error generating Markdown action items: ${error.message}`,
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Aden MCP Server running on stdio");
  }
}

const server = new AdenMCPServer();
server.run().catch(console.error);

// Export the class for testing
export { AdenMCPServer };
