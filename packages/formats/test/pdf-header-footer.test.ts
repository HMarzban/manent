import { expect, test } from "bun:test";
import { paginate, profileFor, toLayoutBlocks } from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { durationOfParts } from "../src/pdf/furniture/header-footer.ts";

test("durationOfParts excludes blocks marked noTiming when falling back to pagination timing", () => {
  const variety = profileFor("variety");
  if (variety === null) throw new TypeError("no variety profile");

  const docWithNoTiming: DocJSON = {
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: { id: "block001", type: "dialogue", noTiming: false },
            content: [{ type: "text", text: "Good evening everybody." }],
          },
          {
            type: "block",
            attrs: { id: "block002", type: "dialogue", noTiming: true },
            content: [
              {
                type: "text",
                text: "This long untimed rehearsal note should never add to the fallback running time.",
              },
            ],
          },
        ],
      },
    ],
  };

  const docTimedOnly: DocJSON = {
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: { id: "block001", type: "dialogue", noTiming: false },
            content: [{ type: "text", text: "Good evening everybody." }],
          },
        ],
      },
    ],
  };

  const withUntimed = paginate(
    toLayoutBlocks(blocksOf(docWithNoTiming)),
    variety,
  );
  const timedOnly = paginate(toLayoutBlocks(blocksOf(docTimedOnly)), variety);

  expect(withUntimed.blocks[1]?.noTiming).toBe(true);
  expect(durationOfParts([withUntimed])).toBe(durationOfParts([timedOnly]));
  expect(durationOfParts([withUntimed])).toBeGreaterThan(0);
});
