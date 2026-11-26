import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  SERVER_RELEASE_TARGETS,
  serverCompileArgs,
} from "../build-server-release.ts";
import { E2E_ENGINES, planE2eRuns } from "../e2e-parallel.ts";

test("planE2eRuns assigns distinct ports, web build dirs and project flags per engine", () => {
  const plans = planE2eRuns({
    basePort: 4800,
    webDirs: {
      chromium: "/tmp/c",
      firefox: "/tmp/f",
      webkit: "/tmp/w",
    },
    extraArgs: ["smoke"],
  });
  expect(E2E_ENGINES).toEqual(["chromium", "firefox", "webkit"]);
  expect(plans).toEqual([
    {
      engine: "chromium",
      port: 4800,
      webDir: "/tmp/c",
      args: [
        "run",
        "--filter",
        "@manent/e2e",
        "test",
        "--project",
        "chromium",
        "smoke",
      ],
    },
    {
      engine: "firefox",
      port: 4810,
      webDir: "/tmp/f",
      args: [
        "run",
        "--filter",
        "@manent/e2e",
        "test",
        "--project",
        "firefox",
        "smoke",
      ],
    },
    {
      engine: "webkit",
      port: 4820,
      webDir: "/tmp/w",
      args: [
        "run",
        "--filter",
        "@manent/e2e",
        "test",
        "--project",
        "webkit",
        "smoke",
      ],
    },
  ]);
});

test("serverCompileArgs targets all six release platforms with deterministic outfiles", () => {
  expect(SERVER_RELEASE_TARGETS).toEqual([
    "bun-darwin-arm64",
    "bun-darwin-x64",
    "bun-linux-x64",
    "bun-linux-arm64",
    "bun-windows-x64",
    "bun-windows-arm64",
  ]);
  expect(serverCompileArgs("bun-linux-arm64", "server")).toEqual([
    "build",
    "--compile",
    "--minify",
    "--bytecode",
    "--format=esm",
    "--target=bun-linux-arm64",
    "apps/server/src/main.ts",
    "apps/server/src/checkpoint-worker.ts",
    "--outfile",
    join("server", "manent-linux-arm64"),
  ]);
});
