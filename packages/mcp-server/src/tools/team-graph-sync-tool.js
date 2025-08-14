import { TeamGraphSync } from "../team-graph-sync.js";

/**
 * MCP Tool wrapper for team graph synchronization
 * Provides secure, authenticated access to team graph sync functionality
 */
export class TeamGraphSyncTool {
  constructor() {
    this.name = "sync_team_graph";
    this.description = "Synchronize current team's database schema to Neo4j knowledge graph with proper tenant isolation";
    this.inputSchema = {
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
    };
  }

  /**
   * Execute team graph synchronization
   */
  async execute(args) {
    const { jwtToken, format = "graph", verify = true } = args;

    // Validate authentication
    if (!jwtToken || typeof jwtToken !== "string") {
      throw new Error("Valid JWT token is required for team graph synchronization");
    }

    // Check Neo4j configuration
    if (!process.env.NEO4J_URI || !process.env.NEO4J_PASSWORD) {
      throw new Error("Neo4j configuration missing: NEO4J_URI and NEO4J_PASSWORD environment variables are required");
    }

    const sync = new TeamGraphSync();
    
    try {
      console.log("🔄 Starting authenticated team graph synchronization...");
      
      const result = await sync.syncTeamGraph(jwtToken, { format, verify });
      
      return {
        content: [
          {
            type: "text",
            text: this.formatSyncResult(result),
          },
        ],
      };

    } catch (error) {
      console.error("❌ Team graph sync failed:", error.message);
      
      return {
        content: [
          {
            type: "text",
            text: `Team graph synchronization failed: ${error.message}`,
          },
        ],
        isError: true,
      };
    } finally {
      await sync.close();
    }
  }

  /**
   * Format synchronization result for display
   */
  formatSyncResult(result) {
    const { extraction, transformation, upsert, verification } = result;
    
    let output = "✅ **Team Graph Synchronization Completed**\n\n";
    
    // Extraction summary
    output += "**📥 Data Extraction:**\n";
    output += `- Team ID: ${extraction.teamId}\n`;
    output += `- User: ${extraction.userEmail}\n`;
    output += `- Extracted: ${extraction.extractedAt}\n\n`;
    
    // Transformation summary
    output += "**🔄 Data Transformation:**\n";
    output += `- Tenant ID: ${transformation.tenantId}\n`;
    output += `- Nodes Created: ${transformation.nodeCount}\n`;
    output += `- Relationships Created: ${transformation.relationshipCount}\n\n`;
    
    // Upsert summary
    output += "**💾 Neo4j Upsert:**\n";
    output += `- Nodes Upserted: ${upsert.nodesUpserted}\n`;
    output += `- Relationships Upserted: ${upsert.relationshipsUpserted}\n`;
    output += `- Synced: ${upsert.syncedAt}\n`;
    
    // Verification summary
    if (verification) {
      output += "\n**🔍 Tenant Isolation Verification:**\n";
      output += `- Status: ${verification.exists ? "✅ Verified" : "❌ Failed"}\n`;
      output += `- ${verification.message}\n`;
      
      if (verification.exists) {
        output += `- Last Sync: ${verification.lastSyncAt}\n`;
      }
    }
    
    return output;
  }
}

/**
 * Factory function for MCP tool registration
 */
export function createTeamGraphSyncTool() {
  return new TeamGraphSyncTool();
}