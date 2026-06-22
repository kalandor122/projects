# Stage 1: Build
FROM node:20 AS builder

WORKDIR /app

# Copy package files and install ALL dependencies
COPY package*.json ./
RUN npm install

# Copy source code and config files
COPY tsconfig.json ./
COPY src ./src
COPY db ./db

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-slim AS runner

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --production

# Copy built assets and database schema
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db ./db

# Expose port
EXPOSE 3090

# Start the server
CMD ["node", "dist/index.js"]
