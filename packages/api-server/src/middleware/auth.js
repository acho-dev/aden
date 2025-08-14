import { parseJWTToken } from "../utils/jwt.js";

/**
 * Express middleware: Verify JWT token from request headers
 */
export async function requireJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header required" });
  }

  const tokenMatch = authHeader.match(/^jwt\s+(.+)$/i);
  if (!tokenMatch) {
    return res.status(401).json({ error: "Invalid authorization format" });
  }

  const token = tokenMatch[1];

  try {
    req.jwtToken = token;
    req.userInfo = await parseJWTToken(token);

    next();
  } catch (error) {
    return res.status(401).json({ error: "Authentication failed: " + error.message });
  }
}

export async function requireSessionOwnership(req, res, next) {
  const sessionService = req.app.locals.sessionService;
  try {
    const session = await sessionService.getSession(req.params.sessionId);
    if (
      !session ||
      !session.userInfo ||
      session.userInfo.userId !== req.userInfo.userId ||
      session.userInfo.teamId !== req.userInfo.teamId
    ) {
      return res.status(403).json({ error: "Access denied: session belongs to different user" });
    }
    next();
  } catch (error) {
    res.status(500).json({
      error: "Failed to validate session ownership: " + error.message,
    });
  }
}
