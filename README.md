# Aden MCP Agent System with Goal-Aware Task Generation

An intelligent multi-agent system implementing the Model Context Protocol (MCP) with advanced goal-aware task generation capabilities. This system enables AI agents to understand project objectives, analyze progress gaps, and dynamically generate strategic tasks to achieve goals.

## 🌟 Key Features

### Goal-Aware Task Generation
- **Intelligent Gap Analysis**: Agents analyze the difference between current state and desired goals
- **Strategic Task Planning**: Generates tasks that actively move toward goal completion, not just error recovery
- **Progress Tracking**: Maintains awareness of completed tasks and their outcomes
- **Verification Tasks**: Automatically generates testing and validation tasks

### Multi-Agent Architecture
- **PlannerAgent**: Analyzes requests and creates execution plans
- **ExecutorAgent**: Executes tasks with tool calls and dynamic task generation
- **AnalyzerAgent**: Synthesizes results and generates final responses
- **CoordinatorAgent**: Orchestrates agent collaboration and parallel execution

### Advanced Capabilities
- **Session-Based File Isolation**: Secure workspace management for each session
- **File System Tracking**: "Ducky vision" for verifying actual file creation
- **Import Verification**: Validates dependencies and module imports
- **Parallel Task Execution**: Executes independent tasks concurrently
- **DuckDB Integration**: Local analytics with DuckDB support
- **Neo4j Knowledge Graph**: Team-scoped memory and knowledge management

## 🚀 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Neo4j (optional, for knowledge graph features)
- MongoDB (optional, for session persistence)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/aden-mcp-agent.git
cd aden-mcp-agent
```

2. Install dependencies:
```bash
# Install server dependencies
cd packages/mcp-server
npm install

# Install client dependencies
cd ../agent-client
npm install
```

3. Configure environment variables:
```bash
# Create .env file in packages/mcp-server
cp .env.example .env

# Add your configuration:
ADEN_HOST=https://your-api-host.com
ADEN_API_TOKEN=your_jwt_token
NEO4J_URI=bolt://localhost:7687
NEO4J_PASSWORD=your_neo4j_password
OPENAI_API_KEY=your_openai_key  # For intelligent analytics
```

4. Start the MCP server:
```bash
cd packages/mcp-server
npm start
```

5. Use the client:
```bash
cd packages/agent-client
node src/cli.js chat
```

## 📖 Usage Examples

### Basic Chat with Goal-Aware Task Generation
```bash
# Start interactive chat
node src/cli.js chat

# Ask to create a project
> Create a complete web dashboard with analytics and data visualization
```

The system will:
1. Analyze your goal
2. Create an initial plan
3. Execute tasks systematically
4. Generate new tasks based on progress gaps
5. Add verification tasks automatically

### Authenticated Team Session
```bash
# Set up authentication
node src/cli.js auth -t "your_jwt_token"

# Chat with team memory context
node src/cli.js chat -t "your_jwt_token"
```

## 🏗️ Architecture

```
┌─────────────────┐
│  User Request   │
└────────┬────────┘
         │
┌────────▼────────┐
│ CoordinatorAgent│ ◄── Orchestrates multi-agent workflow
└────────┬────────┘
         │
┌────────▼────────┐
│  PlannerAgent   │ ◄── Creates initial execution plan
└────────┬────────┘
         │
┌────────▼────────┐
│  ExecutorAgent  │ ◄── Executes tasks with goal-aware generation
│ + GoalAwareTasks│     
└────────┬────────┘
         │
┌────────▼────────┐
│  AnalyzerAgent  │ ◄── Synthesizes results
└────────┬────────┘
         │
┌────────▼────────┐
│  Final Response │
└─────────────────┘
```

## 🔧 Core Components

### GoalAwareTaskGenerator (`/packages/agent-client/src/agents/goal-aware-task-generator.js`)
The intelligent task generation system that:
- Analyzes progress toward goals
- Identifies missing components
- Generates strategic tasks
- Creates verification tasks

### ExecutorAgent with Dynamic Task Generation
Enhanced executor that:
- Tracks file creation with verification
- Generates tasks based on execution results
- Maintains project structure awareness
- Handles parallel task execution

### AgentContext with File System Tracking
Centralized context management:
- Session workspace isolation
- File content caching
- Import dependency tracking
- Project structure verification

## 🧪 Testing

Run the test suite:
```bash
cd packages/agent-client
npm test

# Test goal-aware task generation specifically
node test/test-goal-aware-task-generation.js
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 Key Improvements Made

### Problem Solved: Goal-Aware Task Generation
**Before**: Agents only generated tasks in response to errors or failures
**After**: Agents proactively generate tasks to bridge gaps between current state and desired goals

### Problem Solved: File Creation Verification
**Before**: Agents claimed to create files but often created them in wrong locations
**After**: "Ducky vision" verification ensures files are created where expected

### Problem Solved: Malformed Directory Structures
**Before**: Shell brace expansion syntax created literal directory names like `{css,js,images}`
**After**: Proper validation prevents brace expansion in file paths

### Problem Solved: Session Isolation
**Before**: File operations could access any system path
**After**: All operations restricted to secure session workspaces

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on the Model Context Protocol (MCP) specification
- Integrates with Anthropic's Claude API
- Uses Neo4j for knowledge graph capabilities
- Leverages DuckDB for local analytics

## 📞 Contact

For questions or support, please open an issue on GitHub.

---
**Note**: Remember to update API endpoints, tokens, and credentials with your own values before deploying.