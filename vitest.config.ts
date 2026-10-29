import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/fast/**/*.test.ts"], environment: "node" },
});
