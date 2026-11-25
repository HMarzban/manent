// Bracket-time Check source: lists every `T=` form that sets no time, naming its slug (Segment in a Podcast) and opening the bracket.
import { readBlocks, scriptBody } from "@manent/crdt";
import type { TimingFacts } from "@manent/editor";
import { findBracketTimes } from "@manent/pagination";
import type { BracketTime } from "@manent/pagination";
import { textAnchorAt } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { TIMING_WORDS } from "@manent/ui";
import { archiveSource } from "../archive/archive-source.ts";
import {
  notifyChecksChanged,
  recordCheckDetail,
} from "../checks/checks-context.ts";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import type { PersonServices } from "../services/ports.ts";
import { timingFactsOf } from "./timing-facts.ts";

const SOURCE_ID = "bracket_time";
const MAX_CACHE_ENTRIES = 16;

type UnreadTime = Extract<BracketTime, { ok: false }>;

interface BracketCheck {
  readonly id: string;
  readonly sentence: string;
  readonly action: {
    readonly label: string;
    run(): void;
  };
}

interface BracketCheckSource {
  readonly id: string;
  find(docId: string): readonly BracketCheck[];
}

interface ScriptBlock {
  readonly id: string;
  readonly type: string;
  readonly text: string;
}

interface CachedFallback {
  readonly source: unknown;
  readonly fromEditor: boolean;
  readonly podcast: boolean;
  readonly checks: readonly BracketCheck[];
}

const fallbackCache = new Map<string, CachedFallback>();
const storedBlocksCache = new Map<string, readonly ScriptBlock[]>();
const loadingStored = new Set<string>();
let stopLiveWatch: (() => void) | null = null;

function setBounded<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function ensureLiveWatch(): void {
  if (stopLiveWatch !== null) return;
  stopLiveWatch = subscribeLiveEditors(() => {
    for (const [docId, entry] of fallbackCache) {
      if (entry.fromEditor && liveEditor(docId) === null) {
        fallbackCache.delete(docId);
      }
    }
    for (const docId of storedBlocksCache.keys()) {
      if (liveEditor(docId) !== null) {
        storedBlocksCache.delete(docId);
        const cached = fallbackCache.get(docId);
        if (cached !== undefined && !cached.fromEditor) {
          fallbackCache.delete(docId);
        }
      }
    }
    if (fallbackCache.size === 0 && storedBlocksCache.size === 0) {
      stopLiveWatch?.();
      stopLiveWatch = null;
    }
  });
}

function isVariety(docId: string): boolean {
  const services = archiveSource.get();
  if (services === null) return true;
  try {
    return services.openScriptStore(docId).get("script.format") === "variety";
  } catch {
    // isolated tests without a script store rely on published facts or caller-supplied blocks
    return true;
  }
}

const isPodcast = (docId: string): boolean =>
  archiveSource.get()?.library.documentKind(docId).get() === "podcast";

function openBracket(docId: string, blockId: string, offset: number): void {
  const scriptPath = `/s/${docId}`;
  if (
    typeof window !== "undefined" &&
    window.location.pathname !== scriptPath
  ) {
    const url = `${scriptPath}?at=${encodeURIComponent(blockId)}`;
    window.history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  archiveSource.get()?.editor.run({ kind: "go_to", blockId, offset });
}

function blockJsonText(block: BlockJSON): string {
  if (block.content === undefined) return "";
  let text = "";
  for (const run of block.content) text += run.text;
  return text;
}

function readBlockTexts(
  docId: string,
  neededIds: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const texts = new Map<string, string>();
  const editor = liveEditor(docId);
  if (editor === null || neededIds.size === 0) return texts;
  const pmDoc = editor.view?.state?.doc;
  if (pmDoc !== undefined && pmDoc !== null) {
    pmDoc.descendants((node) => {
      if (node.type.name !== "block") return true;
      const id = node.attrs["id"];
      if (typeof id === "string" && neededIds.has(id) && !texts.has(id))
        texts.set(id, node.textContent);
      return false;
    });
    return texts;
  }
  for (const [id, block] of readBlocks(editor.doc, neededIds))
    texts.set(id, blockJsonText(block));
  return texts;
}

function buildCheck(options: {
  docId: string;
  blockId: string;
  blockText: string;
  slugText: string | null;
  time: UnreadTime;
  podcast: boolean;
  open: (blockId: string, offset: number) => void;
}): BracketCheck {
  const { docId, blockId, blockText, slugText, time, podcast, open } = options;
  const form = blockText.slice(time.from, time.to);
  const id = `${blockId}:${time.from}:${time.to}`;
  const anchor =
    time.from >= 0 && time.to <= blockText.length && time.from <= time.to
      ? textAnchorAt({ id: blockId, text: blockText }, time.from, time.to)
      : null;
  recordCheckDetail(docId, `${SOURCE_ID}:${id}`, {
    anchor,
    subject: form,
  });
  const slug =
    slugText !== null && slugText.trim() !== "" ? slugText.trim() : null;
  return {
    id,
    sentence: TIMING_WORDS.unreadTimeCheck(slug, form, time.code, podcast),
    action: {
      label: TIMING_WORDS.seeBracket(podcast),
      run: () => open(blockId, time.from),
    },
  };
}

function checksFromFacts(
  docId: string,
  facts: TimingFacts,
  podcast: boolean,
): readonly BracketCheck[] {
  if (facts.unread.length === 0) return [];
  const neededIds = new Set<string>();
  for (const entry of facts.unread) {
    neededIds.add(entry.blockId);
    if (entry.slugId !== null) neededIds.add(entry.slugId);
  }
  const texts = readBlockTexts(docId, neededIds);
  return facts.unread.map((entry) =>
    buildCheck({
      docId,
      blockId: entry.blockId,
      blockText: texts.get(entry.blockId) ?? "",
      slugText:
        entry.slugId === null ? null : (texts.get(entry.slugId) ?? null),
      time: entry.time,
      podcast,
      open: (blockId, offset) => openBracket(docId, blockId, offset),
    }),
  );
}

/** Scans `blocks` once with `findBracketTimes` for unread `T=` forms when no live `TimingFacts` exist. */
function findBracketTimeChecksInBlocks(options: {
  docId: string;
  blocks: readonly ScriptBlock[];
  podcast: boolean;
  open?: (blockId: string, offset: number) => void;
}): readonly BracketCheck[] {
  const { docId, blocks, podcast } = options;
  const open =
    options.open ??
    ((blockId: string, offset: number) => openBracket(docId, blockId, offset));
  const checks: BracketCheck[] = [];
  let currentSlug: string | null = null;
  for (const block of blocks) {
    if (block.type === "slug") {
      currentSlug = block.text;
      continue;
    }
    if (block.type !== "bracket") continue;
    for (const time of findBracketTimes(block.text)) {
      if (time.ok) continue;
      checks.push(
        buildCheck({
          docId,
          blockId: block.id,
          blockText: block.text,
          slugText: currentSlug,
          time,
          podcast,
          open,
        }),
      );
    }
  }
  return checks;
}

function extractScriptBlocks(
  blocks: readonly BlockJSON[],
): readonly ScriptBlock[] {
  const result: ScriptBlock[] = [];
  for (const block of blocks) {
    const type = block.attrs?.type;
    const id = typeof block.attrs?.id === "string" ? block.attrs.id : "";
    if (type === "slug" || type === "bracket") {
      result.push({ id, type, text: blockJsonText(block) });
    }
  }
  return result;
}

async function readStoredDocBlocks(
  services: PersonServices,
  docId: string,
): Promise<readonly BlockJSON[] | null> {
  try {
    const local = await services.documentBlocks(docId);
    if (local !== null) return local;
  } catch {
    // fall back to opening the handle directly when documentBlocks is unavailable
  }
  let handle: DocHandle | null = null;
  try {
    handle = await services.openHandle(docId);
    const view = handle.readOnly.get();
    if (view !== null) {
      return view.status.get().live ? [...view.blocks.get()] : null;
    }
    return (scriptBody(handle.doc()).materialize().content ?? []).flatMap(
      (section) => section.content ?? [],
    );
  } catch {
    // document unavailable on this device or sync not started
    return null;
  } finally {
    if (handle !== null) {
      await handle.close().catch(() => {
        // closing a temporary fallback handle after read is best-effort
      });
    }
  }
}

function warmStoredBlocks(docId: string): void {
  if (loadingStored.has(docId)) return;
  const services = archiveSource.get();
  if (services === null) return;
  loadingStored.add(docId);
  void readStoredDocBlocks(services, docId)
    .then((blocks) => {
      if (blocks === null || liveEditor(docId) !== null) return;
      setBounded(storedBlocksCache, docId, extractScriptBlocks(blocks));
      ensureLiveWatch();
      notifyChecksChanged(docId, services);
    })
    .finally(() => {
      loadingStored.delete(docId);
    });
}

function checksFromLiveEditor(
  docId: string,
  editor: NonNullable<ReturnType<typeof liveEditor>>,
  podcast: boolean,
): readonly BracketCheck[] {
  const pmDoc = editor.view?.state?.doc;
  if (pmDoc === undefined || pmDoc === null) {
    const rawBlocks = (
      scriptBody(editor.doc).materialize().content ?? []
    ).flatMap((section) => section.content ?? []);
    return findBracketTimeChecksInBlocks({
      docId,
      blocks: extractScriptBlocks(rawBlocks),
      podcast,
    });
  }
  const cached = fallbackCache.get(docId);
  if (
    cached !== undefined &&
    cached.source === pmDoc &&
    cached.podcast === podcast
  )
    return cached.checks;
  const blocks: ScriptBlock[] = [];
  pmDoc.descendants((node) => {
    if (node.type.name !== "block") return true;
    const id = typeof node.attrs["id"] === "string" ? node.attrs["id"] : "";
    const type =
      typeof node.attrs["type"] === "string" ? node.attrs["type"] : "general";
    if (type === "slug" || type === "bracket")
      blocks.push({ id, type, text: node.textContent });
    return false;
  });
  const checks = findBracketTimeChecksInBlocks({ docId, blocks, podcast });
  setBounded(fallbackCache, docId, {
    source: pmDoc,
    fromEditor: true,
    podcast,
    checks,
  });
  ensureLiveWatch();
  return checks;
}

function checksFromFallback(
  docId: string,
  podcast: boolean,
): readonly BracketCheck[] {
  const editor = liveEditor(docId);
  if (editor !== null) return checksFromLiveEditor(docId, editor, podcast);
  const stored = storedBlocksCache.get(docId);
  if (stored === undefined) {
    warmStoredBlocks(docId);
    return [];
  }
  const cached = fallbackCache.get(docId);
  if (
    cached !== undefined &&
    cached.source === stored &&
    cached.podcast === podcast
  )
    return cached.checks;
  const checks = findBracketTimeChecksInBlocks({
    docId,
    blocks: stored,
    podcast,
  });
  setBounded(fallbackCache, docId, {
    source: stored,
    fromEditor: false,
    podcast,
    checks,
  });
  ensureLiveWatch();
  return checks;
}

/** Unread `T=` bracket times: reads `timingFactsOf(docId).unread` while mounted, else scans bracket blocks once. */
export const bracketTimeCheck: BracketCheckSource = {
  id: SOURCE_ID,
  find(docId) {
    if (!isVariety(docId)) return [];
    const podcast = isPodcast(docId);
    const facts = timingFactsOf(docId).get();
    if (facts !== null) return checksFromFacts(docId, facts, podcast);
    return checksFromFallback(docId, podcast);
  },
};
