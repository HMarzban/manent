import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import type { DraftOpenResponse, VersionContent } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  readCachedDraft,
  readPendingTap,
  writeCachedDraft,
  writePendingTap,
} from "../src/reader/reader-storage.ts";
import { ReaderScreen } from "../src/screens/reader/reader-screen.tsx";
import { EnvironmentProvider } from "../src/services/context.tsx";
import { createPersonStore } from "../src/state/person.store.ts";
import { readAloudActions } from "../src/state/read-aloud.store.ts";
import { fakeApi, testEnvironment } from "./services.fixtures.ts";

withDom();

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  readAloudActions.setInactive();
});

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(i: number) {
      return [...map.keys()][i] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function sampleContent(): VersionContent {
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

function sampleDraft(
  overrides: Partial<DraftOpenResponse> = {},
): DraftOpenResponse {
  return {
    docId: "doc-r1",
    sendId: "send-r1",
    versionId: "ver-2",
    name: "Studio",
    sentAt: Date.UTC(2026, 10, 16, 12, 0, 0),
    content: sampleContent(),
    watermark: "Leo Marsh",
    canComment: true,
    lastReadVersionId: "ver-1",
    ...overrides,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++)
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

test("online refusal evicts previously cached offline draft", async () => {
  const storage = memoryStorage();
  writeCachedDraft(storage, "tok-revoked", "leo", 1000, sampleDraft());
  expect(readCachedDraft(storage, "tok-revoked", "leo")).not.toBeNull();

  const env = testEnvironment({ storage });
  const usePerson = createPersonStore(null);
  usePerson.getState().setPerson({
    userId: "leo",
    name: "Leo Marsh",
    token: "bearer-leo",
  });
  const fetchFn = (async () =>
    new Response(JSON.stringify({ error: "link_revoked" }), {
      status: 410,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;

  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <EnvironmentProvider environment={env}>
        <ReaderScreen
          token="tok-revoked"
          api={fakeApi()}
          fetch={fetchFn}
          usePerson={usePerson}
        />
      </EnvironmentProvider>,
    );
  });
  await flush();

  expect(container.querySelector("h1")?.textContent).toBe(
    "This link can't be opened",
  );
  expect(container.textContent).toContain("This link no longer works.");
  const backLink = container.querySelector<HTMLAnchorElement>('a[href="/"]');
  expect(backLink?.textContent).toBe("Back to Library");
  expect(readCachedDraft(storage, "tok-revoked", "leo")).toBeNull();
});

test("offline cached reader shows connection-needed message on Changes since you last read, high-contrast bottom bar, and reading_aloud state line", async () => {
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
    const storage = memoryStorage();
    const tabStorage = memoryStorage();
    writeCachedDraft(
      storage,
      "tok-off",
      "leo",
      Date.UTC(2026, 10, 16, 12, 0, 0),
      sampleDraft(),
    );
    // Persisted pending tap is NOT consumed while offline, stays safe.
    writePendingTap(tabStorage, "tok-off", {
      blockId: "block002",
      place: { left: 100, top: 200 },
    });

    const env = testEnvironment({ storage, tabStorage });
    env.personServices = createValue(null);
    const usePerson = createPersonStore(null);
    usePerson.getState().setPerson({
      userId: "leo",
      name: "Leo Marsh",
      token: "bearer-leo",
    });
    const fetchFn = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const container = document.createElement("div");
    document.body.replaceChildren(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <EnvironmentProvider environment={env}>
          <ReaderScreen
            token="tok-off"
            api={fakeApi()}
            fetch={fetchFn}
            usePerson={usePerson}
          />
        </EnvironmentProvider>,
      );
    });
    await flush();

    // Click Changes since you last read while offline -> connection-needed message!
    const sinceButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Changes since you last read",
    );
    if (sinceButton === undefined)
      throw new Error("no Changes since you last read button");
    act(() => sinceButton.click());
    await flush();

    expect(container.textContent).toContain(
      "Changes since you last read needs a connection.",
    );
    // Bottom message bar carries explicit text-fg contrast class.
    const messageBar = container.querySelector(
      '[data-tour="message_slot"]',
    )?.parentElement;
    expect(messageBar?.className).toContain("text-fg");

    // Activating Read aloud for draft.docId shows Reading aloud · Stop in StateBar on /r/$token.
    act(() => {
      readAloudActions.setActive("doc-r1");
    });
    expect(
      container.querySelector('[data-tour="state_bar"]')?.textContent,
    ).toContain("Reading aloud");
    expect(readPendingTap(tabStorage, "tok-off")).not.toBeNull();
  } finally {
    if (prevFonts !== undefined)
      Object.defineProperty(document, "fonts", prevFonts);
    else delete (document as { fonts?: unknown }).fonts;
    if (prevFontFace !== undefined)
      (globalThis as { FontFace?: unknown }).FontFace = prevFontFace;
    else delete (globalThis as { FontFace?: unknown }).FontFace;
  }
});
