# Use official Node.js runtime as base image
FROM node:22-alpine

# Set working directory in container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Change ownership of app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 8000

# Set environment variable
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start node directly, not through npm. The server flushes every unsaved
# account to the database when SIGTERM arrives (see server/saves.js), and
# npm as PID 1 relays signals unreliably -- a `docker stop` could kill
# the process without the flush ever running, losing the last seconds of
# work the in-memory design exists to protect.
CMD ["node", "server.js"]