export class MermaidValidator {
  constructor() {
    // Define regex patterns for validation
    this.patterns = {
      diagramTypes: /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)/i,
      
      // Flowchart patterns
      flowchartDirection: /^(graph|flowchart)\s+(TD|TB|BT|RL|LR)$/i,
      nodeDefinition: /^\s*[A-Za-z_][A-Za-z0-9_-]*(\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|>[^<]*<|[[(][^)\]]*[\])>])?(\s*-->.*)?$/,
      connection: /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*(-->|---|==>|===|-\.->|\.\.\.|~~>)\s*[A-Za-z_][A-Za-z0-9_-]*(\[[^\]]*\])?$/,
      
      // ER diagram patterns
      erRelationship: /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*\|\|?(--|-\.)-?\|?\|?o?\{\s*[A-Za-z_][A-Za-z0-9_-]*\s*:\s*"[^"]*"$/,
      erEntity: /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*\{$/,
      erAttribute: /^\s*[a-z_][a-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*(\s+(PK|FK|UK))?$/i,
    };
  }

  // Extract mermaid code from tool result
  extractMermaidCode(toolResult) {
    try {
      if (!toolResult || !toolResult.content) return null;
      
      if (typeof toolResult.content === 'string') {
        const match = toolResult.content.match(/```mermaid\n([\s\S]*?)```/);
        return match ? match[1].trim() : null;
      }
      
      if (Array.isArray(toolResult.content)) {
        for (const item of toolResult.content) {
          if (item.type === 'text' && item.text) {
            const match = item.text.match(/```mermaid\n([\s\S]*?)```/);
            if (match) return match[1].trim();
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting mermaid code:', error);
      return null;
    }
  }

  // Validate mermaid syntax using regex patterns
  async validate(code) {
    const result = {
      isValid: false,
      error: null,
      suggestions: []
    };

    try {
      const lines = code.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('%%'));
      
      if (lines.length === 0) {
        result.error = 'Empty diagram';
        return result;
      }

      // Check first line for valid diagram type
      const firstLine = lines[0];
      if (!this.patterns.diagramTypes.test(firstLine)) {
        result.error = 'Invalid diagram type';
        result.suggestions = ['Start with a valid diagram type like "graph TD", "flowchart LR", "erDiagram", etc.'];
        return result;
      }

      // Validate based on diagram type
      const diagramType = firstLine.toLowerCase();
      
      if (diagramType.startsWith('graph') || diagramType.startsWith('flowchart')) {
        const validation = this.validateFlowchart(lines);
        if (!validation.isValid) {
          result.error = validation.error;
          result.suggestions = validation.suggestions;
          return result;
        }
      } else if (diagramType.startsWith('erdiagram')) {
        const validation = this.validateERDiagram(lines);
        if (!validation.isValid) {
          result.error = validation.error;
          result.suggestions = validation.suggestions;
          return result;
        }
      }

      result.isValid = true;
    } catch (error) {
      result.error = error.message || 'Unknown validation error';
      result.suggestions = this.generateSuggestions(code, error.message);
    }

    return result;
  }

  // Validate flowchart/graph syntax
  validateFlowchart(lines) {
    const result = { isValid: true, error: null, suggestions: [] };
    
    // Skip first line (diagram type)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip comments and empty lines
      if (!line || line.startsWith('%%')) continue;
      
      // Check for valid node definition or connection
      const isValidNode = this.patterns.nodeDefinition.test(line);
      const isValidConnection = this.patterns.connection.test(line);
      
      if (!isValidNode && !isValidConnection) {
        // Check for common patterns that might be fixable
        if (line.match(/^[^A-Za-z_]/)) {
          result.error = `Line ${i + 1}: Invalid node ID - must start with letter or underscore`;
          result.suggestions = ['Node IDs must start with a letter or underscore', 'Wrap text in quotes if it contains special characters'];
        } else if (line.includes('->') && !line.includes('-->')) {
          result.error = `Line ${i + 1}: Use --> for arrows in flowcharts`;
          result.suggestions = ['Use --> instead of -> for arrows in flowcharts'];
        } else {
          result.error = `Line ${i + 1}: Invalid syntax - "${line}"`;
          result.suggestions = [
            'Ensure proper node definition: NodeID[Label] or NodeID(Label)',
            'Ensure proper connections: NodeA --> NodeB',
            'Wrap labels containing special characters in quotes'
          ];
        }
        result.isValid = false;
        break;
      }
    }
    
    return result;
  }

  // Validate ER diagram syntax
  validateERDiagram(lines) {
    const result = { isValid: true, error: null, suggestions: [] };
    
    let inEntity = false;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      if (!line || line.startsWith('%%')) continue;
      
      if (line === '}') {
        inEntity = false;
        continue;
      }
      
      if (this.patterns.erEntity.test(line)) {
        inEntity = true;
        continue;
      }
      
      if (inEntity) {
        if (!this.patterns.erAttribute.test(line)) {
          result.error = `Line ${i + 1}: Invalid attribute syntax - "${line}"`;
          result.suggestions = ['Attributes should follow format: field_name DataType or field_name DataType PK/FK/UK'];
          result.isValid = false;
          break;
        }
      } else {
        if (!this.patterns.erRelationship.test(line)) {
          result.error = `Line ${i + 1}: Invalid relationship syntax - "${line}"`;
          result.suggestions = ['Relationships should follow format: EntityA ||--o{ EntityB : "relationship name"'];
          result.isValid = false;
          break;
        }
      }
    }
    
    return result;
  }

  // Generate fix suggestions based on common errors
  generateSuggestions(code, errorMessage = '') {
    const suggestions = [];
    
    if (!code.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)/m)) {
      suggestions.push('Diagram must start with a valid diagram type (e.g., "graph TD", "flowchart LR", "erDiagram")');
    }

    const quotes = code.match(/"/g) || [];
    if (quotes.length % 2 !== 0) {
      suggestions.push('Check for unclosed quotes in node labels or text');
    }

    if (errorMessage.includes('Lexical error') || errorMessage.includes('Parse error')) {
      suggestions.push('Ensure node IDs start with a letter and contain only letters, numbers, underscores, or hyphens');
      suggestions.push('Wrap text containing special characters in quotes');
    }

    if (code.includes('->') && code.match(/^(graph|flowchart)/m)) {
      suggestions.push('Use --> for arrows in flowchart/graph diagrams');
    }

    if (code.includes('erDiagram')) {
      if (!code.match(/\|\|--|--\|\||--o\{|o\{--/)) {
        suggestions.push('ER relationships should use proper syntax like ||--o{, }o--||, ||--||');
      }
    }

    return suggestions;
  }

  // Generate fix prompt for LLM
  generateFixPrompt(validationResult, originalCode) {
    let prompt = 'The Mermaid diagram has validation errors. Please fix the following issues:\n\n';
    
    if (validationResult.error) {
      prompt += `Error: ${validationResult.error}\n\n`;
    }
    
    if (validationResult.suggestions.length > 0) {
      prompt += 'Suggestions:\n';
      validationResult.suggestions.forEach((suggestion, i) => {
        prompt += `${i + 1}. ${suggestion}\n`;
      });
      prompt += '\n';
    }
    
    prompt += 'Original diagram code:\n```mermaid\n' + originalCode + '\n```\n\n';
    prompt += 'Please generate a corrected version of this Mermaid diagram that addresses these issues.';
    
    return prompt;
  }
}

export default MermaidValidator;