# ── Estágio 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Estágio 2: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

LABEL maintainer="JavaMelody Monitor"
LABEL description="History API — NestJS + MongoDB"

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copia apenas o build compilado
COPY --from=builder /app/dist ./dist

RUN addgroup -S api && adduser -S api -G api
USER api

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/docs-json || exit 1

CMD ["node", "dist/main"]
