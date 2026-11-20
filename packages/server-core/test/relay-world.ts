// A service world whose two scripts are each written in their own mode, with the upstream and the
// device's storage state it reports to, and Sam's typing in either script.
import {
  ORIGIN_LOAD,
  createDoc,
  scriptBody,
  scriptDocFromJSON,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocJSON } from "@manent/schema";
import type { UpdateRow } from "@manent/storage";
import type { Message } from "@manent/sync-protocol";
import type { UpstreamItem, WriteMode } from "../src/index.ts";
import { BLOCK, DOC, DOC2, HOME, PROJECT, createTypist } from "./seed.ts";
import type { Typist } from "./seed.ts";
import { SAM_CLIENT, createServiceWorld } from "./service-world.ts";
import type { ServiceOptions, ServiceWorld } from "./service-world.ts";

export const B1 = BLOCK;
export const B2 = "b000000000000002";

export interface RelayWorld extends ServiceWorld {
  /** Each script's write mode, asked when its room is created and on modeChanged. */
  modes: Map<string, WriteMode>;
  upstream: { items: UpstreamItem[] };
  deviceStates: ("ok" | "failing")[];
  /** Sam's next edit of `docId`: `block` inserted holding `text` the first time, then `text` appended to it. */
  typingIn(docId: string, block?: string, text?: string): Uint8Array;
}

/**
 * DOC is the authority's and DOC2 is relayed, both scripts in PROJECT owned by Sam, which Dana
 * edits; any setting is accepted. Nobody is subscribed yet.
 */
export function createRelayWorld(options: ServiceOptions = {}): RelayWorld {
  const modes = new Map<string, WriteMode>([
    [DOC, "authority"],
    [DOC2, "relay"],
  ]);
  const upstream: { items: UpstreamItem[] } = { items: [] };
  const deviceStates: ("ok" | "failing")[] = [];
  const world = createServiceWorld({
    mode: (docId) => modes.get(docId) ?? "authority",
    upstream: { enqueue: (item) => void upstream.items.push(item) },
    onDeviceStorage: (state) => void deviceStates.push(state),
    registry: { check: () => ({ ok: true }), isGuarded: () => false },
    ...options,
  });
  world.service.access.create("sam", {
    docId: DOC2,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  world.storage.directory.setRole(DOC2, "dana", "edit", []);
  const typists = new Map<string, Typist>();
  const typed = new Map<string, Set<string>>();
  const typingIn = (docId: string, block = B1, text = "scene one") => {
    const typist = typists.get(docId) ?? createTypist(SAM_CLIENT);
    typists.set(docId, typist);
    const blocks = typed.get(docId) ?? new Set<string>();
    typed.set(docId, blocks);
    if (blocks.has(block)) return typist.type(block, text);
    const after = [...blocks].at(-1) ?? null;
    blocks.add(block);
    return typist.insertBlock(block, after, text);
  };
  return Object.assign(world, { modes, upstream, deviceStates, typingIn });
}

/** The current generation's rows of `docId` in HOME. */
export function tail(world: ServiceWorld, docId: string): UpdateRow[] {
  const { log } = world.storage.open(HOME);
  const generation = log.get(docId)?.generation ?? 0;
  return log.tail(docId, generation, 0).rows;
}

/** The document the current generation's rows of `docId` build. */
export function roomDoc(world: ServiceWorld, docId: string): CrdtDoc {
  const doc = createDoc();
  for (const { update } of tail(world, docId))
    doc.applyUpdate(update, ORIGIN_LOAD);
  return doc;
}

export const materialize = (doc: CrdtDoc): DocJSON =>
  scriptBody(doc).materialize();

/** `json` with the text of `blockId` replaced by `text`. */
export function withBlock(
  json: DocJSON,
  blockId: string,
  text: string,
): DocJSON {
  const content = (json.content ?? []).map((section) => ({
    ...section,
    content: (section.content ?? []).map((block) =>
      block.attrs?.id === blockId
        ? { ...block, content: [{ type: "text" as const, text }] }
        : block,
    ),
  }));
  return { ...json, content };
}

/** A new document holding `json`, written by `clientId`, as a rebuild at the cloud makes one. */
export const rebuiltFrom = (json: DocJSON, clientId: number): CrdtDoc =>
  scriptDocFromJSON(json, { clientId });

export const ack = (
  docId: string,
  clientSeq: number,
  serverSeq: number,
): Message => ({ type: "ACK", docId, generation: 1, clientSeq, serverSeq });
