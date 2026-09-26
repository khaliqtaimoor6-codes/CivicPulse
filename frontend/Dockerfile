# Build the Vite application, then serve its static output with nginx.
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS serve
# nginx:alpine pins an older alpine package set than the one carrying the
# libexpat fix for CVE-2026-93990 (2.8.5-r0). Upgrade on top of the tag so the
# image is not left holding a HIGH severity CVE that alpine has already fixed.
RUN apk upgrade --no-cache
COPY --from=build /app/dist /usr/share/nginx/html
# nginx:alpine envsubst processes templates from this directory at startup.
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
