import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import {
  ToReview,
  useToReviewVisible,
} from "../src/screens/document/to-review.tsx";
import {
  DOC_ID,
  buttonNamed,
  click,
  nameOf,
  region,
  renderFrame,
  unmountFrame,
} from "./document-frame.fixtures.tsx";
import type { Frame } from "./document-frame.fixtures.tsx";
import {
  B1,
  B2,
  fakeReview,
  overlap,
  sceneEightDoc,
} from "./review-dom.fixtures.ts";
import { turn, until } from "./sync.fixtures.ts";

withDom();

const HISTORY = "../src/screens/document/history-sections.ts";

// To review alone, so that the History tab is there for it or for nothing
mock.module(HISTORY, () => ({
  HISTORY_SECTIONS: [
    { id: "to_review", Section: ToReview, useVisible: useToReviewVisible },
  ],
}));

afterEach(() => {
  unmountFrame();
});

/** Runs `commandId` as a control does, lets what a panel loads apart arrive, then lets a frame pass. */
async function run(frame: Frame, commandId: string): Promise<void> {
  await act(async () => {
    frame.services.commands.run(commandId, "control");
  });
  await act(async () => {
    frame.clock.advance(16);
  });
}

/**
 * Waits until `done` holds, a turn at a time, each in its own act: React draws what a lazily loaded part
 * brings only once the act it arrives in ends, so a wait held inside one act would never see it.
 */
const drawnWhen = (done: () => boolean): Promise<void> =>
  until(done, () => act(turn));

const sidePanel = (frame: Frame): HTMLElement =>
  region(frame.container, "side_panel");

/** The side panel's tabs; none while it is closed. */
const tabs = (frame: Frame): string[] =>
  [
    ...frame.container.querySelectorAll(
      "[data-region='side_panel'] [role='tab']",
    ),
  ].map(nameOf);

/** To review as drawn: its heading, then each entry's words and its choices. */
function drawn(frame: Frame): string[] {
  const section = sidePanel(frame).querySelector(
    "section[aria-label='To review']",
  );
  return [...(section?.querySelectorAll("h3, .mn-row, p, button") ?? [])].map(
    nameOf,
  );
}

test("To review shows both wordings, named, with the three choices", async () => {
  const review = fakeReview(sceneEightDoc());
  review.entriesOf.set([overlap("item-1", DOC_ID, B1, ["sam"])]);
  const frame = await renderFrame({ review });
  await run(frame, "history.open");
  // the rows load apart from the entry
  await drawnWhen(() => drawn(frame).length > 0);
  expect(drawn(frame)).toEqual([
    "To review · 1",
    "Sc. 8 · you and Sam both changed this",
    "The tide turns at once.",
    "The tide holds.",
    "Keep as merged",
    "Use mine",
    "Use Sam's",
  ]);
});

test("History opens from the title bar while something is to review, and closes when resolved", async () => {
  const review = fakeReview(sceneEightDoc());
  const frame = await renderFrame({ review });
  await run(frame, "view.sidePanel");
  const without = tabs(frame);
  act(() => review.entriesOf.set([overlap("item-1", DOC_ID, B1, [])]));
  await run(frame, "history.open");
  await drawnWhen(() => drawn(frame).length > 0);
  const withOne = [
    tabs(frame),
    sidePanel(frame).querySelector("header h2")?.textContent ?? null,
    drawn(frame).slice(0, 2),
  ];
  await click(buttonNamed(sidePanel(frame), "Keep as merged"));
  await act(async () => {
    frame.clock.advance(16);
  });
  expect([
    without,
    withOne,
    tabs(frame),
    review.asked,
    document.activeElement
      ?.closest("[data-region]")
      ?.getAttribute("data-region"),
  ]).toEqual([
    ["Comments", "Details"],
    [
      [],
      "Version history",
      ["To review · 1", "Sc. 8 · changed here and elsewhere"],
    ],
    // the panel closes with the standalone History panel it showed
    [],
    ["keep item-1"],
    "page",
  ]);
});

test("Review in the message and in the Sync centre opens To review with focus on its first item", async () => {
  const review = fakeReview(sceneEightDoc());
  review.entriesOf.set([
    overlap("item-1", DOC_ID, B1, ["dana", "sam"]),
    overlap("item-2", DOC_ID, B2, ["dana", "sam", "leo"]),
  ]);
  const frame = await renderFrame({ review });
  await run(frame, "history.review");
  await drawnWhen(
    () => document.activeElement?.closest("[data-review-block]") != null,
  );
  const focused = nameOf(document.activeElement ?? document.body);
  const row = document.activeElement?.closest("[data-review-block]");
  expect([
    focused,
    row?.getAttribute("data-review-block"),
    drawn(frame).filter((words) => words.startsWith("Use")),
  ]).toEqual([
    "Keep as merged",
    B1,
    ["Use mine", "Use Dana and Sam's", "Use mine", "Use the other wording"],
  ]);
});
