import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { NAMES_WORDS, WRITING_TOOLS_WORDS } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { NameField } from "../src/names/name-field.tsx";
import { NumbersCast } from "../src/screens/document/numbers-cast.tsx";
import { CheckMark } from "../src/send/check-mark.tsx";
import { typeInto } from "./document-frame.fixtures.tsx";

withDom();

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

test("NumbersCast caps at 8 characters with share bars and expands on Show all", () => {
  const characters = Array.from({ length: 10 }, (_, idx) => ({
    name: `CHAR ${idx + 1}`,
    speeches: 10 - idx,
    words: (10 - idx) * 20,
  }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);

  act(() => {
    root.render(<NumbersCast characters={characters} />);
  });

  expect(host.querySelectorAll("dt").length).toBe(8);
  expect(host.querySelectorAll(".mn-share-fill").length).toBe(8);
  const toggle = host.querySelector("button")!;
  expect(toggle.textContent).toBe(WRITING_TOOLS_WORDS.numbersShowAll(10));

  act(() => {
    toggle.click();
  });
  expect(host.querySelectorAll("dt").length).toBe(10);
  expect(toggle.textContent).toBe(WRITING_TOOLS_WORDS.numbersShowFewer);
});

test("NameField guards case-insensitive duplicates, exposes Save/Cancel and cancels on Escape", () => {
  const results: (string | null)[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);

  act(() => {
    root.render(
      <NameField
        label={NAMES_WORDS.kinds.character.add}
        placeholder={NAMES_WORDS.kinds.character.placeholder}
        initial=""
        existingNames={["NORA"]}
        onDone={(name) => results.push(name)}
      />,
    );
  });

  const input = host.querySelector("input")!;
  const saveBtn = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === NAMES_WORDS.save,
  )!;

  typeInto(input, "nora");
  act(() => {
    saveBtn.click();
  });
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    NAMES_WORDS.alreadyListed("nora"),
  );
  expect(results).toEqual([]);

  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(results).toEqual([null]);
});

test("CheckMark sizes both icons to size-icon", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <div>
        <CheckMark ok={true} />
        <CheckMark ok={false} />
      </div>,
    );
  });
  const svgs = [...host.querySelectorAll("svg")];
  expect(
    svgs.every((s) => s.getAttribute("class")?.includes("size-icon")),
  ).toBe(true);
});
