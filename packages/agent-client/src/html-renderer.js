import fs from "fs/promises";
import path from "path";

/**
 * HTML Renderer for Conversation Logs
 * Generates beautiful, readable HTML files from session data
 */
export class HTMLRenderer {
  constructor(config = {}) {
    this.outputDir = config.outputDir || "./logs/html";
    this.theme = config.theme || "modern";
    this.includeRawPrompts = config.includeRawPrompts ?? true;
    this.includeToolDetails = config.includeToolDetails ?? true;
    this.autoOpen = config.autoOpen ?? false;
  }

  /**
   * Render a session to HTML
   */
  async renderSession(sessionData, outputPath = null) {
    if (!outputPath) {
      await this.ensureOutputDirectory();
      outputPath = path.join(this.outputDir, `session-${sessionData.sessionId}.html`);
    }

    const html = this.generateHTML(sessionData);
    await fs.writeFile(outputPath, html, "utf8");

    return outputPath;
  }

  /**
   * Generate HTML content for a session
   */
  generateHTML(session) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aden Conversation - ${this.formatDate(session.startTime)}</title>
    <style>
        ${this.getCSS()}
    </style>
</head>
<body>
    <div class="container">
        ${this.renderHeader(session)}
        ${this.renderStats(session)}
        ${this.renderConversation(session)}
        ${this.includeRawPrompts ? this.renderRawPrompts(session) : ""}
        ${this.renderFooter()}
    </div>
    <script>
        ${this.getJavaScript()}
    </script>
</body>
</html>`;

    return html;
  }

  /**
   * Render session header
   */
  renderHeader(session) {
    const startTime = new Date(session.startTime);
    const endTime = session.endTime ? new Date(session.endTime) : null;
    const duration = session.duration ? this.formatDuration(session.duration) : "Active";

    return `
    <header class="session-header">
        <h1>🤖 Aden AI Conversation</h1>
        <div class="session-info">
            <div class="info-grid">
                <div class="info-item">
                    <span class="label">Session ID:</span>
                    <span class="value" title="${session.sessionId}">${session.sessionId.slice(0, 16)}...</span>
                </div>
                <div class="info-item">
                    <span class="label">Started:</span>
                    <span class="value">${startTime.toLocaleString()}</span>
                </div>
                <div class="info-item">
                    <span class="label">Ended:</span>
                    <span class="value">${endTime ? endTime.toLocaleString() : "Active"}</span>
                </div>
                <div class="info-item">
                    <span class="label">Duration:</span>
                    <span class="value">${duration}</span>
                </div>
                <div class="info-item">
                    <span class="label">Type:</span>
                    <span class="value session-type">${session.metadata.type || "unknown"}</span>
                </div>
                <div class="info-item">
                    <span class="label">LLM Provider:</span>
                    <span class="value">${session.metadata.llmProvider || "unknown"}</span>
                </div>
            </div>
        </div>
    </header>`;
  }

  /**
   * Render session statistics
   */
  renderStats(session) {
    return `
    <section class="stats-section">
        <h2>📊 Session Statistics</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${session.stats.totalInteractions}</div>
                <div class="stat-label">Interactions</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${session.stats.totalToolCalls}</div>
                <div class="stat-label">Tool Calls</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${session.stats.totalPrompts}</div>
                <div class="stat-label">Prompts</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${session.stats.totalTokensUsed.toLocaleString()}</div>
                <div class="stat-label">Tokens Used</div>
            </div>
        </div>
    </section>`;
  }

  /**
   * Render the main conversation
   */
  renderConversation(session) {
    const interactions = session.interactions || [];

    let conversationHTML = `
    <section class="conversation-section">
        <h2>💬 Conversation</h2>
        <div class="conversation">`;

    interactions.forEach((interaction, index) => {
      conversationHTML += this.renderInteraction(interaction, index);
    });

    conversationHTML += `
        </div>
    </section>`;

    return conversationHTML;
  }

  /**
   * Render a single interaction
   */
  renderInteraction(interaction, index) {
    const timestamp = new Date(interaction.timestamp);
    const responseTime = interaction.metadata.responseTime
      ? `${Math.round(interaction.metadata.responseTime)}ms`
      : "N/A";

    return `
    <div class="interaction" id="interaction-${index}">
        <div class="interaction-header">
            <span class="interaction-number">#${index + 1}</span>
            <span class="timestamp">${timestamp.toLocaleTimeString()}</span>
            <span class="response-time">⏱️ ${responseTime}</span>
            ${
              interaction.toolCalls.length > 0
                ? `<span class="tool-count">🔧 ${interaction.toolCalls.length} tools</span>`
                : ""
            }
        </div>
        
        <div class="message user-message">
            <div class="message-header">
                <span class="message-type">👤 User</span>
            </div>
            <div class="message-content">
                ${this.formatMessageContent(interaction.userMessage)}
            </div>
        </div>

        ${this.includeToolDetails ? this.renderToolCalls(interaction.toolCalls) : ""}

        <div class="message assistant-message">
            <div class="message-header">
                <span class="message-type">🤖 Aden</span>
                ${
                  interaction.metadata.tokensUsed
                    ? `<span class="token-count">${interaction.metadata.tokensUsed} tokens</span>`
                    : ""
                }
            </div>
            <div class="message-content">
                ${this.formatMessageContent(interaction.systemResponse)}
            </div>
        </div>
    </div>`;
  }

  /**
   * Render tool calls for an interaction
   */
  renderToolCalls(toolCalls) {
    if (!toolCalls || toolCalls.length === 0) return "";

    let toolHTML = `<div class="tool-calls">`;

    toolCalls.forEach((toolCall, index) => {
      const executionTime = toolCall.executionTime
        ? `${Math.round(toolCall.executionTime)}ms`
        : "N/A";
      const hasError =
        toolCall.error ||
        (toolCall.result &&
          (toolCall.result.includes("Error:") ||
            toolCall.result.includes("HTTP error!") ||
            toolCall.result.includes("status: 4") ||
            toolCall.result.includes("status: 5") ||
            toolCall.result.toLowerCase().includes("failed") ||
            toolCall.result.toLowerCase().includes("exception") ||
            toolCall.result.toLowerCase().includes("timeout") ||
            toolCall.result.includes("Column not found") ||
            toolCall.result.includes("Table not found") ||
            toolCall.result.includes("Error Code:") ||
            toolCall.result.includes("Hint:")));

      toolHTML += `
      <div class="tool-call ${hasError ? "tool-error" : "tool-success"}">
        <div class="tool-header" onclick="toggleToolDetails('tool-${toolCall.id}')">
          <span class="tool-name">🔧 ${toolCall.name}</span>
          <span class="execution-time">⏱️ ${executionTime}</span>
          <span class="toggle-btn">▼</span>
        </div>
        <div class="tool-details" id="tool-${toolCall.id}" style="display: none;">
          <div class="tool-input">
            <h4>Input:</h4>
            <pre><code>${JSON.stringify(toolCall.input, null, 2)}</code></pre>
          </div>
          <div class="tool-result">
            <h4>Result:</h4>
            <pre><code>${this.escapeHtml(toolCall.result || "No result")}</code></pre>
          </div>
          ${
            toolCall.error
              ? `
            <div class="tool-error-details">
              <h4>Error:</h4>
              <pre><code>${this.escapeHtml(toolCall.error)}</code></pre>
            </div>
          `
              : ""
          }
        </div>
      </div>`;
    });

    toolHTML += `</div>`;
    return toolHTML;
  }

  /**
   * Render raw prompts section (optional)
   */
  renderRawPrompts(session) {
    const interactions = session.interactions || [];
    let promptsHTML = `
    <section class="raw-prompts-section">
        <h2>🔍 Raw Prompts</h2>
        <div class="prompts-container">`;

    interactions.forEach((interaction, index) => {
      if (interaction.rawPrompts && interaction.rawPrompts.length > 0) {
        promptsHTML += `
        <div class="interaction-prompts">
          <h3>Interaction #${index + 1}</h3>`;

        interaction.rawPrompts.forEach((prompt, promptIndex) => {
          promptsHTML += `
          <div class="raw-prompt">
            <div class="prompt-header" onclick="togglePromptDetails('prompt-${interaction.id}-${promptIndex}')">
              <span class="prompt-type">${prompt.type || "unknown"}</span>
              <span class="prompt-model">${prompt.model}</span>
              <span class="toggle-btn">▼</span>
            </div>
            <div class="prompt-details" id="prompt-${interaction.id}-${promptIndex}" style="display: none;">
              <div class="prompt-system">
                <h4>System Prompt:</h4>
                <pre><code>${this.escapeHtml(prompt.system || "None")}</code></pre>
              </div>
              <div class="prompt-messages">
                <h4>Messages:</h4>
                <pre><code>${JSON.stringify(prompt.messages, null, 2)}</code></pre>
              </div>
              <div class="prompt-response">
                <h4>Response:</h4>
                <pre><code>${JSON.stringify(prompt.response, null, 2)}</code></pre>
              </div>
            </div>
          </div>`;
        });

        promptsHTML += `</div>`;
      }
    });

    promptsHTML += `
        </div>
    </section>`;

    return promptsHTML;
  }

  /**
   * Render footer
   */
  renderFooter() {
    const generatedTime = new Date().toLocaleString();
    return `
    <footer class="report-footer">
        <p>Generated by Aden AI on ${generatedTime}</p>
        <p>This report contains conversation logs, tool calls, and performance metrics.</p>
    </footer>`;
  }

  /**
   * Get CSS styles
   */
  getCSS() {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: white;
            margin-top: 20px;
            margin-bottom: 20px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }

        .session-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 30px;
        }

        .session-header h1 {
            font-size: 2.5rem;
            margin-bottom: 20px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
        }

        .info-item {
            background: rgba(255,255,255,0.1);
            padding: 12px;
            border-radius: 8px;
            backdrop-filter: blur(10px);
        }

        .info-item .label {
            display: block;
            font-size: 0.9rem;
            opacity: 0.8;
            margin-bottom: 4px;
        }

        .info-item .value {
            display: block;
            font-weight: 600;
            font-size: 1.1rem;
        }

        .session-type {
            text-transform: capitalize;
            background: rgba(255,255,255,0.2);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.9rem !important;
        }

        .stats-section {
            margin-bottom: 30px;
        }

        .stats-section h2 {
            font-size: 1.8rem;
            margin-bottom: 20px;
            color: #333;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }

        .stat-card {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 25px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 4px 15px rgba(240, 147, 251, 0.3);
        }

        .stat-number {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 8px;
        }

        .stat-label {
            font-size: 1rem;
            opacity: 0.9;
        }

        .conversation-section h2 {
            font-size: 1.8rem;
            margin-bottom: 25px;
            color: #333;
        }

        .interaction {
            border: 1px solid #e1e5e9;
            border-radius: 12px;
            margin-bottom: 25px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        .interaction-header {
            background: #f8f9fa;
            padding: 12px 20px;
            border-bottom: 1px solid #e1e5e9;
            display: flex;
            align-items: center;
            gap: 15px;
            font-size: 0.9rem;
        }

        .interaction-number {
            background: #667eea;
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-weight: 600;
        }

        .timestamp {
            color: #6c757d;
        }

        .response-time, .tool-count {
            background: #e9ecef;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
        }

        .message {
            padding: 20px;
        }

        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .message-type {
            font-weight: 600;
            font-size: 1.1rem;
        }

        .user-message {
            background: #f8f9fa;
            border-bottom: 1px solid #e1e5e9;
        }

        .assistant-message {
            background: white;
        }

        .message-content {
            font-size: 1rem;
            line-height: 1.7;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .token-count {
            background: #d4edda;
            color: #155724;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
        }

        .tool-calls {
            background: #f8f9fa;
            border-top: 1px solid #e1e5e9;
            border-bottom: 1px solid #e1e5e9;
            padding: 15px 20px;
        }

        .tool-call {
            border: 1px solid #dee2e6;
            border-radius: 8px;
            margin-bottom: 10px;
            overflow: hidden;
        }

        .tool-call:last-child {
            margin-bottom: 0;
        }

        .tool-success {
            border-left: 4px solid #28a745;
        }

        .tool-error {
            border-left: 4px solid #dc3545;
        }

        .tool-header {
            background: #fff;
            padding: 12px 15px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background-color 0.2s;
        }

        .tool-header:hover {
            background: #f8f9fa;
        }

        .tool-name {
            font-weight: 600;
            color: #495057;
        }

        .execution-time {
            font-size: 0.9rem;
            color: #6c757d;
        }

        .toggle-btn {
            color: #6c757d;
            transition: transform 0.2s;
        }

        .tool-details {
            background: #f8f9fa;
            border-top: 1px solid #dee2e6;
            padding: 15px;
        }

        .tool-details h4 {
            margin-bottom: 8px;
            color: #495057;
            font-size: 0.9rem;
        }

        .tool-details pre {
            background: #fff;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 12px;
            overflow-x: auto;
            margin-bottom: 15px;
            font-size: 0.85rem;
        }

        .tool-details pre:last-child {
            margin-bottom: 0;
        }

        .tool-error-details pre {
            background: #f8d7da;
            border-color: #f5c6cb;
            color: #721c24;
        }

        .raw-prompts-section {
            margin-top: 40px;
            padding-top: 30px;
            border-top: 2px solid #e1e5e9;
        }

        .raw-prompts-section h2 {
            font-size: 1.8rem;
            margin-bottom: 25px;
            color: #333;
        }

        .interaction-prompts {
            margin-bottom: 30px;
        }

        .interaction-prompts h3 {
            margin-bottom: 15px;
            color: #495057;
        }

        .raw-prompt {
            border: 1px solid #dee2e6;
            border-radius: 8px;
            margin-bottom: 15px;
            overflow: hidden;
        }

        .prompt-header {
            background: #e9ecef;
            padding: 12px 15px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .prompt-header:hover {
            background: #dee2e6;
        }

        .prompt-type {
            background: #667eea;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 600;
        }

        .prompt-model {
            font-size: 0.9rem;
            color: #6c757d;
        }

        .prompt-details {
            padding: 15px;
            background: #f8f9fa;
            border-top: 1px solid #dee2e6;
        }

        .report-footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e1e5e9;
            text-align: center;
            color: #6c757d;
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            .container {
                margin: 10px;
                padding: 15px;
            }

            .session-header {
                padding: 20px;
            }

            .session-header h1 {
                font-size: 2rem;
            }

            .info-grid {
                grid-template-columns: 1fr;
            }

            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }

            .interaction-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
            }
        }
    `;
  }

  /**
   * Get JavaScript code
   */
  getJavaScript() {
    return `
        function toggleToolDetails(toolId) {
            const element = document.getElementById(toolId);
            const toggle = element.previousElementSibling.querySelector('.toggle-btn');
            
            if (element.style.display === 'none') {
                element.style.display = 'block';
                toggle.style.transform = 'rotate(180deg)';
            } else {
                element.style.display = 'none';
                toggle.style.transform = 'rotate(0deg)';
            }
        }

        function togglePromptDetails(promptId) {
            const element = document.getElementById(promptId);
            const toggle = element.previousElementSibling.querySelector('.toggle-btn');
            
            if (element.style.display === 'none') {
                element.style.display = 'block';
                toggle.style.transform = 'rotate(180deg)';
            } else {
                element.style.display = 'none';
                toggle.style.transform = 'rotate(0deg)';
            }
        }

        // Auto-scroll to latest interaction on load
        document.addEventListener('DOMContentLoaded', function() {
            const interactions = document.querySelectorAll('.interaction');
            if (interactions.length > 0) {
                const lastInteraction = interactions[interactions.length - 1];
                lastInteraction.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    `;
  }

  // Utility methods

  formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  }

  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  formatMessageContent(content) {
    // Basic HTML escaping and formatting
    return this.escapeHtml(content)
      .replace(/\n/g, "<br>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>");
  }

  escapeHtml(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async ensureOutputDirectory() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create HTML output directory:", error.message);
    }
  }
}
