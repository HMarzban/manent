// What a new series starts with: Drama template, Season 1, and episode 101 over its opening script.
import {
  readEpisodes,
  readSeasons,
  scriptBody,
  writeEpisode,
  writeProjectKey,
  writeSeason,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import { paperForRegion } from "@manent/settings";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId, projectHome } from "@manent/sync-protocol";
import { firstBlock } from "../editor-host/first-block.ts";
import type { ProjectStart } from "../services/sync/create-script.ts";
import type { ProjectCreated } from "../services/sync/library-index.ts";

const holdsText = (handle: DocHandle): boolean =>
  (scriptBody(handle.doc()).materialize().content ?? []).some((section) =>
    (section.content ?? []).some((block) =>
      (block.content ?? []).some((run) => run.text !== ""),
    ),
  );

function startSeriesScript(handle: DocHandle, language: string): void {
  const doc = handle.doc();
  if (yXmlFragmentForBinding(doc).length === 0) {
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [firstBlock("screenplay")]),
    );
  }
  handle.setSetting("script.format", "screenplay");
  handle.setSetting("script.paper", paperForRegion(language));
}

/** A new series starts with a Screenplay-format script (Drama's format). */
export const SERIES_START: ProjectStart = {
  kinds: ["series"],
  docKind: "script",
  start: (handle, _kind, language) => startSeriesScript(handle, language),
  isUntouched: (handle) => !holdsText(handle),
};

/** Writes `project.template` = `"drama"`, Season 1, and episode 101 into a new series' project index. */
export const seriesCreated: ProjectCreated = {
  id: "series_season",
  async made({ sync, workspaceId, projectId, kind, docId }) {
    if (kind !== "series") return;
    const handle = await sync.client.open(indexDocId("project", projectId), {
      create: { kind: "index", home: projectHome(projectId), workspaceId },
    });
    try {
      const doc = handle.doc();
      writeProjectKey(doc, "template", "project.template", "drama");
      if (readSeasons(doc).size === 0 && readEpisodes(doc).size === 0) {
        const seasonId = crypto.randomUUID();
        writeSeason(doc, { id: seasonId, number: 1, title: null });
        writeEpisode(doc, {
          id: crypto.randomUUID(),
          seasonId,
          number: 101,
          title: null,
          writerUserId: sync.userId,
          stage: null,
          dueAt: null,
          pages: null,
          openCount: null,
          locked: false,
          docIds: { script: docId, outline: null, roomLog: null },
        });
      }
    } finally {
      await handle.close();
    }
  },
  removed: () => {},
};
