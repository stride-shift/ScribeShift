# ScribeShift background generation worker — deploys to Google Cloud Run.
# `gcloud run deploy --source .` auto-detects this Dockerfile.
# (Vercel ignores this file; it builds the web app with vite, not Docker.)
FROM node:20-slim

WORKDIR /app

# Install production deps only.
COPY package*.json ./
RUN npm ci --omit=dev

# The worker only needs the server code.
COPY server ./server

# A tiny health server keeps Cloud Run happy; the real work is the poll loop.
CMD ["node", "server/worker.js"]
