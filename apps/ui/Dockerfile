FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/ui/package.json ./apps/ui/

RUN npm ci --ignore-scripts

COPY packages/shared ./packages/shared
COPY apps/ui ./apps/ui

RUN npm run build --workspace=apps/ui

# ---- Runtime: serve with nginx ----
FROM nginx:alpine AS runtime

COPY --from=build /app/apps/ui/dist /usr/share/nginx/html

# Nginx config for SPA routing + API proxy
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5173
