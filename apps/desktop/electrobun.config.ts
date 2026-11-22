// The build of the desktop app. The version and the update address are set in the environment by the build script.
const debugFlags: Record<string, string> = process.env.MANENT_DEBUG_PORT
  ? { "remote-debugging-port": process.env.MANENT_DEBUG_PORT }
  : {};

export default {
  app: {
    name: "Manent",
    identifier: "app.manent.desktop",
    version: process.env.MANENT_BUILD_VERSION ?? "0.0.0",
  },
  build: {
    bun: { entrypoint: "src/shell/main.ts" },
    copy: {
      "build/stage/web": "web",
      "build/stage/cloud": "cloud",
      "build/stage/seed": "seed",
      "build/stage/THIRD-PARTY-NOTICES.txt": "THIRD-PARTY-NOTICES.txt",
      "build/stage/build.json": "build.json",
    },
    mac: { bundleCEF: true, defaultRenderer: "cef", chromiumFlags: debugFlags },
    win: { bundleCEF: true, defaultRenderer: "cef" },
    linux: { bundleCEF: true, defaultRenderer: "cef" },
  },
  runtime: { exitOnLastWindowClosed: true },
  release: {
    baseUrl: process.env.MANENT_UPDATE_BASE_URL ?? "",
    generatePatch: false,
  },
} as const;
