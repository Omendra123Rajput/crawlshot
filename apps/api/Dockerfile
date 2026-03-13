FROM node:20-slim

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json turbo.json ./

# Copy all package.json files for workspace resolution
COPY apps/api/package.json apps/api/
COPY packages/utils/package.json packages/utils/
COPY packages/queue/package.json packages/queue/
COPY packages/storage/package.json packages/storage/
COPY packages/crawler/package.json packages/crawler/

# Install all dependencies
RUN npm install --omit=dev || npm install

# Copy source code
COPY apps/api/ apps/api/
COPY packages/utils/ packages/utils/
COPY packages/queue/ packages/queue/
COPY packages/storage/ packages/storage/
COPY packages/crawler/ packages/crawler/

EXPOSE 3001

CMD ["npx", "tsx", "apps/api/src/index.ts"]
