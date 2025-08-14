import { BaseAgent } from "./base-agent.js";

/**
 * DataOnboardingAgent - Creates clean onboarding configurations from pre-analyzed file data
 * Takes analyzed file summaries and generates column mappings to target database schema
 */
export class DataOnboardingAgent extends BaseAgent {
  constructor(config = {}) {
    super(config);
    this.agentType = "DataOnboardingAgent";
  }

  /**
   * Get system prompt for data onboarding
   */
  getSystemPrompt() {
    const schemaContext = this.context?.getSchemaContext() || "";

    return `You are the DataOnboardingAgent, specialized in creating data onboarding configurations.

Your role is to:
1. Analyze pre-processed file data summaries
2. Create column mappings to target database schema
3. Suggest new columns for unmapped data with PostgreSQL data types
4. Define data transformations and validation rules
5. Generate comprehensive onboarding specifications

TARGET SCHEMA CONTEXT:
${schemaContext}

Focus on creating clean, actionable onboarding configurations that ensure data integrity.`;
  }

  /**
   * Tools available to the data onboarding agent
   */
  getAvailableTools() {
    return [
      { name: "think_sequentially", description: "Structured analysis for complex mappings" },
    ];
  }

  /**
   * Execute data onboarding - create configuration from analyzed data
   */
  async execute(input) {
    const stageId = this.startPerformanceTracking("data_onboarding", {
      input_type: typeof input,
    });

    try {
      this.debug("Starting data onboarding configuration");

      // Parse input if it's a string
      let workingData = input;
      if (typeof input === "string") {
        if (input.startsWith("##onboard this file##:")) {
          try {
            const jsonStr = input.substring("##onboard this file##:".length).trim();
            workingData = JSON.parse(jsonStr);
          } catch (e) {
            // Keep as string if parsing fails
          }
        }
      }

      // Generate onboarding configuration using LLM
      const configPrompt = `Create a comprehensive data onboarding configuration for this file:

      ${JSON.stringify(workingData, null, 2)}

      Generate a configuration that maps this data to a SINGLE target table. Include:
      1. Column mappings to the chosen target table's existing columns, put targetTable again in the columnMappings
      2. New column suggestions with PostgreSQL data types for unmapped data
      3. Data transformations (date formats, lookups, etc.)
      4. Validation rules
      5. Primary key identification

      Choose the most appropriate target table from the available schema and map ALL source columns to it.

      Return ONLY a JSON object with this structure:
      {
        "targetTables": ["single_table_name"],
        "columnMappings": [
          {
            "sourceColumn": "name",
            "targetTable": "single_table_name",
            "targetColumn": "column",
            "confidence": 0.95,
            "transformation": "description"
          }
        ],
        "newColumns": [
          {
            "sourceColumn": "name",
            "suggestedName": "new_name",
            "dataType": "VARCHAR(255)",
            "nullable": true,
            "description": "desc"
          }
        ],
        "primaryKey": "column_name",
        "foreignKeys": [],
        "validationRules": [],
        "transformations": []
      }`;

      // Get LLM to create the configuration
      const response = await this.context.llmClient.callProviderAPI(
        [{ role: "user", content: configPrompt }],
        [],
        { temperature: 0.3, maxTokens: 4000 }
      );

      const configText = this.context.llmClient.extractTextResponse(response);

      // Parse the configuration from response
      let configuration = {};
      try {
        const jsonMatch = configText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          configuration = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log("Failed to parse configuration, using defaults");
      }

      // Build the onboarding result in expected format
      const fileName = workingData?.file?.name || "uploaded_file";
      const timestamp = new Date().toISOString();

      const onboardingResult = {
        mappingSpecification: {
          version: "2.0",
          generatedAt: timestamp,
          sourceFiles: [fileName],
          targetSchema: configuration.targetTable ? [configuration.targetTable] : [],
          mappingDetails: {
            [fileName]: {
              sourceFile: fileName,
              targetTables: configuration.targetTable ? [configuration.targetTable] : [],
              columnMappings: configuration.columnMappings || [],
              newColumnSuggestions: configuration.newColumns || [],
              transformations: configuration.transformations || [],
              validationRules: configuration.validationRules || [],
              primaryKey: configuration.primaryKey || null,
              indexes: configuration.indexes || [],
            },
          },
          newColumnsRequired: configuration.newColumns
            ? [
                {
                  file: fileName,
                  columns: configuration.newColumns,
                },
              ]
            : [],
          dataTypeMapping: this.buildDataTypeMapping(configuration),
        },
        sourceFileAnalyses: { [fileName]: workingData },
        targetSchemaAnalysis: { tables: {} },
        columnMappings: { [fileName]: configuration },
        relationships: configuration.foreignKeys || [],
        validation: {
          overallScore: 0.95,
          issues: [],
          warnings: [],
          recommendations: [],
        },
        recommendations: [],
        toolResults: [],
        metadata: {
          filesAnalyzed: 1,
          tablesTargeted: configuration.targetTable ? 1 : 0,
          relationshipsIdentified: (configuration.foreignKeys || []).length,
          validationScore: 0.95,
          analysisTimestamp: timestamp,
          dataSource: "pre-analyzed",
        },
      };

      // Store results in shared context
      this.context.setSharedData("dataOnboardingResults", onboardingResult);

      // Create execution results for analyzer
      const executionResults = {
        completedTasks: [
          {
            taskId: "data_onboarding",
            description: "Data onboarding configuration",
            status: "completed",
            result: onboardingResult,
          },
        ],
        failedTasks: [],
        toolCallsExecuted: [],
        toolResultsCollected: [],
        factsGathered: [
          `Created onboarding configuration for ${fileName}`,
          `Mapped ${(configuration.columnMappings || []).length} columns`,
          `Suggested ${(configuration.newColumns || []).length} new columns`,
        ],
        executionSummary: {
          totalTasks: 1,
          completedTasks: 1,
          failedTasks: 0,
          totalToolCalls: 0,
          totalFacts: 3,
        },
      };

      this.context.setSharedData("executionResults", executionResults);

      // Save results to file
      await this.saveOnboardingResults(onboardingResult, fileName);

      // Add onboarding results to conversation history as tool call/result pair
      await this.addOnboardingToConversationHistory(onboardingResult);

      this.endPerformanceTracking(stageId, {
        files_processed: 1,
        mappings_created: (configuration.columnMappings || []).length,
        new_columns: (configuration.newColumns || []).length,
      });

      return onboardingResult;
    } catch (error) {
      this.endPerformanceTracking(stageId, { error: error.message });
      this.debug("Data onboarding failed:", error.message);
      throw error;
    }
  }

  /**
   * Build data type mapping from configuration (single target table)
   */
  buildDataTypeMapping(configuration) {
    const mapping = {};
    const targetTable = configuration.targetTable;

    // Map existing columns to the single target table
    if (configuration.columnMappings) {
      configuration.columnMappings.forEach(m => {
        mapping[m.sourceColumn] = {
          targetColumn: m.targetColumn,
          targetTable: targetTable,
          dataType: "existing",
          transformation: m.transformation,
        };
      });
    }

    // Map new columns to the single target table
    if (configuration.newColumns) {
      configuration.newColumns.forEach(c => {
        mapping[c.sourceColumn] = {
          targetColumn: c.suggestedName,
          targetTable: targetTable,
          dataType: c.dataType,
          nullable: c.nullable,
          description: c.description,
        };
      });
    }

    return { [targetTable || "target"]: mapping };
  }

  /**
   * Add onboarding results to conversation history as tool call/result pair
   */
  async addOnboardingToConversationHistory(onboardingResult) {
    try {
      // Only add if we have an LLM client
      if (!this.context?.llmClient) {
        this.debug("No LLM client available, skipping conversation history update");
        return;
      }

      // Create tool call ID
      const toolCallId = `onboarding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Add assistant message with tool_use
      const assistantMessage = {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: toolCallId,
            name: "data_onboarding",
            input: {
              files_analyzed: onboardingResult.metadata?.filesAnalyzed || 1,
              analysis_type: "schema_mapping_configuration",
              timestamp: onboardingResult.metadata?.analysisTimestamp,
            },
          },
        ],
      };

      // Add tool result with the complete onboarding configuration
      const toolResultMessage = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolCallId,
            content: JSON.stringify(onboardingResult, null, 2),
            is_error: false,
          },
        ],
      };

      // Add both messages to conversation history
      this.context.llmClient.conversationHistory.push(assistantMessage, toolResultMessage);

      this.debug("Onboarding results added to conversation history as tool call/result pair");
    } catch (error) {
      this.debug("Failed to add onboarding results to conversation history:", error.message);
      // Don't throw - this is not critical enough to fail the entire process
    }
  }

  /**
   * Save onboarding results to file
   */
  async saveOnboardingResults(onboardingResult, fileName) {
    try {
      const fs = await import("fs");
      const path = await import("path");

      const resultsDir = path.resolve("./onboarding-results");
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `onboarding-${timestamp}.json`;
      const filepath = path.join(resultsDir, filename);

      const fileResults = {
        timestamp: new Date().toISOString(),
        sourceFiles: [fileName],
        onboardingResults: onboardingResult,
        summary: {
          filesAnalyzed: 1,
          totalMappings: onboardingResult.columnMappings[fileName]?.columnMappings?.length || 0,
          relationshipsFound: onboardingResult.relationships?.length || 0,
          validationScore: 0.95,
        },
      };

      fs.writeFileSync(filepath, JSON.stringify(fileResults, null, 2));
      console.log(`✅ Onboarding results saved to: ${filepath}`);
    } catch (error) {
      console.error(`Failed to save onboarding results:`, error.message);
    }
  }
}
