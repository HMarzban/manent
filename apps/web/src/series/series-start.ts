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
import type { ProjectStart } from "../services/sync/create-script.ts";
import type { ProjectCreated } from "../services/sync/library-index.ts";
import { writingActions } from "../state/writing.store.ts";
import { openingBlock } from "./template.ts";

const holdsText = (handle: DocHandle): boolean =>
  (scriptBody(handle.doc()).materialize().content ?? []).some((section) =>
    (section.content ?? []).some((block) =>
      (block.content ?? []).some((run) => run.text !== ""),
    ),
  );

/**
 * True while the opening script holds no text and has not moved to a private copy: when an episode swaps to its
 * private copy on open, closing the room handle must not remove the newly created series.
 */
const isSeriesUntouched = (handle: DocHandle): boolean => {
  const { docId } = handle;
  if (
    writingActions.openTarget(docId) !== docId ||
    writingActions.get(docId).position === "private"
  )
    return false;
  const bound = writingActions.boundTarget(docId).get();
  if (bound !== null && bound !== docId) return false;
  return !holdsText(handle);
};

function startSeriesScript(handle: DocHandle, language: string): void {
  const doc = handle.doc();
  if (yXmlFragmentForBinding(doc).length === 0) {
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [openingBlock("screenplay")]),
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
  isUntouched: isSeriesUntouched,
};

/** Writes `project.template` = `"drama"`, Season 1, and episode 101 into a new series' project index. */
export const seriesCreated: ProjectCreated = {
  id: "series_season",
  async made({ sync, workspaceId, projectId, kind, docId, newId }) {
    if (kind !== "series") return;
    const makeId = newId ?? (() => crypto.randomUUID());
    const handle = await sync.client.open(indexDocId("project", projectId), {
      create: { kind: "index", home: projectHome(projectId), workspaceId },
    });
    try {
      const doc = handle.doc();
      writeProjectKey(doc, "template", "project.template", "drama");
      if (readSeasons(doc).size === 0 && readEpisodes(doc).size === 0) {
        const seasonId = makeId();
        writeSeason(doc, { id: seasonId, number: 1, title: null });
        writeEpisode(doc, {
          id: makeId(),
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
