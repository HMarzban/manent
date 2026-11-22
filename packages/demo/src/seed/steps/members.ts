// The Small workspace's index and the roles its members hold.
import type { SeedStep } from "../seed.ts";
import { createStory } from "../story.ts";

export const MEMBERS_STEP: SeedStep = {
  id: "members",
  workspace: "small",
  background: false,
  async run(context) {
    const { driver } = context;
    if (driver === null) return [];
    // the workspace is as old as the oldest project in it
    await createStory(context, "members").at("D−120");
    await driver.workspace("sam", "small", [
      { userId: "nell-varga", role: "comment", capabilities: [] },
    ]);
    return [];
  },
};
