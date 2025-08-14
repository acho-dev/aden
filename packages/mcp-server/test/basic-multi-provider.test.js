/**
 * Basic multi-provider LLM test to validate refactor
 * Tests functionality without requiring actual API keys
 */

import { LLMFactory } from "../../agent-client/src/llm/llm-factory.js";

class BasicTestRunner {
  constructor() {
    this.tests = [];
    this.results = [];
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log(`\n🧪 Running ${this.tests.length} Basic Multi-Provider Tests\n`);

    for (const test of this.tests) {
      try {
        console.log(`⏱️  Running: ${test.name}`);
        const startTime = Date.now();

        await test.testFn();

        const duration = Date.now() - startTime;
        this.results.push({ name: test.name, status: "PASS", duration });
        console.log(`✅ PASS: ${test.name} (${duration}ms)`);
      } catch (error) {
        this.results.push({
          name: test.name,
          status: "FAIL",
          error: error.message,
        });
        console.log(`❌ FAIL: ${test.name}`);
        console.log(`   Error: ${error.message}`);
      }
    }

    this.printSummary();
  }

  printSummary() {
    const passed = this.results.filter(r => r.status === "PASS").length;
    const failed = this.results.filter(r => r.status === "FAIL").length;

    console.log("\n📊 Test Summary:");
    console.log(`   Total: ${this.results.length}`);
    console.log(`   Passed: ${passed}`);
    console.log(`   Failed: ${failed}`);

    if (failed > 0) {
      console.log("\n❌ Failed Tests:");
      this.results
        .filter(r => r.status === "FAIL")
        .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }

    console.log(
      `\n${failed === 0 ? "✅" : "❌"} All tests ${failed === 0 ? "passed" : "completed with failures"}\n`
    );
  }
}

const runner = new BasicTestRunner();

// Test 1: Factory Provider Management
runner.test("LLMFactory - All Providers Supported", () => {
  const providers = LLMFactory.getSupportedProviders();
  const expectedProviders = ["claude", "openai", "gemini", "mistral"];

  for (const provider of expectedProviders) {
    if (!providers.includes(provider)) {
      throw new Error(`Missing provider: ${provider}`);
    }
  }

  console.log(`   Supported providers: ${providers.join(", ")}`);
});

// Test 2: Model Validation for All Providers
runner.test("LLMFactory - Model Validation", () => {
  const testCases = [
    { provider: "claude", model: "claude-3-5-sonnet-20241022" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "gemini", model: "gemini-1.5-pro" },
    { provider: "mistral", model: "mistral-large-latest" },
  ];

  for (const { provider, model } of testCases) {
    if (!LLMFactory.isValidModel(provider, model)) {
      throw new Error(`Model validation failed: ${provider}/${model}`);
    }
  }

  console.log(`   Validated ${testCases.length} model configurations`);
});

// Test 3: Provider Features and Capabilities
runner.test("LLMFactory - Provider Features", () => {
  const providers = ["claude", "openai", "gemini", "mistral"];

  for (const provider of providers) {
    const features = LLMFactory.getProviderFeatures(provider);

    if (!features.streaming || !features.functionCalling) {
      throw new Error(`Provider ${provider} missing essential features`);
    }

    if (!features.strengths || !Array.isArray(features.strengths)) {
      throw new Error(`Provider ${provider} missing strengths array`);
    }
  }

  console.log(`   Validated features for ${providers.length} providers`);
});

// Test 4: Provider Recommendations
runner.test("LLMFactory - Task Recommendations", () => {
  const taskTypes = [
    "business-analysis",
    "creative-writing",
    "code-generation",
    "long-context",
    "cost-effective",
  ];

  for (const taskType of taskTypes) {
    const recommendations = LLMFactory.recommendProviderForTask(taskType);

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      throw new Error(`No recommendations for task: ${taskType}`);
    }

    // Verify all recommended providers are supported
    for (const provider of recommendations) {
      if (!LLMFactory.getSupportedProviders().includes(provider)) {
        throw new Error(`Recommended provider not supported: ${provider}`);
      }
    }
  }

  console.log(`   Generated recommendations for ${taskTypes.length} task types`);
});

// Test 5: Configuration and Settings
runner.test("LLMFactory - Configuration Management", () => {
  const providers = ["claude", "openai", "gemini", "mistral"];

  for (const provider of providers) {
    const defaultModel = LLMFactory.getDefaultModel(provider);
    if (!defaultModel) {
      throw new Error(`No default model for provider: ${provider}`);
    }

    const settings = LLMFactory.getRecommendedSettings(provider, defaultModel);
    if (!settings.temperature || !settings.maxTokens) {
      throw new Error(`Incomplete settings for provider: ${provider}`);
    }

    // Test provider defaults application
    const config = LLMFactory.applyProviderDefaults(provider, {
      custom: "value",
    });
    if (!config.providerName || !config.capabilities) {
      throw new Error(`Provider defaults not applied correctly: ${provider}`);
    }
  }

  console.log(`   Validated configuration for ${providers.length} providers`);
});

// Test 6: Invalid Provider Handling
runner.test("LLMFactory - Error Handling", async () => {
  // Test invalid provider
  try {
    await LLMFactory.create("invalid-provider", {}, {});
    throw new Error("Should have failed for invalid provider");
  } catch (error) {
    if (!error.message.includes("Unsupported LLM provider")) {
      throw new Error(`Wrong error message for invalid provider: ${error.message}`);
    }
  }

  // Test invalid model
  if (LLMFactory.isValidModel("claude", "invalid-model")) {
    throw new Error("Should have rejected invalid model");
  }

  // Test invalid provider for features
  try {
    LLMFactory.getProviderFeatures("invalid-provider");
    throw new Error("Should have failed for invalid provider features");
  } catch (error) {
    if (!error.message.includes("Provider features not found")) {
      throw new Error("Wrong error message for invalid provider features");
    }
  }

  console.log("   Error handling works correctly");
});

// Test 7: LLM Class Instantiation (without API calls)
runner.test("LLM Classes - Basic Instantiation", async () => {
  const providers = [
    { name: "claude", config: { model: "claude-3-5-sonnet-20241022" } },
    { name: "openai", config: { model: "gpt-4o" } },
    { name: "gemini", config: { model: "gemini-1.5-pro" } },
    { name: "mistral", config: { model: "mistral-large-latest" } },
  ];

  for (const { name, config } of providers) {
    try {
      // Test creation without initialization (no API key required)
      const llm = await LLMFactory.create(name, config, { apiKey: "test-key" });

      // Test basic interface methods
      if (typeof llm.getProviderName !== "function") {
        throw new Error(`${name}: getProviderName method missing`);
      }

      if (llm.getProviderName() !== name) {
        throw new Error(`${name}: incorrect provider name returned`);
      }

      if (typeof llm.getDefaultModel !== "function") {
        throw new Error(`${name}: getDefaultModel method missing`);
      }

      if (typeof llm.isValidModel !== "function") {
        throw new Error(`${name}: isValidModel method missing`);
      }

      const capabilities = llm.getProviderCapabilities();
      if (!capabilities.streaming || !capabilities.functionCalling) {
        throw new Error(`${name}: missing essential capabilities`);
      }

      const metrics = llm.getMetrics();
      if (!metrics.provider || metrics.provider !== name) {
        throw new Error(`${name}: metrics not properly initialized`);
      }
    } catch (error) {
      if (error.message.includes("API key") || error.message.includes("credentials")) {
        // Expected for providers that validate API keys during initialization
        console.log(`   ${name}: API validation working (expected)`);
      } else {
        throw error;
      }
    }
  }

  console.log(`   Validated instantiation for ${providers.length} providers`);
});

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runner.run().catch(console.error);
}

export { runner as basicTestRunner };
