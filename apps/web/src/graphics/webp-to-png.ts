// Lazy browser WebP → PNG transcoder for PDFKit export (PDF embeds PNG/JPEG natively).
// Returns null gracefully when image decoding or canvas export is unavailable (PDF falls back to vector placeholder).

export interface DecodedBitmap {
  readonly width: number;
  readonly height: number;
  close?(): void;
}

export interface WebpTranscodePorts {
  readonly decode?: (blob: Blob) => Promise<DecodedBitmap>;
  readonly encodePng?: (bitmap: DecodedBitmap) => Promise<Uint8Array | null>;
}

async function defaultEncodePng(
  bitmap: DecodedBitmap,
): Promise<Uint8Array | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    return blob === null ? null : new Uint8Array(await blob.arrayBuffer());
  }
  return null;
}

/** Transcodes WebP bytes to PNG bytes in the browser, returning null if unavailable. */
export async function transcodeWebpToPng(
  bytes: Uint8Array,
  ports?: WebpTranscodePorts,
): Promise<Uint8Array | null> {
  const decode =
    ports?.decode ??
    (typeof createImageBitmap === "function"
      ? (blob: Blob) => createImageBitmap(blob)
      : null);
  if (decode === null) return null;
  const encodePng = ports?.encodePng ?? defaultEncodePng;
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const bitmap = await decode(new Blob([copy], { type: "image/webp" }));
    try {
      if (bitmap.width < 1 || bitmap.height < 1) return null;
      return await encodePng(bitmap);
    } finally {
      bitmap.close?.();
    }
  } catch {
    return null;
  }
}
