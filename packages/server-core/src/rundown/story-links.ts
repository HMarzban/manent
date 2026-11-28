// Which rundowns in a home link each story, resolved strictly from the server's directory.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  loadDoc,
  readRundown,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { RowKind, RundownJSON } from "@manent/schema";
import type { Home, Storage } from "@manent/storage";

export interface StoryRowLink {
  readonly rundownId: string;
  readonly rowId: string;
  readonly kind: RowKind;
  readonly blockId: string | null;
}

export interface StoryLinks {
  /** Every row in any non-tombstoned rundown of `storyDocId`'s home whose `docId` equals `storyDocId`. */
  linksOf(storyDocId: string): readonly StoryRowLink[];
  /** Refreshes the cached links of one rundown in `home` from its latest state. */
  refreshRundown(home: Home, rundownId: string, rundown: RundownJSON): void;
}

interface StoredLink {
  readonly rowId: string;
  readonly kind: RowKind;
  readonly docId: string;
  readonly blockId: string | null;
}

const homeKey = (home: Home): string => `${home.kind}:${home.id}`;

/**
 * Loads the current generation of a placed, non-tombstoned document from storage without
 * quarantining corrupt rows. Returns null if not placed, deleted, or missing from its log.
 * The caller destroys the returned document.
 */
export function loadStoredDoc(storage: Storage, docId: string): CrdtDoc | null {
  const { directory } = storage;
  const place = directory.placeOf(docId);
  if (place === null || directory.tombstoneOf(docId) !== null) return null;
  const file = storage.open(place.home);
  const row = file.log.get(docId);
  if (row === null) return null;
  const checkpoint = file.checkpoints.newest(docId, row.generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const from = checkpoint?.seq ?? 0;
  const { rows } = file.log.tail(docId, row.generation, from, {
    quarantine: false,
  });
  for (const { update } of rows) doc.applyUpdate(update, ORIGIN_LOAD);
  discardPending(doc);
  return doc;
}

function extractLinks(rundown: RundownJSON): readonly StoredLink[] {
  const links: StoredLink[] = [];
  for (const row of rundown.rows) {
    if (row.docId === null) continue;
    links.push({
      rowId: row.id,
      kind: row.kind,
      docId: row.docId,
      blockId: row.blockId,
    });
  }
  return links;
}

function readRundownLinks(
  storage: Storage,
  rundownId: string,
): readonly StoredLink[] {
  const doc = loadStoredDoc(storage, rundownId);
  if (doc === null) return [];
  try {
    return extractLinks(readRundown(doc));
  } finally {
    doc.destroy();
  }
}

/**
 * Resolves a story's linked rundowns strictly from `storage.directory.documentsIn(home, "rundown")`
 * and each rundown's own rows, cached per home with a story reverse index and refreshed when a rundown commits.
 */
export function createStoryLinks(storage: Storage): StoryLinks {
  const { directory } = storage;
  const homes = new Map<
    string,
    {
      byRundown: Map<string, readonly StoredLink[]>;
      byStory: Map<string, StoryRowLink[]>;
    }
  >();

  function getHome(home: Home) {
    const key = homeKey(home);
    let entry = homes.get(key);
    if (entry === undefined) {
      entry = { byRundown: new Map(), byStory: new Map() };
      homes.set(key, entry);
    }
    return entry;
  }

  function rebuildIndex(entry: {
    byRundown: Map<string, readonly StoredLink[]>;
    byStory: Map<string, StoryRowLink[]>;
  }): void {
    entry.byStory.clear();
    for (const [rundownId, links] of entry.byRundown) {
      for (const link of links) {
        let list = entry.byStory.get(link.docId);
        if (list === undefined) {
          list = [];
          entry.byStory.set(link.docId, list);
        }
        list.push({
          rundownId,
          rowId: link.rowId,
          kind: link.kind,
          blockId: link.blockId,
        });
      }
    }
  }

  function ensureHome(home: Home) {
    const entry = getHome(home);
    const active = new Set<string>();
    let changed = false;
    for (const id of directory.documentsIn(home, "rundown")) {
      if (directory.tombstoneOf(id) !== null) continue;
      active.add(id);
      if (!entry.byRundown.has(id)) {
        entry.byRundown.set(id, readRundownLinks(storage, id));
        changed = true;
      }
    }
    for (const cachedId of entry.byRundown.keys())
      if (!active.has(cachedId)) {
        entry.byRundown.delete(cachedId);
        changed = true;
      }
    if (changed) rebuildIndex(entry);
    return entry;
  }

  function linksOf(storyDocId: string): readonly StoryRowLink[] {
    if (directory.tombstoneOf(storyDocId) !== null) return [];
    const place = directory.placeOf(storyDocId);
    if (place === null) return [];
    return ensureHome(place.home).byStory.get(storyDocId) ?? [];
  }

  function refreshRundown(
    home: Home,
    rundownId: string,
    rundown: RundownJSON,
  ): void {
    const entry = getHome(home);
    entry.byRundown.set(rundownId, extractLinks(rundown));
    rebuildIndex(entry);
  }

  return { linksOf, refreshRundown };
}
