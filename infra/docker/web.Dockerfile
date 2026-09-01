FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/sale-scheduler-web/package.json apps/sale-scheduler-web/package.json
COPY apps/sale-scheduler-worker/package.json apps/sale-scheduler-worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/colorme-api/package.json packages/colorme-api/package.json
COPY packages/colorme-auth/package.json packages/colorme-auth/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/jobs/package.json packages/jobs/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @sale-scheduler/web build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/sale-scheduler-web/.next/standalone ./
COPY --from=build /app/apps/sale-scheduler-web/.next/static ./apps/sale-scheduler-web/.next/static
EXPOSE 3000
USER node
CMD ["node", "apps/sale-scheduler-web/server.js"]
