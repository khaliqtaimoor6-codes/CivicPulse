# Build the Vite application, then serve its static output with nginx.
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
# nginx:alpine envsubst processes templates from this directory at startup.
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
