import type { ElectrobunConfig } from "electrobun"

// Bundled Chromium on every system, with hidden windows never throttled; SPIKE_DEBUG_PORT opens a debugging port.
const CEF = {
  bundleCEF: true,
  defaultRenderer: "cef",
  chromiumFlags: {
    "disable-backgrounding-occluded-windows": true,
    "disable-renderer-backgrounding": true,
    ...(process.env.SPIKE_DEBUG_PORT ? { "remote-debugging-port": process.env.SPIKE_DEBUG_PORT } : {}),
  },
} as const

export default {
  app: { name: "ManentSpike", identifier: "dev.manent.spike01", version: process.env.SPIKE_VERSION ?? "0.0.1" },
  build: { bun: { entrypoint: "electrobun/src/main.ts" }, copy: { "shared/page": "page" }, mac: CEF, win: CEF, linux: CEF },
  release: { baseUrl: "http://127.0.0.1:47471/", generatePatch: false },
} satisfies ElectrobunConfig
