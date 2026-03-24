FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/agent/package.json ./apps/agent/

RUN npm ci --ignore-scripts

COPY packages/shared ./packages/shared
COPY apps/agent ./apps/agent

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/agent

# ---- Runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=base /app/apps/agent/dist ./apps/agent/dist
COPY --from=base /app/apps/agent/package.json ./apps/agent/package.json

WORKDIR /app/apps/agent

ENV NODE_ENV=production
# No EXPOSE — agent is outbound-only, no inbound ports

CMD ["node", "dist/apps/agent/src/main.js"]
