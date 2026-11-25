// What a settled desktop world keeps, judged against the cloud's and the node's logs, the window,
// the node's records and the person's upstream store.
import { ORIGIN_LOAD, createDoc, loadDoc, readStateVector } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { NodeRecords } from "@manent/local-node";
import type { Storage } from "@manent/storage";
import type { LoadedDocument } from "@manent/sync-client";
import { DOC, MARKER, linesOf, markersIn } from "./device.ts";
import type { Books, Device } from "./device.ts";
import { HOME } from "./script.ts";

/** The script's current generation as `storage`'s log alone holds it; empty when it holds none. The caller destroys it. */
function logDoc(storage: Storage): CrdtDoc {
  const doc = createDoc();
  if (storage.directory.placeOf(DOC) === null) return doc;
  const { log } = storage.open(HOME);
  const row = log.get(DOC);
  if (row !== null)
    for (const { update } of log.tail(DOC, row.generation, 0).rows)
      doc.applyUpdate(update, ORIGIN_LOAD);
  return doc;
}

export function logText(storage: Storage): string[] {
  const doc = logDoc(storage);
  const lines = linesOf(doc);
  doc.destroy();
  return lines;
}

/** The markers `window` typed that its document holds now. */
export function heldMarkers(books: Books, window: Device): string[] {
  const held = [...markersIn(window.lines())];
  return held.filter((marker) => books.typist.get(marker) === window);
}

/** D5, at a status that says synced: a marker the window holds that the cloud's log does not. */
export function unsyncedMarker(
  books: Books,
  window: Device,
  cloud: Storage,
): string | null {
  const text = logText(cloud).join("\n");
  return heldMarkers(books, window).find((m) => !text.includes(m)) ?? null;
}

export interface DesktopFacts {
  person: string;
  cloud: Storage;
  node: Storage;
  window: Device;
  books: Books;
  records: NodeRecords;
  /** Markers the window held while the node had acknowledged everything it sent. */
  acked: ReadonlySet<string>;
  /** The network is up, the disk free and the node running. */
  up: boolean;
  /** The person has a cloud session. */
  session: boolean;
  /** The key of the first hand-off the node stored. */
  firstKey: string | null;
  refusals: { heard: number; caused: number };
  /** D5 and D7, found as the world moved. */
  found: { d5: string | null; d7: string | null };
}

/** D2: one text everywhere, every marker in it or in Recovered text, none twice. */
function syncFault(
  facts: DesktopFacts,
  node: string,
  kept: (marker: string) => boolean,
): string | null {
  const cloud = logText(facts.cloud).join("\n");
  if (cloud !== node || node !== facts.window.lines().join("\n"))
    return "D2: the cloud, the node and the window hold different text";
  for (const marker of facts.books.typist.keys())
    if (!kept(marker))
      return `D2: ${marker} is in neither the script nor its Recovered text`;
  const markers = cloud.match(MARKER) ?? [];
  if (new Set(markers).size !== markers.length)
    return "D2: a marker appears twice in the script";
  return null;
}

/** D3: one adoption, under the key the node stored first, for the person. */
function adoptionFault({ cloud, firstKey, person }: DesktopFacts) {
  if (cloud.directory.placeOf(DOC) === null) return null;
  const file = cloud.open(HOME);
  const row = file.adoptions.get(DOC);
  if (row === null) return null;
  if (row.key !== firstKey || row.userId !== person)
    return `D3: the cloud adopted the script under ${row.key} for ${row.userId}, not ${firstKey} for ${person}`;
  const { rows } = file.log.tail(DOC, 1, 0, { quarantine: false });
  const imports = rows.filter((logged) => logged.origin === "import").length;
  return imports > 1
    ? `D3: the cloud took the script in ${imports} times`
    : null;
}

/** In the Recovered text of a device that held it: a collaborator's client files its own text a deletion left unplaced. */
function isRecoveredByHolder(books: Books, marker: string): boolean {
  return [...(books.holders.get(marker) ?? [])].some((device) =>
    device.handle.recovered.get().some((item) => item.text.includes(marker)),
  );
}

/** The first of D1–D7 broken, named; null when all hold. D2 and D7 hold only with the world up. */
export function firstDesktopBroken(facts: DesktopFacts): string | null {
  const { books, records, refusals, found, up } = facts;
  const node = logText(facts.node).join("\n");
  const items = [
    ...facts.window.handle.recovered.get(),
    ...records.recovered(DOC),
  ];
  const recovered = items.map((item) => item.text).join("\n");
  const kept = (marker: string): boolean =>
    node.includes(marker) ||
    recovered.includes(marker) ||
    isRecoveredByHolder(books, marker) ||
    books.removed.has(marker);
  for (const marker of facts.acked)
    if (!kept(marker))
      return `D1: ${marker} was acknowledged and is not in the node's log`;
  const synced = up && facts.session ? syncFault(facts, node, kept) : null;
  if (synced !== null) return synced;
  const adopted = adoptionFault(facts);
  if (adopted !== null) return adopted;
  if (refusals.heard > refusals.caused)
    return `D4: the cloud refused ${refusals.heard} of the node's pushes and was asked to refuse ${refusals.caused}`;
  if (up && found.d7 !== null) return found.d7;
  if (found.d5 !== null) return found.d5;
  const placed = facts.cloud.directory.placeOf(DOC) !== null;
  if (facts.person === "you" && !facts.session && placed)
    return "D6: the cloud holds the script before You signed in to sync";
  return null;
}

/** The document an upstream store holds. The caller destroys it. */
function storedDoc(loaded: LoadedDocument): CrdtDoc {
  const { checkpoint } = loaded;
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  for (const entry of loaded.entries)
    if (entry.kind === "update") doc.applyUpdate(entry.update, ORIGIN_LOAD);
  return doc;
}

const vectorOf = (doc: CrdtDoc): Map<number, number> => {
  const vector = readStateVector(doc.encodeStateVector());
  doc.destroy();
  return vector;
};

/** D7: the node's room and the person's upstream store on the room's cloud generation hold one history of the person's client IDs. */
export function historyFault(options: {
  person: string;
  node: Storage;
  records: NodeRecords;
  upstream: LoadedDocument | null;
}): string | null {
  const { person, node, upstream } = options;
  const state = options.records.docState(DOC);
  if (state?.state !== "synced" || upstream === null) return null;
  if (upstream.meta.generation !== state.generation) return null;
  const ours = vectorOf(logDoc(node));
  const theirs = vectorOf(storedDoc(upstream));
  for (const [clientId, { userId }] of node.open(HOME).log.ledger(DOC))
    if (
      userId === person &&
      (ours.get(clientId) ?? 0) !== (theirs.get(clientId) ?? 0)
    )
      return `D7: the node's room and the upstream hold different histories of client ${clientId}`;
  return null;
}
