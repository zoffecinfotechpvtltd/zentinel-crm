import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "./src/test-support/globalSetup.ts",
    testTimeout: 20000,
    hookTimeout: 20000,
    // All test files share ONE embedded Postgres instance (started once in
    // globalSetup) and every file's afterEach TRUNCATEs the whole database.
    // Vitest runs test FILES in parallel by default — with that on, one
    // file's TRUNCATE would wipe data another file's test is mid-assertion
    // on. Every route-module task in this plan depends on this being off.
    fileParallelism: false,
  },
});
