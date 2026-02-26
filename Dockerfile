FROM oven/bun:1-slim AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

FROM base AS builder
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM base AS pruner
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-slim AS release
WORKDIR /app

USER bun

COPY --from=builder --chown=bun:bun /app/build ./build
COPY --from=pruner --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json .

EXPOSE 3000
ENV NODE_ENV=production

CMD [ "bun", "run", "build/index.js" ]