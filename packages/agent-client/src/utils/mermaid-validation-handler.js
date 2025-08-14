import { MermaidValidator } from './mermaid-validator.js';

export class MermaidValidationHandler {
  constructor() {
    this.validator = new MermaidValidator();
    this.maxRetries = 3;
  }

  // Process and validate mermaid diagrams in tool results
  async processResults(toolCalls, toolResults, options = {}) {
    const { mcpClient, logger, llmInstance, originalMessage } = options;
    
    const mermaidItems = this.findMermaidDiagrams(toolCalls, toolResults);
    
    if (mermaidItems.length === 0) {
      return { allToolCalls: toolCalls, allToolResults: toolResults };
    }

    console.log(`🎨 Found ${mermaidItems.length} Mermaid diagram(s) to validate`);

    for (const item of mermaidItems) {
      await this.validateAndFixDiagram(item, {
        mcpClient,
        logger,
        llmInstance,
        originalMessage
      });
    }

    return { allToolCalls: toolCalls, allToolResults: toolResults };
  }

  // Find mermaid diagram tool calls and results
  findMermaidDiagrams(toolCalls, toolResults) {
    const items = [];
    
    for (let i = 0; i < toolCalls.length; i++) {
      if (toolCalls[i].name === 'mermaid_diagram') {
        items.push({
          toolCall: toolCalls[i],
          result: toolResults[i],
          index: i
        });
      }
    }
    
    return items;
  }

  // Validate and fix a single mermaid diagram
  async validateAndFixDiagram(item, options) {
    const { mcpClient, logger, llmInstance, originalMessage } = options;
    
    const mermaidCode = this.validator.extractMermaidCode(item.result);
    
    if (!mermaidCode) {
      console.log('⚠️ Could not extract Mermaid code from result');
      return;
    }

    let validation = await this.validator.validate(mermaidCode);
    
    if (validation.isValid) {
      console.log('✅ Mermaid diagram is valid');
      return;
    }

    console.log(`❌ Mermaid validation failed: ${validation.error}`);
    
    const fixedResult = await this.attemptFix(
      item,
      mermaidCode,
      validation,
      { mcpClient, logger, llmInstance, originalMessage }
    );

    if (fixedResult) {
      Object.assign(item.result, fixedResult);
      console.log('✅ Mermaid diagram fixed successfully');
    } else {
      this.addWarningToResult(item.result, validation);
      console.log('⚠️ Could not fix Mermaid diagram, added warning');
    }
  }

  // Attempt to fix invalid mermaid diagram
  async attemptFix(item, originalCode, validation, options) {
    const { mcpClient, logger, llmInstance, originalMessage } = options;
    
    let currentCode = originalCode;
    let currentValidation = validation;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      console.log(`🔄 Fix attempt ${attempt}/${this.maxRetries}...`);
      
      const fixPrompt = this.validator.generateFixPrompt(currentValidation, currentCode);
      
      const fixedCode = this.applySimpleFixes(currentCode, currentValidation);
      
      const fixedToolCall = {
        id: `${item.toolCall.id}_fix_${attempt}`,
        name: 'mermaid_diagram',
        input: {
          ...item.toolCall.input,
          code: fixedCode,
          title: `${item.toolCall.input.title || 'Diagram'} (Fixed)`
        }
      };

      try {
        const fixResults = await llmInstance.executeToolCalls(
          [fixedToolCall], 
          mcpClient, 
          logger
        );

        if (fixResults.length > 0) {
          const newCode = this.validator.extractMermaidCode(fixResults[0]);
          
          if (newCode) {
            const newValidation = await this.validator.validate(newCode);
            
            if (newValidation.isValid) {
              console.log(`✅ Fixed diagram is valid on attempt ${attempt}`);
              return fixResults[0];
            }
            
            currentCode = newCode;
            currentValidation = newValidation;
          }
        }
      } catch (error) {
        console.error(`Fix attempt ${attempt} failed:`, error.message);
      }
    }
    
    return null;
  }

  // Apply simple automatic fixes
  applySimpleFixes(code, validation) {
    let fixedCode = code;
    
    // Handle the common case: text after diagram type without proper node syntax
    const lines = fixedCode.split('\n');
    if (lines.length >= 2) {
      const firstLine = lines[0].trim();
      const secondLine = lines[1].trim();
      
      // Check if first line is diagram type and second line is raw text
      if (firstLine.match(/^(graph|flowchart)\s+(TD|TB|BT|RL|LR)?$/i) && 
          secondLine && 
          !secondLine.match(/^\s*[A-Za-z_][A-Za-z0-9_-]*\s*[\[\(]/) && // not a node definition
          !secondLine.match(/^\s*[A-Za-z_][A-Za-z0-9_-]*\s*-->/) // not a connection
         ) {
        // Convert raw text to proper node
        const textContent = lines.slice(1).join(' ').trim();
        fixedCode = firstLine + '\n    A["' + textContent + '"]';
      }
    }
    
    if (!code.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram)/m)) {
      fixedCode = 'graph TD\n' + fixedCode;
    }
    
    if (validation.error && validation.error.includes('Lexical error')) {
      fixedCode = fixedCode.replace(/->/g, '-->');
    }
    
    const nodePattern = /([A-Za-z_][A-Za-z0-9_-]*)\s*\[([^\]]+)\]/g;
    fixedCode = fixedCode.replace(nodePattern, (match, nodeId, label) => {
      if (!label.startsWith('"') && !label.startsWith("'")) {
        return `${nodeId}["${label}"]`;
      }
      return match;
    });
    
    return fixedCode;
  }

  // Add warning to result about validation failure
  addWarningToResult(result, validation) {
    if (result.content && Array.isArray(result.content)) {
      result.content.push({
        type: 'text',
        text: `\n⚠️ Warning: This Mermaid diagram may contain syntax errors.\nError: ${validation.error}\nSuggestions: ${validation.suggestions.join('; ')}`
      });
    }
  }
}

export default MermaidValidationHandler;