// The person's private copy against the room's script, each as the server holds it now, counted by scene.
import { compareDocs } from "@manent/revisions";
import type { Comparison } from "@manent/revisions";
import type { BlockJSON } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";
import { docOfContent } from "../history/content-doc.ts";
import type { PersonServices } from "../services/ports.ts";
import { askHead } from "./requests.ts";

/** One scene of the copy's changes: `scene` is its number as the script shows it. */
export interface SceneChanges {
  sceneId: string;
  scene: string;
  changes: number;
}

export interface CopyChanges {
  /** The room's script, the side the copy's changes are drawn against. */
  room: VersionContent;
  comparison: Comparison;
  scenes: readonly SceneChanges[];
}

const HEADINGS: readonly string[] = ["scene_heading", "slug", "chapter"];

/** By heading id, the scene's number: its stored `num`, else its count among the headings from 1. */
function sceneNumbers(blocks: readonly BlockJSON[]): Map<string, string> {
  const numbers = new Map<string, string>();
  for (const { attrs } of blocks) {
    if (attrs === undefined || !HEADINGS.includes(String(attrs.type))) continue;
    const num = typeof attrs.num === "string" ? attrs.num : null;
    if (typeof attrs.id === "string")
      numbers.set(attrs.id, num ?? String(numbers.size + 1));
  }
  return numbers;
}

/** The changes of `comparison` counted by scene, in its order; a scene the copy removed takes the room's number. */
function countByScene(
  comparison: Comparison,
  copy: readonly BlockJSON[],
  room: readonly BlockJSON[],
): SceneChanges[] {
  const counts = new Map<string, number>();
  for (const entry of comparison.entries)
    if ((entry.kind !== "unchanged" || entry.moved) && entry.sceneId !== null)
      counts.set(entry.sceneId, (counts.get(entry.sceneId) ?? 0) + 1);
  const copyNumbers = sceneNumbers(copy);
  const roomNumbers = sceneNumbers(room);
  return comparison.scenes.map((sceneId) => ({
    sceneId,
    scene: copyNumbers.get(sceneId) ?? roomNumbers.get(sceneId) ?? "",
    changes: counts.get(sceneId) ?? 0,
  }));
}

/** The content of `docId` at the head the server holds; null when the server or the schema cannot give it. */
async function contentAtHead(
  services: Pick<PersonServices, "userId" | "history">,
  docId: string,
): Promise<VersionContent | null> {
  const head = await askHead(services.userId, docId);
  return head === null
    ? null
    : services.history.content(docId, { position: head });
}

/** The changes of the private copy `privateDocId` against the room's script `docId`; null while either cannot be read. */
export async function compareCopy(
  services: Pick<PersonServices, "userId" | "history">,
  docId: string,
  privateDocId: string,
): Promise<CopyChanges | null> {
  const [room, copy] = await Promise.all([
    contentAtHead(services, docId),
    contentAtHead(services, privateDocId),
  ]);
  const older = room === null ? null : docOfContent(room);
  const newer = copy === null ? null : docOfContent(copy);
  if (room === null || copy === null || older === null || newer === null)
    return null;
  const comparison = compareDocs(older, newer);
  return {
    room,
    comparison,
    scenes: countByScene(comparison, copy.blocks, room.blocks),
  };
}
