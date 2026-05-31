# ── Estágio único — BFF é leve, sem build step ───────────────────────────────
FROM node:22-alpine

LABEL maintainer="JavaMelody Monitor"
LABEL description="BFF — autenticação JSF + proxy JavaMelody + persistência MongoDB"

WORKDIR /app

# Copia manifesto e instala dependências de produção apenas
COPY package*.json ./
RUN npm ci --omit=dev

# Copia código-fonte (exclui o que está no .dockerignore)
COPY . .

# Usuário não-root por segurança
RUN addgroup -S bff && adduser -S bff -G bff
USER bff

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
