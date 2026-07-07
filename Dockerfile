# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: production ───────────────────────────────────────────────────────
# Ubuntu, not Debian/Alpine: MongoDB only publishes official arm64 packages
# for Ubuntu, and this image needs to run on both amd64 and arm64 hosts.
FROM ubuntu:22.04 AS production

WORKDIR /app

ENV NODE_ENV=production
ENV MONGODB_URI="mongodb://127.0.0.1:27017/carenoww?replicaSet=rs0"
ENV DEBIAN_FRONTEND=noninteractive

# Node.js 20 (NodeSource) + MongoDB 7.0 (mongod + mongosh)
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl gnupg ca-certificates wget \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg \
    && echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
      > /etc/apt/sources.list.d/mongodb-org-7.0.list \
    && apt-get update && apt-get install -y --no-install-recommends \
      mongodb-org-server mongodb-mongosh \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/db

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5031

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5031/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
