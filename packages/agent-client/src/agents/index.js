/**
 * Multi-Agent Architecture Entry Point
 * Exports all agents and related classes for the multi-agent system
 */

export { BaseAgent } from './base-agent.js';
export { AgentContext } from './agent-context.js';
export { PlannerAgent } from './planner-agent.js';
export { ExecutorAgent } from './executor-agent.js';
export { AnalyzerAgent } from './analyzer-agent.js';
export { CoordinatorAgent } from './coordinator-agent.js';

// Agent types for configuration
export const AGENT_TYPES = {
  PLANNER: 'PlannerAgent',
  EXECUTOR: 'ExecutorAgent', 
  ANALYZER: 'AnalyzerAgent',
  COORDINATOR: 'CoordinatorAgent'
};

// Default multi-agent configuration
export const DEFAULT_MULTI_AGENT_CONFIG = {
  maxAgentTransitions: 8,
  maxReplans: 3,
  maxTasks: 10,
  useMultiAgent: true
};

/**
 * Create a configured multi-agent system
 * @param {Object} config - Configuration options
 * @returns {Object} Configured agents and coordinator
 */
export function createMultiAgentSystem(config = {}) {
  const mergedConfig = { ...DEFAULT_MULTI_AGENT_CONFIG, ...config };
  
  const agents = {
    planner: new PlannerAgent(mergedConfig),
    executor: new ExecutorAgent(mergedConfig),
    analyzer: new AnalyzerAgent(mergedConfig),
    coordinator: new CoordinatorAgent(mergedConfig)
  };
  
  return {
    agents,
    coordinator: agents.coordinator,
    config: mergedConfig
  };
}