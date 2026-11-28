// Generates unified Bound "M" (ADR 0078) icons across desktop (macOS .iconset, Windows/Linux PNG),
// Web PWA manifest icons (apps/web/public/icons/) and site/apple-touch-icon.png from site/favicon.svg.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ICONSET_ENTRIES = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
] as const;

const ASSET_ICON_SIZE = 512;

/** Full-bleed maskable Bound "M" SVG keeping the monogram inside the 80% Android/PWA safe circle. */
const MASKABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" fill="#FDFCFA"/>
  <g transform="translate(3.2 3.2) scale(0.8)">
    <path fill="#1F1D1A" d="M7.5 8.5H10.7C11 8.5 11.3 8.65 11.5 8.95L16.2 15.8L19.6 10.8C19.8 10.5 20.2 10.65 20.2 11V15.3C20.2 15.5 20.1 15.7 19.95 15.9L16.9 20.1C16.7 20.35 16.45 20.45 16.2 20.45C15.95 20.45 15.7 20.35 15.5 20.1L10.7 13.4V22.5C10.7 23.05 10.25 23.5 9.7 23.5H7.5C6.95 23.5 6.5 23.05 6.5 22.5V9.5C6.5 8.95 6.95 8.5 7.5 8.5Z"/>
    <rect fill="#2450BE" x="21.9" y="8.5" width="3.6" height="15" rx="0.9"/>
  </g>
</svg>
`;

async function runTool(cmd: string[]): Promise<void> {
  const proc = Bun.spawn(cmd, {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${cmd[0]} exited with ${code}: ${stderr.trim()}`);
  }
}

async function renderSvg(
  rsvg: string | null,
  sips: string | null,
  svgPath: string,
  size: number,
  outPath: string,
): Promise<void> {
  if (rsvg !== null) {
    await runTool([
      rsvg,
      "-w",
      String(size),
      "-h",
      String(size),
      "-o",
      outPath,
      svgPath,
    ]);
    return;
  }
  const qlmanage = Bun.which("qlmanage");
  if (qlmanage !== null && sips !== null) {
    const scratch = await mkdtemp(join(tmpdir(), "manent-icon-"));
    try {
      await runTool([
        qlmanage,
        "-t",
        "-s",
        String(size),
        "-o",
        scratch,
        svgPath,
      ]);
      const base = svgPath.split("/").at(-1) ?? "favicon.svg";
      const rendered = join(scratch, `${base}.png`);
      if (await Bun.file(rendered).exists()) {
        await runTool([
          sips,
          "-z",
          String(size),
          String(size),
          rendered,
          "--out",
          outPath,
        ]);
        return;
      }
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
  throw new Error(
    "Neither rsvg-convert nor qlmanage+sips is available on PATH.",
  );
}

async function generateIcons(root: string): Promise<void> {
  const svgPath = join(root, "site/favicon.svg");
  const iconsetDir = join(root, "apps/desktop/icon.iconset");
  const assetsDir = join(root, "apps/desktop/assets");
  const webIconsDir = join(root, "apps/web/public/icons");

  await Promise.all([
    mkdir(iconsetDir, { recursive: true }),
    mkdir(assetsDir, { recursive: true }),
    mkdir(webIconsDir, { recursive: true }),
  ]);

  const rsvg = Bun.which("rsvg-convert");
  const sips = Bun.which("sips");
  const scratch = await mkdtemp(join(tmpdir(), "manent-maskable-"));
  const maskablePath = join(scratch, "maskable.svg");
  try {
    await writeFile(maskablePath, MASKABLE_SVG);
    const faviconSvg = await readFile(svgPath, "utf8");
    await writeFile(join(webIconsDir, "icon.svg"), faviconSvg);

    await Promise.all([
      ...ICONSET_ENTRIES.map(({ name, size }) =>
        renderSvg(rsvg, sips, svgPath, size, join(iconsetDir, name)),
      ),
      renderSvg(
        rsvg,
        sips,
        svgPath,
        ASSET_ICON_SIZE,
        join(assetsDir, "icon.png"),
      ),
      renderSvg(rsvg, sips, svgPath, 192, join(webIconsDir, "icon-192.png")),
      renderSvg(rsvg, sips, svgPath, 512, join(webIconsDir, "icon-512.png")),
      renderSvg(
        rsvg,
        sips,
        maskablePath,
        512,
        join(webIconsDir, "icon-maskable-512.png"),
      ),
      renderSvg(
        rsvg,
        sips,
        svgPath,
        180,
        join(webIconsDir, "apple-touch-icon.png"),
      ),
      renderSvg(
        rsvg,
        sips,
        svgPath,
        180,
        join(root, "site/apple-touch-icon.png"),
      ),
    ]);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  console.log(
    `Wrote ${ICONSET_ENTRIES.length} desktop iconset PNGs, apps/desktop/assets/icon.png, Web PWA icons and site/apple-touch-icon.png.`,
  );
}

if (import.meta.main) {
  await generateIcons(join(import.meta.dir, "../.."));
}
