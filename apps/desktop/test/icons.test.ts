import { expect, test } from "bun:test";
import { join } from "node:path";

const desktopRoot = join(import.meta.dir, "..");
const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

async function readPngSize(
  path: string,
): Promise<{ width: number; height: number }> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  expect(bytes.length).toBeGreaterThanOrEqual(24);
  expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

test("Windows and Linux desktop icon PNG fits inside Windows ICO 256x256 limit", async () => {
  const { width, height } = await readPngSize(
    join(desktopRoot, "assets/icon.png"),
  );
  expect(width).toBe(256);
  expect(height).toBe(256);
});

test("macOS icon.iconset holds all ten PNG sizes", async () => {
  const expected: ReadonlyArray<readonly [string, number]> = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ];
  for (const [name, size] of expected) {
    const dims = await readPngSize(join(desktopRoot, "icon.iconset", name));
    expect(dims).toEqual({ width: size, height: size });
  }
});
