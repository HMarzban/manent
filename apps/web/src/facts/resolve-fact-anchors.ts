// Resolving pinned fact anchors against documents already held on this device, without opening remote scripts.
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { resolveAnchor } from "@manent/revisions";
import type { AnchorBlock, AnchorResolution } from "@manent/revisions";
import type { BlockJSON, TextAnchor } from "@manent/schema";
import { useEffect, useState } from "react";
import { liveEditor } from "../editor-host/live-editor.ts";
import { useServices } from "../services/context.tsx";
import type { PersonServices } from "../services/ports.ts";
import type { FactEntry } from "./facts-entries.ts";

/** Blocks on each side of the anchor's block searched for its quote, matching editor annotations. */
const NEIGHBOURS = 2;

const REMOVED: AnchorResolution = Object.freeze({
  ok: false,
  reason: "removed",
});

/** Plain text of a stored block, as a text anchor's offsets count it. */
function blockText(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

function toAnchorBlocks(blocks: readonly BlockJSON[]): AnchorBlock[] {
  return blocks.map((block) => ({
    id: typeof block.attrs?.id === "string" ? block.attrs.id : "",
    text: blockText(block),
  }));
}

function blocksFromDoc(doc: CrdtDoc): AnchorBlock[] {
  const blocks = (scriptBody(doc).materialize().content ?? []).flatMap(
    (section) => section.content ?? [],
  );
  return toAnchorBlocks(blocks);
}

/**
 * Resolves `anchor` in `blocks` using `resolveAnchor` over the anchor's block and up to two neighbours on each side.
 * When the anchor's block id is absent, returns `{ ok: false, reason: "removed" }`.
 */
export function resolveFactInBlocks(
  anchor: TextAnchor,
  blocks: readonly AnchorBlock[],
): AnchorResolution {
  const at = blocks.findIndex((block) => block.id === anchor.blockId);
  if (at === -1) return REMOVED;
  const from = Math.max(0, at - NEIGHBOURS);
  const to = Math.min(blocks.length, at + NEIGHBOURS + 1);
  return resolveAnchor(anchor, blocks.slice(from, to));
}

/**
 * Reads `docId`'s blocks from the open editor or from this device's local store; returns null when the document is not
 * held locally, has never synced with nothing waiting, or its access was removed, so remote scripts are never opened.
 */
export async function loadDeviceDocBlocks(
  services: Pick<PersonServices, "documentBlocks" | "onDevice" | "openHandle">,
  docId: string,
): Promise<readonly AnchorBlock[] | null> {
  const open = liveEditor(docId);
  if (open !== null) return blocksFromDoc(open.doc);
  const direct = await services.documentBlocks(docId).catch(() => null);
  if (direct !== null) return toAnchorBlocks(direct);
  const held = await services.onDevice([docId]).catch(() => null);
  if (held === null || !held.has(docId)) return null;
  const handle = await services.openHandle(docId).catch(() => null);
  if (handle === null) return null;
  try {
    const status = handle.status.get();
    if (
      status.side.includes("access_removed") ||
      status.side.includes("deleted")
    )
      return null;
    if (status.neverSynced && status.waiting === 0) return null;
    const view = handle.readOnly.get();
    if (view !== null) {
      if (!view.status.get().live) return null;
      return toAnchorBlocks(view.blocks.get());
    }
    return blocksFromDoc(handle.doc());
  } finally {
    await handle.close();
  }
}

const EMPTY_RESOLUTIONS: ReadonlyMap<string, AnchorResolution> = new Map();

/** Resolves each fact whose document is already held on this device; facts of unheld documents are absent from the map. */
export function useFactResolutions(
  facts: readonly FactEntry[],
): ReadonlyMap<string, AnchorResolution> {
  const services = useServices();
  const [resolutions, setResolutions] =
    useState<ReadonlyMap<string, AnchorResolution>>(EMPTY_RESOLUTIONS);
  const key = facts
    .map(
      (fact) =>
        `${fact.id}:${fact.docId}:${fact.anchor.blockId}:${fact.anchor.start}:${fact.anchor.end}:${fact.anchor.quote}`,
    )
    .join("|");

  useEffect(() => {
    if (facts.length === 0) {
      setResolutions(EMPTY_RESOLUTIONS);
      return;
    }
    let active = true;
    const docIds = [...new Set(facts.map((fact) => fact.docId))];
    void Promise.all(
      docIds.map(async (docId) => ({
        docId,
        blocks: await loadDeviceDocBlocks(services, docId),
      })),
    ).then((loaded) => {
      if (!active) return;
      const byDoc = new Map(
        loaded.flatMap(({ docId, blocks }) =>
          blocks === null ? [] : [[docId, blocks] as const],
        ),
      );
      const next = new Map<string, AnchorResolution>();
      for (const fact of facts) {
        const blocks = byDoc.get(fact.docId);
        if (blocks !== undefined)
          next.set(fact.id, resolveFactInBlocks(fact.anchor, blocks));
      }
      setResolutions(next);
    });
    return () => {
      active = false;
    };
  }, [services, key]);

  return resolutions;
}
