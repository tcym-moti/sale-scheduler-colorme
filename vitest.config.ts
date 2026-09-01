import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = resolve(import.meta.dirname);

export default defineConfig({
  resolve: {
    alias: {
      "@sale-scheduler/shared": resolve(root, "packages/shared/src/index.ts"),
      "@sale-scheduler/colorme-api": resolve(root, "packages/colorme-api/src/index.ts"),
      "@sale-scheduler/colorme-auth": resolve(root, "packages/colorme-auth/src/index.ts"),
      "@sale-scheduler/database": resolve(root, "packages/database/src/index.ts"),
      "@sale-scheduler/jobs": resolve(root, "packages/jobs/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: { reporter: ["text", "json-summary"] }
  }
});
