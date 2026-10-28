FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@11.28.9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,id=roveran-pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 WEB_DIST=/app/apps/web/dist
WORKDIR /app
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/migrations /app/apps/api/migrations
COPY --from=build /app/apps/web/dist /app/apps/web/dist
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
