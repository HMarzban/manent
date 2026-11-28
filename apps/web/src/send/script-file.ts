// What Export writes: the shape of a file type, a file's name, the FDX or Fountain file of a script with what it leaves
// out, and the browser download that saves it.
import type { KeptItem, KeptKind, ScriptForExport } from "@manent/formats";
import type { Pagination } from "@manent/pagination";
import { FORMATS } from "@manent/schema";
import type { FormatId } from "@manent/schema";
import type { DocKind } from "@manent/sync-protocol";
import { IMPORT_WORDS, joinNames } from "@manent/ui";
import type { SendFormId } from "../screens/send/form-ids.ts";

/** What a file type writes from: the document, its title, and the pages the frame shows (null for a format without pages). */
export interface ExportWork {
  readonly docId: string;
  readonly title: string;
  readonly pages: Pagination | null;
  readonly now: () => number;
}

/** A file as it is saved: its bytes and its name, with its extension. */
export interface WrittenFile {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly name: string;
}

/** A kind of file the Send forms offer; its own module, `file-types/<id in kebab-case>.ts`, makes it. */
export interface ExportFileType {
  readonly id: string;
  /** Its choice in the As row. */
  readonly label: string;
  /** The MIME type it is saved with. */
  readonly mime: string;
  /** The kinds of document it serves. */
  readonly docKinds: readonly DocKind[];
  /** The script formats it serves; null serves every one. */
  readonly formats: readonly FormatId[] | null;
  /** The Send forms whose As row offers it. */
  readonly forms: readonly SendFormId[];
  /** Whether Print offers it; when it does not, the reason Print gives, or null for none. */
  readonly print: { offered: true } | { offered: false; reason: string | null };
  /** Offered only while page numbers are locked. */
  readonly lockedOnly: boolean;
  /** The indices of the pages its file holds, for the pages shown; null holds every page. */
  readonly pagesOf: ((pages: Pagination) => readonly number[]) | null;
  /** The file; rejects when it cannot be written. */
  write(work: ExportWork): Promise<WrittenFile>;
  /**
   * Null for a file drawn in the script font, whose Checks row is the script's checks. Otherwise the Checks row's
   * sentence, saying what the file leaves out, or null when it leaves out nothing; rejects when it cannot be worked out.
   */
  readonly leftOut:
    ((work: { docId: string; title: string }) => Promise<string | null>) | null;
}

/** The formats whose scripts have pages and files: every one but Ink, whose own exports come later. */
export const PAGED_FORMATS: readonly FormatId[] = Object.freeze(
  FORMATS.filter((format) => format !== "ink"),
);

/** Paged dramatic script formats excluding prose manuscripts (for FDX, Fountain, Sides and screenplay reports). */
export const SCRIPT_ONLY_FORMATS: readonly FormatId[] = Object.freeze(
  PAGED_FORMATS.filter((format) => format !== "manuscript"),
);

const NAME_LIMIT = 120;
// the characters a file system refuses in a name
const REFUSED_IN_NAME = new RegExp('[/\\\\:*?"<>|]', "g");

/** The two script file formats a script is written in. */
export const SCRIPT_FILES: Readonly<
  Record<
    "fdx" | "fountain",
    { readonly extension: string; readonly mime: string }
  >
> = Object.freeze({
  fdx: { extension: ".fdx", mime: "application/xml" },
  fountain: { extension: ".fountain", mime: "text/plain;charset=utf-8" },
});

/** `<title>` and `extension`, each refused character turned into "-", at most NAME_LIMIT characters. */
export function fileName(title: string, extension: string): string {
  const base = [...title.replace(REFUSED_IN_NAME, "-")]
    .slice(0, NAME_LIMIT - extension.length)
    .join("");
  return `${base}${extension}`;
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
  const { extension, mime } = SCRIPT_FILES[kind];
  return {
    bytes: new TextEncoder().encode(written.text),
    name: fileName(script.title, extension),
    type: mime,
    leftOut: written.leftOut,
  };
}

const KEPT = IMPORT_WORDS.kept;

const FORMAT_NAMES: Readonly<Record<"fdx" | "fountain", string>> =
  Object.freeze({ fdx: IMPORT_WORDS.asFdx, fountain: IMPORT_WORDS.asFountain });

/** The name a kept item is said by, given the other format's element names joined; null for a lock that could not be placed, which has no row. */
const KEPT_NAMES: Readonly<
  Record<KeptKind, (item: KeptItem, elements: string) => string | null>
> = Object.freeze({
  title_page: () => KEPT.title_page,
  document_part: (item) => KEPT.document_part(item.name),
  paragraph_part: () => KEPT.paragraph_part,
  run_part: () => KEPT.run_part,
  element_type: (_item, elements) => KEPT.element_type(elements),
  scene_number: () => KEPT.scene_number,
  note_part: () => KEPT.note_part,
  boneyard: () => KEPT.boneyard,
  fountain_markup: () => KEPT.fountain_markup,
  unplaced_lock: () => null,
});

/**
 * What a file in `kind` leaves out, each name once in the order first met. An element the writer turned into another
 * is said by its own label; null when nothing is left out.
 */
function leftOutSentence(
  kind: "fdx" | "fountain",
  leftOut: readonly KeptItem[],
): string | null {
  const made = (item: KeptItem): boolean =>
    item.kind === "element_type" && item.from === kind;
  const elements = joinNames([
    ...new Set(
      leftOut
        .filter((item) => item.kind === "element_type" && !made(item))
        .map((item) => item.name),
    ),
  ]);
  const names = [
    ...new Set(
      leftOut.flatMap((item) => {
        const name = made(item)
          ? item.name
          : KEPT_NAMES[item.kind](item, elements);
        return name === null ? [] : [name];
      }),
    ),
  ];
  const [only] = names;
  if (only === undefined) return null;
  const format = FORMAT_NAMES[kind];
  return names.length === 1
    ? IMPORT_WORDS.leftOutOne(only, format)
    : IMPORT_WORDS.leftOut(joinNames(names), format);
}

/** The script's file in `kind`, written from the open editor; rejects when no editor holds it or the writer fails. */
async function scriptFile(
  kind: "fdx" | "fountain",
  work: { docId: string; title: string },
): Promise<{ bytes: Uint8Array; name: string; leftOut: readonly KeptItem[] }> {
  // loaded apart, as the commands know the file types before the editor's code arrives
  const { scriptForExport } = await import("../editor-host/export-source.ts");
  const script = await scriptForExport(work.docId, work.title);
  if (script === null) throw new Error(`no open editor holds ${work.docId}`);
  return fileFor(kind, script);
}

/** The script's file in `kind`, named for `work`'s title. */
export async function writeScriptFile(
  kind: "fdx" | "fountain",
  work: { docId: string; title: string },
): Promise<WrittenFile> {
  const { bytes, name } = await scriptFile(kind, work);
  return { bytes: new Uint8Array(bytes), name };
}

/** What the script's file in `kind` leaves out, as the Checks row says it; null when nothing. */
export async function scriptFileLeftOut(
  kind: "fdx" | "fountain",
  work: { docId: string; title: string },
): Promise<string | null> {
  return leftOutSentence(kind, (await scriptFile(kind, work)).leftOut);
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
