import fetch from "node-fetch";

/**
 * MCP Tool wrapper for RAG (Retrieval Augmented Generation) queries
 * Provides secure, authenticated access to indexed document search functionality
 */
export class RagTool {
  constructor() {
    this.name = "rag_query";
    this.description = "Query indexed documents to find relevant information using RAG (Retrieval Augmented Generation) system. Returns AI-generated responses with source attribution.";
    this.inputSchema = {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language query to search indexed documents and generate AI response",
        },
      },
      required: ["query"],
    };
  }

  /**
   * Execute RAG query
   */
  async execute(args) {
    const { jwtToken, query } = args;

    // Validate authentication
    if (!jwtToken || typeof jwtToken !== "string") {
      throw new Error("Valid JWT token is required for RAG query");
    }

    // Validate input parameters
    if (!query || typeof query !== "string") {
      throw new Error(
        `Invalid query parameter: ${typeof query}. Query must be a non-empty string.`
      );
    }

    if (query.trim().length === 0) {
      throw new Error("Query parameter cannot be empty or contain only whitespace.");
    }

    // Get API endpoint from environment variables
    const ADEN_HOST = process.env.ADEN_HOST || "http://localhost:8888";
    const API_ENDPOINT = `${ADEN_HOST}/ai/rag/query`;

    try {
      console.log("🔍 Starting RAG query...");
      
      // Debug logging - show token prefix for verification
      const tokenPrefix = jwtToken.substring(0, 20);
      console.log(`🔑 Using token: ${tokenPrefix}... for rag_query`);

      const requestBody = {
        query: query,
      };

      console.log("📤 Sending RAG query request:", {
        endpoint: API_ENDPOINT,
        query: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
      });

      // Make the API request with proper timeout
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `jwt ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        timeout: 60000, // 60 seconds timeout as recommended in documentation
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `RAG API request failed with status ${response.status}: ${response.statusText}. Details: ${errorText}`
        );
      }

      const result = await response.json();

      console.log("✅ RAG query completed successfully");
      console.log(`📊 Token usage: ${result.tokenUse?.inputTokens || 0} input, ${result.tokenUse?.outputTokens || 0} output`);

      return {
        content: [
          {
            type: "text",
            text: this.formatRagResult(result, query),
          },
        ],
      };

    } catch (error) {
      console.error("❌ RAG query failed:", error.message);
      
      return {
        content: [
          {
            type: "text",
            text: `RAG query failed: ${error.message}\n\nQuery: ${query}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Format RAG query result for display
   */
  formatRagResult(result, query) {
    let output = "## 🔍 **RAG Query Response**\n\n";
    
    // Query information
    output += `**Query:** ${query}\n\n`;
    
    // Answer section
    output += `**Answer:**\n${result.content}\n\n`;

    // Sources section
    if (result.sources && result.sources.length > 0) {
      output += `**📚 Sources (${result.sources.length}):**\n`;
      result.sources.forEach((source, index) => {
        output += `${index + 1}. ${source.source}`;
        if (source.loaderId) {
          output += ` (Loader: ${source.loaderId})`;
        }
        output += `\n`;
      });
      output += `\n`;
    }

    // Metadata section
    output += `**📊 Metadata:**\n`;
    output += `- Response ID: ${result.id}\n`;
    output += `- Timestamp: ${result.timestamp}\n`;
    
    if (result.tokenUse) {
      output += `- Token Usage: ${result.tokenUse.inputTokens} input, ${result.tokenUse.outputTokens} output\n`;
    }
    
    return output;
  }
}

/**
 * Factory function for MCP tool registration
 */
export function createRagTool() {
  return new RagTool();
}