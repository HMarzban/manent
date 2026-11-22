// The one place a script is made: its document, its first block and its paper, on the device before anything is sent.
import {
  IMPORT_MAP,
  IMPORT_RECORD_KEY,
  NOTES_MAP,
  jsonMap,
  scriptBody,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import { FORMATS } from "@manent/schema";
import type { BlockJSON, FormatId } from "@manent/schema";
import { SETTINGS, paperForRegion } from "@manent/settings";
import type { DocHandle, SyncClient } from "@manent/sync-client";
import { projectHome } from "@manent/sync-protocol";
import { firstBlock } from "../../editor-host/first-block.ts";
import type { ImportedProject } from "../ports.ts";

/** A script to make: its id, its project's id, and the language whose region gives its paper. */
export interface NewScript {
  docId: string;
  projectId: string;
  language: string;
}

/** The format a new script has: the setting's default, which the registry has checked is one of the formats. */
function defaultFormat(): FormatId {
  const given = SETTINGS.get("script.format").default;
  const format = FORMATS.find((id) => id === given);
  if (format === undefined) throw new RangeError(`no format ${String(given)}`);
  return format;
}

/** Writes `blocks` as the script's body when the device holds none of it. */
function writeBody(handle: DocHandle, blocks: readonly BlockJSON[]): void {
  const doc = handle.doc();
  if (yXmlFragmentForBinding(doc).length === 0)
    scriptBody(doc).write((w) => w.insertBlocks(null, blocks));
}

/** Writes a new script's first block, one of the default format's first element, when the device holds none of it, and the paper of `language`'s region. */
export function startScript(handle: DocHandle, language: string): void {
  writeBody(handle, [firstBlock(defaultFormat())]);
  handle.setSetting("script.paper", paperForRegion(language));
}

/**
 * Writes what `startScript` writes, but the imported blocks for the first block (that block for a file without
 * any), the file's paper when it gives one, every note and the import record; each its own local transaction.
 */
export function startImported(
  handle: DocHandle,
  imported: ImportedProject,
  language: string,
): void {
  const { script, record } = imported;
  writeBody(
    handle,
    script.blocks.length > 0 ? script.blocks : [firstBlock(defaultFormat())],
  );
  const notes = jsonMap(handle.doc(), NOTES_MAP);
  for (const { id, note } of script.notes) notes.set(id, note);
  jsonMap(handle.doc(), IMPORT_MAP).set(IMPORT_RECORD_KEY, record);
  handle.setSetting("script.paper", script.paper ?? paperForRegion(language));
}

/** Makes `script` in a project of its own, created on the server at its first sync. */
export async function createScript(
  client: SyncClient,
  script: NewScript,
): Promise<void> {
  const handle = await client.open(script.docId, {
    create: {
      kind: "script",
      home: projectHome(script.projectId),
      workspaceId: null,
    },
  });
  startScript(handle, script.language);
  await handle.close();
}
