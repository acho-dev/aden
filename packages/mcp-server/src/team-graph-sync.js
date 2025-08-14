import neo4j from "neo4j-driver";
import { parseJWTToken } from "../../agent-client/src/auth-utils.js";
import { createAdenOrgTenantId } from "../../agent-client/src/utils/tenant-utils.js";
import { 
  SCHEMA_RELATIONSHIPS, 
  sanitizeRelationshipType, 
  isValidRelationshipType 
} from "./relationship-types.js";

/**
 * Team Graph Synchronization Utility
 * Extracts team graph from Aden API and syncs to Neo4j with proper tenant isolation
 */
export class TeamGraphSync {
  constructor(options = {}) {
    this.adenHost = options.adenHost || process.env.ADEN_HOST || "https://your-api-host.com";
    this.neo4jUri = options.neo4jUri || process.env.NEO4J_URI;
    this.neo4jUsername = options.neo4jUsername || process.env.NEO4J_USERNAME;
    this.neo4jPassword = options.neo4jPassword || process.env.NEO4J_PASSWORD;
    this.neo4jDatabase = options.neo4jDatabase || process.env.NEO4J_DATABASE || "neo4j";
    
    this.driver = null;
    this.session = null;
  }

  /**
   * Initialize Neo4j connection
   */
  async initialize() {
    if (!this.neo4jUri || !this.neo4jPassword) {
      throw new Error("Neo4j configuration missing: NEO4J_URI and NEO4J_PASSWORD are required");
    }

    try {
      this.driver = neo4j.driver(
        this.neo4jUri,
        neo4j.auth.basic(this.neo4jUsername, this.neo4jPassword)
      );

      // Test connection
      const serverInfo = await this.driver.getServerInfo();
      console.log(`✅ Neo4j connected: ${serverInfo.address} (v${serverInfo.agent})`);
      
    } catch (error) {
      console.error("❌ Neo4j connection failed:", error.message);
      throw error;
    }
  }

  /**
   * Extract team graph from Aden API with authentication
   */
  async extractTeamGraph(jwtToken, format = "graph") {
    if (!jwtToken) {
      throw new Error("JWT token is required for authenticated graph extraction");
    }

    // Parse JWT to get team information
    let teamInfo;
    try {
      teamInfo = await parseJWTToken(jwtToken);
      console.log(`🔍 Extracting graph for team: ${teamInfo.current_team_id} (user: ${teamInfo.email})`);
    } catch (error) {
      throw new Error(`Invalid JWT token: ${error.message}`);
    }

    // Build API endpoint for graph export
    const apiEndpoint = `${this.adenHost}/erp/object/graph-export`;
    const params = new URLSearchParams({
      format: format,
      depth: "3", // Deep extraction to get full relationships
    });

    try {
      console.log(`📥 Calling graph-export API: ${apiEndpoint}?${params}`);
      
      const response = await fetch(`${apiEndpoint}?${params}`, {
        method: "GET",
        headers: {
          Authorization: `jwt ${jwtToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Graph export failed: ${response.status} - ${errorData.message || response.statusText}`
        );
      }

      const graphData = await response.json();
      console.log(`✅ Graph extracted successfully: ${Object.keys(graphData).length} root elements`);
      
      // Debug: Log the actual structure of returned data
      console.log(`🔍 Graph data structure:`, JSON.stringify(graphData, null, 2).substring(0, 1000) + '...');
      
      return {
        teamId: teamInfo.teamId || teamInfo.current_team_id,
        userId: teamInfo.userId || teamInfo.id,
        userEmail: teamInfo.fullIdentity?.email || teamInfo.email,
        graphData: graphData,
        extractedAt: new Date().toISOString(),
      };

    } catch (error) {
      console.error("❌ Graph extraction failed:", error.message);
      throw error;
    }
  }

  /**
   * Transform graph data into Neo4j nodes and relationships
   * Based on migration script patterns for handling nodes/edges format
   */
  transformGraphToNeo4j(extractedGraph) {
    const { teamId, userId, graphData } = extractedGraph;
    const nodes = [];
    const relationships = [];
    const tenantId = createAdenOrgTenantId(teamId);

    console.log(`🔄 Transforming graph data for tenant: ${tenantId}`);
    console.log(`📊 Graph data contains: nodes=${graphData.nodes?.length || 0}, edges=${graphData.edges?.length || 0}`);

    // Helper function to extract table and column from node ID
    const extractTableAndColumn = (nodeId) => {
      const parts = nodeId.split('.');
      if (parts.length >= 2) {
        return {
          tableName: parts[0],
          columnName: parts[1]
        };
      } else {
        return {
          tableName: parts[0],
          columnName: null
        };
      }
    };

    // Process nodes from graph data (same format as migration script expects)
    if (graphData.nodes && Array.isArray(graphData.nodes)) {
      graphData.nodes.forEach((node) => {
        const { tableName, columnName } = extractTableAndColumn(node.id);
        const nodeId = `${tenantId}:${node.id}`;
        
        // Get appropriate Neo4j label for node kind (matching neo4j-schema-service)
        const nodeLabel = this.getNodeLabel(node.kind);
        
        const baseProperties = {
          tenantId: tenantId,
          teamId: teamId,
          originalId: node.id,
          kind: node.kind || 'Unknown',
          datatype: node.datatype,
          tableName: tableName,
          columnName: columnName,
          createdAt: new Date().toISOString(),
          lastSyncAt: new Date().toISOString(),
        };

        // For Knowledge nodes, preserve critical data field and metadata
        if (node.kind === 'Knowledge') {
          baseProperties.data = node.data;
          baseProperties.entities = node.entities;
          baseProperties.properties = node.properties;
          baseProperties.category = node.category;
          baseProperties.confidence = node.confidence;
          baseProperties.reasoning = node.reasoning;
          baseProperties.timestamp = node.timestamp;
        }

        // Add description if available
        if (node.description) {
          baseProperties.description = node.description;
        }

        nodes.push({
          id: nodeId,
          label: nodeLabel,
          kind: node.kind,
          datatype: node.datatype,
          tableName: tableName,
          columnName: columnName,
          properties: baseProperties,
        });
      });
    }

    // Process edges from graph data (same format as migration script expects)
    if (graphData.edges && Array.isArray(graphData.edges)) {
      graphData.edges.forEach((edge) => {
        const fromNodeId = `${tenantId}:${edge.from}`;
        const toNodeId = `${tenantId}:${edge.to}`;
        
        // Use proper relationship types from centralized definitions
        let relationshipType = edge.label || SCHEMA_RELATIONSHIPS.RELATES_TO;
        
        // Validate and sanitize the relationship type
        if (!isValidRelationshipType(relationshipType)) {
          console.warn(`⚠️ Invalid relationship type: ${relationshipType}, using default`);
          relationshipType = SCHEMA_RELATIONSHIPS.RELATES_TO;
        }
        
        relationshipType = sanitizeRelationshipType(relationshipType);
        
        relationships.push({
          from: fromNodeId,
          to: toNodeId,
          type: relationshipType,
          properties: {
            tenantId: tenantId,
            originalLabel: edge.label,
            score: edge.score || null,
            createdAt: new Date().toISOString(),
          },
        });
      });
    }

    console.log(`✅ Transformation complete: ${nodes.length} nodes, ${relationships.length} relationships`);

    return {
      tenantId,
      nodes,
      relationships,
      metadata: {
        teamId: teamId,
        userId: userId,
        nodeCount: nodes.length,
        relationshipCount: relationships.length,
        syncedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Get appropriate Neo4j label for node kind (matching neo4j-schema-service)
   */
  getNodeLabel(kind) {
    const labelMap = {
      'Entity': 'Table',
      'Property': 'Column', 
      'Knowledge': 'Knowledge',
      'Index': 'SchemaIndex',
      'Constraint': 'SchemaConstraint'
    };
    
    return labelMap[kind] || 'Table';
  }

  /**
   * Upsert nodes and relationships to Neo4j with tenant isolation
   */
  async upsertToNeo4j(transformedData) {
    const { tenantId, nodes, relationships, metadata } = transformedData;
    
    if (!this.driver) {
      throw new Error("Neo4j driver not initialized. Call initialize() first.");
    }

    const session = this.driver.session({ database: this.neo4jDatabase });
    
    try {
      console.log(`🔄 Starting Neo4j upsert for tenant: ${tenantId}`);
      
      // Begin transaction
      const txc = session.beginTransaction();

      // 1. Create/update tenant metadata node
      await txc.run(`
        MERGE (t:Tenant {id: $tenantId})
        SET t += $metadata
        SET t.lastSyncAt = datetime()
      `, { tenantId, metadata });

      // 2. Upsert nodes with tenant isolation (using same pattern as neo4j-schema-service)
      for (const node of nodes) {
        console.log(`Creating ${node.label} node for ID: ${node.properties.originalId}`);
        
        const query = `
          MERGE (n:${node.label} {id: $id, tenantId: $tenantId})
          SET n += $properties,
              n.updated_at = datetime(),
              n.kind = $kind,
              n.datatype = $datatype,
              n.tableName = $tableName,
              n.columnName = $columnName
          RETURN count(n) as updated_count
        `;
        
        await txc.run(query, {
          id: node.id,
          tenantId: tenantId,
          properties: node.properties,
          kind: node.kind,
          datatype: node.datatype || null,
          tableName: node.tableName || null,
          columnName: node.columnName || null
        });
      }

      // 3. Upsert relationships with tenant isolation
      for (const rel of relationships) {
        const cypher = `
          MATCH (from {id: $fromId, tenantId: $tenantId})
          MATCH (to {id: $toId, tenantId: $tenantId})
          MERGE (from)-[r:${rel.type} {tenantId: $tenantId}]->(to)
          SET r += $properties
          SET r.lastSyncAt = datetime()
        `;
        
        await txc.run(cypher, {
          fromId: rel.from,
          toId: rel.to,
          tenantId: tenantId,
          properties: rel.properties,
        });
      }

      // 4. Create relationship from tenant to schema nodes
      await txc.run(`
        MATCH (t:Tenant {id: $tenantId})
        MATCH (n:SchemaNode {tenantId: $tenantId})
        MERGE (t)-[r:OWNS]->(n)
        SET r.lastSyncAt = datetime()
      `, { tenantId });

      // Commit transaction
      await txc.commit();
      console.log(`✅ Neo4j upsert completed: ${nodes.length} nodes, ${relationships.length} relationships`);

      return {
        success: true,
        tenantId,
        nodesUpserted: nodes.length,
        relationshipsUpserted: relationships.length,
        syncedAt: new Date().toISOString(),
      };

    } catch (error) {
      console.error("❌ Neo4j upsert failed:", error.message);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Verify tenant data isolation
   */
  async verifyTenantIsolation(tenantId) {
    if (!this.driver) {
      throw new Error("Neo4j driver not initialized. Call initialize() first.");
    }

    const session = this.driver.session({ database: this.neo4jDatabase });
    
    try {
      // Check tenant data
      const result = await session.run(`
        MATCH (t:Tenant {id: $tenantId})
        OPTIONAL MATCH (t)-[:OWNS]->(n:SchemaNode)
        RETURN t, COUNT(n) as nodeCount
      `, { tenantId });

      if (result.records.length === 0) {
        return { exists: false, message: `Tenant ${tenantId} not found` };
      }

      const record = result.records[0];
      const tenant = record.get('t');
      const nodeCount = record.get('nodeCount').toNumber();

      return {
        exists: true,
        tenantId: tenant.properties.id,
        teamId: tenant.properties.teamId,
        nodeCount: nodeCount,
        lastSyncAt: tenant.properties.lastSyncAt,
        message: `Tenant ${tenantId} has ${nodeCount} schema nodes`,
      };

    } catch (error) {
      console.error("❌ Tenant verification failed:", error.message);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Full synchronization workflow
   */
  async syncTeamGraph(jwtToken, options = {}) {
    const format = options.format || "graph";
    const verify = options.verify !== false; // Default true

    try {
      console.log("🚀 Starting team graph synchronization...");

      // Step 1: Initialize Neo4j connection
      if (!this.driver) {
        await this.initialize();
      }

      // Step 2: Extract team graph from Aden API
      const extractedGraph = await this.extractTeamGraph(jwtToken, format);

      // Step 3: Transform graph data for Neo4j
      const transformedData = this.transformGraphToNeo4j(extractedGraph);

      // Step 4: Upsert to Neo4j with tenant isolation
      const upsertResult = await this.upsertToNeo4j(transformedData);

      // Step 5: Verify tenant isolation (optional)
      let verificationResult = null;
      if (verify) {
        verificationResult = await this.verifyTenantIsolation(transformedData.tenantId);
      }

      console.log("✅ Team graph synchronization completed successfully");

      return {
        success: true,
        extraction: {
          teamId: extractedGraph.teamId,
          userId: extractedGraph.userId,
          userEmail: extractedGraph.userEmail,
          extractedAt: extractedGraph.extractedAt,
        },
        transformation: {
          tenantId: transformedData.tenantId,
          nodeCount: transformedData.nodes.length,
          relationshipCount: transformedData.relationships.length,
        },
        upsert: upsertResult,
        verification: verificationResult,
      };

    } catch (error) {
      console.error("❌ Team graph synchronization failed:", error.message);
      throw error;
    }
  }

  /**
   * Clean up Neo4j connection
   */
  async close() {
    if (this.driver) {
      await this.driver.close();
      console.log("✅ Neo4j connection closed");
    }
  }
}

/**
 * Convenience function for one-time sync
 */
export async function syncTeamGraphOnce(jwtToken, options = {}) {
  const sync = new TeamGraphSync(options);
  
  try {
    const result = await sync.syncTeamGraph(jwtToken, options);
    return result;
  } finally {
    await sync.close();
  }
}