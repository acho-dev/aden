#!/usr/bin/env node

/**
 * Test runner script for LLM integration tests
 * Sets up environment and runs comprehensive tests
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

config({ path: join(projectRoot, ".env") });
config({ path: join(projectRoot, "client/.env") });

// Import and run tests
import("./llm-integration.test.js")
  .then(async module => {
    console.log("🧪 Starting LLM Integration Test Suite\n");
    console.log("Environment Check:");
    console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "✅ Set" : "❌ Missing"}`);
    console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "✅ Set" : "❌ Missing"}`);
    console.log(`   ADEN_HOST: ${process.env.ADEN_HOST || "Not set"}`);
    console.log(`   ADEN_API_TOKEN: ${process.env.ADEN_API_TOKEN ? "✅ Set" : "❌ Missing"}`);
    console.log("");

    await module.testRunner.run();
  })
  .catch(error => {
    console.error("❌ Test suite failed to start:", error);
    process.exit(1);
  });
