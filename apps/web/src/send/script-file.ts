// What Export writes: a clean PDF, an FDX or a Fountain file, its name, and the browser download that saves it.
import type { KeptItem, ScriptForExport } from "@manent/formats";

export const EXPORT_KINDS = ["pdf", "fdx", "fountain"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

const NAME_LIMIT = 120;
// the characters a file system refuses in a name
const REFUSED_IN_NAME = new RegExp('[/\\\\:*?"<>|]', "g");

const FILES: Readonly<
  Record<ExportKind, { readonly extension: string; readonly type: string }>
> = Object.freeze({
  pdf: { extension: ".pdf", type: "application/pdf" },
  fdx: { extension: ".fdx", type: "application/xml" },
  fountain: { extension: ".fountain", type: "text/plain;charset=utf-8" },
});

/** `<title>` and the kind's extension, each refused character turned into "-", at most NAME_LIMIT characters. */
export function fileName(title: string, kind: ExportKind): string {
  const { extension } = FILES[kind];
  const base = [...title.replace(REFUSED_IN_NAME, "-")]
    .slice(0, NAME_LIMIT - extension.length)
    .join("");
  return `${base}${extension}`;
}

/** The MIME type a file of `kind` is saved with. */
export function fileType(kind: ExportKind): string {
  return FILES[kind].type;
}

/** The FDX or Fountain file of `script`, with the kept items the format cannot hold, which are left out of it. */
export async function fileFor(
  kind: "fdx" | "fountain",
  script: ScriptForExport,
): Promise<{
  bytes: Uint8Array;
  name: string;
  type: string;
  leftOut: readonly KeptItem[];
}> {
  const { writeFdx, writeFountain } = await import("@manent/formats");
  const written = kind === "fdx" ? writeFdx(script) : writeFountain(script);
  return {
    bytes: new TextEncoder().encode(written.text),
    name: fileName(script.title, kind),
    type: fileType(kind),
    leftOut: written.leftOut,
  };
}

/** Hands `bytes` to the browser as a download named `name`, of MIME type `type`. */
export function save(
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  type: string,
): void {
  const href = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  URL.revokeObjectURL(href);
}
