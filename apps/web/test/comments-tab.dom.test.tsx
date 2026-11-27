import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { COMMENTS_WORDS, SHARING_WORDS } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  commentCounts,
  filteredThreads,
  roundStats,
} from "../src/comments/comments-filter.ts";
import type { ScriptCommentsState } from "../src/comments/comments-types.ts";
import { MentionField } from "../src/comments/mention-field.tsx";
import { ThreadRow } from "../src/comments/thread-rows.tsx";
import { createShareActions } from "../src/sharing/share-actions.ts";
import type { ShareRequests } from "../src/sharing/share-requests.ts";
import { shareHeld } from "../src/sharing/share-store.ts";
import { testServices } from "./services.fixtures.ts";

withDom();

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

function sampleState(): ScriptCommentsState {
  return {
    docId: "doc-c1",
    access: "edit",
    role: "editor",
    canComment: true,
    canEdit: true,
    loading: false,
    rounds: {
      "rd-1": {
        name: "Network notes",
        createdAt: 1000,
        versionId: "v-1",
        v: 1,
      },
    },
    threads: {
      "t-1": {
        v: 1,
        anchor: {
          blockId: "b-1",
          start: 0,
          end: 10,
          quote: "Harbour fog",
          prefix: "",
          suffix: "",
        },
        roundId: "rd-1",
        authorUserId: "u-dana",
        createdAt: 2000,
        state: { kind: "open" },
      },
      "t-2": {
        v: 1,
        anchor: {
          blockId: "b-2",
          start: 0,
          end: 12,
          quote: "Ferry whistle",
          prefix: "",
          suffix: "",
        },
        roundId: "rd-1",
        authorUserId: "u-leo",
        createdAt: 1500,
        state: {
          kind: "resolved",
          byUserId: "u-dana",
          at: 3000,
          outcome: "addressed",
          reason: "Tightened beat",
        },
      },
    },
    items: {
      "i-1": {
        v: 1,
        threadId: "t-1",
        authorUserId: "u-dana",
        createdAt: 2000,
        body: "First comment",
        mentionedUserIds: [],
      },
      "i-2": {
        v: 1,
        threadId: "t-1",
        authorUserId: "u-leo",
        createdAt: 2100,
        body: "Earlier reply one",
        mentionedUserIds: [],
      },
      "i-3": {
        v: 1,
        threadId: "t-1",
        authorUserId: "u-dana",
        createdAt: 2200,
        body: "Earlier reply two",
        mentionedUserIds: [],
      },
      "i-4": {
        v: 1,
        threadId: "t-1",
        authorUserId: "u-leo",
        createdAt: 2300,
        body: "Latest reply stays visible",
        mentionedUserIds: [],
      },
      "i-5": {
        v: 1,
        threadId: "t-2",
        authorUserId: "u-leo",
        createdAt: 1500,
        body: "Cut the whistle echo",
        mentionedUserIds: [],
      },
    },
    flags: {},
    notes: [],
    people: [
      { userId: "u-dana", name: "Dana Reyes" },
      { userId: "u-leo", name: "Leo Marsh" },
    ],
    peopleState: "loaded",
    removedIds: new Set(),
    blockScenes: new Map(),
  };
}

test("commentCounts, roundStats and round sub-filtering compute exact triage numbers", () => {
  const state = sampleState();
  expect(commentCounts(state, "u-dana")).toEqual({
    open: 1,
    mine: 1,
    writers: 0,
  });
  expect(roundStats(state, "rd-1")).toEqual({ total: 2, open: 1, resolved: 1 });
  expect(filteredThreads(state, "round:rd-1", "u-dana", "all").length).toBe(2);
  expect(filteredThreads(state, "round:rd-1", "u-dana", "open").length).toBe(1);
  expect(
    filteredThreads(state, "round:rd-1", "u-dana", "resolved").length,
  ).toBe(1);
});

test("ThreadRow folds earlier replies while keeping latest reply visible and previews resolved threads", () => {
  const state = sampleState();
  const all = filteredThreads(state, "round:rd-1", "u-dana", "all");
  const openEntry = all.find((e) => e.id === "t-1")!;
  const resolvedEntry = all.find((e) => e.id === "t-2")!;

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);

  act(() => {
    root.render(
      <div>
        <ThreadRow
          entry={openEntry}
          state={state}
          currentUserId="u-dana"
          active={true}
          now={4000}
          onOpen={() => {}}
        />
        <ThreadRow
          entry={resolvedEntry}
          state={state}
          currentUserId="u-dana"
          active={false}
          now={4000}
          onOpen={() => {}}
        />
      </div>,
    );
  });

  expect(host.textContent).toContain("Latest reply stays visible");
  expect(host.textContent).not.toContain("Earlier reply one");
  expect(host.textContent).toContain(COMMENTS_WORDS.earlierReplies(2));
  expect(host.textContent).toContain(COMMENTS_WORDS.addressed);
  expect(host.textContent).toContain("Tightened beat");
  expect(host.textContent).toContain("Cut the whistle echo");

  const expandBtn = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(COMMENTS_WORDS.earlierReplies(2)),
  )!;
  act(() => {
    expandBtn.click();
  });
  expect(host.textContent).toContain("Earlier reply one");
});

test("MentionField exposes combobox listbox ARIA attributes and option ids", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);

  act(() => {
    root.render(
      <MentionField
        placeholder={COMMENTS_WORDS.composerPlaceholder}
        submitLabel={COMMENTS_WORDS.commentLabel}
        mentions={true}
        people={[{ userId: "u-leo", name: "Leo Marsh" }]}
        peopleState="loaded"
        onSubmit={() => true}
      />,
    );
  });

  const textarea = host.querySelector("textarea")!;
  expect(textarea.getAttribute("aria-expanded")).toBe("false");

  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  );
  act(() => {
    textarea.focus();
    descriptor?.set?.call(textarea, "@le");
    textarea.setSelectionRange(3, 3);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });

  const listbox = host.querySelector('[role="listbox"]');
  const option = host.querySelector('[role="option"]');
  expect(listbox?.id).toBeTruthy();
  expect(textarea.getAttribute("aria-expanded")).toBe("true");
  expect(textarea.getAttribute("aria-controls")).toBe(listbox?.id ?? null);
  expect(textarea.getAttribute("aria-activedescendant")).toBe(
    option?.id ?? null,
  );
});

test("share actions surface clipboard refusal on the link row and return false", async () => {
  const services = testServices({ userId: "u-dana" });
  const held = shareHeld("u-dana", "doc-clip");
  held.access.set({
    people: [
      {
        userId: "u-dana",
        name: "Dana Reyes",
        role: "owner",
        groupId: null,
        lastActiveAt: null,
      },
    ],
    groups: [],
    links: [],
  });
  const refusals: [string, string | null][] = [];
  const fakeRequests: ShareRequests = {
    access: async () => ({ ok: true, value: held.access.get()! }),
    choices: async () => [],
    grant: async () => ({ ok: true, value: held.access.get()! }),
    remove: async () => ({ ok: true, value: held.access.get()! }),
    grantGroup: async () => ({ ok: true, value: held.access.get()! }),
    removeGroup: async () => ({ ok: true, value: held.access.get()! }),
    createLink: async (_docId, role) => ({
      ok: true,
      value: {
        link: { id: "l-1", role, expiresAt: null, createdAt: 1000 },
        token: "tok-1",
      },
    }),
    revokeLink: async () => ({ ok: true, value: held.access.get()! }),
    join: async () => ({
      ok: true,
      value: { docId: "doc-clip", role: "view", joined: true },
    }),
  };
  const actions = createShareActions({
    docId: "doc-clip",
    requests: fakeRequests,
    held,
    messages: services.messages,
    reverses: services.reverses,
    title: () => "Pilot",
    refuse: (row, sentence) => refusals.push([row, sentence]),
    copy: async () => false,
    origin: "https://manent.test",
  });

  const ok = await actions.copyLink("view", null);
  expect(ok).toBe(false);
  expect(refusals).toEqual([["link", SHARING_WORDS.clipboardRefused]]);
});
