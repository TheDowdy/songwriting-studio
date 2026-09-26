# syntax=docker/dockerfile:1

# ---- Build: type-check and bundle the app to static files ------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Serve: nginx on port 8080 ---------------------------------------------------------------
# The "unprivileged" nginx image runs as a normal user and listens on 8080 by default.
FROM nginxinc/nginx-unprivileged:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/fluid-frets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
