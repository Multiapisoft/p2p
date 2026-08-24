# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget \
  && addgroup -S app \
  && adduser -S app -G app \
  && corepack enable \
  && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --config.dangerouslyAllowAllBuilds=true \
  && chown -R app:app /app
COPY --from=build --chown=app:app /app/dist ./dist
USER app
EXPOSE 9091
CMD ["node", "dist/main.js"]
