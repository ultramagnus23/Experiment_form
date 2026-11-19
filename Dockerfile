FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 AUDIO_DIR=/data/audio
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /data/audio && chown -R node:node /data /app
USER node
VOLUME ["/data/audio"]
EXPOSE 3000
# Apply pending migrations, then start. Migrations are idempotent and take an advisory lock.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node_modules/.bin/next start -p 3000"]
