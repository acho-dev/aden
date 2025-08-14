# Multi-stage build for the complete Aden MCP project
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy all package.json files and install dependencies
COPY package*.json ./
COPY client/package*.json ./client/
COPY api-server/package*.json ./api-server/

# Install dependencies for all modules
RUN npm ci || echo "Root package install optional"

WORKDIR /app/client
RUN npm ci

WORKDIR /app/api-server
RUN npm ci

# Production stage
FROM node:18-alpine

# Install curl and mongodb tools for health checks
RUN apk add --no-cache curl mongodb-tools

# Create app directory and user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 && \
    mkdir -p /app && \
    chown -R nextjs:nodejs /app

WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/client/node_modules ./client/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/api-server/node_modules ./api-server/node_modules

# Copy source code
COPY --chown=nextjs:nodejs ./src ./src
COPY --chown=nextjs:nodejs ./client/src ./client/src
COPY --chown=nextjs:nodejs ./client/config ./client/config
COPY --chown=nextjs:nodejs ./client/package*.json ./client/
COPY --chown=nextjs:nodejs ./api-server/src ./api-server/src
COPY --chown=nextjs:nodejs ./api-server/package*.json ./api-server/
COPY --chown=nextjs:nodejs ./package*.json ./

# Set working directory to api-server
WORKDIR /app/api-server

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Start the API server
CMD ["npm", "start"]