/**
 * Centralized definition of all Neo4j relationship types used in the knowledge graph
 * This file provides type safety, validation, and documentation for graph relationships
 */

/**
 * Schema-level relationships between database entities (tables, columns, indexes, constraints)
 */
export const SCHEMA_RELATIONSHIPS = {
  // Core schema relationships
  FOREIGN_KEY: 'FOREIGN_KEY',           // Table to table foreign key relationship
  REFERENCES: 'REFERENCES',             // General reference between schema elements
  CONTAINS: 'CONTAINS',                 // Container relationship (table contains columns)
  HAS_PROPERTY: 'HAS_PROPERTY',         // Entity has property relationship
  RELATES_TO: 'RELATES_TO',             // General schema relationship (fallback)
  
  // Index and constraint relationships
  INDEXES: 'INDEXES',                   // Table has index relationship
  CONSTRAINED_BY: 'CONSTRAINED_BY',     // Column constrained by constraint
  
  // Domain inheritance relationships
  EXTENDS: 'EXTENDS',                   // Customer schema extends public schema
  OVERRIDES: 'OVERRIDES'                // Customer schema overrides public schema
};

/**
 * Knowledge-to-Schema relationships based on knowledge categories
 * These connect knowledge nodes to schema entities (tables/columns)
 */
export const KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS = {
  INFLUENCES: 'INFLUENCES',                     // business_decision → schema entities
  RELATES_TO_SCHEMA: 'RELATES_TO_SCHEMA',       // technical_insight → schema entities
  AFFECTS_USAGE: 'AFFECTS_USAGE',               // user_preference → schema entities
  PROVIDES_CONTEXT: 'PROVIDES_CONTEXT',         // domain_knowledge → schema entities
  GUIDES_PROCESS: 'GUIDES_PROCESS',             // process_insight → schema entities
  DESCRIBES_RELATIONSHIP: 'DESCRIBES_RELATIONSHIP' // data_relationship → schema entities
};

/**
 * Knowledge-to-Knowledge relationships
 * These connect knowledge nodes to other knowledge nodes
 */
export const KNOWLEDGE_TO_KNOWLEDGE_RELATIONSHIPS = {
  SIMILAR_TO: 'SIMILAR_TO',                     // Knowledge nodes with similar content/category
  CONTRADICTS: 'CONTRADICTS',                   // Knowledge nodes that contradict each other
  BUILDS_ON: 'BUILDS_ON',                       // Knowledge that builds on previous knowledge
  SUPERSEDES: 'SUPERSEDES'                      // Newer knowledge that replaces older knowledge
};

/**
 * All relationship types combined for validation and utilities
 */
export const ALL_RELATIONSHIP_TYPES = {
  ...SCHEMA_RELATIONSHIPS,
  ...KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS,
  ...KNOWLEDGE_TO_KNOWLEDGE_RELATIONSHIPS
};

/**
 * Knowledge category to relationship type mapping
 * Used by the remember tool to determine appropriate relationships
 */
export const KNOWLEDGE_CATEGORY_TO_RELATIONSHIP = {
  'business_decision': KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.INFLUENCES,
  'technical_insight': KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.RELATES_TO_SCHEMA,
  'user_preference': KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.AFFECTS_USAGE,
  'domain_knowledge': KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.PROVIDES_CONTEXT,
  'process_insight': KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.GUIDES_PROCESS,
  'data_relationship': KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.DESCRIBES_RELATIONSHIP
};

/**
 * Relationship type metadata for documentation and validation
 */
export const RELATIONSHIP_METADATA = {
  [SCHEMA_RELATIONSHIPS.FOREIGN_KEY]: {
    description: 'Foreign key relationship between tables',
    sourceTypes: ['Table'],
    targetTypes: ['Table'],
    cardinality: 'many-to-one'
  },
  [SCHEMA_RELATIONSHIPS.REFERENCES]: {
    description: 'General reference between schema elements',
    sourceTypes: ['Table', 'Column', 'Knowledge'],
    targetTypes: ['Table', 'Column', 'Knowledge'],
    cardinality: 'many-to-many'
  },
  [SCHEMA_RELATIONSHIPS.CONTAINS]: {
    description: 'Container relationship (table contains columns)',
    sourceTypes: ['Table'],
    targetTypes: ['Column'],
    cardinality: 'one-to-many'
  },
  [SCHEMA_RELATIONSHIPS.HAS_PROPERTY]: {
    description: 'Entity has property relationship',
    sourceTypes: ['Table'],
    targetTypes: ['Column'],
    cardinality: 'one-to-many'
  },
  [KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.INFLUENCES]: {
    description: 'Business decision that influences schema design or usage',
    sourceTypes: ['Knowledge'],
    targetTypes: ['Table', 'Column'],
    cardinality: 'many-to-many'
  },
  [KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.RELATES_TO_SCHEMA]: {
    description: 'Technical insight related to schema structure',
    sourceTypes: ['Knowledge'],
    targetTypes: ['Table', 'Column'],
    cardinality: 'many-to-many'
  },
  [KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.AFFECTS_USAGE]: {
    description: 'User preference that affects how schema is used',
    sourceTypes: ['Knowledge'],
    targetTypes: ['Table', 'Column'],
    cardinality: 'many-to-many'
  },
  [KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.PROVIDES_CONTEXT]: {
    description: 'Domain knowledge that provides context for schema elements',
    sourceTypes: ['Knowledge'],
    targetTypes: ['Table', 'Column'],
    cardinality: 'many-to-many'
  },
  [KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.GUIDES_PROCESS]: {
    description: 'Process insight that guides how schema is used',
    sourceTypes: ['Knowledge'],
    targetTypes: ['Table', 'Column'],
    cardinality: 'many-to-many'
  },
  [KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS.DESCRIBES_RELATIONSHIP]: {
    description: 'Knowledge that describes relationships between data elements',
    sourceTypes: ['Knowledge'],
    targetTypes: ['Table', 'Column'],
    cardinality: 'many-to-many'
  },
  [KNOWLEDGE_TO_KNOWLEDGE_RELATIONSHIPS.SIMILAR_TO]: {
    description: 'Knowledge nodes with similar content or category',
    sourceTypes: ['Knowledge'],
    targetTypes: ['Knowledge'],
    cardinality: 'many-to-many'
  },
  [KNOWLEDGE_TO_KNOWLEDGE_RELATIONSHIPS.CONTRADICTS]: {
    description: 'Knowledge nodes that contradict each other',
    sourceTypes: ['Knowledge'],
    targetTypes: ['Knowledge'],
    cardinality: 'many-to-many'
  },
  [KNOWLEDGE_TO_KNOWLEDGE_RELATIONSHIPS.BUILDS_ON]: {
    description: 'Knowledge that builds on or extends previous knowledge',
    sourceTypes: ['Knowledge'],
    targetTypes: ['Knowledge'],
    cardinality: 'many-to-many'
  },
  [KNOWLEDGE_TO_KNOWLEDGE_RELATIONSHIPS.SUPERSEDES]: {
    description: 'Newer knowledge that replaces or updates older knowledge',
    sourceTypes: ['Knowledge'],
    targetTypes: ['Knowledge'],
    cardinality: 'many-to-many'
  }
};

/**
 * Validation functions
 */

/**
 * Check if a relationship type is valid
 * @param {string} relationshipType - The relationship type to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidRelationshipType(relationshipType) {
  return Object.values(ALL_RELATIONSHIP_TYPES).includes(relationshipType);
}

/**
 * Get relationship type for a knowledge category
 * @param {string} category - Knowledge category
 * @returns {string} Appropriate relationship type
 */
export function getRelationshipTypeForCategory(category) {
  return KNOWLEDGE_CATEGORY_TO_RELATIONSHIP[category] || SCHEMA_RELATIONSHIPS.RELATES_TO;
}

/**
 * Validate relationship between source and target node types
 * @param {string} relationshipType - The relationship type
 * @param {string} sourceType - Source node type (Table, Column, Knowledge, etc.)
 * @param {string} targetType - Target node type
 * @returns {boolean} True if valid combination, false otherwise
 */
export function isValidRelationshipCombination(relationshipType, sourceType, targetType) {
  const metadata = RELATIONSHIP_METADATA[relationshipType];
  if (!metadata) return false;
  
  return metadata.sourceTypes.includes(sourceType) && metadata.targetTypes.includes(targetType);
}

/**
 * Get all relationship types for a specific category
 * @param {string} category - Category: 'schema', 'knowledge-to-schema', 'knowledge-to-knowledge', 'all'
 * @returns {Object} Object containing relationship types for the category
 */
export function getRelationshipTypesByCategory(category) {
  switch (category.toLowerCase()) {
    case 'schema':
      return SCHEMA_RELATIONSHIPS;
    case 'knowledge-to-schema':
      return KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS;
    case 'knowledge-to-knowledge':
      return KNOWLEDGE_TO_KNOWLEDGE_RELATIONSHIPS;
    case 'all':
    default:
      return ALL_RELATIONSHIP_TYPES;
  }
}

/**
 * Sanitize relationship type for Neo4j (ensure valid identifier)
 * @param {string} relationshipType - Raw relationship type
 * @returns {string} Sanitized relationship type safe for Neo4j
 */
export function sanitizeRelationshipType(relationshipType) {
  if (!relationshipType || typeof relationshipType !== 'string') {
    return SCHEMA_RELATIONSHIPS.RELATES_TO;
  }
  
  // Convert to uppercase and replace invalid chars with underscores
  return relationshipType
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Get relationship metadata
 * @param {string} relationshipType - The relationship type
 * @returns {Object|null} Metadata object or null if not found
 */
export function getRelationshipMetadata(relationshipType) {
  return RELATIONSHIP_METADATA[relationshipType] || null;
}

// Export relationship type lists for convenience
export const SCHEMA_RELATIONSHIP_LIST = Object.values(SCHEMA_RELATIONSHIPS);
export const KNOWLEDGE_TO_SCHEMA_RELATIONSHIP_LIST = Object.values(KNOWLEDGE_TO_SCHEMA_RELATIONSHIPS);
export const KNOWLEDGE_TO_KNOWLEDGE_RELATIONSHIP_LIST = Object.values(KNOWLEDGE_TO_KNOWLEDGE_RELATIONSHIPS);
export const ALL_RELATIONSHIP_TYPE_LIST = Object.values(ALL_RELATIONSHIP_TYPES);