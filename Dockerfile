# Base image
FROM node:lts-alpine AS base

# 1. Install all dependencies (incl. dev) for building.
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build the source.
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Production dependencies only (drops eslint/prettier/typescript/etc.).
FROM base AS prod-deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 4. Minimal runtime image, running as an unprivileged user.
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4321
ENV HOST=0.0.0.0

# Don't run production as root.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 astro

COPY --from=prod-deps --chown=astro:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=astro:nodejs /app/dist ./dist
COPY --from=builder --chown=astro:nodejs /app/package.json ./package.json

USER astro

EXPOSE 4321

# Liveness probe: the server should answer the root route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "./dist/server/entry.mjs"]
