FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/sale-scheduler-web/package.json apps/sale-scheduler-web/package.json
COPY apps/sale-scheduler-worker/package.json apps/sale-scheduler-worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/colorme-api/package.json packages/colorme-api/package.json
COPY packages/colorme-auth/package.json packages/colorme-auth/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/jobs/package.json packages/jobs/package.json
RUN pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "db:migrate"]
