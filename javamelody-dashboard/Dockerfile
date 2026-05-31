# ── Estágio 1: build Angular ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build -- --configuration=production

# ── Estágio 2: nginx para servir os estáticos ─────────────────────────────────
FROM nginx:1.27-alpine AS runner

LABEL maintainer="JavaMelody Monitor"
LABEL description="Dashboard Angular — servido via nginx"

# Remove config padrão do nginx
RUN rm /etc/nginx/conf.d/default.conf

# Config customizada para SPA (redireciona tudo para index.html)
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copia build do Angular
COPY --from=builder /app/dist/javamelody-dashboard/browser /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
