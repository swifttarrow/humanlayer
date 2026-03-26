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

RUN apk add --no-cache git

# Create non-root user for agent execution
RUN addgroup -S agent && adduser -S agent -G agent

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=base /app/apps/agent/dist ./apps/agent/dist
COPY --from=base /app/apps/agent/package.json ./apps/agent/package.json

# Create workspace mount point with agent ownership
RUN mkdir -p /workspace && chown agent:agent /workspace

WORKDIR /app/apps/agent

ENV NODE_ENV=production
# Compose overrides HOME to /workspace/.humanlayer-agent so npx CLIs run from an exec-capable bind mount (tmpfs /tmp is often noexec).
ENV HOME=/workspace/.humanlayer-agent
ENV NPM_CONFIG_CACHE=/workspace/.humanlayer-agent/npm-cache
# No EXPOSE — agent is outbound-only, no inbound ports

USER agent

# Ensure npm home/cache dirs exist on the bind-mounted workspace (path is empty until first run).
CMD ["sh", "-c", "mkdir -p /workspace/.humanlayer-agent/npm-cache && exec node /app/apps/agent/dist/apps/agent/src/main.js"]
