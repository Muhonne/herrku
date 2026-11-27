FROM node:24-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 13 compiles from source (no prebuilt binary), so the builder
# needs a toolchain. The runtime stage copies the compiled node_modules and
# never needs these tools.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
COPY mcp/package.json ./mcp/package.json

RUN npm ci --include=dev
RUN npm rebuild better-sqlite3 sharp esbuild

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000

RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
COPY mcp/package.json ./mcp/package.json

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/mcp/dist ./mcp/dist
COPY migrations ./migrations

RUN mkdir -p /data && chown -R node:node /app /data

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/dist/index.js"]
