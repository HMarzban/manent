import "@manent/testkit/dom";
import { STUDIO_PALETTE_IDS } from "@manent/settings";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  ActivePaletteGem,
  HiddenGemIcon,
  ManentMark,
  ManentStackedLockup,
  ManentWordmark,
  PaletteGemButton,
  STUDIO_PALETTES,
} from "../src/index.ts";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
  host = null;
});

function renderIntoHost(element: React.ReactNode): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

test("brand components render the Bound M mark, [M]anent ligature and plain-ink stacked lockup with zero literal colours", () => {
  const container = renderIntoHost(
    <div>
      <ManentMark />
      <ManentWordmark />
      <ManentStackedLockup />
    </div>,
  );
  const svgs = container.querySelectorAll("svg");
  expect(svgs.length).toBe(3);
  const wordmark = container.querySelector(
    'span[role="img"][aria-label="Manent"]',
  );
  expect(wordmark?.textContent).toBe("anent");
  expect(container.textContent).toContain("Manent");
  for (const svg of svgs) {
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,6}/i);
  }
});

test("every one of the 24 studio palettes has metadata and a currentColor HiddenGemIcon", () => {
  expect(STUDIO_PALETTES.map((p) => p.id)).toEqual([...STUDIO_PALETTE_IDS]);
  const container = renderIntoHost(
    <div>
      {STUDIO_PALETTE_IDS.map((id) => (
        <HiddenGemIcon key={id} palette={id} />
      ))}
    </div>,
  );
  const paths = container.querySelectorAll("svg path");
  expect(paths.length).toBe(24);
  for (const path of paths) {
    expect(path.getAttribute("fill")).toBe("currentColor");
    expect((path.getAttribute("d") ?? "").length).toBeGreaterThan(20);
  }
});

test("ActivePaletteGem tracks html[data-palette] reactively and stays purely decorative", async () => {
  document.documentElement.removeAttribute("data-palette");
  const container = renderIntoHost(<ActivePaletteGem />);
  const span = container.querySelector<HTMLElement>("[data-palette-gem]");
  expect(span).not.toBeNull();
  expect(span?.getAttribute("aria-hidden")).toBe("true");
  expect(span?.classList.contains("mn-gem-only")).toBe(true);
  expect(span?.getAttribute("data-palette-gem")).toBe("studio");
  expect(span?.textContent).toBe("");
  const studioPath = span?.querySelector("svg path")?.getAttribute("d");

  await act(async () => {
    document.documentElement.setAttribute("data-palette", "celluloid");
    await Promise.resolve();
  });
  expect(span?.getAttribute("data-palette-gem")).toBe("celluloid");
  const celluloidPath = span?.querySelector("svg path")?.getAttribute("d");
  expect(celluloidPath).not.toBe(studioPath);

  await act(async () => {
    document.documentElement.setAttribute("data-palette", "unknown-palette");
    await Promise.resolve();
  });
  expect(span?.getAttribute("data-palette-gem")).toBe("studio");

  await act(async () => {
    document.documentElement.removeAttribute("data-palette");
    await Promise.resolve();
  });
  expect(span?.getAttribute("data-palette-gem")).toBe("studio");
});

test("clicking ActivePaletteGem opens the Museum Edition Collector Vitrine, fires click bursts, browses all 24 themes, toggles sound, applies a theme, and closes on data-gems=off", async () => {
  document.documentElement.setAttribute("data-palette", "celluloid");
  document.documentElement.removeAttribute("data-gems");
  let openedAppearance = 0;
  const applied: string[] = [];
  const visited: string[] = [];
  const container = renderIntoHost(
    <ActivePaletteGem
      keptPalettes={["celluloid", "studio"]}
      onVisitPalette={(id) => {
        visited.push(id);
      }}
      onSelectPalette={(next) => {
        applied.push(next);
      }}
      onOpenAppearance={() => {
        openedAppearance += 1;
      }}
    />,
  );
  const trigger = container.querySelector<HTMLElement>("[data-palette-gem]");
  expect(trigger).not.toBeNull();
  expect(document.querySelector("[data-gem-popover]")).toBeNull();

  await act(async () => {
    trigger!.click();
    await Promise.resolve();
  });

  const popover = document.querySelector<HTMLElement>("[data-gem-popover]");
  expect(popover).not.toBeNull();
  expect(popover?.getAttribute("data-gem-popover")).toBe("celluloid");
  expect(popover?.getAttribute("data-popup-open")).toBe("");
  expect(popover?.textContent).toContain("Celluloid");
  expect(popover?.textContent).toContain("04 / 24");
  expect(popover?.textContent).toContain("2 of 24 kept");
  expect(popover?.textContent).toContain(
    "Sixty-five millimetres, desert light and a clean cut before dawn.",
  );
  expect(visited).toContain("celluloid");

  // Pointer click on stage fires an interactive burst; Play again replays full choreography.
  const stage = popover!.querySelector<HTMLButtonElement>("[data-gem-stage]");
  expect(stage?.getAttribute("data-gem-run")).toBe("0");
  expect(stage?.getAttribute("data-gem-bursts")).toBe("0");

  await act(async () => {
    stage!.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        detail: 1,
        clientX: 80,
        clientY: 50,
      }),
    );
    await Promise.resolve();
  });
  expect(stage?.getAttribute("data-gem-bursts")).toBe("1");

  const playAgain = [...popover!.querySelectorAll("button")].find((btn) =>
    btn.textContent?.includes("Play again"),
  );
  expect(playAgain).toBeDefined();
  await act(async () => {
    playAgain!.click();
    await Promise.resolve();
  });
  expect(stage?.getAttribute("data-gem-run")).toBe("1");

  // Sound toggle flips aria-pressed cleanly.
  const soundBtn = popover!.querySelector<HTMLButtonElement>(
    "button[aria-label='Sound off']",
  );
  expect(soundBtn?.getAttribute("aria-pressed")).toBe("false");
  await act(async () => {
    soundBtn!.click();
    await Promise.resolve();
  });
  expect(
    popover!
      .querySelector<HTMLButtonElement>("button[aria-label='Sound on']")
      ?.getAttribute("aria-pressed"),
  ).toBe("true");

  // Stepping to Next theme previews the next gem live and offers Apply theme.
  const nextBtn = popover!.querySelector<HTMLButtonElement>(
    "button[aria-label='Next theme']",
  );
  await act(async () => {
    nextBtn!.click();
    await Promise.resolve();
  });
  expect(popover?.getAttribute("data-gem-popover")).toBe("nightwire");
  expect(popover?.getAttribute("data-palette")).toBe("nightwire");
  expect(popover?.textContent).toContain("Electric sheep");
  expect(popover?.textContent).toContain("05 / 24");

  const applyTheme = [...popover!.querySelectorAll("button")].find((btn) =>
    btn.textContent?.includes("Apply theme"),
  );
  expect(applyTheme).toBeDefined();
  await act(async () => {
    applyTheme!.click();
    await Promise.resolve();
  });
  expect(applied).toEqual(["nightwire"]);

  // Stepping back returns to Change theme.
  const prevBtn = popover!.querySelector<HTMLButtonElement>(
    "button[aria-label='Previous theme']",
  );
  await act(async () => {
    prevBtn!.click();
    await Promise.resolve();
  });
  expect(popover?.getAttribute("data-gem-popover")).toBe("celluloid");

  // Switching data-gems="off" closes the vitrine automatically.
  await act(async () => {
    document.documentElement.setAttribute("data-gems", "off");
    await Promise.resolve();
  });
  expect(document.querySelector("[data-gem-popover]")).toBeNull();

  // Re-enabling and clicking "Change theme" closes the vitrine and invokes the callback.
  await act(async () => {
    document.documentElement.removeAttribute("data-gems");
    trigger!.click();
    await Promise.resolve();
  });
  const reopened = document.querySelector<HTMLElement>("[data-gem-popover]");
  const changeTheme = [...(reopened?.querySelectorAll("button") ?? [])].find(
    (btn) => btn.textContent?.includes("Change theme"),
  );
  expect(changeTheme).toBeDefined();
  await act(async () => {
    changeTheme!.click();
    await Promise.resolve();
  });
  expect(openedAppearance).toBe(1);
  expect(document.querySelector("[data-gem-popover]")).toBeNull();
  await act(async () => {
    document.documentElement.removeAttribute("data-palette");
    await Promise.resolve();
  });
});

test("PaletteGemButton provides an accessible trigger button that opens the Collector Vitrine", async () => {
  const container = renderIntoHost(<PaletteGemButton palette="nocturne" />);
  const button = container.querySelector<HTMLButtonElement>(
    "[data-palette-gem-button='nocturne']",
  );
  expect(button).not.toBeNull();
  expect(button?.getAttribute("aria-label")).toBe("Crossroads hidden gem");

  await act(async () => {
    button!.click();
    await Promise.resolve();
  });

  const popover = document.querySelector<HTMLElement>("[data-gem-popover]");
  expect(popover?.getAttribute("data-gem-popover")).toBe("nocturne");
  expect(popover?.textContent).toContain("Crossroads");
  expect(popover?.textContent).toContain("24 / 24");
});
