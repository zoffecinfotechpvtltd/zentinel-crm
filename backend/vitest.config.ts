import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // node_modules/pdf-parse's package entry (index.js) has a long-standing
      // upstream bug: on load it checks `module.parent` to guess whether it's
      // being run as a CLI script, and under Vitest's SSR module loader that
      // check is always falsy — so it synchronously tries to read a fixture
      // PDF bundled with the *pdf-parse* npm package's own test suite (not
      // this repo's), which isn't present, and throws ENOENT. That crashes
      // every test that imports the app (app.ts -> routes/invoices.ts ->
      // "pdf-parse"), including this harness's smoke test. Aliasing straight
      // to pdf-parse's actual implementation module skips that dead debug
      // branch entirely — it's the exact same function index.js re-exports,
      // so behavior is unchanged; only the buggy top-level side effect is
      // avoided. Confirmed via ENOENT stack trace pointing at
      // pdf-parse/index.js before this alias was added.
      "pdf-parse": path.resolve(__dirname, "node_modules/pdf-parse/lib/pdf-parse.js"),
    },
  },
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
