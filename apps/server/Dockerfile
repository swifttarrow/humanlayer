FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json ./
COPY tsconfig.base.json .eslintrc.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install all dependencies (workspaces)
RUN npm ci --ignore-scripts

# Copy source
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

# Build shared and server
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/server

# Generate Prisma client
RUN cd apps/server && npx prisma generate

# ---- Runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=base /app/apps/server/dist ./apps/server/dist
COPY --from=base /app/apps/server/package.json ./apps/server/package.json
COPY --from=base /app/apps/server/prisma ./apps/server/prisma

WORKDIR /app/apps/server

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
