/**
 * PromptManager - Centralized prompt management system
 * Loads markdown-based prompts with template variable support
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class PromptManager {
  constructor(promptsDir = null) {
    // Default to the prompts directory relative to this file
    this.promptsDir = promptsDir || join(__dirname, '../../prompts');
    this.cache = new Map();
    this.templates = new Map();
    this.loadAllPrompts();
  }

  /**
   * Load all prompts from the prompts directory
   */
  loadAllPrompts() {
    // Load agent prompts
    this.loadPromptCategory('agents', [
      'planner',
      'executor', 
      'analyzer',
      'coordinator',
      'data-onboarding'
    ]);

    // Load task prompts
    this.loadPromptCategory('tasks', [
      'intent-analysis',
      'plan-generation',
      'task-execution',
      'insight-analysis',
      'response-generation'
    ]);
  }

  /**
   * Load prompts for a specific category
   */
  loadPromptCategory(category, promptNames) {
    for (const name of promptNames) {
      const path = join(this.promptsDir, category, `${name}.md`);
      if (existsSync(path)) {
        try {
          const content = readFileSync(path, 'utf8');
          const key = `${category}/${name}`;
          this.templates.set(key, content);
          console.log(`✅ Loaded prompt template: ${key}`);
        } catch (error) {
          console.warn(`⚠️ Failed to load prompt ${category}/${name}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Get a prompt with variables replaced
   * @param {string} key - The prompt key (e.g., 'agents/planner')
   * @param {Object} variables - Variables to replace in the template
   * @returns {string} The processed prompt
   */
  getPrompt(key, variables = {}) {
    // Check cache first
    const cacheKey = `${key}:${JSON.stringify(variables)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Get template
    const template = this.templates.get(key);
    if (!template) {
      console.warn(`⚠️ Prompt template not found: ${key}`);
      return this.getFallbackPrompt(key, variables);
    }

    // Process template
    const processed = this.processTemplate(template, variables);
    
    // Cache the result
    this.cache.set(cacheKey, processed);
    
    return processed;
  }

  /**
   * Process a template with variable substitution
   * @param {string} template - The template string
   * @param {Object} variables - Variables to substitute
   * @returns {string} Processed template
   */
  processTemplate(template, variables) {
    let processed = template;

    // Handle conditional sections {{#if variable}}...{{/if}}
    processed = this.processConditionals(processed, variables);

    // Handle loops {{#each array}}...{{/each}}
    processed = this.processLoops(processed, variables);

    // Replace simple variables {{variable}}
    processed = this.processVariables(processed, variables);

    // Handle default values {{variable|default}}
    processed = this.processDefaults(processed);

    return processed;
  }

  /**
   * Process conditional sections
   */
  processConditionals(template, variables) {
    const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    return template.replace(conditionalRegex, (match, varName, content) => {
      const value = this.getNestedValue(variables, varName);
      
      // Check if value is truthy
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        return content;
      }
      return '';
    });
  }

  /**
   * Process loops
   */
  processLoops(template, variables) {
    const loopRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    
    return template.replace(loopRegex, (match, varName, content) => {
      const array = this.getNestedValue(variables, varName);
      
      if (!Array.isArray(array)) {
        return '';
      }

      return array.map((item, index) => {
        let itemContent = content;
        
        // Replace {{this}} with the current item
        itemContent = itemContent.replace(/\{\{this\}\}/g, 
          typeof item === 'object' ? JSON.stringify(item) : String(item));
        
        // Replace {{@index}} with the current index
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
        
        // If item is an object, replace its properties
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach(key => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            itemContent = itemContent.replace(regex, String(item[key] || ''));
          });
        }
        
        return itemContent;
      }).join('');
    });
  }

  /**
   * Process simple variable substitutions
   */
  processVariables(template, variables) {
    const varRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    
    return template.replace(varRegex, (match, varPath) => {
      const value = this.getNestedValue(variables, varPath);
      
      if (value === undefined || value === null) {
        return match; // Keep original if not found
      }
      
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      
      return String(value);
    });
  }

  /**
   * Process default values
   */
  processDefaults(template) {
    const defaultRegex = /\{\{(\w+(?:\.\w+)*)\|([^}]+)\}\}/g;
    
    return template.replace(defaultRegex, (match, varPath, defaultValue) => {
      // If variable wasn't replaced (still has {{}}), use default
      if (match.includes('{{')) {
        return defaultValue;
      }
      return match;
    });
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  /**
   * Get fallback prompt when template is not found
   */
  getFallbackPrompt(key, variables) {
    // Return embedded fallback prompts
    const fallbacks = {
      'agents/planner': `You are the PlannerAgent. Analyze the user request and create an execution plan.
Context: {{schemaContext|No schema available}}
Request: {{message|No message}}`,
      
      'agents/executor': `You are the ExecutorAgent. Execute the following task using available tools.
Task: {{task.description|No task description}}`,
      
      'agents/analyzer': `You are the AnalyzerAgent. Analyze the results and generate a response.
Request: {{originalMessage|No message}}`,
    };

    const fallback = fallbacks[key] || `Default prompt for ${key}`;
    return this.processTemplate(fallback, variables);
  }

  /**
   * Reload a specific prompt from disk
   */
  reloadPrompt(key) {
    const [category, name] = key.split('/');
    const path = join(this.promptsDir, category, `${name}.md`);
    
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, 'utf8');
        this.templates.set(key, content);
        this.clearCache(key);
        return true;
      } catch (error) {
        console.error(`Failed to reload prompt ${key}: ${error.message}`);
        return false;
      }
    }
    return false;
  }

  /**
   * Clear cache for a specific prompt or all prompts
   */
  clearCache(key = null) {
    if (key) {
      // Clear cache for specific key
      for (const cacheKey of this.cache.keys()) {
        if (cacheKey.startsWith(`${key}:`)) {
          this.cache.delete(cacheKey);
        }
      }
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }

  /**
   * Get all available prompt keys
   */
  getAvailablePrompts() {
    return Array.from(this.templates.keys());
  }

  /**
   * Export prompts for documentation
   */
  exportPrompts() {
    const exports = {};
    for (const [key, template] of this.templates.entries()) {
      exports[key] = {
        template,
        variables: this.extractVariables(template)
      };
    }
    return exports;
  }

  /**
   * Extract variable names from a template
   */
  extractVariables(template) {
    const variables = new Set();
    
    // Extract from simple variables
    const varRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    let match;
    while ((match = varRegex.exec(template)) !== null) {
      variables.add(match[1]);
    }
    
    // Extract from conditionals
    const conditionalRegex = /\{\{#if\s+(\w+)\}\}/g;
    while ((match = conditionalRegex.exec(template)) !== null) {
      variables.add(match[1]);
    }
    
    // Extract from loops
    const loopRegex = /\{\{#each\s+(\w+)\}\}/g;
    while ((match = loopRegex.exec(template)) !== null) {
      variables.add(match[1]);
    }
    
    return Array.from(variables);
  }
}

// Singleton instance
let promptManager = null;

/**
 * Get the singleton PromptManager instance
 */
export function getPromptManager() {
  if (!promptManager) {
    promptManager = new PromptManager();
  }
  return promptManager;
}

/**
 * Quick helper to get a prompt
 */
export function getPrompt(key, variables = {}) {
  return getPromptManager().getPrompt(key, variables);
}