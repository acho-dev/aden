/**
 * Tenant ID utilities for consistent namespacing across the system
 * 
 * Format: {namespace}:{id}
 * Examples:
 * - aden-org:11525 (Aden organization team)
 * - public:default (Public/default tenant)
 * - slack-workspace:T123456 (Future Slack integration)
 * - github-org:mycompany (Future GitHub integration)
 */

/**
 * Create a namespaced tenant ID
 * @param {string} namespace - The namespace (e.g., 'aden-org', 'public')
 * @param {string|number} id - The tenant ID within that namespace
 * @returns {string} Namespaced tenant ID
 */
export function createTenantId(namespace, id) {
  if (!namespace || (!id && id !== 0)) {
    throw new Error('Both namespace and id are required for tenant ID');
  }
  
  return `${namespace}:${String(id)}`;
}

/**
 * Parse a namespaced tenant ID
 * @param {string} tenantId - Namespaced tenant ID (e.g., 'aden-org:11525')
 * @returns {Object} { namespace, id } or null if invalid
 */
export function parseTenantId(tenantId) {
  if (!tenantId || typeof tenantId !== 'string') {
    return null;
  }
  
  const parts = tenantId.split(':');
  if (parts.length !== 2) {
    return null;
  }
  
  return {
    namespace: parts[0],
    id: parts[1]
  };
}

/**
 * Create Aden organization tenant ID
 * @param {string|number} teamId - Aden team ID
 * @returns {string} Namespaced tenant ID for Aden org
 */
export function createAdenOrgTenantId(teamId) {
  return createTenantId('aden-org', teamId);
}

/**
 * Get the public/default tenant ID
 * @returns {string} Public tenant ID
 */
export function getPublicTenantId() {
  return createTenantId('public', 'default');
}

/**
 * Check if a tenant ID belongs to Aden organization
 * @param {string} tenantId - Tenant ID to check
 * @returns {boolean} True if it's an Aden org tenant
 */
export function isAdenOrgTenant(tenantId) {
  const parsed = parseTenantId(tenantId);
  return parsed && parsed.namespace === 'aden-org';
}

/**
 * Check if a tenant ID is the public tenant
 * @param {string} tenantId - Tenant ID to check
 * @returns {boolean} True if it's the public tenant
 */
export function isPublicTenant(tenantId) {
  const parsed = parseTenantId(tenantId);
  return parsed && parsed.namespace === 'public';
}

/**
 * Get the raw ID from a namespaced tenant ID
 * @param {string} tenantId - Namespaced tenant ID
 * @returns {string} Raw ID without namespace, or null if invalid
 */
export function extractRawId(tenantId) {
  const parsed = parseTenantId(tenantId);
  return parsed ? parsed.id : null;
}

/**
 * Convert legacy tenant ID to namespaced format
 * @param {string|number|null} legacyTenantId - Legacy tenant ID
 * @returns {string|null} Namespaced tenant ID or null
 */
export function migrateLegacyTenantId(legacyTenantId) {
  if (!legacyTenantId) {
    return null;
  }
  
  // If already namespaced, return as-is
  if (typeof legacyTenantId === 'string' && legacyTenantId.includes(':')) {
    return legacyTenantId;
  }
  
  // Convert legacy format to Aden org tenant
  return createAdenOrgTenantId(legacyTenantId);
}