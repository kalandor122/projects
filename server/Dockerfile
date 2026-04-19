# Stage 1: Build
FROM node:20 AS builder

WORKDIR /app

# Copy package files and install ALL dependencies
COPY package*.json ./
RUN npm install

# Copy source code and other required files
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

# Copy built assets and necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db ./db

# Expose port
EXPOSE 3001

# Command to run the application
CMD ["npm", "start"]
