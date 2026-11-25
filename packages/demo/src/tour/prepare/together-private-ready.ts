// As Sam, ensures his private copy of 205 Slack Water is still open and selected; returns used once handed in.
import { jsonMap } from "@manent/crdt";
import { indexDocId } from "@manent/sync-protocol";
import { seedDoc } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY, USED } from "./seeded-doc.ts";

export const TOGETHER_PRIVATE_READY: TourPreparation = {
  id: "together-private-ready",
  async run(driver) {
    if (driver.privateCopies === null)
      throw new SeedDriverError(
        "unavailable",
        "the server has no private copies",
      );
    const { docId } = seedDoc("medium/harbour-lights/205");
    const session = await driver.open("sam", indexDocId("user", "sam"));
    let openCopy = false;
    try {
      const entry = jsonMap(session.doc, "private_copies").get(docId);
      openCopy =
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof Reflect.get(entry, "privateDocId") === "string" &&
        Reflect.get(entry, "handedInAt") === null;
    } finally {
      await session.close();
    }
    if (!openCopy) return USED;
    await driver.privateCopies.setPosition("sam", docId, "private");
    return READY;
  },
};
