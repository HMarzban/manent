// The build of the desktop app. The version and the update address are set in the environment by the build script.
const memoryFlags: Record<string, string | boolean> = {
  "disable-features": "SpareRendererForSitePerProcess,BackForwardCache",
  "renderer-process-limit": "1",
  "disk-cache-size": "16777216",
};
const debugFlags: Record<string, string | boolean> = process.env
  .MANENT_DEBUG_PORT
  ? { "remote-debugging-port": process.env.MANENT_DEBUG_PORT }
  : {};
const chromiumFlags: Record<string, string | boolean> = {
  ...memoryFlags,
  ...debugFlags,
};
// Electrobun's Linux launcher preloads libvk_swiftshader.so; disable Vulkan so Ubuntu 24.04
// stack-protected helpers do not abort in software/Xvfb environments, and allow CI to skip GPU.
const linuxChromiumFlags: Record<string, string | boolean> = {
  ...chromiumFlags,
  "disable-features": "SpareRendererForSitePerProcess,BackForwardCache,Vulkan",
  "disable-vulkan": true,
  ...(process.env.MANENT_CEF_DISABLE_GPU === "1"
    ? { "disable-gpu": true, "disable-gpu-compositing": true }
    : {}),
};

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
      chromiumFlags,
      icons: "icon.iconset",
    },
    win: {
      bundleCEF: true,
      defaultRenderer: "cef",
      chromiumFlags,
      icon: "assets/icon.png",
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
      chromiumFlags: linuxChromiumFlags,
      icon: "assets/icon.png",
    },
  },
  runtime: { exitOnLastWindowClosed: true },
  release: {
    baseUrl: process.env.MANENT_UPDATE_BASE_URL ?? "",
    generatePatch: false,
  },
} as const;
