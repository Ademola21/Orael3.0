# ─────────────────────────────────────────────────────────────
#  Orael — Multi-stage Dockerfile
#  Builds the Vite frontend, then runs everything in one container
#  (server + bot + static frontend) via the start script.
# ─────────────────────────────────────────────────────────────

# ---- Stage 1: Build frontend ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install build tools for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++ libc6-compat

ARG VITE_ADSGRAM_BLOCK_ID
ARG VITE_ADSGRAM_TASK_BLOCK_ID

ENV VITE_ADSGRAM_BLOCK_ID=$VITE_ADSGRAM_BLOCK_ID
ENV VITE_ADSGRAM_TASK_BLOCK_ID=$VITE_ADSGRAM_TASK_BLOCK_ID

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---- Stage 2: Production runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

# Install runtime libs + build tools for compiling better-sqlite3
RUN apk add --no-cache libc6-compat curl tini python3 make g++

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && apk del python3 make g++ && npm cache clean --force

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy server source
COPY server ./server
COPY index.html ./
COPY src ./src
COPY vite.config.js ./
COPY orael_logo.svg ./

# Create data directory for SQLite
RUN mkdir -p /app/data
VOLUME /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --header="x-forwarded-proto: https" -qO- http://localhost:3000/api/health || exit 1

# Start both server and bot
CMD ["npm", "run", "start"]
