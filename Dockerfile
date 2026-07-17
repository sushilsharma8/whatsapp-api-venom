# Venom-bot needs Chromium — use Debian-based Node, not Alpine
FROM node:18-bookworm-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- runtime ---
FROM node:18-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Persist WhatsApp session + media downloads via Railway volumes
RUN mkdir -p /app/tokens /tmp/whatsapp-files \
    && chown -R node:node /app /tmp/whatsapp-files

USER node

EXPOSE 3000

CMD ["node", "dist/main"]
