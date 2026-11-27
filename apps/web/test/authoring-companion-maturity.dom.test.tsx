import { withDom } from "@manent/testkit/dom";
import { MATERIAL_WORDS, WRITING_TOOLS_WORDS } from "@manent/ui";
import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AlternatesPopover } from "../src/material/alternates/alternates-popover.tsx";
import { NumbersCast } from "../src/screens/document/numbers-cast.tsx";
import { typeInto } from "./document-frame.fixtures.tsx";

withDom();

describe("Section 1 authoring & companion maturity", () => {
  test("AlternatesPopover clamps left, trims whitespace, and distinguishes outside vs Escape vs button close", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const closed: (string | undefined)[] = [];
    const typed: string[] = [];
    const used: string[] = [];
    let parentEscape = false;
    const onParentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") parentEscape = true;
    };
    document.addEventListener("keydown", onParentKeyDown);

    await act(async () => {
      root.render(
        <AlternatesPopover
          rows={[
            {
              id: "alt-1",
              text: "Take the long way round.",
              writer: "Sam",
              pitched: true,
            },
          ]}
          place={{ left: 2000, top: 100, above: 80 }}
          focus="list"
          onUse={(id) => used.push(id)}
          onType={(text) => typed.push(text)}
          onClose={(reason) => closed.push(reason)}
        />,
      );
    });

    const dialog = host.querySelector<HTMLElement>(
      "[role='dialog'][data-tour='alternates']",
    );
    expect(dialog).not.toBeNull();
    const parsedLeft = Number.parseFloat(dialog?.style.left ?? "9999");
    expect(parsedLeft).toBeLessThanOrEqual(window.innerWidth - 8);

    const closeBtn = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${MATERIAL_WORDS.closeAlternates}"]`,
    );
    expect(closeBtn).not.toBeNull();

    const input = host.querySelector<HTMLInputElement>("input");
    const addBtn = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === MATERIAL_WORDS.addAlternate,
    );
    expect(input).not.toBeNull();
    expect(addBtn?.disabled).toBe(true);

    input!.focus();
    typeInto(input!, "   ");
    expect(addBtn?.disabled).toBe(true);

    typeInto(input!, "  Cut to the chase.  ");
    expect(addBtn?.disabled).toBe(false);

    await act(async () => {
      addBtn?.click();
    });
    expect(typed).toEqual(["Cut to the chase."]);

    await act(async () => {
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(closed).toEqual(["escape"]);
    expect(parentEscape).toBe(false);

    await act(async () => {
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(closed).toEqual(["escape", "outside"]);

    await act(async () => {
      closeBtn?.click();
    });
    expect(closed).toEqual(["escape", "outside", "button"]);

    document.removeEventListener("keydown", onParentKeyDown);
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  test("NumbersCast uses valid single-depth <dl> groups, exposes title on dt and aria-expanded on Show all", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const characters = Array.from({ length: 10 }, (_, i) => ({
      name: `CHARACTER_${i + 1}`,
      speeches: 10 - i,
      words: (10 - i) * 20,
    }));

    await act(async () => {
      root.render(<NumbersCast characters={characters} />);
    });

    const dl = host.querySelector("dl");
    expect(dl).not.toBeNull();
    const dts = [...host.querySelectorAll("dt")];
    expect(dts.length).toBe(8);
    // Every <dt> sits inside a single direct <div> child of <dl> (WCAG 1.3.1 dlitem)
    for (const dt of dts) {
      expect(dt.parentElement?.tagName).toBe("DIV");
      expect(dt.parentElement?.parentElement).toBe(dl);
    }
    expect(dts[0]?.getAttribute("title")).toBe("CHARACTER_1");

    const toggle = host.querySelector<HTMLButtonElement>("button");
    expect(toggle?.textContent).toBe(WRITING_TOOLS_WORDS.numbersShowAll(10));
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelectorAll("dt").length).toBe(10);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
