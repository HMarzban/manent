// Pure, deterministic PNG builder for seeded inline graphics and broadcast chyrons (no Node/Bun built-ins).

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1)
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.byteLength; i += 1)
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.byteLength; i += 1) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeU32Be(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.byteLength);
  writeU32Be(out, 0, data.byteLength);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeU32Be(
    out,
    8 + data.byteLength,
    crc32(out.subarray(4, 8 + data.byteLength)),
  );
  return out;
}

/** Encodes raw bytes as a valid zlib stream using uncompressed stored deflate blocks. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const blocks = Math.max(1, Math.ceil(raw.byteLength / maxBlock));
  const out = new Uint8Array(2 + raw.byteLength + blocks * 5 + 4);
  // zlib header: CMF=0x78 (deflate, 32K window), FLG=0x01 (check bits)
  out[0] = 0x78;
  out[1] = 0x01;
  let dst = 2;
  let src = 0;
  for (let b = 0; b < blocks; b += 1) {
    const len = Math.min(maxBlock, raw.byteLength - src);
    const isFinal = b === blocks - 1 ? 1 : 0;
    out[dst++] = isFinal;
    out[dst++] = len & 0xff;
    out[dst++] = (len >>> 8) & 0xff;
    const nlen = ~len & 0xffff;
    out[dst++] = nlen & 0xff;
    out[dst++] = (nlen >>> 8) & 0xff;
    out.set(raw.subarray(src, src + len), dst);
    dst += len;
    src += len;
  }
  writeU32Be(out, dst, adler32(raw));
  return out;
}

type Rgb = readonly [number, number, number];

/** Encodes an RGB pixel painter `(x, y) => [r, g, b]` into a valid RGB PNG binary. */
export function encodeRgbPng(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgb,
): Uint8Array {
  const stride = 1 + width * 3;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    raw[row] = 0; // filter: None
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const at = row + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  const ihdr = new Uint8Array(13);
  writeU32Be(ihdr, 0, width);
  writeU32Be(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  const parts = [
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.byteLength;
  }
  return png;
}

/** Archival coastal tide-curve plate for The Salt Almanac (160×90). */
export function makeTidePlatePng(): Uint8Array {
  const w = 160;
  const h = 90;
  return encodeRgbPng(w, h, (x, y) => {
    // outer paper margin and fine border
    if (x === 4 || x === w - 5 || y === 4 || y === h - 5) return [124, 108, 86];
    if (x < 4 || x > w - 5 || y < 4 || y > h - 5) return [244, 238, 226];
    // subtle archival grid lines
    const onGrid = (x - 16) % 24 === 0 || (y - 14) % 18 === 0;
    // primary tide sine wave & secondary spring-tide curve
    const wave1 = 48 + Math.sin(((x - 16) / (w - 32)) * Math.PI * 2.5) * 18;
    const wave2 = 52 + Math.cos(((x - 16) / (w - 32)) * Math.PI * 2.5) * 11;
    if (Math.abs(y - wave1) < 1.35) return [30, 68, 104];
    if (Math.abs(y - wave2) < 1.1) return [166, 98, 42];
    if (y > wave1 && y < h - 8) return [224, 232, 238];
    if (onGrid) return [228, 220, 206];
    return [248, 244, 236];
  });
}

/** Storyboard frame for Tin Boat: dusk sky, cove water, and small tin hull (160×90). */
export function makeStoryboardPng(): Uint8Array {
  const w = 160;
  const h = 90;
  return encodeRgbPng(w, h, (x, y) => {
    if (x < 3 || x >= w - 3 || y < 3 || y >= h - 3) return [42, 46, 56];
    const horizon = 54;
    // lantern moon in upper right
    const dx = x - 124;
    const dy = y - 24;
    if (dx * dx + dy * dy <= 81) return [246, 224, 152];
    // headland silhouette on left
    if (y >= 34 + Math.max(0, (x - 18) * 0.45) && y <= horizon && x < 68)
      return [54, 68, 82];
    // little tin boat hull + mast on water
    if (x >= 76 && x <= 104 && y >= 50 && y <= 57) {
      const inset = Math.max(0, y - 51);
      if (x >= 76 + inset && x <= 104 - inset) return [214, 104, 64];
    }
    if (x === 90 && y >= 32 && y <= 50) return [60, 56, 52];
    if (x > 90 && x <= 102 && y >= 34 && y <= 46 && x - 90 <= (y - 34) * 1.1)
      return [244, 238, 222];
    // cove water ripples
    if (y > horizon) {
      const ripple = (y - horizon) % 6 === 0 && (x + y * 3) % 14 < 6;
      return ripple ? [126, 162, 186] : [58, 96, 124];
    }
    // dusk sky gradient
    const t = y / horizon;
    return [
      Math.round(78 + t * 92),
      Math.round(108 + t * 76),
      Math.round(142 + t * 52),
    ];
  });
}

/** Broadcast storm-alert OTS graphic card for Lannick One News (160×90). */
export function makeStormCardPng(): Uint8Array {
  const w = 160;
  const h = 90;
  return encodeRgbPng(w, h, (x, y) => {
    // top amber broadcast header band
    if (y < 16) return [196, 118, 28];
    // bottom dark navy ticker band
    if (y >= h - 14) return [22, 34, 52];
    // concentric wind/isobar rings centred at (98, 46)
    const dist = Math.hypot(x - 98, y - 46);
    if (
      Math.abs(dist - 14) < 1.2 ||
      Math.abs(dist - 24) < 1.2 ||
      Math.abs(dist - 34) < 1.1
    )
      return [236, 184, 92];
    // coastline block on left
    if (x < 56 - Math.sin(y / 12) * 8) return [56, 78, 96];
    return [30, 52, 78];
  });
}
