/**
 * ConversationContextBuilder - Modular utility for building conversation context
 * Provides consistent, configurable context formatting across all agents
 */

export class ConversationContextBuilder {
  constructor(conversationHistory = []) {
    this.conversationHistory = conversationHistory;
  }

  /**
   * Build conversation context with configurable options
   * @param {Object} options - Configuration options
   * @param {number} options.maxExchanges - Maximum number of exchanges to include (default: 3)
   * @param {number} options.maxMessageLength - Maximum length per message (default: 200)
   * @param {boolean} options.includeSystemMessages - Include system messages (default: false)
   * @param {string} options.format - Output format: 'detailed', 'compact', 'summary' (default: 'detailed')
   * @param {string} options.prefix - Custom prefix for the context section
   * @param {string} options.suffix - Custom suffix for the context section
   * @returns {string} Formatted conversation context
   */
  build(options = {}) {
    const {
      maxExchanges = 3,
      maxMessageLength = 200,
      includeSystemMessages = false,
      format = 'detailed',
      prefix = 'CONVERSATION HISTORY (Current Session)',
      suffix = 'Consider the above context when responding.',
    } = options;

    if (!this.conversationHistory || this.conversationHistory.length === 0) {
      return '';
    }

    // Calculate how many messages to include (exchanges * 2)
    const maxMessages = maxExchanges * 2;
    const recentHistory = this.conversationHistory.slice(-maxMessages);

    if (recentHistory.length === 0) {
      return '';
    }

    // Build context based on format
    let context = '';
    
    switch (format) {
      case 'detailed':
        context = this.buildDetailedContext(recentHistory, maxMessageLength, includeSystemMessages);
        break;
      case 'compact':
        context = this.buildCompactContext(recentHistory, maxMessageLength, includeSystemMessages);
        break;
      case 'summary':
        context = this.buildSummaryContext(recentHistory, maxMessageLength);
        break;
      default:
        context = this.buildDetailedContext(recentHistory, maxMessageLength, includeSystemMessages);
    }

    if (!context) {
      return '';
    }

    // Format the final output
    return `\n${prefix}:\n${context}\n${suffix}\n`;
  }

  /**
   * Build detailed conversation context with full exchange formatting
   */
  buildDetailedContext(history, maxLength, includeSystemMessages) {
    const exchanges = [];
    
    for (let i = 0; i < history.length; i += 2) {
      const userMsg = this.extractMessage(history[i]);
      const assistantMsg = this.extractMessage(history[i + 1]);
      
      if (!userMsg && !assistantMsg) continue;
      
      let exchange = '';
      
      if (userMsg) {
        const truncated = this.truncateMessage(userMsg, maxLength);
        exchange += `User: ${truncated}\n`;
      }
      
      if (assistantMsg) {
        const truncated = this.truncateMessage(assistantMsg, maxLength);
        exchange += `Assistant: ${truncated}\n`;
      }
      
      if (exchange) {
        exchanges.push(exchange);
      }
    }
    
    return exchanges.join('\n');
  }

  /**
   * Build compact conversation context with minimal formatting
   */
  buildCompactContext(history, maxLength, includeSystemMessages) {
    const messages = [];
    
    for (const msg of history) {
      const content = this.extractMessage(msg);
      if (!content) continue;
      
      const role = this.extractRole(msg);
      if (!includeSystemMessages && role === 'system') continue;
      
      const truncated = this.truncateMessage(content, maxLength);
      messages.push(`[${role}] ${truncated}`);
    }
    
    return messages.join('\n');
  }

  /**
   * Build summary context with key points extracted
   */
  buildSummaryContext(history, maxLength) {
    const keyPoints = [];
    
    // Extract key information from recent exchanges
    for (let i = history.length - 1; i >= 0 && keyPoints.length < 3; i--) {
      const msg = this.extractMessage(history[i]);
      if (!msg) continue;
      
      const role = this.extractRole(history[i]);
      
      // Extract key phrases or questions
      if (role === 'user') {
        const question = this.extractKeyPhrase(msg, 'question');
        if (question) {
          keyPoints.unshift(`Asked: ${this.truncateMessage(question, maxLength / 2)}`);
        }
      } else if (role === 'assistant') {
        const answer = this.extractKeyPhrase(msg, 'answer');
        if (answer) {
          keyPoints.unshift(`Provided: ${this.truncateMessage(answer, maxLength / 2)}`);
        }
      }
    }
    
    return keyPoints.join('\n');
  }

  /**
   * Extract message content from various message formats
   */
  extractMessage(message) {
    if (!message) return null;
    
    if (typeof message === 'string') {
      return message;
    }
    
    if (message.content) {
      if (typeof message.content === 'string') {
        return message.content;
      }
      if (Array.isArray(message.content)) {
        // Handle multi-part content (e.g., tool results)
        return message.content
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join(' ');
      }
    }
    
    if (message.text) {
      return message.text;
    }
    
    return null;
  }

  /**
   * Extract role from message
   */
  extractRole(message) {
    if (!message) return 'unknown';
    
    if (message.role) {
      return message.role;
    }
    
    // Infer role from position or content
    if (typeof message === 'string') {
      return 'user'; // Default assumption for string messages
    }
    
    return 'unknown';
  }

  /**
   * Truncate message to specified length
   */
  truncateMessage(message, maxLength) {
    if (!message || message.length <= maxLength) {
      return message;
    }
    
    // Smart truncation - try to break at sentence or word boundary
    const truncated = message.substring(0, maxLength);
    
    // Try to find last sentence end
    const sentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );
    
    if (sentenceEnd > maxLength * 0.7) {
      return truncated.substring(0, sentenceEnd + 1);
    }
    
    // Fall back to word boundary
    const wordEnd = truncated.lastIndexOf(' ');
    if (wordEnd > maxLength * 0.8) {
      return truncated.substring(0, wordEnd) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Extract key phrases from message
   */
  extractKeyPhrase(message, type = 'question') {
    if (!message) return null;
    
    if (type === 'question') {
      // Look for question patterns
      const questionMatch = message.match(/(?:what|how|why|when|where|who|which|can you|could you|would you|please)[^.!?]*[?]/i);
      if (questionMatch) {
        return questionMatch[0];
      }
      
      // Look for imperative statements
      const imperativeMatch = message.match(/^(?:show|get|find|create|write|implement|analyze|explain)[^.!?]*/i);
      if (imperativeMatch) {
        return imperativeMatch[0];
      }
    } else if (type === 'answer') {
      // Extract first meaningful sentence
      const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 10);
      if (sentences.length > 0) {
        return sentences[0].trim();
      }
    }
    
    // Fallback to first part of message
    return message.substring(0, 100);
  }

  /**
   * Get conversation statistics
   */
  getStats() {
    return {
      totalMessages: this.conversationHistory.length,
      exchanges: Math.floor(this.conversationHistory.length / 2),
      userMessages: this.conversationHistory.filter((_, i) => i % 2 === 0).length,
      assistantMessages: this.conversationHistory.filter((_, i) => i % 2 === 1).length,
    };
  }

  /**
   * Create agent-specific context with preset configurations
   */
  static forPlanner(conversationHistory) {
    const builder = new ConversationContextBuilder(conversationHistory);
    return builder.build({
      maxExchanges: 5,
      maxMessageLength: 200,
      format: 'detailed',
      prefix: 'CONVERSATION HISTORY (This Session)',
      suffix: 'IMPORTANT: Consider this context when planning tasks. Look for references to previous results or ongoing discussions.',
    });
  }

  static forExecutor(conversationHistory) {
    const builder = new ConversationContextBuilder(conversationHistory);
    return builder.build({
      maxExchanges: 3,
      maxMessageLength: 150,
      format: 'compact',
      prefix: 'CONVERSATION CONTEXT',
      suffix: 'Note: Consider this context when executing the task.',
    });
  }

  static forAnalyzer(conversationHistory) {
    const builder = new ConversationContextBuilder(conversationHistory);
    return builder.build({
      maxExchanges: 2,
      maxMessageLength: 150,
      format: 'summary',
      prefix: 'Recent Conversation',
      suffix: 'Build upon this context in your response.',
    });
  }
}

/**
 * Convenience function for quick context building
 */
export function buildConversationContext(conversationHistory, options = {}) {
  const builder = new ConversationContextBuilder(conversationHistory);
  return builder.build(options);
}