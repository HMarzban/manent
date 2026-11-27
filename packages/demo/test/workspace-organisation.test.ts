import { expect, test } from "bun:test";
import { parseSeedText } from "../src/content/markup.ts";
import { PRIVATE_DRAFTS } from "../src/seed/steps/private-drafts-data.ts";

const BANNED_VISIBLE_WORDS =
  /\b(generation|rebuild|conflict|error|failed|starred)\b/i;

test("private drafts cover all five registered personas and leave 'you' empty", () => {
  const users = new Set(PRIVATE_DRAFTS.map((draft) => draft.userId));
  expect([...users].toSorted()).toEqual(["ana", "dana", "leo", "priya", "sam"]);
  expect(users.has("you")).toBe(false);
});

test("private drafts span multiple real formats with unique ids and valid markup", () => {
  const formats = new Set(PRIVATE_DRAFTS.map((draft) => draft.format));
  expect(formats.has("screenplay")).toBe(true);
  expect(formats.has("manuscript")).toBe(true);
  expect(formats.has("stage_play")).toBe(true);
  expect(formats.has("game")).toBe(true);
  expect(formats.has("variety")).toBe(true);

  const projectIds = new Set(PRIVATE_DRAFTS.map((draft) => draft.projectId));
  const docIds = new Set(PRIVATE_DRAFTS.map((draft) => draft.docId));
  expect(projectIds.size).toBe(PRIVATE_DRAFTS.length);
  expect(docIds.size).toBe(PRIVATE_DRAFTS.length);

  for (const draft of PRIVATE_DRAFTS) {
    const parsed = parseSeedText(draft.text);
    expect(parsed.blocks.length).toBeGreaterThanOrEqual(3);
    expect(draft.projectTitle).not.toMatch(BANNED_VISIBLE_WORDS);
    expect(draft.docTitle).not.toMatch(BANNED_VISIBLE_WORDS);
    for (const block of parsed.blocks) {
      expect(block.text).not.toMatch(BANNED_VISIBLE_WORDS);
    }
  }
});
