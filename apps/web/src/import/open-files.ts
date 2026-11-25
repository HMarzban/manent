// Opening files as new scripts: each read, counted and made in the Library, or the one sentence that says why not.
import type {
  FormatErrorCode,
  ImportedScript,
  SourceFormat,
} from "@manent/formats";
import {
  DEFAULT_LAYOUT_SETTINGS,
  ENGINE_VERSION,
  engineFor,
  profileFromSettings,
} from "@manent/pagination";
import { importAnchors, lockedPagination } from "@manent/revisions";
import { blockText, blocksOf, classifyLine, sectionize } from "@manent/schema";
import type { BlockJSON, IdSource } from "@manent/schema";
import { paperForRegion } from "@manent/settings";
import { GAME_EXPORTS_WORDS, IMPORT_WORDS, formatDate } from "@manent/ui";
import type { Message, MessageQueue } from "@manent/ui";
import type { LibraryIndex } from "../services/ports.ts";
import { createInkProject } from "../services/sync/ink-project.ts";
import { importRecordOf, summaryOf } from "./import-record.ts";
import { IMPORTABLE_EXTENSIONS } from "./readers.ts";
import type { ImportReader } from "./readers.ts";
import type { ReopenMemory } from "./reopen.ts";

/** A file to import, as the picker, a drop or the desktop's shell gives it (the wire's OpenedFile, with base64 bytes, is converted to it). */
export interface ImportFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** Where an imported script goes: the workspace the Library shows, and the router's navigate. */
export interface ImportPlace {
  readonly workspaceId: string;
  navigate(path: string): void;
}

export interface FileOpener {
  open(files: readonly ImportFile[]): Promise<void>;
  /** Imports again, as a new script, the file the last `reopened` message named; nothing when there is none. */
  importAgain(): Promise<void>;
}

/** A file being opened, with its reader and the hash it is known by. */
interface Opening {
  readonly file: ImportFile;
  readonly reader: ImportReader;
  readonly sha: string;
}

interface OpenerOptions {
  readers: readonly ImportReader[];
  library: LibraryIndex;
  messages: MessageQueue;
  place: () => Promise<ImportPlace>;
  reopen: ReopenMemory;
  userId: string;
  now: () => number;
  ids: IdSource;
  randomKey: () => string;
  sha256: (bytes: Uint8Array) => Promise<string>;
  language: string;
}

/** Lower-case hexadecimal SHA-256 of the bytes. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  // a copy: digest takes bytes over an ArrayBuffer, and a Uint8Array may view a shared one
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return new Uint8Array(digest).toHex();
}

/** A new request key: 16 random bytes in lower-case hexadecimal. */
export const randomKey = (): string =>
  crypto.getRandomValues(new Uint8Array(16)).toHex();

/** The name's last `.` part, lower-cased, with its dot; empty for a name without one. */
const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

const stemOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
};

const brief = (
  id: string,
  text: string,
  actions: Message["actions"] = [],
): Message => ({ id, text, actions, lifetime: "brief", ownWork: false });

const refusal = (text: string): Message => brief("import_refused", text);

const INK_FUNCTION = /^={2,}\s*function\b/;

/** Counts Ink knots in `blocks`, excluding `=== function … ===` declarations and block comments. */
function countInkKnots(blocks: readonly BlockJSON[]): number {
  let knots = 0;
  let commentOpen = false;
  for (const block of blocks) {
    const text = (block.content ?? []).map((run) => run.text).join("");
    const line = classifyLine(text, "ink", commentOpen);
    commentOpen = line.commentOpen;
    if (line.kind === "knot" && !INK_FUNCTION.test(text.trimStart())) knots++;
  }
  return knots;
}

function formatRefusal(
  name: string,
  from: SourceFormat,
  code: FormatErrorCode,
): string {
  if (from === "ink") return GAME_EXPORTS_WORDS.inkNotUtf8(name);
  if (from === "pdf" && code === "not_this_format")
    return IMPORT_WORDS.pdfNoText(name);
  if (from === "docx" && code === "too_large")
    return IMPORT_WORDS.docxTooLarge(name);
  return IMPORT_WORDS.unreadable(name, IMPORT_WORDS.formatNames[from]);
}

/** The pages Manent gives the script under its paper, locked where the file locked them, and those that hold more than fits. */
function pagesOf(
  script: ImportedScript,
  language: string,
): { pages: number; overflowing: readonly string[] } {
  const engine = engineFor(ENGINE_VERSION);
  if (engine === null)
    throw new RangeError(`no pagination engine ${ENGINE_VERSION}`);
  const paper = script.paper ?? paperForRegion(language);
  const settings = { ...DEFAULT_LAYOUT_SETTINGS, paper };
  const profile = profileFromSettings(engine, settings);
  if (profile === null)
    throw new RangeError(`no page profile for ${settings.format}`);
  const flat = blocksOf(sectionize(script.blocks));
  const records =
    script.production === null
      ? []
      : importAnchors(
          flat.flatMap((block) =>
            block.attrs.id === null
              ? []
              : [{ id: block.attrs.id, text: blockText(block) }],
          ),
          script.production.anchors,
        );
  const layout = lockedPagination(
    engine.toLayoutBlocks(flat),
    profile,
    records,
    engine,
  );
  return {
    pages: layout.pagination.pages.length,
    overflowing: layout.overflowing,
  };
}

export function createFileOpener(options: OpenerOptions): FileOpener {
  const { library, messages, reopen } = options;
  // the file the last `reopened` message named, which Import again imports
  let reopened: Opening | null = null;

  /** Reads, counts and makes the file a new script; says what came in, or why nothing did. */
  const importFile = async ({ file, reader, sha }: Opening): Promise<void> => {
    const { name } = file;
    if ("refuse" in reader) {
      messages.push(refusal(reader.refuse(name)));
      return;
    }
    const formats = await import("@manent/formats");
    let script: ImportedScript;
    try {
      script = await reader.read(file.bytes, options.ids);
    } catch (error) {
      if (!(error instanceof formats.FormatError)) throw error;
      messages.push(refusal(formatRefusal(name, reader.from, error.code)));
      return;
    }
    if (reader.from === "ink") {
      const title = stemOf(name);
      const place = await options.place();
      const made = await createInkProject(library, place.workspaceId, {
        title,
        blocks: script.blocks,
      }).catch(() => null);
      if (made === null) {
        messages.push(refusal(IMPORT_WORDS.notSaved(name)));
        return;
      }
      reopen.remember(sha, made.docId, options.now());
      place.navigate(`/s/${made.docId}`);
      const knots = countInkKnots(script.blocks);
      messages.push(
        brief(
          "import_summary",
          GAME_EXPORTS_WORDS.importedInk(title, script.blocks.length, knots),
        ),
      );
      return;
    }
    const { pages, overflowing } = pagesOf(script, options.language);
    const scenes = script.blocks.filter(
      (block) => block.attrs?.type === "scene_heading",
    ).length;
    const counts = { pages, scenes, notes: script.notes.length };
    const title = script.title ?? stemOf(name);
    const at = { importedAt: options.now(), userId: options.userId };
    const lockKey = script.production === null ? null : options.randomKey();
    const record = importRecordOf(
      script,
      { name, sha256: sha },
      title,
      at,
      counts,
      overflowing,
      lockKey,
    );
    const place = await options.place();
    const made = await library
      .importProject(place.workspaceId, { title, script, record })
      .catch(() => null);
    if (made === null) {
      messages.push(refusal(IMPORT_WORDS.notSaved(name)));
      return;
    }
    reopen.remember(sha, made.docId, record.importedAt);
    place.navigate(`/s/${made.docId}`);
    const said = [summaryOf(record)];
    if (lockKey !== null) said.push(IMPORT_WORDS.lockWaiting);
    const actions =
      record.from === "fdx"
        ? [{ label: IMPORT_WORDS.seeShortcuts, commandId: "app.shortcuts" }]
        : [];
    messages.push(brief("import_summary", said.join(" "), actions));
  };

  /** True when the file was imported before and its script is still listed: it is opened and offered again. */
  const openedAgain = async (opening: Opening): Promise<boolean> => {
    const found = reopen.find(opening.sha);
    if (found === null) return false;
    const place = await options.place();
    const title = library.documentTitle(found.docId);
    // the shown workspace's index is read before its titles are trusted
    await library.readProjects(place.workspaceId);
    const listed = title.get();
    if (listed === null) return false;
    reopened = opening;
    place.navigate(`/s/${found.docId}`);
    const day = formatDate(found.importedAt);
    const action = {
      label: IMPORT_WORDS.importAgain,
      commandId: "file.importAgain",
    };
    messages.push(
      brief("import_reopened", IMPORT_WORDS.reopened(listed, day), [action]),
    );
    return true;
  };

  /** The file's reader, after refusing a file of another kind or one too large; null when it is refused. */
  const readerOf = async (file: ImportFile): Promise<ImportReader | null> => {
    const extension = extensionOf(file.name);
    const reader = options.readers.find((row) => row.extension === extension);
    if (!IMPORTABLE_EXTENSIONS.includes(extension) || reader === undefined) {
      messages.push(
        refusal(IMPORT_WORDS.notImportable(file.name, IMPORTABLE_EXTENSIONS)),
      );
      return null;
    }
    const { IMPORT_LIMIT_BYTES } = await import("@manent/formats");
    if (file.bytes.length <= IMPORT_LIMIT_BYTES) return reader;
    messages.push(refusal(IMPORT_WORDS.tooLarge(file.name)));
    return null;
  };

  return {
    async open(files) {
      for (const file of files) {
        const reader = await readerOf(file);
        if (reader === null) continue;
        const opening = { file, reader, sha: await options.sha256(file.bytes) };
        if (!(await openedAgain(opening))) await importFile(opening);
      }
    },
    async importAgain() {
      const again = reopened;
      if (again === null) return;
      reopened = null;
      await importFile(again);
    },
  };
}

let registered: FileOpener | null = null;

/** The last opener registered is the one the window's drop, the commands and the desktop's opened files reach, as registerLiveEditor does for editors. */
export function registerFileOpener(opener: FileOpener): void {
  registered = opener;
}

export function fileOpener(): FileOpener | null {
  return registered;
}
