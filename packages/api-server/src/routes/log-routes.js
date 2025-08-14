import express from "express";
import { ConversationLogger } from "../../../agent-client/src/conversation-logger.js";

const router = express.Router();

router.get("/logs/sessions", async (req, res) => {
  const config = req.app.locals.config;

  try {
    const logger = new ConversationLogger(
      config.get("conversationLogging"),
      config.get("htmlReporting")
    );
    const sessions = await logger.getSessionLogs();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/logs/stats", async (req, res) => {
  const config = req.app.locals.config;

  try {
    const logger = new ConversationLogger(
      config.get("conversationLogging"),
      config.get("htmlReporting")
    );
    const stats = await logger.getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
