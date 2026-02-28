# Stage 1: Build and compile
FROM node:24.11.0-alpine AS build

# Install build tools required by better-sqlite3 native addon
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files and install all dependencies (including devDependencies)
COPY server/package.json server/package-lock.json ./
RUN npm ci

# Copy source and TypeScript config, then compile
COPY server/tsconfig.json ./
COPY server/src/ ./src/
RUN npm run build

# Stage 2: Production dependencies only
FROM node:24.11.0-alpine AS deps

# Install build tools required by better-sqlite3 native addon
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Stage 3: Production image
FROM node:24.11.0-alpine

WORKDIR /app

# Copy production node_modules (with pre-compiled better-sqlite3 native addon)
COPY --from=deps /app/node_modules ./node_modules

# Copy compiled JavaScript output and remove unnecessary TypeScript artifacts
COPY --from=build /app/dist ./dist
RUN find dist -name '*.d.ts' -o -name '*.d.ts.map' -o -name '*.js.map' | xargs rm -f

# Copy package.json for Node.js module resolution
COPY server/package.json ./

# Create data directory for SQLite persistence (EFS mount point in production)
RUN mkdir -p /app/data && chown node:node /app/data

# Environment variables (no secrets baked in)
ENV PORT=3000
ENV SQLITE_DB_PATH=/app/data/food-cache.db
# USDA_API_KEY and ISSUER_URL must be provided at runtime

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

# Run as non-root user
USER node

ENTRYPOINT ["node", "dist/index.js"]
