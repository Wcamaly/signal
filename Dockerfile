FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV SIGNAL_DATA_DIR=/app/data

RUN groupadd --system --gid 1001 signal && \
    useradd --system --uid 1001 --gid signal signal

COPY --from=builder /app/public ./public
COPY --from=builder --chown=signal:signal /app/.next/standalone ./
COPY --from=builder --chown=signal:signal /app/.next/static ./.next/static
RUN mkdir /app/data && chown signal:signal /app/data

USER signal
EXPOSE 3000
CMD ["node", "server.js"]