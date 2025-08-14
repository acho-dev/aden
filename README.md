# Aden Analytics Agent System - Deep Database Intelligence via MCP

A sophisticated multi-agent analytics platform that leverages the Model Context Protocol (MCP) to provide deep database exploration and intelligent data analysis. This system empowers AI agents to autonomously navigate your data ecosystem, execute complex analytical queries, and deliver actionable business insights through natural language interactions.

## 🎯 Why Aden?

### The Challenge
Modern businesses struggle with data trapped in silos across multiple databases, requiring technical expertise to extract insights. Traditional BI tools demand SQL knowledge, manual report building, and constant maintenance. Data teams are overwhelmed with ad-hoc requests while business users wait days for simple answers.

### The Aden Solution
Aden transforms how organizations interact with their data through **conversational analytics powered by AI agents**. Instead of writing queries or building dashboards, users simply ask questions in natural language and receive instant, actionable insights.

### What Makes Aden Different

#### 🧠 **True Database Intelligence**
Unlike chatbots that guess at queries, Aden's agents understand your actual database schema, relationships, and business context. They generate precise, optimized SQL that works the first time.

#### 🚀 **Zero Setup Analytics**
No need to define metrics, build data models, or create dashboards. Aden automatically discovers your data structure and begins delivering insights immediately.

#### 🔄 **Adaptive Learning**
Every interaction makes Aden smarter. The platform builds organizational knowledge graphs that capture business logic, metric definitions, and analytical patterns unique to your company.

#### 🏢 **Enterprise-Grade Architecture**
Built for scale with team-based isolation, JWT authentication, and comprehensive audit trails. Process millions of records with DuckDB's columnar engine while maintaining sub-second response times.

#### 🤝 **MCP-Native Integration**
First analytics platform built entirely on the Model Context Protocol, enabling seamless integration with any MCP-compatible tool or service. Extend functionality without touching core code.

### Real-World Impact

**For Business Users:**
- Get answers in seconds, not days
- No SQL or technical knowledge required
- Natural conversation with follow-up questions
- Automated insight discovery and recommendations

**For Data Teams:**
- Eliminate repetitive query requests
- Focus on strategic initiatives
- Automatic documentation of business logic
- Reusable knowledge that scales across teams

**For Organizations:**
- Democratize data access across all departments
- Reduce time-to-insight by 90%
- Build institutional knowledge automatically
- Ensure consistent, accurate analytics

## 🌟 Key Features

### Intelligent Database Analytics
- **Autonomous Query Generation**: AI agents automatically generate complex SQL queries based on natural language questions
- **Schema-Aware Intelligence**: Agents understand your database structure through graph_export and intelligently navigate relationships
- **Multi-Database Support**: Seamlessly query PostgreSQL, DuckDB, Neo4j, and MongoDB through unified MCP tools
- **Business Context Understanding**: Agents detect business keywords and automatically enrich queries with relevant context
- **Type-Safe Query Generation**: PostgreSQL queries with explicit type casting and proper JOIN operations

### Advanced Analytics Capabilities
- **Intelligent Subagent Orchestration**: Claude-powered subagents that understand business intent and generate follow-up queries
- **Real-time Data Exploration**: Interactive exploration of databases with instant visualization generation
- **Cross-Database Correlation**: Combine data from multiple sources for comprehensive analysis
- **Automated Insight Discovery**: Agents proactively identify patterns, anomalies, and actionable insights
- **CSV/Parquet Analytics**: Local file analysis with DuckDB for fast analytical processing

### Multi-Agent Analytics Architecture
- **PlannerAgent**: Analyzes data requests and creates analytical execution plans
- **ExecutorAgent**: Orchestrates database queries and data retrieval across multiple sources
- **AnalyzerAgent**: Synthesizes query results into business insights and recommendations
- **CoordinatorAgent**: Manages parallel query execution and result aggregation

### Enterprise Data Features
- **Team-Scoped Knowledge Graph**: Neo4j integration for organizational memory and context
- **Session Persistence**: MongoDB storage for conversation history and query patterns
- **Performance Optimization**: Query caching, parallel execution, and intelligent model selection
- **Secure Data Access**: JWT-based authentication with team-level data isolation

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

### Business Analytics Queries
```bash
# Start interactive analytics session
node src/cli.js chat

# Natural language database queries
> Show me revenue trends for Q4 2024 broken down by product category
> Which customers have the highest churn risk based on usage patterns?
> Analyze employee productivity metrics across departments
> Compare this month's sales performance to the same period last year
```

The analytics agent will:
1. Understand your business question
2. Automatically explore your database schema
3. Generate optimized SQL queries
4. Execute parallel data retrievals
5. Synthesize results into actionable insights
6. Generate visualizations when appropriate

### Advanced Analytics Examples

#### Revenue Analysis
```bash
> What's our ARR and how has it changed over the last 6 months?
# Agent will:
# - Query subscription data
# - Calculate Annual Recurring Revenue
# - Analyze month-over-month changes
# - Identify growth drivers
```

#### Customer Intelligence
```bash
> Find all enterprise customers who haven't engaged in 30 days
# Agent will:
# - Query customer segments
# - Analyze engagement metrics
# - JOIN with activity logs
# - Provide re-engagement recommendations
```

#### Operational Analytics
```bash
> Show me ticket resolution times by support agent this week
# Agent will:
# - Query ticket database
# - Calculate resolution metrics
# - Group by agent performance
# - Identify bottlenecks
```

### Authenticated Team Analytics
```bash
# Set up authentication for team-scoped data
node src/cli.js auth -t "your_jwt_token"

# Access team-specific analytics with context
node src/cli.js chat -t "your_jwt_token"
> Show me our team's project completion rate vs company average
```

## 🏗️ Architecture

### Analytics-First Architecture Overview

The Aden Analytics Agent System is designed from the ground up for intelligent database exploration and business analytics. At its core, the system transforms natural language questions into sophisticated multi-database queries, orchestrates parallel data retrieval, and synthesizes results into actionable business insights.

### High-Level System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        CLI[CLI Interface<br/>packages/agent-client/src/cli.js]
        API[API Server<br/>packages/api-server]
    end
    
    subgraph "Multi-Agent System"
        COORD[CoordinatorAgent<br/>• Orchestrates workflow<br/>• Manages agent transitions<br/>• Parallel execution control]
        PLAN[PlannerAgent<br/>• Intent analysis<br/>• Plan generation<br/>• Task breakdown]
        EXEC[ExecutorAgent<br/>• Task execution<br/>• Tool orchestration<br/>• Goal-aware task generation]
        ANAL[AnalyzerAgent<br/>• Result synthesis<br/>• Response formatting<br/>• Quality assurance]
    end
    
    subgraph "Decision & Optimization Layer"
        MADEX[MultiAgentDecisionExecutor<br/>• Agent coordination<br/>• Schema loading<br/>• Context management]
        FDOPT[FastDecisionOptimizer<br/>• Single-step optimization<br/>• Simple query handling<br/>• Circuit breaker]
        DCONT[DecisionContext<br/>• Schema context<br/>• RAG context<br/>• Session state]
    end
    
    subgraph "LLM Integration Layer"
        LLMF[LLMFactory<br/>• Provider selection<br/>• Model configuration]
        CLAUDE[ClaudeLLM<br/>• Anthropic API<br/>• Intelligent analytics<br/>• Subagent orchestration]
        GPT[OpenAILLM<br/>• GPT models<br/>• Function calling]
        GEMINI[GeminiLLM<br/>• Google AI<br/>• Tiered models<br/>• Cost optimization]
        GROQ[GroqLLM<br/>• Fast inference<br/>• Open models]
    end
    
    subgraph "MCP Server Layer"
        MCPS[MCP Server<br/>packages/mcp-server/src/index.js]
        TOOLS[Tool Manager<br/>• Tool registration<br/>• Tool execution<br/>• Result formatting]
        TASK[TaskPlanner<br/>• Task lifecycle<br/>• Dependency management<br/>• Status tracking]
        SEQ[SequentialThinker<br/>• 5-phase analysis<br/>• Structured thinking]
        LOOP[LoopDetector<br/>• Pattern detection<br/>• Infinite loop prevention]
    end
    
    subgraph "Data & Storage Layer"
        NEO4J[Neo4j Knowledge Graph<br/>• Team-scoped memory<br/>• Knowledge relationships<br/>• Schema integration]
        MONGO[MongoDB<br/>• Session persistence<br/>• Conversation history<br/>• Performance logs]
        DUCK[DuckDB<br/>• Local analytics<br/>• CSV/Parquet support<br/>• SQL queries]
        FILES[File Providers<br/>• Local files<br/>• HTTP downloads<br/>• Aden platform files]
    end
    
    subgraph "Supporting Components"
        GOAL[GoalAwareTaskGenerator<br/>• Gap analysis<br/>• Strategic planning<br/>• Verification tasks]
        ACTX[AgentContext<br/>• Session management<br/>• File tracking<br/>• Team context]
        PERF[PerformanceLogger<br/>• Latency tracking<br/>• Pipeline stages<br/>• Optimization metrics]
        CONV[ConversationLogger<br/>• Session recording<br/>• Tool call tracking<br/>• Debug logging]
    end
    
    CLI --> MADEX
    API --> MADEX
    MADEX --> COORD
    MADEX --> FDOPT
    
    COORD --> PLAN
    COORD --> EXEC
    COORD --> ANAL
    
    PLAN --> ACTX
    EXEC --> ACTX
    EXEC --> GOAL
    ANAL --> ACTX
    
    MADEX --> DCONT
    DCONT --> NEO4J
    DCONT --> MONGO
    
    ACTX --> MCPS
    MCPS --> TOOLS
    TOOLS --> TASK
    TOOLS --> SEQ
    TOOLS --> LOOP
    
    PLAN --> LLMF
    EXEC --> LLMF
    ANAL --> LLMF
    
    LLMF --> CLAUDE
    LLMF --> GPT
    LLMF --> GEMINI
    LLMF --> GROQ
    
    TOOLS --> DUCK
    TOOLS --> FILES
    TOOLS --> NEO4J
    
    MADEX --> PERF
    COORD --> PERF
    ACTX --> CONV
```

### Analytics Query Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant MultiAgent as MultiAgentDecisionExecutor
    participant Schema as Neo4j Schema Service
    participant Plan as PlannerAgent
    participant Exec as ExecutorAgent
    participant Analytics as Analytics Subagent
    participant MCP as MCP Tools
    participant DB as Databases
    participant Anal as AnalyzerAgent
    
    User->>CLI: "Show me revenue by product last quarter"
    CLI->>MultiAgent: chat(analyticsQuery)
    
    Note over MultiAgent: Detect business/analytics keywords
    
    MultiAgent->>Schema: loadSchemaContext()
    Schema->>DB: graph_export
    DB-->>Schema: Database ontology
    Schema-->>MultiAgent: Schema context
    
    MultiAgent->>Plan: createAnalyticsPlan(query, schema)
    Plan->>Plan: Analyze intent
    Plan->>Plan: Identify required data sources
    Plan-->>MultiAgent: Execution plan with queries
    
    MultiAgent->>Exec: executeAnalytics(plan)
    
    par Parallel Query Execution
        Exec->>Analytics: Generate SQL for revenue data
        Analytics->>MCP: db_query(revenueSQL)
        MCP->>DB: PostgreSQL query
        DB-->>MCP: Revenue results
    and
        Exec->>Analytics: Generate SQL for product data
        Analytics->>MCP: db_query(productSQL)
        MCP->>DB: PostgreSQL query
        DB-->>MCP: Product results
    and
        Exec->>MCP: search_memories(context)
        MCP->>DB: Neo4j knowledge query
        DB-->>MCP: Historical context
    end
    
    MCP-->>Exec: Aggregated results
    Exec->>Analytics: Synthesize insights
    Analytics-->>Exec: Business analysis
    
    Exec->>Anal: formatResults(data, insights)
    Anal->>Anal: Generate visualizations
    Anal->>Anal: Create recommendations
    Anal-->>User: Formatted analytics response
```

### Tool Ecosystem

```mermaid
graph LR
    subgraph "Core MCP Tools"
        THINK[think_sequentially<br/>5-phase analysis]
        PLAN_T[plan_tasks<br/>Task planning]
        EXEC_T[execute_task<br/>Task execution]
        STATUS[get_task_status<br/>Progress tracking]
    end
    
    subgraph "File System Tools"
        READ[read_file<br/>Session-scoped]
        WRITE[write_file<br/>Session-scoped]
        LIST[list_directory<br/>Directory listing]
        CMD[execute_command<br/>Safe commands only]
    end
    
    subgraph "Memory & Knowledge Tools"
        SEARCH[search_memories<br/>Team-scoped search]
        REMEMBER[remember<br/>Store knowledge]
        GRAPH_E[graph_export<br/>Schema export]
        GRAPH_Q[graph_query<br/>Neo4j queries]
    end
    
    subgraph "Analytics Tools"
        DB_Q[db_query<br/>PostgreSQL queries]
        DUCK_Q[duckdb_query<br/>Local analytics]
        CSV[csv_analytics<br/>CSV processing]
        VISUAL[create_visualization<br/>Chart generation]
    end
    
    subgraph "Integration Tools"
        RAG[rag_query<br/>Document search]
        TEAM_SYNC[team_graph_sync<br/>Graph synchronization]
        FILE_DL[download_file<br/>Multi-provider downloads]
        MERMAID[validate_mermaid<br/>Diagram validation]
    end
```

### Performance Optimization Features

```mermaid
graph TD
    subgraph "Optimization Strategies"
        TIER[Tiered Model Selection<br/>• Planning: Pro/Sonnet models<br/>• Execution: Flash/Haiku models<br/>• Simple: Fastest models]
        
        PARA[Parallel Execution<br/>• Independent tool calls<br/>• Concurrent agent tasks<br/>• Batch operations]
        
        CACHE[Caching Layers<br/>• Schema caching 5min TTL<br/>• Decision pattern cache<br/>• Tool result cache]
        
        CIRC[Circuit Breaker<br/>• Fast failure detection<br/>• Automatic recovery<br/>• Retry prevention]
        
        FAST[Fast Path Optimization<br/>• Single-step bypass<br/>• Direct tool execution<br/>• Skip multi-agent for simple queries]
    end
    
    TIER --> COST[60-80% cost reduction]
    PARA --> LAT[70% latency reduction]
    CACHE --> PERF[<10ms schema access]
    CIRC --> REL[Improved reliability]
    FAST --> SPEED[70-80% faster simple queries]
```

## 🔧 Core Analytics Components

### Intelligent Analytics Subagent (`/packages/agent-client/src/llm/claude-llm.js`)
The AI-powered database intelligence system that:
- Automatically detects business and analytics questions
- Generates schema-aware SQL queries
- Orchestrates multi-tool analytical workflows
- Synthesizes data into actionable insights

### MultiAgentDecisionExecutor (`/packages/agent-client/src/decision-executor/multi-agent-decision-executor.js`)
Advanced orchestration layer that:
- Routes analytics queries through specialized agents
- Manages parallel database connections
- Optimizes query execution paths
- Maintains session context and team isolation

### Neo4j Schema Service (`/packages/agent-client/src/decision-executor/neo4j-schema-service.js`)
Schema intelligence engine that:
- Exports database ontology in real-time
- Maps table relationships and foreign keys
- Provides column metadata and constraints
- Enables intelligent JOIN generation

### MCP Database Tools (`/packages/mcp-server/src/index.js`)
Comprehensive data access layer providing:
- `db_query`: PostgreSQL query execution with parameterization
- `duckdb_query`: Local analytics on CSV/Parquet files
- `graph_export`: Schema discovery and relationship mapping
- `search_memories`: Team knowledge retrieval from Neo4j

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

## 💡 Framework Capabilities

### 🎯 Aden Platform Integration
The framework is purpose-built for the Aden analytics platform, providing:
- **Native JWT Authentication**: Seamless integration with Aden's team-based security model
- **Platform File Access**: Direct access to Aden-hosted datasets and reports
- **Team Knowledge Graphs**: Organizational memory that grows with every interaction
- **Enterprise Schema Management**: Automatic discovery and navigation of complex business databases

### 🚀 Advanced Analytics Features
- **Natural Language to SQL**: Transform business questions into optimized database queries
- **Multi-Database Federation**: Query across PostgreSQL, DuckDB, Neo4j, and MongoDB in a single request
- **Intelligent Query Planning**: AI agents that understand database relationships and optimize JOIN operations
- **Real-time Schema Discovery**: Dynamic exploration of database structure without manual configuration
- **Parallel Query Execution**: Concurrent data retrieval for 70-80% faster response times

### 🤖 Multi-Agent Intelligence
- **Specialized Analytics Agents**: Purpose-built agents for planning, execution, and synthesis
- **Autonomous Workflow Orchestration**: Agents collaborate to solve complex analytical problems
- **Context-Aware Responses**: Agents maintain conversation history and team knowledge
- **Adaptive Model Selection**: Automatic selection of optimal AI models based on query complexity

### 📊 Business Intelligence Capabilities
- **Automated Insight Discovery**: Proactive identification of trends, anomalies, and opportunities
- **Cross-Functional Analysis**: Combine sales, customer, operational, and financial data
- **Visualization Generation**: Automatic creation of charts and dashboards from query results
- **Predictive Analytics**: Leverage historical data for forecasting and trend analysis
- **Export & Reporting**: Generate formatted reports in multiple formats

### 🔒 Enterprise Security & Governance
- **Team-Level Data Isolation**: Secure multi-tenant architecture with JWT-based access control
- **Audit Trail**: Complete logging of all queries and data access
- **Session Management**: Isolated workspaces for secure data processing
- **Compliance Ready**: Built-in support for data governance and regulatory requirements

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