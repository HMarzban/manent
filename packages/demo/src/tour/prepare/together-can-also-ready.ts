// As Dana, ensures Priya's issue/lock capability is recorded in The Long Night's project index can_also map.
import { writeProjectKey } from "@manent/crdt";
import { indexDocId } from "@manent/sync-protocol";
import { seedProject } from "../../seed/catalogue.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

export const TOGETHER_CAN_ALSO_READY: TourPreparation = {
  id: "together-can-also-ready",
  async run(driver) {
    const { projectId } = seedProject("medium/the-long-night");
    const session = await driver.open("dana", indexDocId("project", projectId));
    try {
      await session.change((doc) => {
        writeProjectKey(doc, "can_also", "issue_revisions", {
          userIds: ["priya"],
          groupIds: [],
        });
        writeProjectKey(doc, "can_also", "lock_page_numbers", {
          userIds: ["priya"],
          groupIds: [],
        });
      });
    } finally {
      await session.close();
    }
    return READY;
  },
};
