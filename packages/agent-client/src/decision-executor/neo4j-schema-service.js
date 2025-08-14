import neo4j from 'neo4j-driver';
import { 
  SCHEMA_RELATIONSHIPS,
  sanitizeRelationshipType,
  isValidRelationshipType
} from '../../../mcp-server/src/relationship-types.js';

/**
 * Neo4j-based schema storage service with multi-tenant support
 * Replaces JSON file-based schema storage with graph database
 * Optimized with caching for better performance
 */
export class Neo4jSchemaService {
  constructor(config) {
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password)
    );
    this.database = config.database || 'neo4j';
    this.defaultTenant = config.defaultTenant || 'public';
    
    // Schema cache with TTL (5 minutes)
    this.schemaCache = new Map();
    this.schemaCacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.lastSchemaUpdate = new Map();
  }

  /**
   * Initialize database with constraints and indexes
   */
  async initialize() {
    const session = this.driver.session({ database: this.database });
    
    try {
      // Create constraints for each node type
      const constraints = [
        'CREATE CONSTRAINT table_id_unique IF NOT EXISTS FOR (n:Table) REQUIRE n.id IS UNIQUE',
        'CREATE CONSTRAINT column_id_unique IF NOT EXISTS FOR (n:Column) REQUIRE n.id IS UNIQUE',
        'CREATE CONSTRAINT knowledge_id_unique IF NOT EXISTS FOR (n:Knowledge) REQUIRE n.id IS UNIQUE',
        'CREATE CONSTRAINT index_id_unique IF NOT EXISTS FOR (n:SchemaIndex) REQUIRE n.id IS UNIQUE',
        'CREATE CONSTRAINT constraint_id_unique IF NOT EXISTS FOR (n:SchemaConstraint) REQUIRE n.id IS UNIQUE'
      ];
      
      for (const constraint of constraints) {
        await session.run(constraint);
      }
      
      // Create indexes for performance
      const indexes = [
        'CREATE INDEX table_tenant_idx IF NOT EXISTS FOR (n:Table) ON (n.tenantId)',
        'CREATE INDEX column_tenant_idx IF NOT EXISTS FOR (n:Column) ON (n.tenantId)',
        'CREATE INDEX knowledge_tenant_idx IF NOT EXISTS FOR (n:Knowledge) ON (n.tenantId)',
        'CREATE INDEX table_domain_idx IF NOT EXISTS FOR (n:Table) ON (n.domain)',
        'CREATE INDEX column_datatype_idx IF NOT EXISTS FOR (n:Column) ON (n.datatype)'
      ];
      
      for (const index of indexes) {
        await session.run(index);
      }
      
      console.log('✅ Neo4j schema service initialized with type-specific constraints and indexes');
    } catch (error) {
      console.warn('⚠️ Failed to initialize Neo4j constraints:', error.message);
    } finally {
      await session.close();
    }
  }

  /**
   * Load minimal schema for a specific tenant - lightweight version with caching
   * @param {string} tenantId - Tenant identifier, null for public-only
   * @returns {Object} Minimal schema data for LLM consumption
   */
  async preloadSchemaMinimal(tenantId = null) {
    const cacheKey = `minimal_${tenantId || 'public'}`;
    
    // Check cache first
    if (this.isCacheValid(cacheKey)) {
      console.log(`⚡ Using cached minimal schema for tenant: ${tenantId || 'public:default'}`);
      return this.schemaCache.get(cacheKey);
    }
    
    const session = this.driver.session({ database: this.database });
    
    try {
      console.log(`🔍 Loading minimal schema from Neo4j for tenant: ${tenantId || 'public:default'}`);
      
      const query = `
        // Load minimal node info
        MATCH (n) WHERE n.tenantId = $tenantId AND (
          n:Table OR n:Column OR n:Knowledge
        )
        
        // Get all relationships for the tenant
        OPTIONAL MATCH (n)-[r]-(connected) 
        WHERE connected.tenantId = $tenantId AND r.tenantId = $tenantId AND (
          connected:Table OR connected:Column OR connected:Knowledge
        )
        
        WITH n, collect(DISTINCT {
          from: n.id,
          to: connected.id,
          type: type(r)
        }) as node_edges
        
        RETURN 
          collect(DISTINCT CASE 
            WHEN n:Table THEN {id: n.id, type: "table", tableName: n.tableName, domain: n.domain, description: n.description}
            WHEN n:Column THEN {id: n.id, type: "column", columnName: n.columnName, datatype: n.datatype, tableName: n.tableName, description: n.description}  
            WHEN n:Knowledge THEN {id: n.id, type: "knowledge", data: n.data, description: n.description, category: n.category, confidence: n.confidence}
          END) as nodes,
          
          // Flatten essential edges only
          reduce(all_edges = [], node_edge_list IN collect(node_edges) | 
            all_edges + [edge IN node_edge_list WHERE edge.from IS NOT NULL AND edge.to IS NOT NULL AND edge.from <> edge.to]
          ) as edges,
          
          count(DISTINCT CASE WHEN n:Table THEN n END) as table_count,
          count(DISTINCT CASE WHEN n:Column THEN n END) as column_count,
          count(DISTINCT CASE WHEN n:Knowledge THEN n END) as knowledge_count
      `;
      
      const result = await session.run(query, { tenantId });
      const record = result.records[0];
      
      if (!record) {
        throw new Error('No schema data found in Neo4j');
      }
      
      const nodes = record.get('nodes').filter(n => n && n.id);
      const edges = record.get('edges').filter(e => e && e.from && e.to && e.from !== e.to);
      const tableCount = record.get('table_count').toNumber();
      const columnCount = record.get('column_count').toNumber(); 
      const knowledgeCount = record.get('knowledge_count').toNumber();
      
      console.log(`✅ Minimal schema loaded: ${tableCount} tables, ${columnCount} columns, ${knowledgeCount} knowledge nodes, ${edges.length} relationships`);
      
      const schema = {
        tenant: tenantId,
        nodes: nodes,
        edges: edges,
        summary: {
          tables: tableCount,
          columns: columnCount,
          knowledge: knowledgeCount,
          relationships: edges.length,
          total: nodes.length
        },
        note: "Minimal schema with essential info only. Includes relationships with specific types."
      };
      
      // Store in cache
      this.updateCache(cacheKey, schema);
      
      return schema;
      
    } finally {
      await session.close();
    }
  }
  
  /**
   * Check if cache entry is valid
   */
  isCacheValid(key) {
    if (!this.schemaCache.has(key)) return false;
    
    const lastUpdate = this.lastSchemaUpdate.get(key);
    if (!lastUpdate) return false;
    
    const age = Date.now() - lastUpdate;
    return age < this.schemaCacheTTL;
  }
  
  /**
   * Update cache with new data
   */
  updateCache(key, data) {
    this.schemaCache.set(key, data);
    this.lastSchemaUpdate.set(key, Date.now());
  }
  
  /**
   * Clear cache for a specific tenant or all
   */
  clearCache(tenantId = null) {
    if (tenantId) {
      const keys = [`minimal_${tenantId}`, `full_${tenantId}`];
      keys.forEach(key => {
        this.schemaCache.delete(key);
        this.lastSchemaUpdate.delete(key);
      });
    } else {
      this.schemaCache.clear();
      this.lastSchemaUpdate.clear();
    }
    console.log(`🗑️ Schema cache cleared for ${tenantId || 'all tenants'}`);
  }

  /**
   * Load schema for a specific tenant (public + customer-specific) - FULL VERSION with caching
   * @param {string} tenantId - Tenant identifier, null for public-only
   * @returns {Object} Combined schema data formatted for LLM consumption
   */
  async preloadSchema(tenantId = null) {
    const cacheKey = `full_${tenantId || 'public'}`;
    
    // Check cache first
    if (this.isCacheValid(cacheKey)) {
      console.log(`⚡ Using cached full schema for tenant: ${tenantId || 'public:default'}`);
      return this.schemaCache.get(cacheKey);
    }
    
    const session = this.driver.session({ database: this.database });
    
    try {
      console.log(`🔍 Loading schema from Neo4j for tenant: ${tenantId || 'public:default'}`);
      
      const query = `
        // Load all node types for the tenant
        MATCH (n) WHERE n.tenantId = $tenantId AND (
          n:Table OR n:Column OR n:Knowledge OR n:SchemaIndex OR n:SchemaConstraint
        )
        
        // Get relationships between nodes (now using specific relationship types)
        OPTIONAL MATCH (n)-[r]-(connected) 
        WHERE connected.tenantId = $tenantId AND (
          connected:Table OR connected:Column OR connected:Knowledge OR 
          connected:SchemaIndex OR connected:SchemaConstraint
        ) AND r.tenantId = $tenantId
        
        RETURN 
          collect(DISTINCT {
            id: n.id,
            kind: [label IN labels(n) WHERE label <> 'CustomerSchema' | label][0],
            datatype: n.datatype,
            domain: n.domain,
            tenantId: n.tenantId,
            description: n.description,
            tableName: n.tableName,
            columnName: n.columnName,
            metadata: {
              created_at: n.created_at,
              updated_at: n.updated_at,
              migrated_at: n.migrated_at
            }
          }) as nodes,
          
          collect(DISTINCT {
            from: n.id,
            to: connected.id,
            label: type(r),
            original_type: r.original_type,
            domain: n.domain
          }) as edges
      `;
      
      const result = await session.run(query, { tenantId });
      const record = result.records[0];
      
      if (!record) {
        throw new Error('No schema data found in Neo4j');
      }
      
      return this.formatSchemaForLLM(record);
      
    } finally {
      await session.close();
    }
  }

  /**
   * Save or update schema nodes for a specific tenant
   * @param {Array} schemaUpdates - Array of schema node updates
   * @param {string} tenantId - Tenant identifier
   */
  async saveSchemaUpdates(schemaUpdates, tenantId) {
    const session = this.driver.session({ database: this.database });
    
    try {
      console.log(`💾 Saving ${schemaUpdates.length} schema updates for tenant: ${tenantId}`);
      
      let totalUpdated = 0;
      
      // Process each node type separately for proper labeling
      for (const update of schemaUpdates) {
        const nodeLabel = this.getNodeLabel(update.kind);
        
        const query = `
          MERGE (n:${nodeLabel} {id: $id, tenantId: $tenantId})
          SET n += $properties,
              n.updated_at = datetime(),
              n.kind = $kind,
              n.datatype = $datatype,
              n.description = $description,
              n.tableName = $tableName,
              n.columnName = $columnName,
              n.data = $data,
              n.entities = $entities,
              n.category = $category,
              n.confidence = $confidence,
              n.reasoning = $reasoning,
              n.timestamp = $timestamp
          RETURN count(n) as updated_count
        `;
        
        const result = await session.run(query, {
          id: update.id,
          tenantId: tenantId,
          properties: update.properties,
          kind: update.kind,
          datatype: update.datatype || null,
          description: update.properties.description,
          tableName: update.tableName || null,
          columnName: update.columnName || null,
          data: update.properties.data || null,
          entities: update.properties.entities || null,
          category: update.properties.category || null,
          confidence: update.properties.confidence || null,
          reasoning: update.properties.reasoning || null,
          timestamp: update.properties.timestamp || null
        });
        
        const updated = result.records[0].get('updated_count').toNumber();
        totalUpdated += updated;
      }
      
      console.log(`✅ Updated ${totalUpdated} schema nodes for tenant: ${tenantId}`);
      return totalUpdated;
      
    } finally {
      await session.close();
    }
  }

  /**
   * Get appropriate Neo4j label for node kind
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
   * Clean up existing generic SCHEMA_RELATIONSHIP edges for a tenant
   * @param {string} tenantId - Tenant identifier
   */
  async cleanupGenericRelationships(tenantId) {
    const session = this.driver.session({ database: this.database });
    
    try {
      console.log(`🧹 Cleaning up existing SCHEMA_RELATIONSHIP edges for tenant: ${tenantId}`);
      
      const result = await session.run(`
        MATCH ()-[r:SCHEMA_RELATIONSHIP]->()
        WHERE r.tenantId IS NULL OR r.tenantId = $tenantId
        DELETE r
        RETURN count(r) as deleted_count
      `, { tenantId });
      
      const deletedCount = result.records[0].get('deleted_count').toNumber();
      console.log(`✅ Deleted ${deletedCount} generic SCHEMA_RELATIONSHIP edges`);
      return deletedCount;
      
    } finally {
      await session.close();
    }
  }

  /**
   * Create relationships between schema nodes
   * @param {Array} relationships - Array of {from, to, label} relationships
   * @param {string} tenantId - Tenant identifier
   */
  async createSchemaRelationships(relationships, tenantId) {
    const session = this.driver.session({ database: this.database });
    
    try {
      let totalCreated = 0;
      
      // Process relationships by type to create proper Neo4j relationship types
      const relationshipsByType = this.groupRelationshipsByType(relationships);
      
      for (const [relType, rels] of Object.entries(relationshipsByType)) {
        // Validate and sanitize relationship type
        const safeRelType = this.sanitizeRelationshipType(relType);
        
        if (!isValidRelationshipType(safeRelType)) {
          console.warn(`⚠️ Unknown relationship type: ${relType}, using ${SCHEMA_RELATIONSHIPS.RELATES_TO}`);
        }
        
        console.log(`🔗 Creating ${rels.length} ${safeRelType} relationships...`);
        
        for (const rel of rels) {
          const query = `
            MATCH (from {id: $fromId, tenantId: $tenantId})
            MATCH (to {id: $toId, tenantId: $tenantId})
            WHERE (from:Table OR from:Column OR from:Knowledge OR from:SchemaIndex OR from:SchemaConstraint) AND
                  (to:Table OR to:Column OR to:Knowledge OR to:SchemaIndex OR to:SchemaConstraint)
            MERGE (from)-[r:${safeRelType}]->(to)
            SET r.created_at = COALESCE(r.created_at, datetime()),
                r.updated_at = datetime(),
                r.original_type = $originalType,
                r.tenantId = $tenantId
            RETURN count(r) as created
          `;
          
          try {
            const result = await session.run(query, {
              fromId: rel.from,
              toId: rel.to,
              originalType: rel.label,
              tenantId
            });
            
            const created = result.records[0].get('created').toNumber();
            totalCreated += created;
            
          } catch (relError) {
            console.warn(`⚠️ Failed to create ${safeRelType} relationship ${rel.from} -> ${rel.to}:`, relError.message);
          }
        }
      }
      
      console.log(`✅ Created ${totalCreated} schema relationships for tenant: ${tenantId}`);
      return totalCreated;
      
    } finally {
      await session.close();
    }
  }

  /**
   * Search schema nodes by pattern with relationship context
   * @param {string} searchTerm - Search term for node ID or description
   * @param {string} tenantId - Tenant identifier
   * @returns {Array} Matching schema nodes with relationship information
   */
  async searchSchema(searchTerm, tenantId = null) {
    const session = this.driver.session({ database: this.database });
    
    try {
      const query = `
        // Search nodes by term
        MATCH (n {tenantId: $tenantId})
        WHERE (n:Table OR n:Column OR n:Knowledge OR n:SchemaIndex OR n:SchemaConstraint) AND
              (n.id CONTAINS $searchTerm OR n.description CONTAINS $searchTerm)
        
        // Get related nodes through specific relationship types
        OPTIONAL MATCH (n)-[r]-(related)
        WHERE related.tenantId = $tenantId AND r.tenantId = $tenantId AND
              (related:Table OR related:Column OR related:Knowledge OR related:SchemaIndex OR related:SchemaConstraint)
        
        RETURN 
          n as node,
          collect(DISTINCT {
            related_node: related.id,
            relationship_type: type(r),
            direction: CASE WHEN startNode(r) = n THEN 'outgoing' ELSE 'incoming' END
          }) as relationships
      `;
      
      const result = await session.run(query, { searchTerm, tenantId });
      
      return result.records.map(record => ({
        node: record.get('node'),
        relationships: record.get('relationships').filter(rel => rel.related_node)
      }));
      
    } finally {
      await session.close();
    }
  }

  /**
   * Get schema statistics for monitoring and analytics with relationship type breakdown
   * @param {string} tenantId - Optional tenant identifier
   */
  async getSchemaStats(tenantId = null) {
    const session = this.driver.session({ database: this.database });
    
    try {
      // Get node statistics
      const nodeQuery = `
        MATCH (n {tenantId: $tenantId})
        WHERE n:Table OR n:Column OR n:Knowledge OR n:SchemaIndex OR n:SchemaConstraint
        RETURN 
          count(DISTINCT n) as total_nodes,
          count(DISTINCT CASE WHEN n:Table THEN n END) as tables,
          count(DISTINCT CASE WHEN n:Column THEN n END) as columns,
          count(DISTINCT CASE WHEN n:Knowledge THEN n END) as knowledge,
          count(DISTINCT CASE WHEN n:SchemaIndex THEN n END) as indexes,
          count(DISTINCT CASE WHEN n:SchemaConstraint THEN n END) as constraints,
          max(n.updated_at) as last_update
      `;
      
      // Get relationship statistics by type
      const relationshipQuery = `
        MATCH ()-[r]->()
        WHERE r.tenantId = $tenantId
        RETURN 
          type(r) as relationship_type,
          count(r) as count
        ORDER BY count DESC
      `;
      
      const nodeResult = await session.run(nodeQuery, { tenantId });
      const relationshipResult = await session.run(relationshipQuery, { tenantId });
      
      const nodeStats = nodeResult.records[0];
      const relationshipStats = {};
      let totalRelationships = 0;
      
      relationshipResult.records.forEach(record => {
        const relType = record.get('relationship_type');
        const count = record.get('count').toNumber();
        relationshipStats[relType] = count;
        totalRelationships += count;
      });
      
      return {
        nodes: {
          total: nodeStats.get('total_nodes').toNumber(),
          tables: nodeStats.get('tables').toNumber(),
          columns: nodeStats.get('columns').toNumber(),
          knowledge: nodeStats.get('knowledge').toNumber(),
          indexes: nodeStats.get('indexes').toNumber(),
          constraints: nodeStats.get('constraints').toNumber()
        },
        relationships: {
          total: totalRelationships,
          by_type: relationshipStats
        },
        last_update: nodeStats.get('last_update'),
        tenant_id: tenantId,
        timestamp: new Date().toISOString()
      };
      
    } finally {
      await session.close();
    }
  }

  /**
   * Group relationships by their semantic type for proper Neo4j relationship creation
   */
  groupRelationshipsByType(relationships) {
    const grouped = {};
    
    for (const rel of relationships) {
      const relType = rel.label || 'RELATED_TO';
      if (!grouped[relType]) {
        grouped[relType] = [];
      }
      grouped[relType].push(rel);
    }
    
    return grouped;
  }

  /**
   * Sanitize relationship type for Neo4j (uppercase, underscores, no special chars)
   * Now uses centralized sanitization function
   */
  sanitizeRelationshipType(relType) {
    return sanitizeRelationshipType(relType);
  }

  /**
   * Format Neo4j query results for LLM consumption
   * Maintains compatibility with existing JSON schema format
   */
  formatSchemaForLLM(record) {
    const nodes = record.get('nodes').filter(n => n.id);
    const edges = record.get('edges').filter(e => e.from && e.to);
    
    // Count nodes by type
    const nodeTypeCounts = nodes.reduce((acc, node) => {
      const kind = node.kind || 'Unknown';
      acc[kind] = (acc[kind] || 0) + 1;
      return acc;
    }, {});
    
    // Maintain compatibility with existing JSON structure
    return {
      nodes: nodes,
      edges: edges,
      metadata: {
        total_nodes: nodes.length,
        total_edges: edges.length,
        node_types: nodeTypeCounts,
        tables: nodeTypeCounts.Table || 0,
        columns: nodeTypeCounts.Column || 0,
        knowledge: nodeTypeCounts.Knowledge || 0,
        indexes: nodeTypeCounts.SchemaIndex || 0,
        constraints: nodeTypeCounts.SchemaConstraint || 0,
        last_updated: new Date().toISOString()
      }
    };
  }

  /**
   * Close the Neo4j driver connection
   */
  async close() {
    await this.driver.close();
    console.log('🔌 Neo4j driver connection closed');
  }

  /**
   * Health check for Neo4j connectivity
   */
  async healthCheck() {
    const session = this.driver.session({ database: this.database });
    
    try {
      const result = await session.run('RETURN "Neo4j Connected" as status');
      return {
        status: 'healthy',
        message: result.records[0].get('status'),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    } finally {
      await session.close();
    }
  }
}

/**
 * Factory function for creating Neo4j schema service instances
 */
export function createNeo4jSchemaService(config = {}) {
  const defaultConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD,
    database: process.env.NEO4J_DATABASE || 'contextdb',
    defaultTenant: process.env.DEFAULT_TENANT_ID || 'public'
  };
  
  return new Neo4jSchemaService({ ...defaultConfig, ...config });
}