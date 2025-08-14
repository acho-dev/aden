# Environment Configuration

This monorepo uses consolidated environment configuration at the root level. All packages share the same environment variables.

## Environment Files

### Root Level (Recommended)
- `.env` - Local development environment (ignored by git)
- `.env.example` - Template with all available variables and documentation
- `.env.dev` - Development environment configuration
- `.env.prod` - Production environment configuration (ignored by git)

### Package Level (Deprecated)
⚠️ **Package-level .env files have been removed.** All environment configuration is now centralized at the monorepo root.

## Setup Instructions

### 1. Initial Setup
```bash
# Copy the example file
cp .env.example .env

# Edit with your values
nano .env
```

### 2. Environment-Specific Setup

For **development**:
```bash
cp .env.dev .env
# Or load specific environment
NODE_ENV=development npm start
```

For **production**:
```bash
cp .env.prod .env
# Or load specific environment  
NODE_ENV=production npm start
```

## Configuration Sections

### Core API Configuration (Required)
```bash
ADEN_HOST=https://your-api-host.com
ADEN_API_TOKEN=your_jwt_token_here
ADEN_JWT_TOKEN=your_jwt_token_here
```

### LLM API Keys (Required for AI features)
```bash
# Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_api_key_here
CLAUDE_MODEL=claude-3-5-sonnet-20241022

# Google Gemini
GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# OpenAI GPT
OPENAI_API_KEY=your_openai_api_key_here

# Groq (for fast execution)
GROQ_API_KEY=your_groq_api_key_here
```

### Database Configuration
```bash
# Neo4j Knowledge Graph
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_neo4j_password_here
NEO4J_DATABASE=contextdb

# MongoDB (for session persistence)
MONGODB_URL=mongodb://localhost:27017
```

### MCP Server Configuration
```bash
LLM_PROVIDER=claude
MCP_SERVER_PATH=../mcp-server/src/index.js
MCP_TIMEOUT=60000
```

## Package-Specific Behavior

### How Packages Load Environment Variables

#### Agent Client (`packages/agent-client`)
- First checks: `../../../.env` (root)
- Fallback: `../.env` (package level - deprecated)
- Configuration: `src/config.js` and `src/config-loader.js`

#### API Server (`packages/api-server`)
- Loads: `../../../.env` (root)
- Configuration: `src/server.js`

#### MCP Server (`packages/mcp-server`)
- Loads: `../../../.env` (root)
- Configuration: `src/index.js`

## Running Commands

### From Root Directory
```bash
# All packages will use ./env
npm run start:server
npm run start:client
npm run start:api
```

### From Package Directory
```bash
# Agent client will use ../../.env (root)
cd packages/agent-client
npm start

# API server will use ../../.env (root)  
cd packages/api-server
npm start

# MCP server will use ../../.env (root)
cd packages/mcp-server
npm start
```

## Environment Variable Priority

1. **Process environment variables** (highest priority)
2. **Root .env file** (`.env`)
3. **Package config.json overrides**
4. **Default values in code** (lowest priority)

## Development vs Production

### Development Environment
- Uses local database instances
- Debug logging enabled
- Development-specific API endpoints
- Local Neo4j or Aura development instance

### Production Environment
- Production database connections
- Optimized logging levels
- Production API endpoints
- Production Neo4j Aura instance

## Security Best Practices

1. **Never commit .env files** (except .env.example)
2. **Use different tokens for dev/prod**
3. **Rotate API keys regularly**
4. **Use environment-specific databases**
5. **Keep JWT tokens up to date**

## Migration Notes

### From Package-Level .env Files
If you previously had package-level .env files:

1. ✅ **Consolidated**: All variables moved to root `.env`
2. ✅ **Removed**: All `packages/*/.env` files deleted
3. ✅ **Updated**: All packages now read from root
4. ✅ **Tested**: All services working with root configuration

### Path Changes
- **Old**: `MCP_SERVER_PATH=../src/index.js`
- **New**: `MCP_SERVER_PATH=../mcp-server/src/index.js`

The path is relative to where the package runs, so from `packages/agent-client`, `../mcp-server/src/index.js` correctly points to the MCP server.

## Troubleshooting

### Common Issues

**MCP Server not found:**
```bash
# Check if MCP_SERVER_PATH is correct relative to package directory
# From packages/agent-client, it should be: ../mcp-server/src/index.js
```

**Environment variables not loading:**
```bash
# Check if .env exists at root
ls -la .env

# Check if package is looking in right place
# Should be ../../../.env from package/src/ directories
```

**Authentication errors:**
```bash
# Check if ADEN_JWT_TOKEN is set and valid
echo $ADEN_JWT_TOKEN

# Update expired tokens
# Copy fresh token from Aden platform
```

### Debug Environment Loading
```bash
# Check what environment file is being loaded
node -e "
const path = require('path');
const __dirname = process.cwd();
console.log('Current dir:', __dirname);
console.log('Looking for .env at:', path.join(__dirname, '../../../.env'));
console.log('Exists:', require('fs').existsSync(path.join(__dirname, '../../../.env')));
"
```