FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine

RUN apk add --no-cache apache2-utils gettext

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
# Strip Windows CRLF line endings and make executable
RUN tr -d '\r' < /docker-entrypoint.sh > /tmp/ep.sh && mv /tmp/ep.sh /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# BACKEND_HOST: service name to proxy /api/ to (default works for docker-compose)
ENV BACKEND_HOST=backend
ENV AUTH_USER=""
ENV AUTH_PASS=""

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
