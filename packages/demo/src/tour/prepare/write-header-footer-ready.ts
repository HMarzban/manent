// As Sam, puts The Lamp Room's Paper back to US Letter and its Header back to Page number.
import { scriptSettings } from "@manent/crdt";
import { seedDoc } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { LAMP_ROOM_US_LETTER } from "./lamp-room-us-letter.ts";
import { READY } from "./seeded-doc.ts";

const LAMP_ROOM_KEY = "medium/the-lamp-room/script";
const PAGE_NUMBER_HEADER = Object.freeze({
  left: Object.freeze({ kind: "none" }),
  center: Object.freeze({ kind: "none" }),
  right: Object.freeze({ kind: "page_number" }),
  firstPage: false,
  rule: false,
});

export const WRITE_HEADER_FOOTER_READY: TourPreparation = {
  id: "write-header-footer-ready",
  async run(driver, time) {
    const paper = await LAMP_ROOM_US_LETTER.run(driver, time);
    if (!paper.ok) return paper;
    const session = await driver.open("sam", seedDoc(LAMP_ROOM_KEY).docId);
    try {
      const held = scriptSettings(session.doc).entries()["script.header"];
      if (
        held === undefined ||
        JSON.stringify(held) === JSON.stringify(PAGE_NUMBER_HEADER)
      )
        return READY;
      if (
        (await session.set("script.header", PAGE_NUMBER_HEADER)) === "refused"
      )
        throw new SeedDriverError(
          "refused",
          `script.header on ${LAMP_ROOM_KEY}`,
        );
    } finally {
      await session.close();
    }
    return READY;
  },
};
