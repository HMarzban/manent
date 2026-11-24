// As Sam, puts "Marguerita" back in scene 4 of 205 Slack Water (room script and Sam's private copy if open).
import { jsonMap, scriptBody } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import { seedDoc } from "../../seed/catalogue.ts";
import type { SeedDriver } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

const LINE_PREFIX = "Down on the slip the ";
const LISTED = "Marguerite";
const MISSPELLING = "Marguerita";

async function restoreInDoc(
  driver: SeedDriver,
  userId: string,
  docId: string,
): Promise<void> {
  const session = await driver.open(userId, docId);
  try {
    const blocks = blocksOf(scriptBody(session.doc).materialize());
    const target = blocks.find((block) =>
      blockText(block).includes(LINE_PREFIX),
    );
    if (target === undefined || target.attrs.id === null) return;
    const text = blockText(target);
    const at = text.indexOf(LISTED);
    if (at === -1 || text.includes(MISSPELLING)) return;
    const blockId = target.attrs.id;
    await session.change((doc) =>
      scriptBody(doc).write((writer) => {
        writer.deleteText(blockId, at, LISTED.length);
        writer.insertText(blockId, at, MISSPELLING);
      }),
    );
  } finally {
    await session.close();
  }
}

async function openPrivateCopyId(
  driver: SeedDriver,
  userId: string,
  roomDocId: string,
): Promise<string | null> {
  const session = await driver.open(userId, indexDocId("user", userId));
  try {
    const entry = jsonMap(session.doc, "private_copies").get(roomDocId);
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      return null;
    const copyId = Reflect.get(entry, "privateDocId");
    const handedInAt = Reflect.get(entry, "handedInAt");
    return typeof copyId === "string" && handedInAt === null ? copyId : null;
  } finally {
    await session.close();
  }
}

export const WRITE_NAMES_READY: TourPreparation = {
  id: "write-names-ready",
  async run(driver) {
    const { docId } = seedDoc("medium/harbour-lights/205");
    if (driver.privateCopies !== null)
      await driver.privateCopies.setPosition("sam", docId, "everyone");
    await restoreInDoc(driver, "sam", docId);
    const privateCopyId = await openPrivateCopyId(driver, "sam", docId);
    if (privateCopyId !== null)
      await restoreInDoc(driver, "sam", privateCopyId);
    return READY;
  },
};
