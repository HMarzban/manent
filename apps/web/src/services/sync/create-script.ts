// The one place a script is made: its document, its first block and its paper, on the device before anything is sent.
import { scriptBody, yXmlFragmentForBinding } from "@manent/crdt";
import { FORMATS } from "@manent/schema";
import type { FormatId } from "@manent/schema";
import { SETTINGS, paperForRegion } from "@manent/settings";
import type { DocHandle, SyncClient } from "@manent/sync-client";
import { projectHome } from "@manent/sync-protocol";
import { firstBlock } from "../../editor-host/first-block.ts";

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

/** Writes a new script's first block, one of the default format's first element, when the device holds none of it, and the paper of `language`'s region. */
export function startScript(handle: DocHandle, language: string): void {
  const doc = handle.doc();
  if (yXmlFragmentForBinding(doc).length === 0)
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [firstBlock(defaultFormat())]),
    );
  handle.setSetting("script.paper", paperForRegion(language));
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
