import { withDom } from "@manent/testkit/dom";
import { afterEach, describe, expect, test } from "bun:test";
import type { DraftOpenResponse, VersionContent } from "@manent/sync-protocol";
import { INK_WORDS, READER_WORDS, createValue } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { writeCachedDraft } from "../src/reader/reader-storage.ts";
import { ReaderScreen } from "../src/screens/reader/reader-screen.tsx";
import { EnvironmentProvider } from "../src/services/context.tsx";
import { createPersonStore } from "../src/state/person.store.ts";
import {
  MemoryStorage,
  createClock,
  createStorageEvents,
  fakeApi,
  testEnvironment,
} from "./services.fixtures.ts";

withDom();

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function flushUi(turns = 16): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

function inkContent(
  source: string,
  settings: Record<string, unknown> = { "script.format": "ink" },
): VersionContent {
  const lines = source === "" ? [] : source.split("\n");
  return {
    v: 1,
    schemaVersion: 1,
    engineVersion: 1,
    blocks: lines.map((text, index) => ({
      type: "block",
      attrs: {
        id: `inkline${String(index + 1).padStart(4, "0")}`,
        type: "ink_line",
      },
      ...(text === "" ? {} : { content: [{ type: "text", text }] }),
    })),
    locks: null,
    settings,
    authors: {},
  };
}

function scriptContent(): VersionContent {
  return {
    v: 1,
    schemaVersion: 1,
    engineVersion: 1,
    blocks: [
      {
        type: "block",
        attrs: { id: "block001", type: "scene_heading" },
        content: [{ type: "text", text: "INT. PIER - DAY" }],
      },
      {
        type: "block",
        attrs: { id: "block002", type: "action" },
        content: [{ type: "text", text: "Waves hit the pilings." }],
      },
    ],
    locks: null,
    settings: {},
    authors: {},
  };
}

const SAMPLE_INK = [
  "VAR trust = 0",
  "VAR lit = false",
  "Gull Point Light stands above the rocks.",
  "-> stairs",
  "",
  "=== stairs ===",
  "You climb the stairs. The lamp is cold.",
  "* [Read the logbook]",
  "  ~ trust = trust + 1",
  "  You read the pencil notes.",
  "  -> lamp",
  "* [Leave it closed]",
  "  You leave the book shut.",
  "  -> lamp",
  "",
  "=== lamp ===",
  "{trust > 0:Esme nods toward the switch.|Esme keeps her hand on the brass.}",
  "* [Light the lamp]",
  "  ~ lit = true",
  "  A blade of light swings out over the water.",
  "  -> END",
].join("\n");

function sampleInkDraft(
  overrides: Partial<DraftOpenResponse> = {},
): DraftOpenResponse {
  return {
    docId: "doc-ink-1",
    sendId: "send-ink-1",
    versionId: "ver-ink-1",
    name: "For the museum",
    sentAt: Date.UTC(2026, 10, 16, 12, 0, 0),
    content: inkContent(SAMPLE_INK),
    watermark: "Leo Marsh",
    canComment: false,
    lastReadVersionId: null,
    docKind: "ink",
    ...overrides,
  };
}

function dispatchInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
}

function okFetch(draft: DraftOpenResponse): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(draft), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

async function mountReader(options: {
  token?: string;
  fetch: typeof fetch;
  storage?: Storage;
  signedIn?: boolean;
}): Promise<HTMLDivElement> {
  const clock = createClock();
  const storage = options.storage ?? new MemoryStorage();
  const storageEvents = createStorageEvents();
  const env = testEnvironment({
    storage,
    storageEvents: storageEvents.events,
    now: clock.now,
    schedule: clock.schedule,
  });
  env.personServices = createValue(null);
  const usePerson = createPersonStore(null);
  if (options.signedIn ?? true) {
    usePerson.getState().setPerson({
      userId: "leo",
      name: "Leo Marsh",
      token: "bearer-leo",
    });
  }

  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <EnvironmentProvider environment={env}>
        <ReaderScreen
          token={options.token ?? "tok-ink-1"}
          api={fakeApi()}
          fetch={options.fetch}
          usePerson={usePerson}
        />
      </EnvironmentProvider>,
    );
  });
  await flushUi();
  return container;
}

describe("Shared Ink Reader Player (/r/$token)", () => {
  test("plays a shared Ink draft interactively with choices, Back, Restart, Variables drawer, and watermark", async () => {
    const container = await mountReader({
      fetch: okFetch(sampleInkDraft()),
    });

    // Renders Ink reader stage instead of screenplay ReaderPage.
    expect(container.querySelector('[data-reader-ink="true"]')).not.toBeNull();
    expect(container.querySelector(".mn-reader-page")).toBeNull();

    // State bar shows draft name + date without screenplay-only actions.
    const stateBar = container.querySelector('[data-tour="state_bar"]');
    expect(stateBar?.textContent).toContain("For the museum");
    expect(stateBar?.textContent).not.toContain("Changes since you last read");
    expect(stateBar?.textContent).not.toContain("Read aloud");

    // Auto-started into opening passage and choices.
    const log = container.querySelector('[role="log"][aria-live="polite"]');
    expect(log?.textContent).toContain(
      "Gull Point Light stands above the rocks.",
    );
    expect(log?.textContent).toContain(
      "You climb the stairs. The lamp is cold.",
    );

    // Passages render as plain prose, not editor source-jump buttons.
    expect(log?.querySelector("button")).toBeNull();

    // Watermark displays reader's name cleanly.
    const watermark = container.querySelector('[data-reader-watermark="true"]');
    expect(watermark?.textContent).toBe(READER_WORDS.inkWatermark("Leo Marsh"));

    // Back and Restart start disabled at the opening beat.
    const findBtn = (label: string): HTMLButtonElement => {
      const btn = [...container.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === label,
      );
      if (btn === undefined) throw new Error(`missing button ${label}`);
      return btn;
    };
    expect(findBtn(INK_WORDS.back).disabled).toBe(true);
    expect(findBtn(INK_WORDS.restart).disabled).toBe(true);

    // Choose option 1 ("Read the logbook").
    const firstChoices = container.querySelectorAll<HTMLButtonElement>(
      '[data-tour="ink:choices"] button',
    );
    expect(firstChoices.length).toBe(2);
    expect(firstChoices[0]!.textContent).toContain("Read the logbook");
    await act(async () => {
      firstChoices[0]!.click();
    });
    await flushUi();

    expect(log?.textContent).toContain("You read the pencil notes.");
    expect(log?.textContent).toContain("Esme nods toward the switch.");
    expect(findBtn(INK_WORDS.back).disabled).toBe(false);
    expect(findBtn(INK_WORDS.restart).disabled).toBe(false);

    // Variables drawer opens with aria-controls/region and reflects trust=1.
    const varsBtn = [...container.querySelectorAll("button")].find((btn) =>
      btn.textContent?.includes("Variables"),
    )!;
    const controlsId = varsBtn.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(varsBtn.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      varsBtn.click();
    });
    await flushUi();
    expect(varsBtn.getAttribute("aria-expanded")).toBe("true");
    const drawer = container.querySelector<HTMLElement>(
      `#${CSS.escape(controlsId!)}`,
    );
    expect(drawer).not.toBeNull();
    const numInput = drawer!.querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!;
    expect(numInput.value).toBe("1");

    // Edit variable inside drawer -> shows "Variables edited" badge.
    await act(async () => {
      numInput.focus();
      dispatchInputValue(numInput, "3");
    });
    await flushUi();
    expect(container.textContent).toContain(INK_WORDS.variablesEdited);

    // Back steps back one choice cleanly.
    await act(async () => {
      findBtn(INK_WORDS.back).click();
    });
    await flushUi();
    expect(
      container.querySelectorAll('[data-tour="ink:choices"] button').length,
    ).toBe(2);
    expect(findBtn(INK_WORDS.back).disabled).toBe(true);

    // Pick second choice via digit shortcut "2" and finish story.
    const playerEl = container.querySelector<HTMLElement>(
      '[data-tour="ink:player"]',
    )!;
    await act(async () => {
      playerEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "2",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flushUi();
    expect(log?.textContent).toContain("You leave the book shut.");

    // Pick final choice -> reaches "The end".
    const finalChoice = container.querySelector<HTMLButtonElement>(
      '[data-tour="ink:choices"] button',
    )!;
    await act(async () => {
      finalChoice.click();
    });
    await flushUi();
    expect(container.textContent).toContain(
      "A blade of light swings out over the water.",
    );
    expect(container.textContent).toContain(INK_WORDS.theEnd);

    // Restart returns cleanly to opening passage and clears edited variables.
    await act(async () => {
      findBtn(INK_WORDS.restart).click();
    });
    await flushUi();
    expect(container.textContent).not.toContain(INK_WORDS.theEnd);
    expect(container.textContent).not.toContain(INK_WORDS.variablesEdited);
    expect(findBtn(INK_WORDS.back).disabled).toBe(true);
    expect(
      container.querySelectorAll('[data-tour="ink:choices"] button').length,
    ).toBe(2);
  });

  test("detects seeded Ink drafts from ink_line blocks even without script.format setting and omits watermark when null", async () => {
    const container = await mountReader({
      token: "tok-ink-plain",
      fetch: okFetch(
        sampleInkDraft({
          content: inkContent("Opening line.\n* [Continue] Next line.", {}),
          docKind: undefined,
          watermark: null,
        }),
      ),
    });

    expect(container.querySelector('[data-reader-ink="true"]')).not.toBeNull();
    expect(
      container.querySelector('[data-reader-watermark="true"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Opening line.");
    expect(
      container.querySelectorAll('[data-tour="ink:choices"] button').length,
    ).toBe(1);
  });

  test("renders a graceful compile-problem state without dead editor buttons and preserves watermark", async () => {
    const container = await mountReader({
      token: "tok-ink-broken",
      fetch: okFetch(
        sampleInkDraft({
          content: inkContent("-> nonexistent_knot"),
          watermark: "Leo Marsh",
        }),
      ),
    });

    expect(container.querySelector('[data-reader-ink="true"]')).not.toBeNull();
    expect(container.textContent).toContain(READER_WORDS.inkProblemsTitle(1));
    expect(container.textContent).toContain(
      READER_WORDS.inkCompileProblemDetail,
    );
    // No dead "See line" editor button in external reader.
    expect(container.textContent).not.toContain(INK_WORDS.seeLine);
    // Watermark remains visible even in problem state.
    expect(
      container.querySelector('[data-reader-watermark="true"]')?.textContent,
    ).toBe(READER_WORDS.inkWatermark("Leo Marsh"));
  });

  test("renders a calm empty state for an empty Ink draft", async () => {
    const container = await mountReader({
      token: "tok-ink-empty",
      fetch: okFetch(
        sampleInkDraft({
          content: inkContent("", { "script.format": "ink" }),
          watermark: null,
        }),
      ),
    });

    expect(container.querySelector('[data-reader-ink="true"]')).not.toBeNull();
    expect(container.textContent).toContain(INK_WORDS.emptyGameScriptTitle);
    expect(container.textContent).toContain(READER_WORDS.inkEmptyDetail);
  });

  test("plays a cached Ink draft offline with the offline notice in StateBar", async () => {
    const storage = new MemoryStorage();
    const openedAt = Date.UTC(2026, 10, 16, 12, 0, 0);
    writeCachedDraft(
      storage,
      "tok-ink-offline",
      "leo",
      openedAt,
      sampleInkDraft(),
    );

    const container = await mountReader({
      token: "tok-ink-offline",
      storage,
      fetch: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });

    const stateBar = container.querySelector('[data-tour="state_bar"]');
    expect(stateBar?.textContent).toContain(
      "Offline — showing the copy you opened",
    );
    expect(container.querySelector('[data-reader-ink="true"]')).not.toBeNull();
    expect(container.textContent).toContain(
      "You climb the stairs. The lamp is cold.",
    );

    const choice = container.querySelector<HTMLButtonElement>(
      '[data-tour="ink:choices"] button',
    )!;
    await act(async () => {
      choice.click();
    });
    await flushUi();
    expect(container.textContent).toContain("You read the pencil notes.");
  });

  test("keeps normal script drafts on ReaderPage unchanged", async () => {
    const prevFonts = Object.getOwnPropertyDescriptor(document, "fonts");
    const prevFontFace = (globalThis as { FontFace?: unknown }).FontFace;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        add: () => {},
        load: async () => [],
        check: () => true,
        ready: Promise.resolve(),
      },
    });
    (globalThis as { FontFace?: unknown }).FontFace = class FakeFontFace {
      readonly family: string;
      readonly status = "loaded";
      constructor(family: string) {
        this.family = family;
      }
      load() {
        return Promise.resolve(this);
      }
    };
    try {
      const container = await mountReader({
        token: "tok-script-normal",
        fetch: okFetch({
          docId: "doc-script-1",
          sendId: "send-script-1",
          versionId: "ver-script-1",
          name: "Studio",
          sentAt: Date.UTC(2026, 10, 16, 12, 0, 0),
          content: scriptContent(),
          watermark: "Leo Marsh",
          canComment: true,
          lastReadVersionId: "ver-0",
          docKind: "script",
        }),
      });

      expect(container.querySelector('[data-reader-ink="true"]')).toBeNull();
      expect(container.querySelector(".mn-reader-page")).not.toBeNull();
      expect(
        container.querySelector('[data-tour="state_bar"]')?.textContent,
      ).toContain("Changes since you last read");
    } finally {
      if (prevFonts !== undefined)
        Object.defineProperty(document, "fonts", prevFonts);
      else delete (document as { fonts?: unknown }).fonts;
      if (prevFontFace !== undefined)
        (globalThis as { FontFace?: unknown }).FontFace = prevFontFace;
      else delete (globalThis as { FontFace?: unknown }).FontFace;
    }
  });
});
