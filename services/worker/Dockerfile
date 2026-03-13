FROM node:20-slim

# Install Playwright system dependencies (Chromium needs these)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json turbo.json ./

# Copy all package.json files for workspace resolution
COPY services/worker/package.json services/worker/
COPY packages/utils/package.json packages/utils/
COPY packages/queue/package.json packages/queue/
COPY packages/crawler/package.json packages/crawler/
COPY packages/screenshot-engine/package.json packages/screenshot-engine/
COPY packages/storage/package.json packages/storage/

# Install all dependencies
RUN npm install --omit=dev || npm install

# Install Playwright Chromium
RUN npx playwright install chromium

# Copy source code
COPY services/worker/ services/worker/
COPY packages/utils/ packages/utils/
COPY packages/queue/ packages/queue/
COPY packages/crawler/ packages/crawler/
COPY packages/screenshot-engine/ packages/screenshot-engine/
COPY packages/storage/ packages/storage/

# Create screenshots directory
RUN mkdir -p /tmp/screenshots

CMD ["npx", "tsx", "services/worker/src/index.ts"]
