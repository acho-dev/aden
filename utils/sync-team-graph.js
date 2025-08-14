#!/usr/bin/env node

/**
 * CLI Utility: Sync Team Graph to Neo4j
 * 
 * Usage:
 *   node utils/sync-team-graph.js --token <jwt_token>
 *   node utils/sync-team-graph.js --token <jwt_token> --format graph --verify
 *   node utils/sync-team-graph.js --help
 */

import { syncTeamGraphOnce } from "../src/team-graph-sync.js";
import { config } from "dotenv";

// Load environment variables
config();

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    token: null,
    format: "graph",
    verify: true,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case "--token":
      case "-t":
        parsed.token = args[++i];
        break;
      case "--format":
      case "-f":
        parsed.format = args[++i];
        break;
      case "--no-verify":
        parsed.verify = false;
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      default:
        console.warn(`⚠️ Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
🔄 **Team Graph Synchronization Utility**

Extracts the current team's database schema from Aden API and synchronizes it
to the Neo4j knowledge graph with proper tenant isolation.

**Usage:**
  node utils/sync-team-graph.js --token <jwt_token> [options]

**Options:**
  -t, --token <token>    JWT token for team authentication (required)
  -f, --format <format>  Graph export format: json, xml, graph (default: graph)
  --no-verify           Skip tenant isolation verification
  -h, --help            Show this help message

**Environment Variables Required:**
  NEO4J_URI             Neo4j database URI
  NEO4J_USERNAME        Neo4j username (default: neo4j)
  NEO4J_PASSWORD        Neo4j password
  NEO4J_DATABASE        Neo4j database name (default: neo4j)
  ADEN_HOST            Aden API host (default: https://your-api-host.com)

**Examples:**
  # Basic sync with current team token
  node utils/sync-team-graph.js --token "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."

  # Sync with XML format and verification
  node utils/sync-team-graph.js --token "eyJ..." --format xml

  # Sync without verification
  node utils/sync-team-graph.js --token "eyJ..." --no-verify

**Security:**
- JWT tokens are never logged or stored
- Tenant isolation ensures team data separation
- All operations are scoped to the authenticated team
`);
}

/**
 * Validate environment and arguments
 */
function validate(args) {
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.token) {
    console.error("❌ Error: JWT token is required");
    console.error("Use --token <jwt_token> or --help for usage information");
    process.exit(1);
  }

  // Validate format
  const validFormats = ["json", "xml", "graph"];
  if (!validFormats.includes(args.format)) {
    console.error(`❌ Error: Invalid format '${args.format}'. Must be one of: ${validFormats.join(", ")}`);
    process.exit(1);
  }

  // Check required environment variables
  const requiredEnvVars = ["NEO4J_URI", "NEO4J_PASSWORD"];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error("❌ Error: Missing required environment variables:");
    missingVars.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    console.error("\nPlease configure these variables in your .env file or environment");
    process.exit(1);
  }

  console.log("✅ Environment validation passed");
}

/**
 * Display sync progress
 */
function displayProgress(step, message) {
  const steps = ["🔍", "📥", "🔄", "💾", "✅"];
  const stepIcon = steps[Math.min(step, steps.length - 1)];
  console.log(`${stepIcon} ${message}`);
}

/**
 * Main execution function
 */
async function main() {
  console.log("🚀 Team Graph Synchronization Utility\n");

  const args = parseArgs();
  validate(args);

  try {
    displayProgress(0, "Validating authentication...");
    
    displayProgress(1, `Extracting team graph (format: ${args.format})...`);
    
    displayProgress(2, "Transforming graph data for Neo4j...");
    
    displayProgress(3, "Upserting to Neo4j with tenant isolation...");
    
    const result = await syncTeamGraphOnce(args.token, {
      format: args.format,
      verify: args.verify,
    });

    displayProgress(4, "Synchronization completed successfully!\n");

    // Display detailed results
    console.log("📊 **Synchronization Results:**");
    console.log(`   Team ID: ${result.extraction.teamId}`);
    console.log(`   User: ${result.extraction.userEmail}`);
    console.log(`   Tenant: ${result.transformation.tenantId}`);
    console.log(`   Nodes: ${result.transformation.nodeCount}`);
    console.log(`   Relationships: ${result.transformation.relationshipCount}`);
    
    if (result.verification) {
      console.log(`   Verification: ${result.verification.exists ? "✅ Passed" : "❌ Failed"}`);
      if (result.verification.exists) {
        console.log(`   Schema Nodes in Neo4j: ${result.verification.nodeCount}`);
      }
    }

    console.log(`\n🎯 **Next Steps:**`);
    console.log(`   1. Use search_memories tool to query team knowledge`);
    console.log(`   2. Use remember tool to store insights with team context`);
    console.log(`   3. Query Neo4j directly for advanced graph analysis`);
    console.log(`   4. Re-run this sync when schema changes occur`);

  } catch (error) {
    console.error(`\n❌ **Synchronization Failed:**`);
    console.error(`   Error: ${error.message}`);
    
    if (error.message.includes("JWT")) {
      console.error(`\n💡 **JWT Token Issues:**`);
      console.error(`   - Ensure token is valid and not expired`);
      console.error(`   - Check token has team access permissions`);
      console.error(`   - Verify ADEN_HOST is correct`);
    } else if (error.message.includes("Neo4j")) {
      console.error(`\n💡 **Neo4j Connection Issues:**`);
      console.error(`   - Verify NEO4J_URI is accessible`);
      console.error(`   - Check NEO4J_USERNAME and NEO4J_PASSWORD`);
      console.error(`   - Ensure Neo4j instance is running`);
    } else if (error.message.includes("Graph export")) {
      console.error(`\n💡 **API Access Issues:**`);
      console.error(`   - Verify team has database access permissions`);
      console.error(`   - Check ADEN_HOST endpoint is reachable`);
      console.error(`   - Ensure graph-export API is available`);
    }

    process.exit(1);
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("💥 Unexpected error:", error);
    process.exit(1);
  });
}