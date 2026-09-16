FROM node:22-slim

WORKDIR /app

# Install dependencies first for efficient layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code
COPY . .

# Environment defaults
ENV NODE_ENV=production

# Run worker process
CMD ["node", "index.js"]
