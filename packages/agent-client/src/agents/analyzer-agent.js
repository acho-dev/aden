import { BaseAgent } from "./base-agent.js";

/**
 * AnalyzerAgent - Specialized agent for result synthesis and response generation
 * Focuses on analyzing execution results and creating comprehensive responses
 */
export class AnalyzerAgent extends BaseAgent {
  constructor(config = {}) {
    super(config);
    this.agentType = "AnalyzerAgent";
  }

  /**
   * Get system prompt specific to analysis and synthesis tasks
   */
  getSystemPrompt() {
    return `You are the AnalyzerAgent, specialized in analyzing execution results and synthesizing comprehensive responses.

Your role is to:
1. Analyze all execution results and tool outputs comprehensively
2. Extract key insights, patterns, and conclusions from gathered data
3. Synthesize information into coherent, actionable responses
4. Identify gaps or inconsistencies in the collected information
5. Generate final responses that directly address the user's original request

ANALYSIS EXPERTISE:
- Data interpretation and pattern recognition
- Insight extraction from multiple data sources
- Coherent narrative construction from fragmented information
- Gap analysis and completeness assessment
- Business intelligence and recommendation generation

ANALYSIS PRINCIPLES:
- Provide complete, actionable insights rather than raw data summaries
- Focus on answering the original user question directly
- Highlight key findings, trends, and recommendations
- Identify areas where additional information might be needed
- Present information in a clear, structured, and user-friendly format
- Include relevant context and background for better understanding

SYNTHESIS GUIDELINES:
- Start with direct answers to the user's question
- Provide supporting evidence and data
- Include actionable recommendations when appropriate
- Highlight any limitations or caveats in the analysis
- Use formatting tools when they enhance comprehension
- Maintain focus on the user's intent and business value

RESPONSE FORMATTING:
- Generate natural language responses with clear structure
- Use markdown formatting for headers, lists, and emphasis
- Present data insights in readable, narrative form
- Create actionable recommendations in text format
- Include any structured data from execution results in proper JSON markdown blocks

Focus on creating valuable, actionable insights that help users make informed decisions through comprehensive analysis and clear communication.`;
  }

  /**
   * Tools available specifically to the analyzer agent
   */
  getAvailableTools() {
    // AnalyzerAgent should NOT use tools - only synthesize and summarize gathered data
    return [];
  }

  /**
   * Execute analysis and synthesis
   * @param {Object} input - Analysis input containing execution results
   * @returns {Object} Analysis results and final response
   */
  async execute(input) {
    console.log("🔍 DEBUG AnalyzerAgent.execute called with input:", {
      input: input ? "present" : "null",
      inputType: typeof input,
      hasExecutionResults: input && !!input.executionResults,
      executionResultsType:
        input && input.executionResults ? typeof input.executionResults : "undefined",
    });

    const stageId = this.startPerformanceTracking("analysis", {
      has_execution_results: !!input.executionResults,
      tool_results_count: input.executionResults?.toolResultsCollected?.length || 0,
    });

    try {
      console.log("🔍 DEBUG Starting analysis and synthesis");
      this.debug("Starting analysis and synthesis");

      if (!this.validateInput(input)) {
        throw new Error("Invalid input for analysis");
      }

      // Get execution results from input or shared context
      const executionResults =
        input.executionResults || this.context.getSharedData("executionResults");
      const originalPlan = input.originalPlan || this.context.getSharedData("initialPlan");
      const originalMessage = input.originalMessage || this.context.originalMessage;

      console.log("🔍 DEBUG Extracted data:", {
        executionResults: executionResults ? "present" : "null",
        executionResultsType: typeof executionResults,
        originalPlan: originalPlan ? "present" : "null",
        originalMessage: originalMessage ? originalMessage.substring(0, 50) + "..." : "null",
      });

      if (!executionResults) {
        throw new Error("No execution results available for analysis");
      }

      // Step 1: Analyze execution completeness
      console.log("🔍 DEBUG Step 1: Analyzing execution completeness");
      this.context.callbacks?.onStatusChange?.("🔍 Analyzing execution results");

      // Stream analysis phase start
      if (this.context.callbacks?.onAnalysisStart) {
        this.context.callbacks.onAnalysisStart({
          process: "analysis",
          stage: "completeness_analysis",
          phase: "completeness",
          totalTasks: executionResults.completedTasks?.length || 0,
          failedTasks: executionResults.failedTasks?.length || 0,
          toolCalls: executionResults.toolCallsExecuted?.length || 0,
        });
      }

      const completenessAnalysis = await this.analyzeExecutionCompleteness(
        executionResults,
        originalPlan
      );
      console.log("🔍 DEBUG Completeness analysis completed");

      // Step 2: Extract key insights and patterns
      console.log("🔍 DEBUG Step 2: Extracting key insights and patterns");
      this.context.callbacks?.onStatusChange?.("🧠 Extracting insights and patterns");
      const insightAnalysis = await this.extractKeyInsights(executionResults, originalMessage);

      // Stream insights as they are extracted
      if (this.context.callbacks?.onInsightsExtracted) {
        this.context.callbacks.onInsightsExtracted({
          process: "analysis",
          stage: "insights_extraction",
          keyFindings: insightAnalysis.insights?.map(i => i.title || i.description) || [],
          patterns:
            insightAnalysis.insights?.filter(i => i.type === "pattern").map(i => i.title) || [],
          recommendations: insightAnalysis.recommendations?.map(r => r.action) || [],
        });
      }

      console.log("🔍 DEBUG Insight analysis completed");

      // Step 3: Detect if formatted content is available
      console.log("🔍 DEBUG Step 3: Detecting formatted content");
      const formattedContent = this.detectFormattedContent(executionResults);
      console.log("🔍 DEBUG Formatted content detected:", {
        formattedContent: formattedContent ? "present" : "null",
        length: formattedContent ? formattedContent.length : "undefined",
      });

      // Step 4: Generate final response based on content type
      console.log("🔍 DEBUG Step 4: Generating final response");
      this.context.callbacks?.onStatusChange?.("📝 Generating comprehensive response");

      // Stream response generation start info
      if (this.context.callbacks?.onResponseGenerationStart) {
        this.context.callbacks.onResponseGenerationStart({
          process: "analysis",
          stage: "response_generation",
          type: formattedContent.length > 0 ? "formatted" : "standard",
          hasFormattedContent: formattedContent.length > 0,
          dataPoints: executionResults.factsGathered?.length || 0,
        });
      }

      let finalResponse;

      if (formattedContent.length > 0) {
        console.log("🔍 DEBUG Using formatted response path");
        finalResponse = await this.generateFormattedResponse(
          originalMessage,
          insightAnalysis,
          formattedContent,
          completenessAnalysis
        );
      } else {
        console.log("🔍 DEBUG Using standard response path");
        finalResponse = await this.generateStandardResponse(
          originalMessage,
          insightAnalysis,
          executionResults,
          completenessAnalysis
        );
      }
      console.log("🔍 DEBUG Final response generated:", finalResponse ? "present" : "null");

      // Step 5: Store important insights in memory if appropriate
      await this.storeImportantInsights(insightAnalysis, originalMessage);

      const analysisResult = {
        finalResponse,
        completenessAnalysis,
        keyInsights: insightAnalysis.insights,
        recommendedActions: insightAnalysis.recommendations,
        dataQuality: insightAnalysis.dataQuality,
        hasFormattedContent: formattedContent.length > 0,
        analysisMetadata: {
          toolResultsAnalyzed: executionResults.toolResultsCollected?.length || 0,
          factsExtracted: executionResults.factsGathered?.length || 0,
          completedTasks: executionResults.completedTasks?.length || 0,
          analysisTimestamp: new Date().toISOString(),
        },
      };

      // Store analysis results in shared context
      this.context.setSharedData("analysisResults", analysisResult);

      this.endPerformanceTracking(stageId, {
        response_generated: true,
        insights_count: insightAnalysis.insights?.length || 0,
        has_formatted_content: formattedContent.length > 0,
        response_length: finalResponse?.length || 0,
      });

      this.debug(`Analysis completed: ${finalResponse?.length || 0} character response generated`);
      return analysisResult;
    } catch (error) {
      this.endPerformanceTracking(stageId, { error: error.message });
      this.debug("Analysis failed:", error.message);
      throw error;
    }
  }

  /**
   * Analyze execution completeness and identify gaps
   */
  async analyzeExecutionCompleteness(executionResults, originalPlan) {
    const totalTasks = originalPlan?.tasks?.length || 0;
    const completedTasks = executionResults.completedTasks?.length || 0;
    const failedTasks = executionResults.failedTasks?.length || 0;
    const successfulToolResults = (executionResults.toolResultsCollected || []).filter(
      r => r && !r.is_error && !this.isEmptyDatabaseResult(r)
    ).length;
    const totalToolResults = executionResults.toolResultsCollected?.length || 0;

    const completenessScore = totalTasks > 0 ? completedTasks / totalTasks : 1;
    const successRate = totalToolResults > 0 ? successfulToolResults / totalToolResults : 1;

    return {
      completenessScore,
      successRate,
      totalTasks,
      completedTasks,
      failedTasks,
      totalToolResults,
      successfulToolResults,
      gaps: this.identifyExecutionGaps(executionResults, originalPlan),
      recommendations: this.generateCompletenessRecommendations(completenessScore, successRate),
    };
  }

  /**
   * Extract key insights and patterns from execution results
   */
  async extractKeyInsights(executionResults, originalMessage) {
    console.log("🔍 DEBUG extractKeyInsights called with:", {
      executionResults: executionResults ? "present" : "null",
      originalMessage: originalMessage ? originalMessage.substring(0, 50) + "..." : "null",
      toolResultsLength: executionResults?.toolResultsCollected?.length || "undefined",
    });

    // Add defensive checks for executionResults
    if (!executionResults || typeof executionResults !== "object") {
      console.log("🔍 DEBUG executionResults is null or invalid, returning default");
      return {
        insights: [
          {
            type: "conclusion",
            title: "No execution results",
            description: "No execution results available for analysis",
            confidence: 0.1,
            supporting_evidence: "Missing execution results",
          },
        ],
        recommendations: [],
        dataQuality: {
          completeness: 0.1,
          reliability: 0.1,
          relevance: 0.1,
          notes: "No execution results",
        },
        limitations: ["No execution results available"],
        next_steps: [],
      };
    }

    // Build tool results summary with comprehensive error handling
    let toolResultsSummary;
    try {
      console.log("🔍 DEBUG about to call buildToolResultsSummary");
      toolResultsSummary = this.buildToolResultsSummary(executionResults.toolResultsCollected);
      console.log("🔍 DEBUG buildToolResultsSummary completed successfully");
    } catch (summaryError) {
      console.log("🔍 DEBUG buildToolResultsSummary failed:", summaryError.message);
      console.log("🔍 DEBUG summaryError stack:", summaryError.stack);
      toolResultsSummary = "Error generating tool results summary";
    }

    // Build facts list with null safety
    let factsGathered = "";
    try {
      if (executionResults.factsGathered && Array.isArray(executionResults.factsGathered)) {
        factsGathered = executionResults.factsGathered.join("\n");
      } else {
        factsGathered = "No facts gathered";
      }
    } catch (factsError) {
      console.log("🔍 DEBUG facts processing failed:", factsError.message);
      factsGathered = "Error processing facts";
    }

    const insightPrompt = `Analyze these execution results and extract key insights that answer the user's original question:

Original user request: "${originalMessage || "Unknown request"}"

Execution Summary:
- Completed tasks: ${executionResults.completedTasks?.length || 0}
- Failed tasks: ${executionResults.failedTasks?.length || 0}
- Tool results: ${executionResults.toolResultsCollected?.length || 0}
- Facts gathered: ${executionResults.factsGathered?.length || 0}

Tool Results Summary:
${toolResultsSummary}

Facts Gathered:
${factsGathered}

Please analyze this information and provide your findings in markdown format:

## Key Insights

For each insight, use this format:
### [Finding Type] - [Brief Title]
- **Description**: Detailed explanation
- **Confidence**: High/Medium/Low
- **Supporting Evidence**: Evidence from tool results

## Recommendations

For each recommendation, use this format:
### [Priority] Priority - [Action]
- **Rationale**: Why this action is recommended
- **Expected Impact**: Expected result

## Data Quality Assessment

- **Completeness**: [Percentage or High/Medium/Low] - [Notes]
- **Reliability**: [Percentage or High/Medium/Low] - [Notes] 
- **Relevance**: [Percentage or High/Medium/Low] - [Notes]

## Limitations

- List any limitations or caveats found

## Next Steps

- List suggested follow-up actions

Focus on answering the user's original question directly with actionable insights.`;

    try {
      console.log("🔍 DEBUG about to call LLM for insight extraction");
      const response = await this.callLLM([{ role: "user", content: insightPrompt }], null, {
        timeout: 30000,
        executeTools: false,
        process: 'analysis',
        stage: 'insights_extraction'
      });
      console.log("🔍 DEBUG LLM call completed for insight extraction");

      const analysisText = this.context.llmClient.extractTextResponse(response);
      console.log(
        "🔍 DEBUG extracted text response:",
        analysisText ? analysisText.substring(0, 100) + "..." : "null"
      );

      // Parse markdown response instead of JSON
      const analysis = this.parseMarkdownInsights(analysisText);
      console.log("🔍 DEBUG parsed markdown analysis:", analysis ? "present" : "null");

      // Ensure we always have a valid structure
      const finalAnalysis = analysis || {
        insights: [],
        recommendations: [],
        dataQuality: {
          completeness: 0.5,
          reliability: 0.5,
          relevance: 0.5,
          notes: "Unable to assess",
        },
        limitations: [],
        next_steps: [],
      };

      console.log(
        "🔍 DEBUG returning final analysis with insights count:",
        finalAnalysis.insights?.length || 0
      );
      return finalAnalysis;
    } catch (error) {
      console.log("🔍 DEBUG insight extraction failed:", error.message);
      console.log("🔍 DEBUG insight extraction stack:", error.stack);
      this.debug("Insight extraction failed:", error.message);
      return {
        insights: [
          {
            type: "conclusion",
            title: "Analysis incomplete",
            description: "Unable to extract insights due to processing error",
            confidence: 0.1,
            supporting_evidence: "Error in analysis process",
          },
        ],
        recommendations: [],
        dataQuality: {
          completeness: 0.1,
          reliability: 0.1,
          relevance: 0.1,
          notes: "Analysis failed",
        },
        limitations: ["Insight extraction failed"],
        next_steps: [],
      };
    }
  }

  /**
   * Parse markdown insights response into structured data
   */
  parseMarkdownInsights(markdownText) {
    if (!markdownText) return null;

    const analysis = {
      insights: [],
      recommendations: [],
      dataQuality: {
        completeness: 0.5,
        reliability: 0.5,
        relevance: 0.5,
        notes: "Unable to assess"
      },
      limitations: [],
      next_steps: [],
      markdownContent: markdownText // Keep original markdown for easy frontend display
    };

    try {
      // Extract insights
      const insightsMatch = markdownText.match(/## Key Insights([\s\S]*?)(?=##|$)/i);
      if (insightsMatch) {
        const insightsSection = insightsMatch[1];
        const insightMatches = insightsSection.match(/### (.+?)\n([\s\S]*?)(?=###|##|$)/g);
        
        if (insightMatches) {
          analysis.insights = insightMatches.map(match => {
            const lines = match.split('\n');
            const titleLine = lines[0].replace('### ', '');
            const [type, title] = titleLine.split(' - ');
            
            let confidence = 0.7; // Default
            let description = '';
            let evidence = '';
            
            for (const line of lines.slice(1)) {
              if (line.includes('**Description**:')) {
                description = line.replace(/.*\*\*Description\*\*:\s*/, '');
              } else if (line.includes('**Confidence**:')) {
                const confText = line.replace(/.*\*\*Confidence\*\*:\s*/, '').toLowerCase();
                confidence = confText.includes('high') ? 0.9 : confText.includes('low') ? 0.3 : 0.7;
              } else if (line.includes('**Supporting Evidence**:')) {
                evidence = line.replace(/.*\*\*Supporting Evidence\*\*:\s*/, '');
              }
            }
            
            return {
              type: type?.toLowerCase() || 'insight',
              title: title || 'Insight',
              description,
              confidence,
              supporting_evidence: evidence
            };
          });
        }
      }

      // Extract recommendations
      const recommendationsMatch = markdownText.match(/## Recommendations([\s\S]*?)(?=##|$)/i);
      if (recommendationsMatch) {
        const recsSection = recommendationsMatch[1];
        const recMatches = recsSection.match(/### (.+?)\n([\s\S]*?)(?=###|##|$)/g);
        
        if (recMatches) {
          analysis.recommendations = recMatches.map(match => {
            const lines = match.split('\n');
            const titleLine = lines[0].replace('### ', '');
            const [priority, ...actionParts] = titleLine.split(' - ');
            const action = actionParts.join(' - ');
            
            let rationale = '';
            let expectedImpact = '';
            
            for (const line of lines.slice(1)) {
              if (line.includes('**Rationale**:')) {
                rationale = line.replace(/.*\*\*Rationale\*\*:\s*/, '');
              } else if (line.includes('**Expected Impact**:')) {
                expectedImpact = line.replace(/.*\*\*Expected Impact\*\*:\s*/, '');
              }
            }
            
            return {
              priority: priority?.toLowerCase().replace(' priority', '') || 'medium',
              action: action || 'Action needed',
              rationale,
              expected_impact: expectedImpact
            };
          });
        }
      }

      // Extract data quality
      const dataQualityMatch = markdownText.match(/## Data Quality Assessment([\s\S]*?)(?=##|$)/i);
      if (dataQualityMatch) {
        const qualitySection = dataQualityMatch[1];
        const completenessMatch = qualitySection.match(/\*\*Completeness\*\*:\s*(.+)/i);
        const reliabilityMatch = qualitySection.match(/\*\*Reliability\*\*:\s*(.+)/i);
        const relevanceMatch = qualitySection.match(/\*\*Relevance\*\*:\s*(.+)/i);
        
        if (completenessMatch) {
          const text = completenessMatch[1].toLowerCase();
          analysis.dataQuality.completeness = text.includes('high') ? 0.9 : text.includes('low') ? 0.3 : 0.7;
        }
        if (reliabilityMatch) {
          const text = reliabilityMatch[1].toLowerCase();
          analysis.dataQuality.reliability = text.includes('high') ? 0.9 : text.includes('low') ? 0.3 : 0.7;
        }
        if (relevanceMatch) {
          const text = relevanceMatch[1].toLowerCase();
          analysis.dataQuality.relevance = text.includes('high') ? 0.9 : text.includes('low') ? 0.3 : 0.7;
        }
        
        analysis.dataQuality.notes = "Parsed from markdown analysis";
      }

      // Extract limitations
      const limitationsMatch = markdownText.match(/## Limitations([\s\S]*?)(?=##|$)/i);
      if (limitationsMatch) {
        const limitationsSection = limitationsMatch[1];
        const limitationItems = limitationsSection.match(/^- (.+)$/gm);
        if (limitationItems) {
          analysis.limitations = limitationItems.map(item => item.replace(/^- /, ''));
        }
      }

      // Extract next steps
      const nextStepsMatch = markdownText.match(/## Next Steps([\s\S]*?)(?=##|$)/i);
      if (nextStepsMatch) {
        const nextStepsSection = nextStepsMatch[1];
        const stepItems = nextStepsSection.match(/^- (.+)$/gm);
        if (stepItems) {
          analysis.next_steps = stepItems.map(item => item.replace(/^- /, ''));
        }
      }

    } catch (error) {
      console.error('Error parsing markdown insights:', error);
    }

    return analysis;
  }

  /**
   * Detect formatted content that needs special handling
   */
  detectFormattedContent(executionResults) {
    console.log("🔍 DEBUG detectFormattedContent called with:", {
      executionResults: executionResults ? "present" : "null",
      hasToolResultsCollected: executionResults && !!executionResults.toolResultsCollected,
      toolResultsType:
        executionResults && executionResults.toolResultsCollected
          ? typeof executionResults.toolResultsCollected
          : "undefined",
      toolResultsLength:
        executionResults && executionResults.toolResultsCollected
          ? executionResults.toolResultsCollected.length
          : "undefined",
    });

    const formattedTools = [
      "markdown_table",
      "vega_lite_diagram",
      "mermaid_diagram",
      "markdown_action_item",
    ];

    // Add comprehensive null safety
    if (!executionResults) {
      console.log("🔍 DEBUG executionResults is null, returning empty array");
      return [];
    }

    if (!executionResults.toolResultsCollected) {
      console.log("🔍 DEBUG toolResultsCollected is null/undefined, returning empty array");
      return [];
    }

    if (!Array.isArray(executionResults.toolResultsCollected)) {
      console.log(
        "🔍 DEBUG toolResultsCollected is not an array:",
        typeof executionResults.toolResultsCollected
      );
      return [];
    }

    console.log(
      "🔍 DEBUG about to filter toolResultsCollected with length:",
      executionResults.toolResultsCollected.length
    );

    try {
      const filtered = executionResults.toolResultsCollected.filter((result, index) => {
        console.log(`🔍 DEBUG filtering result ${index}:`, {
          result: result ? "present" : "null",
          resultType: typeof result,
          hasToolName: result && typeof result.tool_name !== "undefined",
          toolName: result ? result.tool_name : "undefined",
        });

        if (!result || typeof result !== "object") {
          console.log(`🔍 DEBUG skipping null/invalid result at index ${index}`);
          return false;
        }

        return (
          formattedTools.includes(result.tool_name) &&
          !result.is_error &&
          !this.isEmptyDatabaseResult(result)
        );
      });

      console.log(
        "🔍 DEBUG detectFormattedContent returning filtered array with length:",
        filtered.length
      );
      return filtered;
    } catch (filterError) {
      console.log("🔍 DEBUG filter operation failed:", filterError.message);
      console.log("🔍 DEBUG filter error stack:", filterError.stack);
      return [];
    }
  }

  /**
   * Generate response with formatted content using existing tool results
   * NOTE: This method uses LLM for analysis but does NOT spawn new tool calls
   */
  async generateFormattedResponse(
    originalMessage,
    insightAnalysis,
    formattedContent,
    completenessAnalysis
  ) {
    console.log("🔍 DEBUG generateFormattedResponse called with:", {
      originalMessage: originalMessage ? originalMessage.substring(0, 50) + "..." : "null",
      insightAnalysis: insightAnalysis ? "present" : "null",
      formattedContent: formattedContent ? formattedContent.length : "null",
      completenessAnalysis: completenessAnalysis ? "present" : "null",
    });
    
    // Add conversation history using the context helper
    const conversationContext = this.context?.getAnalyzerContext() || '';

    // Add comprehensive null safety
    const safeInsightAnalysis = insightAnalysis || {
      insights: [],
      recommendations: [],
      dataQuality: { completeness: 0.5, reliability: 0.5, relevance: 0.5 },
    };

    const safeInsights = Array.isArray(safeInsightAnalysis.insights)
      ? safeInsightAnalysis.insights
      : [];
    const safeRecommendations = Array.isArray(safeInsightAnalysis.recommendations)
      ? safeInsightAnalysis.recommendations
      : [];
    const safeDataQuality = safeInsightAnalysis.dataQuality || {
      completeness: 0.5,
      reliability: 0.5,
    };

    const explanationPrompt = `The user requested: "${originalMessage || "Unknown request"}"
${conversationContext}
Based on execution results, we have formatted content to present along with analysis.

Key insights found:
${safeInsights
  .map(insight => `- ${insight.title || "Unknown"}: ${insight.description || "No description"}`)
  .join("\n")}

Recommendations:
${safeRecommendations
  .map(rec => `- ${rec.action || "Unknown action"} (${rec.priority || "unknown"} priority)`)
  .join("\n")}

Data Quality: Completeness ${((safeDataQuality.completeness || 0.5) * 100).toFixed(
      0
    )}%, Reliability ${((safeDataQuality.reliability || 0.5) * 100).toFixed(0)}%

Create a comprehensive response that:
1. Directly answers the user's question with key findings
2. Provides context and interpretation of the results
3. Includes actionable insights and recommendations
4. Notes any limitations or areas for further investigation

IMPORTANT: You are an AnalyzerAgent. Do NOT make any tool calls. Only provide analysis and synthesis of the existing results. Focus on creating a narrative response that explains the findings in a business-friendly manner.`;

    try {
      console.log("🔍 DEBUG about to call LLM for formatted response analysis");
      const response = await this.callLLM([{ role: "user", content: explanationPrompt }], null, {
        timeout: 30000,
        executeTools: false,
        process: 'analysis',
        stage: 'formatted_response_generation'
      });
      console.log("🔍 DEBUG LLM call completed for formatted response");

      const humanExplanation =
        this.context.llmClient.extractTextResponse(response) ||
        "Based on your request, I've analyzed the available data and generated the following results:";
      console.log(
        "🔍 DEBUG extracted human explanation:",
        humanExplanation ? humanExplanation.substring(0, 100) + "..." : "null"
      );

      // Combine explanation with formatted content
      console.log("🔍 DEBUG about to combine response with formatted content");
      const combinedResponse = this.combineResponseWithFormattedContent(
        humanExplanation,
        formattedContent
      );
      console.log(
        "🔍 DEBUG combined response created:",
        combinedResponse ? combinedResponse.substring(0, 100) + "..." : "null"
      );
      return combinedResponse;
    } catch (error) {
      console.log("🔍 DEBUG formatted response generation failed:", error.message);
      console.log("🔍 DEBUG formatted response error stack:", error.stack);
      this.debug("Formatted response generation failed:", error.message);

      const fallbackExplanation = `Based on your request, I've analyzed the available data. Here are the key findings:\n\n${safeInsights
        .map(
          insight => `• ${insight.title || "Unknown"}: ${insight.description || "No description"}`
        )
        .join("\n")}\n\nBelow are the detailed results:`;

      console.log("🔍 DEBUG using fallback explanation for formatted response");
      return this.combineResponseWithFormattedContent(fallbackExplanation, formattedContent);
    }
  }

  /**
   * Generate standard response without formatted content
   */
  async generateStandardResponse(
    originalMessage,
    insightAnalysis,
    executionResults,
    completenessAnalysis
  ) {
    // Add conversation history using the context helper
    const conversationContext = this.context?.getAnalyzerContext() || '';
    
    const responsePrompt = `Create a comprehensive response to this user request: "${originalMessage}"
${conversationContext}

Analysis Results:
Key Insights:
${(insightAnalysis.insights || [])
  .map(insight => `- ${insight.title}: ${insight.description} (confidence: ${insight.confidence})`)
  .join("\n")}

Recommendations:
${(insightAnalysis.recommendations || [])
  .map(rec => `- ${rec.action} (${rec.priority} priority): ${rec.rationale}`)
  .join("\n")}

Data Quality Assessment:
- Completeness: ${(insightAnalysis.dataQuality.completeness * 100).toFixed(0)}%
- Reliability: ${(insightAnalysis.dataQuality.reliability * 100).toFixed(0)}%
- Relevance: ${(insightAnalysis.dataQuality.relevance * 100).toFixed(0)}%

Execution Summary:
- Tasks completed: ${completenessAnalysis.completedTasks}/${completenessAnalysis.totalTasks}
- Tool results: ${completenessAnalysis.successfulToolResults}/${
      completenessAnalysis.totalToolResults
    } successful

Facts Gathered:
${(executionResults.factsGathered || []).slice(0, 10).join("\n")}

Create a response that:
1. Directly answers the user's question
2. Provides specific insights and findings
3. Includes actionable recommendations
4. Acknowledges any limitations
5. Is conversational but professional

Focus on value and actionability rather than just data presentation.

IMPORTANT: You are an AnalyzerAgent. Do NOT make any tool calls. Only provide analysis and synthesis of the existing results.`;

    try {
      const response = await this.callLLM([{ role: "user", content: responsePrompt }], null, {
        timeout: 30000,
        executeTools: false,
        process: 'analysis',
        stage: 'standard_response_generation'
      });

      return (
        this.context.llmClient.extractTextResponse(response) ||
        "I've analyzed your request but encountered an issue generating the response. Please let me know if you'd like me to try a different approach."
      );
    } catch (error) {
      this.debug("Standard response generation failed:", error.message);

      // Fallback response construction
      let fallbackResponse = `Based on your request, here's what I found:\n\n`;

      if (insightAnalysis.insights && insightAnalysis.insights.length > 0) {
        fallbackResponse += `**Key Findings:**\n`;
        insightAnalysis.insights.forEach(insight => {
          fallbackResponse += `• ${insight.title}: ${insight.description}\n`;
        });
        fallbackResponse += `\n`;
      }

      if (insightAnalysis.recommendations && insightAnalysis.recommendations.length > 0) {
        fallbackResponse += `**Recommendations:**\n`;
        insightAnalysis.recommendations.forEach(rec => {
          fallbackResponse += `• ${rec.action} (${rec.priority} priority)\n`;
        });
        fallbackResponse += `\n`;
      }

      if (insightAnalysis.limitations && insightAnalysis.limitations.length > 0) {
        fallbackResponse += `**Limitations:**\n`;
        insightAnalysis.limitations.forEach(limitation => {
          fallbackResponse += `• ${limitation}\n`;
        });
      }

      // Don't apologize for user-initiated cancellation
      const defaultFallback = error.message === 'Operation cancelled by user'
        ? "Operation cancelled by user. You can start a new request when ready."
        : "I apologize, but I encountered an error while analyzing the results. Please try rephrasing your request.";
        
      return fallbackResponse || defaultFallback;
    }
  }

  /**
   * Store important insights in memory for future reference
   */
  async storeImportantInsights(insightAnalysis, originalMessage) {
    if (
      !this.context.mcpClient ||
      !insightAnalysis ||
      !insightAnalysis.insights ||
      !Array.isArray(insightAnalysis.insights)
    ) {
      return;
    }

    try {
      // Only store high-confidence insights that seem valuable for future reference
      const significantInsights = insightAnalysis.insights.filter(
        insight =>
          insight &&
          insight.confidence >= 0.8 &&
          (insight.type === "key_finding" || insight.type === "conclusion")
      );

      for (const insight of significantInsights.slice(0, 2)) {
        // Limit to 2 most important
        const memoryContent = `${insight.title}: ${insight.description}`;

        // await this.context.mcpClient.callTool("remember", {
        //   sessionId: this.context.sessionId,
        //   content: memoryContent,
        //   category: "analytical_insight",
        //   confidence: insight.confidence,
        // });

        this.debug(`[Not really] Stored insight in memory: ${insight.title}`);
      }
    } catch (error) {
      this.debug("Failed to store insights in memory:", error.message);
    }
  }

  /**
   * Build tool results summary for analysis
   */
  buildToolResultsSummary(toolResults) {
    console.log("🔍 DEBUG buildToolResultsSummary called with:", {
      toolResults: toolResults ? "present" : "null",
      isArray: Array.isArray(toolResults),
      length: toolResults ? toolResults.length : "undefined",
      type: typeof toolResults,
    });

    if (!toolResults) {
      console.log("🔍 DEBUG toolResults is null/undefined");
      return "No tool results available.";
    }

    if (!Array.isArray(toolResults)) {
      console.log("🔍 DEBUG toolResults is not an array:", typeof toolResults);
      return "Tool results format is invalid.";
    }

    if (toolResults.length === 0) {
      console.log("🔍 DEBUG toolResults array is empty");
      return "No tool results available.";
    }

    const summary = [];
    const resultsByTool = {};

    // Group by tool type with null safety
    toolResults.forEach((result, index) => {
      console.log(`🔍 DEBUG processing result ${index}:`, {
        result: result ? "present" : "null",
        type: typeof result,
        hasToolName: result && typeof result.tool_name !== "undefined",
      });

      if (!result || typeof result !== "object") {
        console.log(`🔍 DEBUG skipping invalid result at index ${index}`);
        return;
      }

      const toolName = result.tool_name || "unknown";
      if (!resultsByTool[toolName]) {
        resultsByTool[toolName] = [];
      }
      resultsByTool[toolName].push(result);
    });

    console.log("🔍 DEBUG resultsByTool:", Object.keys(resultsByTool));

    // Summarize each tool's results with comprehensive null safety
    Object.entries(resultsByTool).forEach(([toolName, results]) => {
      console.log(`🔍 DEBUG processing tool ${toolName}:`, {
        results: results ? "present" : "null",
        isArray: Array.isArray(results),
        length: results ? results.length : "undefined",
      });

      if (!results || !Array.isArray(results)) {
        console.log(`🔍 DEBUG invalid results for ${toolName}`);
        summary.push(`${toolName}: invalid results format`);
        return;
      }

      // Filter with comprehensive null checking
      const successful = results.filter(r => {
        if (!r || typeof r !== "object") {
          console.log("🔍 DEBUG filtering out null/invalid result");
          return false;
        }
        return !r.is_error && !this.isEmptyDatabaseResult(r);
      });

      const failed = results.filter(r => {
        if (!r || typeof r !== "object") {
          console.log("🔍 DEBUG filtering out null/invalid result in failed");
          return false;
        }
        return r.is_error || this.isEmptyDatabaseResult(r);
      });

      console.log(`🔍 DEBUG ${toolName}: ${successful.length} successful, ${failed.length} failed`);
      summary.push(`${toolName}: ${successful.length} successful, ${failed.length} failed`);

      // Include sample content from successful results with null safety
      if (successful && Array.isArray(successful) && successful.length > 0) {
        successful.slice(0, 2).forEach((result, index) => {
          console.log(`🔍 DEBUG processing successful result ${index}:`, {
            result: result ? "present" : "null",
            hasContent: result && typeof result.content !== "undefined",
            contentType: result ? typeof result.content : "undefined",
          });

          if (!result || typeof result !== "object") {
            console.log(`🔍 DEBUG skipping null result in successful preview`);
            return;
          }

          let preview = "No content";
          let fullLength = 0;

          try {
            if (result.content === null || result.content === undefined) {
              preview = "null/undefined content";
              fullLength = 0;
            } else if (typeof result.content === "string") {
              preview = result.content.substring(0, 200);
              fullLength = result.content.length;
            } else if (typeof result.content === "object") {
              const jsonStr = JSON.stringify(result.content);
              preview = jsonStr.substring(0, 200);
              fullLength = jsonStr.length;
            } else {
              const strContent = String(result.content);
              preview = strContent.substring(0, 200);
              fullLength = strContent.length;
            }
          } catch (previewError) {
            console.log(`🔍 DEBUG error generating preview: ${previewError.message}`);
            preview = "Error generating preview";
            fullLength = 0;
          }

          summary.push(`  - ${preview}${fullLength > 200 ? "..." : ""}`);
        });
      }
    });

    const result = summary.length > 0 ? summary.join("\n") : "No tool results summary available";
    console.log("🔍 DEBUG buildToolResultsSummary returning:", result.substring(0, 200) + "...");
    return result;
  }

  /**
   * Identify gaps in execution
   */
  identifyExecutionGaps(executionResults, originalPlan) {
    const gaps = [];

    // Check for failed tasks
    if (executionResults.failedTasks && executionResults.failedTasks.length > 0) {
      gaps.push(`${executionResults.failedTasks.length} tasks failed to execute`);
    }

    // Check for tool execution failures
    const failedToolResults = (executionResults.toolResultsCollected || []).filter(r => r.is_error);
    if (failedToolResults.length > 0) {
      gaps.push(`${failedToolResults.length} tool calls resulted in errors`);
    }

    // Check for incomplete plan execution
    const plannedTasks = originalPlan?.tasks?.length || 0;
    const completedTasks = executionResults.completedTasks?.length || 0;
    if (plannedTasks > 0 && completedTasks < plannedTasks) {
      gaps.push(`Only ${completedTasks}/${plannedTasks} planned tasks were completed`);
    }

    return gaps;
  }

  /**
   * Generate recommendations based on completeness analysis
   */
  generateCompletenessRecommendations(completenessScore, successRate) {
    const recommendations = [];

    if (completenessScore < 0.8) {
      recommendations.push({
        priority: "high",
        action: "Retry failed tasks or gather additional information",
        rationale: "Execution completeness is below optimal threshold",
      });
    }

    if (successRate < 0.7) {
      recommendations.push({
        priority: "medium",
        action: "Review tool configurations and error handling",
        rationale: "High tool failure rate indicates potential configuration issues",
      });
    }

    return recommendations;
  }

  /**
   * Combine response with formatted content
   */
  combineResponseWithFormattedContent(humanExplanation, formattedContent) {
    console.log("🔍 DEBUG combineResponseWithFormattedContent called with:", {
      humanExplanation: humanExplanation ? "present" : "null",
      humanExplanationType: typeof humanExplanation,
      formattedContent: formattedContent ? "present" : "null",
      formattedContentType: typeof formattedContent,
      formattedContentLength: formattedContent ? formattedContent.length : "undefined",
    });

    // Ensure humanExplanation is a string with comprehensive null safety
    let explanation;
    try {
      if (typeof humanExplanation === "string") {
        explanation = humanExplanation;
      } else if (humanExplanation && typeof humanExplanation.toString === "function") {
        explanation = humanExplanation.toString();
      } else {
        explanation = "Analysis results:";
      }
    } catch (explanationError) {
      console.log("🔍 DEBUG error processing humanExplanation:", explanationError.message);
      explanation = "Analysis results:";
    }

    let combinedResponse = explanation.trim();
    console.log("🔍 DEBUG initial explanation set:", combinedResponse.substring(0, 100) + "...");

    // Add comprehensive null safety for formattedContent processing
    if (!formattedContent) {
      console.log("🔍 DEBUG formattedContent is null, returning explanation only");
      return combinedResponse;
    }

    if (!Array.isArray(formattedContent)) {
      console.log("🔍 DEBUG formattedContent is not an array:", typeof formattedContent);
      return combinedResponse;
    }

    if (formattedContent.length === 0) {
      console.log("🔍 DEBUG formattedContent array is empty");
      return combinedResponse;
    }

    try {
      formattedContent.forEach((result, index) => {
        console.log(`🔍 DEBUG processing formatted content ${index}:`, {
          result: result ? "present" : "null",
          resultType: typeof result,
          hasToolName: result && typeof result.tool_name !== "undefined",
          hasContent: result && typeof result.content !== "undefined",
        });

        if (!result || typeof result !== "object") {
          console.log(`🔍 DEBUG skipping invalid formatted content at index ${index}`);
          return;
        }

        if (index === 0) {
          combinedResponse += "\n\n";
        }

        // Add tool-specific formatting with null safety
        if (formattedContent.length > 1) {
          try {
            const toolDisplayName = this.getToolDisplayName(result.tool_name);
            combinedResponse += `**${toolDisplayName}:**\n`;
          } catch (toolNameError) {
            console.log("🔍 DEBUG error getting tool display name:", toolNameError.message);
            combinedResponse += `**Unknown Tool:**\n`;
          }
        }

        // Extract actual content from MCP format and format appropriately
        let actualContent;
        try {
          actualContent = this.extractContentFromMCPResult(result.content);
          console.log(
            "🔍 DEBUG extracted content:",
            actualContent ? actualContent.substring(0, 100) + "..." : "null"
          );
        } catch (contentError) {
          console.log("🔍 DEBUG error extracting content:", contentError.message);
          actualContent = "Error extracting content";
        }

        // Format content based on tool type - some tools produce ready-to-use content
        try {
          if (this.isReadyToRenderContent(result.tool_name, actualContent)) {
            // Tools like mermaid_diagram, vega_lite_diagram produce ready-to-render content
            combinedResponse += actualContent;
          } else if (actualContent && actualContent.includes("```")) {
            // Content already has markdown formatting
            combinedResponse += actualContent;
          } else {
            // Wrap in appropriate code blocks
            const codeBlockType = this.getCodeBlockType(result.tool_name);
            combinedResponse += `\`\`\`${codeBlockType}\n${
              actualContent || "No content available"
            }\n\`\`\`\n`;
          }
        } catch (formattingError) {
          console.log("🔍 DEBUG error formatting content:", formattingError.message);
          combinedResponse += `\n[Error formatting content]\n`;
        }

        if (index < formattedContent.length - 1) {
          combinedResponse += "\n\n";
        }
      });
    } catch (overallError) {
      console.log(
        "🔍 DEBUG overall error in combineResponseWithFormattedContent:",
        overallError.message
      );
      console.log("🔍 DEBUG overall error stack:", overallError.stack);
      combinedResponse += "\n\n[Error processing formatted content]";
    }

    console.log("🔍 DEBUG final combined response length:", combinedResponse.length);
    return combinedResponse;
  }

  /**
   * Get display name for tool
   */
  getToolDisplayName(toolName) {
    const displayNames = {
      markdown_table: "Data Table",
      vega_lite_diagram: "Data Visualization",
      mermaid_diagram: "Process Diagram",
      markdown_action_item: "Action Items",
    };

    return displayNames[toolName] || toolName;
  }

  /**
   * Check if content from a tool is ready to render as-is
   */
  isReadyToRenderContent(toolName, content) {
    // Tools that produce ready-to-use markdown content
    const readyToRenderTools = [
      "mermaid_diagram",
      "vega_lite_diagram",
      "markdown_table",
      "markdown_action_item",
    ];

    if (!readyToRenderTools.includes(toolName)) {
      return false;
    }

    // Additional check: if content contains code blocks, it's likely ready
    return (
      content && (content.includes("```") || content.includes("|") || content.startsWith("# "))
    );
  }

  /**
   * Get appropriate code block type for tool content
   */
  getCodeBlockType(toolName) {
    const codeBlockTypes = {
      db_query: "sql",
      rag_query: "markdown",
      think_sequentially: "markdown",
      remember: "text",
      default: "json",
    };

    return codeBlockTypes[toolName] || codeBlockTypes.default;
  }

  /**
   * Extract actual content from MCP result format and ensure it's properly formatted
   */
  extractContentFromMCPResult(content) {
    // Extract text from MCP result format: [{"type":"text","text":"..."}]
    let actualText = "";
    if (Array.isArray(content) && content.length > 0 && content[0].type === "text") {
      actualText = content[0].text;
    } else if (typeof content === "string") {
      actualText = content;
    } else if (typeof content === "object") {
      actualText = JSON.stringify(content, null, 2);
    } else {
      actualText = String(content);
    }

    // If content already contains markdown code blocks, return as-is
    if (actualText.includes("```")) {
      return actualText;
    }

    // Try to parse as JSON and pretty print it
    try {
      const parsed = JSON.parse(actualText);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // If it's not JSON, return as-is (could be markdown table, etc.)
      return actualText;
    }
  }

  /**
   * Check if a database result is considered empty (failure)
   * Same logic as ExecutorAgent to maintain consistency
   */
  isEmptyDatabaseResult(result) {
    // Only apply this check to database queries
    if (result.tool_name !== "db_query") return false;

    const content = result.content;
    if (!content) return true;

    // Ensure content is a string before calling trim
    const contentStr =
      typeof content === "string"
        ? content
        : typeof content === "object"
        ? JSON.stringify(content)
        : String(content);

    const trimmed = contentStr.trim();
    if (trimmed === "") return true;
    if (trimmed === "[]") return true;
    if (trimmed === "{}") return true;
    if (trimmed === "null") return true;

    // Try to parse as JSON and check if it's an empty array or object
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length === 0) return true;
      if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length === 0)
        return true;
    } catch (e) {
      // Not JSON, check for common empty result patterns
      if (
        trimmed.includes("0 rows") ||
        trimmed.includes("no results") ||
        trimmed.includes("empty")
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate analysis input
   */
  validateInput(input) {
    return input && typeof input === "object";
  }
}
