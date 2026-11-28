// The build of the desktop app. The version and the update address are set in the environment by the build script.
const debugFlags: Record<string, string> = process.env.MANENT_DEBUG_PORT
  ? { "remote-debugging-port": process.env.MANENT_DEBUG_PORT }
  : {};

const urlSchemes: string[] = ["manent"];
const fileAssociations: Array<{
  ext: string[];
  name: string;
  role: "Editor";
}> = [
  { ext: ["fdx"], name: "Final Draft Script", role: "Editor" },
  { ext: ["fountain"], name: "Fountain Script", role: "Editor" },
  { ext: ["ink"], name: "Ink Interactive Script", role: "Editor" },
  { ext: ["docx"], name: "Word Document", role: "Editor" },
];

export default {
  app: {
    name: "Manent",
    identifier: "app.manent.desktop",
    version: process.env.MANENT_BUILD_VERSION ?? "0.0.0",
    urlSchemes,
    fileAssociations,
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
    mac: {
      bundleCEF: true,
      defaultRenderer: "cef",
      chromiumFlags: debugFlags,
      icons: "icon.iconset",
    },
    win: { bundleCEF: true, defaultRenderer: "cef", icon: "assets/icon.png" },
    linux: { bundleCEF: true, defaultRenderer: "cef", icon: "assets/icon.png" },
  },
  runtime: { exitOnLastWindowClosed: true },
  release: {
    baseUrl: process.env.MANENT_UPDATE_BASE_URL ?? "",
    generatePatch: false,
  },
} as const;
