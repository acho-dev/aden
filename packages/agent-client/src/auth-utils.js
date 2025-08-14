import pkg from "@acho-inc/acho-js";
const { Acho } = pkg;

/**
 * Parse JWT token to extract user and team information
 * @param {string} jwtToken - JWT token (may include 'jwt ' prefix)
 * @param {string} endpoint - Optional endpoint override
 * @returns {Promise<{userId: string, teamId: string, fullIdentity: object}>}
 */
export async function parseJWTToken(jwtToken, endpoint = null) {
  if (!jwtToken) {
    throw new Error("JWT token is required");
  }

  // Remove 'jwt ' prefix if present
  const cleanToken = jwtToken.replace(/^jwt\s+/i, "");

  try {
    const acho = new Acho({
      apiToken: cleanToken,
      endpoint: endpoint || process.env.ADEN_HOST || "https://your-api-host.com",
    });

    const identity = await acho.OAuthEndpoints.identify();

    if (!identity || !identity.id) {
      throw new Error("Invalid token - no identity found");
    }

    const userId = identity.id;
    const teamId = identity.current_team_id;

    if (!teamId) {
      throw new Error("No team ID found in token");
    }

    return { userId, teamId, fullIdentity: identity };
  } catch (error) {
    throw new Error(`JWT token parsing failed: ${error.message}`);
  }
}
