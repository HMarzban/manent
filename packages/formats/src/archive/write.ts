// A project as one zip: a folder per document holding its Final Draft and Fountain files and the data of each named
// draft, and a contents file naming them.
import { zipSync } from "fflate";
import { writeFdx } from "../fdx/write.ts";
import { writeFountain } from "../fountain/write.ts";
import type { ScriptForExport } from "../script/model.ts";

export interface ArchiveDraft {
  readonly versionId: string;
  readonly name: string;
  /** The draft's content as JSON text, written as it is. */
  readonly json: string;
}

export interface ArchiveDocument {
  readonly docId: string;
  /** The script as it is now; its title names the folder and the files. */
  readonly script: ScriptForExport;
  readonly drafts: readonly ArchiveDraft[];
}

export interface ArchiveEntries {
  /** The project's title. */
  readonly project: string;
  /** Milliseconds since the epoch; also the time of every file in the zip. */
  readonly exportedAt: number;
  readonly documents: readonly ArchiveDocument[];
}

const MANIFEST = "manifest.json";
const NAME_LIMIT = 120;
// the characters a file system refuses in a name
const REFUSED_IN_NAME = new RegExp('[/\\\\:*?"<>|]', "g");

/** `name` with each refused character turned into "-", short enough to hold `extension` within NAME_LIMIT characters. */
const baseName = (name: string, extension: string): string =>
  [...name.replace(REFUSED_IN_NAME, "-")]
    .slice(0, NAME_LIMIT - extension.length)
    .join("");

/** `base`, or `base 2`, `base 3`… when `taken` holds it, compared without case as most file systems do; adds it to `taken`. */
function unique(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base} ${n}`;
  taken.add(name.toLowerCase());
  return name;
}

/**
 * The zip of `entries`: per document a folder named by its title, holding `{title}.fdx`, `{title}.fountain` and
 * `drafts/{draft name}.json` per draft, and at the top `manifest.json`, which names each document's folder and drafts.
 */
export function writeArchive(entries: ArchiveEntries): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {};
  const folders = new Set([MANIFEST]);
  const documents = entries.documents.map(({ docId, script, drafts }) => {
    const folder = unique(baseName(script.title, ""), folders);
    files[`${folder}/${baseName(script.title, ".fdx")}.fdx`] = encoder.encode(
      writeFdx(script).text,
    );
    files[`${folder}/${baseName(script.title, ".fountain")}.fountain`] =
      encoder.encode(writeFountain(script).text);
    const names = new Set<string>();
    for (const draft of drafts)
      files[
        `${folder}/drafts/${unique(baseName(draft.name, ".json"), names)}.json`
      ] = encoder.encode(draft.json);
    return {
      docId,
      title: script.title,
      folder,
      drafts: drafts.map(({ versionId, name }) => ({ versionId, name })),
    };
  });
  files[MANIFEST] = encoder.encode(
    JSON.stringify(
      {
        v: 1,
        project: entries.project,
        exportedAt: entries.exportedAt,
        documents,
      },
      null,
      2,
    ),
  );
  return zipSync(files, { mtime: entries.exportedAt });
}
