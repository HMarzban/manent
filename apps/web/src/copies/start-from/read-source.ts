// Access-checked reading of a source document before copying or extracting chapters from it.
import { scriptBody } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import type { DocHandle, SideState, ViewHandle } from "@manent/sync-client";
import type { PersonServices } from "../../services/ports.ts";

/** Source content authorised for the caller: `view` carries only server-projected blocks, never private notes. */
type SourceContent =
  | {
      readonly access: "edit";
      readonly blocks: readonly BlockJSON[];
      readonly settings: Readonly<Record<string, unknown>>;
    }
  | {
      readonly access: "view";
      readonly blocks: readonly BlockJSON[];
      readonly settings: Readonly<Record<string, unknown>>;
    };

type Reading =
  | { kind: "doc" }
  | { kind: "view"; blocks: readonly BlockJSON[] }
  | { kind: "waiting" }
  | { kind: "unreadable" };

const READER_SIDES: readonly SideState[] = ["read_only", "view_only"];

function readingOf(handle: DocHandle): Reading {
  const status = handle.status.get();
  if (status.side.some((side) => !READER_SIDES.includes(side)))
    return { kind: "unreadable" };
  const view = handle.readOnly.get();
  if (view !== null) {
    const { live, link } = view.status.get();
    if (live) return { kind: "view", blocks: view.blocks.get() };
    return { kind: link === "offline" ? "unreadable" : "waiting" };
  }
  // a reader side without a live view never falls back to local CRDT state
  if (status.side.length > 0) return { kind: "unreadable" };
  if (status.docSync === "synced") return { kind: "doc" };
  if (status.link !== "offline") return { kind: "waiting" };
  return {
    kind: status.neverSynced && status.waiting === 0 ? "unreadable" : "doc",
  };
}

/** Settles once `handle` is authorised and readable, or unreadable (refused or never fetched offline). */
function settledReading(
  handle: DocHandle,
): Promise<Exclude<Reading, { kind: "waiting" }>> {
  return new Promise((resolve) => {
    const stops: (() => void)[] = [];
    let watched: ViewHandle | null = null;
    let settled = false;
    const read = (): void => {
      if (settled) return;
      const view = handle.readOnly.get();
      if (view !== null && view !== watched) {
        watched = view;
        stops.push(view.status.subscribe(check));
      }
      const reading = readingOf(handle);
      if (reading.kind === "waiting") return;
      settled = true;
      for (const stop of stops.splice(0)) stop();
      resolve(reading);
    };
    const check = (): void => queueMicrotask(read);
    stops.push(
      handle.status.subscribe(check),
      handle.readOnly.subscribe(check),
    );
    check();
  });
}

/**
 * Reads `sourceDocId` strictly under the caller's server-authoritative access:
 * - Refuses (`null`) when access was removed, the document was deleted, or the server denies read access.
 * - For viewers and commenters (`view_only`/`read_only`), reads only server-projected `ViewHandle` blocks and never
 *   touches the local CRDT document or private notes.
 */
export async function readSourceContent(
  services: Pick<PersonServices, "api" | "openHandle">,
  sourceDocId: string,
  signedIn: boolean,
): Promise<SourceContent | null> {
  const handle = await services.openHandle(sourceDocId);
  try {
    const reading = await settledReading(handle);
    if (reading.kind === "unreadable") return null;
    const status = handle.status.get();
    if (signedIn && status.link === "online" && !status.neverSynced) {
      const role = await services.api.role(sourceDocId);
      if (role === null) return null;
      if (reading.kind === "doc" && role !== "owner" && role !== "edit")
        return null;
    }
    if (reading.kind === "view") {
      if (reading.blocks.length === 0) return null;
      return { access: "view", blocks: [...reading.blocks], settings: {} };
    }
    const blocks = (
      scriptBody(handle.doc()).materialize().content ?? []
    ).flatMap((section) => section.content ?? []);
    if (blocks.length === 0) return null;
    return {
      access: "edit",
      blocks,
      settings: handle.settings.get(),
    };
  } finally {
    await handle.close();
  }
}
