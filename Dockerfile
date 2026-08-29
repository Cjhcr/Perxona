# Node.js LTS Slim Image
FROM node:22-alpine AS runner

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=8083

# Install dependencies first (better cache layer)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Expose service port
EXPOSE 8083

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

# Start application
CMD ["npm", "start"]
