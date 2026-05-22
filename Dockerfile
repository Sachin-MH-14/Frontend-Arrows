# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

# Vite bakes VITE_* at build time (--mode prod reads .env.prod)
COPY .env.prod .env.prod
COPY . .

RUN npm run build

# Serve stage: nginx + Superset guest-token helper (same behavior as npm run dev proxy)
FROM nginx:alpine

RUN apk add --no-cache nodejs gettext wget

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY scripts/superset-guest-token-server.mjs /app/scripts/superset-guest-token-server.mjs
COPY .env.prod /etc/arrows/env.prod

RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
