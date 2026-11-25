// A scene written elsewhere, pasted as Fountain: it lands as elements, and one undo leaves it as the plain text it was.
import { EDITOR_WORDS, IMPORT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { EDITABLE, blocks, openScript, transfer } from "../editor/support.ts";
import { pressKeyOf } from "../support/interface.ts";
import { fixtureText, messageSlot } from "./support.ts";

test("pasted Fountain becomes elements, and Undo leaves it plain", async ({
  page,
}) => {
  await openScript(page, "screenplay");
  const text = fixtureText("text/fountain.txt");
  await transfer(page, "paste", { "text/plain": text });
  await expect
    .poll(async () => (await blocks(page)).map((b) => [b.type, b.text]))
    .toEqual([
      ["scene_heading", "INT. LAMP ROOM - NIGHT"],
      ["action", "Esme winds the clockwork drive. The lens turns."],
      ["character", "ROS"],
      ["dialogue", "You'll wear your arms out."],
      ["character", "ESME"],
      ["parenthetical", "(not looking round)"],
      ["dialogue", "It's the motor that's failed. Not me."],
      ["transition", "CUT TO:"],
    ]);
  const [first] = await blocks(page);
  if (first === undefined) throw new Error("the paste left no line");
  await page.locator(`${EDITABLE} [data-id="${first.id}"]`).click();
  await expect(
    page.getByRole("button", {
      name: EDITOR_WORDS.elementButton(EDITOR_WORDS.elements.scene_heading),
    }),
  ).toBeVisible();
  await expect(
    messageSlot(page).getByText(IMPORT_WORDS.pastedAs(8)),
  ).toBeVisible();
  await pressKeyOf(page, "edit.undo");
  // the plain paste: one Action per line, the note's brackets and the blank lines as they were
  await expect
    .poll(async () => (await blocks(page)).map((b) => [b.type, b.text]))
    .toEqual(text.split("\n").map((line) => ["action", line]));
});
