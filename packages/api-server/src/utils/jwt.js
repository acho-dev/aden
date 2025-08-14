import AchoPackage from "@acho-inc/acho-js";
const { Acho } = AchoPackage;

export async function parseJWTToken(jwtToken, endpoint = null) {
  if (!jwtToken) {
    throw new Error("JWT token is required");
  }

  // Remove 'jwt ' prefix if present
  const cleanToken = jwtToken.replace(/^jwt\s+/i, "");

  try {
    // Initialize Acho client with the JWT token
    const acho = new Acho({
      apiToken: cleanToken,
      endpoint: endpoint || process.env.ADEN_HOST || "https://your-api-host.com",
    });

    // Call identify to get user information
    const identity = await acho.OAuthEndpoints.identify();

    if (!identity) {
      throw new Error("Failed to identify user from JWT token");
    }

    // Extract user ID and team ID
    const userId = identity.id;
    const teamId = identity.current_team_id;

    // console.log(`🐛 DEBUG parseJWTToken - raw identity:`, identity);
    console.log(`🐛 DEBUG parseJWTToken - extracted userId: ${userId}, teamId: ${teamId}`);

    if (!userId || !teamId) {
      throw new Error("JWT token does not contain valid user ID or team ID");
    }

    return {
      userId,
      teamId,
      fullIdentity: identity,
    };
  } catch (error) {
    console.error("JWT parsing error:", error);
    throw new Error(`Invalid JWT token: ${error.message}`);
  }
}
