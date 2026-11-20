// End-to-end tests in three browsers, against one demo started on ports of its own.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { E2E_CONTROL_PORT, E2E_PORT } from "./support/ports.ts";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { baseURL: `http://localhost:${E2E_PORT}` },
  reporter: "line",
  // the tests stop and start the one server
  workers: 1,
  webServer: {
    command: `bun tools/demo/cli.ts demo --no-open --port ${E2E_PORT} --control-port ${E2E_CONTROL_PORT}`,
    env: { MANENT_DATA_DIR: mkdtempSync(join(tmpdir(), "manent e2e ")) },
    cwd: join(import.meta.dirname, ".."),
    // the server listens on 127.0.0.1, and a lookup of localhost may try ::1 first
    url: `http://127.0.0.1:${E2E_PORT}/health`,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
