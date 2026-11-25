import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { paginate, profileFor } from "@manent/pagination";
import { block } from "@manent/pagination/testing";
import type { DraftSendItem } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import { renderRowLine } from "../src/screens/document/history-row-line.tsx";
import type { WhatSelection } from "../src/send-draft/draft-output.ts";
import { sendDraftHistoryRow } from "../src/send-draft/history-row.ts";
import { recordSentDraft } from "../src/send-draft/sends.ts";
import { WhatRowContent } from "../src/send-draft/what-as-rows.tsx";
import { setSidesRange, sidesSelectionFor } from "../src/send/sides-file.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { testEnvironment } from "./services.fixtures.ts";

withDom();

const SCREENPLAY = profileFor("screenplay");
if (SCREENPLAY === null) throw new TypeError("no screenplay profile");
const noop = (): void => {};

let root: Root | null = null;
const restores: (() => void)[] = [];

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  for (const restore of restores.splice(0).toReversed()) restore();
});

test("WhatRowContent renders Sides controls for sides_scenes, clears stored range on Whole script, and clamps numeric bounds only on blur", () => {
  const blocks = [
    block("scene_heading", "INT. CAFE - DAY", { id: "s1", num: "1" }),
    block("action", "Morning coffee.", { id: "a1" }),
    block("scene_heading", "EXT. PIER - NIGHT", { id: "s2", num: "2" }),
    block("action", "Rain falls.", { id: "a2" }),
  ];
  const pagination = paginate(blocks, SCREENPLAY);
  const editor: LiveEditor = {
    docId: "doc-sides",
    doc: {} as LiveEditor["doc"],
    view: {} as LiveEditor["view"],
    scaffold: null,
    presence: {
      publish: noop,
      subscribe: () => noop,
      subscribePeople: () => noop,
    },
    editable: true,
    pagination: () => pagination,
    zoom: () => 1,
    frontPages: () => null,
  };
  restores.push(registerLiveEditor(editor));
  setSidesRange("doc-sides", "s2", "s2");

  let latest: WhatSelection = {
    id: "sides_scenes",
    firstPage: 1,
    lastPage: 5,
    firstScene: 1,
    lastScene: 2,
  };

  function Harness() {
    const [what, setWhat] = useState<WhatSelection>(latest);
    return (
      <WhatRowContent
        docId="doc-sides"
        multiCamera={false}
        locked
        primaryFileTypeId="sides"
        what={what}
        pageCount={5}
        sceneCount={2}
        lastSentDraftName={null}
        onChange={(next) => {
          latest = next;
          setWhat(next);
        }}
      />
    );
  }

  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));

  // Sides controls (First scene / Last scene pickers) are rendered for sides_scenes.
  expect(container.querySelector('[aria-label="First scene"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Last scene"]')).not.toBeNull();

  // Switching back to Whole script clears the stored sides range.
  const wholeBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Whole script",
  );
  if (wholeBtn === undefined) throw new Error("no Whole script toggle");
  act(() => wholeBtn.click());
  expect(latest.id).toBe("whole_script");
  expect(sidesSelectionFor("doc-sides", pagination)?.first.blockId).toBe("s1");

  // Switching to Pages lets the input be cleared without immediately snapping to 1, then clamps on blur.
  const pagesBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Pages",
  );
  if (pagesBtn === undefined) throw new Error("no Pages toggle");
  act(() => pagesBtn.click());
  const firstPageInput = container.querySelector<HTMLInputElement>(
    'input[aria-label="First page"]',
  );
  if (firstPageInput === null) throw new Error("no First page input");

  const setNativeValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    firstPageInput.focus();
  });
  act(() => {
    setNativeValue?.call(firstPageInput, "");
    firstPageInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(firstPageInput.value).toBe("");

  act(() => {
    setNativeValue?.call(firstPageInput, "99");
    firstPageInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(firstPageInput.value).toBe("99");

  act(() => {
    firstPageInput.blur();
  });
  expect(firstPageInput.value).toBe("5");
  expect(latest.firstPage).toBe(5);
});

test("sendDraftHistoryRow formats directRecipientCount + full tooltip and renderRowLine allows 2-line wrap", async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ sends: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
  restores.push(() => {
    globalThis.fetch = prevFetch;
  });
  const services = {
    userId: "dana",
    openHandle: async () => {
      throw new Error("unused");
    },
  } as unknown as PersonServices;

  const send: DraftSendItem & { directRecipientCount: number } = {
    sendId: "s-1",
    versionId: "v-1",
    name: "Studio",
    what: "whole_script",
    againstVersionId: null,
    files: ["pdf"],
    groups: [
      { groupId: "g1", name: "Studio", count: 4, watermark: false },
      { groupId: "g2", name: "Producers", count: 2, watermark: false },
    ],
    recipientCount: 8,
    directRecipientCount: 2,
    openedCount: 3,
    openerUserIds: ["leo", "priya"],
    openerNames: ["Leo Marsh", "Priya Nair"],
    totalOpens: 3,
    hasLink: false,
    watermarked: false,
    sentByUserId: "dana",
    sentAt: 1000,
  };
  recordSentDraft(services, "doc-h", send, null);

  const captured: { value: { text: string; tooltip: string | null } | null } = {
    value: null,
  };
  function Probe() {
    const line =
      sendDraftHistoryRow.useLine?.("doc-h", {
        id: "v-1",
        kind: "sent",
        name: "Studio",
        createdAt: 1000,
        createdByUserId: "dana",
        position: { generation: 1, seq: 1 },
        engineVersion: 1,
        summary: null,
        onDevice: false,
      }) ?? null;
    captured.value = line;
    return line === null ? null : <>{renderRowLine(line)}</>;
  }

  const env = testEnvironment();
  env.personServices = createValue<PersonServices | null>(services);
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <EnvironmentProvider environment={env}>
        <ServicesProvider services={services}>
          <Probe />
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });

  expect(captured.value).toEqual({
    text: "Sent to Studio (4), Producers (2) and 2 people · opened by 3 of 8",
    tooltip:
      "Sent to Studio (4), Producers (2) and 2 people · opened by 3 of 8 · Opened by Leo Marsh and Priya Nair",
  });
  const span = container.querySelector("span");
  expect(span?.className).toContain("line-clamp-2");
  expect(span?.className).toContain("whitespace-normal");
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
});
