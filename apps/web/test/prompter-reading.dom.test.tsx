import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { PROMPTER_WINDOW_WORDS, TimingProvider } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { PrompterReading } from "../src/screens/present/prompter/prompter-reading.tsx";
import { createClock } from "./services.fixtures.ts";

withDom();

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
});

test("the prompter reading area is keyboard-focusable for scrolling", () => {
  const clock = createClock();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  act(() =>
    mounted?.render(
      <TimingProvider timing={{ now: clock.now, schedule: clock.schedule }}>
        <PrompterReading
          surfaceState={{ kind: "ready" }}
          stories={[
            {
              rowId: "row-1",
              blocks: [
                {
                  key: "row-1:0",
                  rowId: "row-1",
                  kind: "dialogue",
                  text: "Good evening.",
                },
              ],
            },
          ]}
          textSize={48}
          mirror={false}
        />
      </TimingProvider>,
    ),
  );
  const main = container.querySelector("main");
  act(() => main?.focus());
  expect({
    label: main?.getAttribute("aria-label") ?? null,
    tabIndex: main?.getAttribute("tabindex") ?? null,
    focused: document.activeElement === main,
  }).toEqual({
    label: PROMPTER_WINDOW_WORDS.readingAreaLabel,
    tabIndex: "0",
    focused: true,
  });
});
