import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { act, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createDoc, jsonMap, NOTES_MAP, startThread } from "@manent/crdt";
import { textAnchorAt } from "@manent/schema";
import { COMMENTS_WORDS } from "@manent/ui";
import {
  annotationsFor,
  scanBlockScenes,
} from "../src/comments/annotations-map.ts";
import { CommentPopover } from "../src/comments/comment-popover.tsx";
import { MentionField } from "../src/comments/mention-field.tsx";
import { ThreadBody } from "../src/comments/thread-body.tsx";
import { NoteRow, ThreadRow } from "../src/comments/thread-rows.tsx";
import type {
  PopoverMode,
  SceneBlockInfo,
  ScriptCommentsState,
  StoredNote,
} from "../src/comments/comments-types.ts";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import type { PersonServices } from "../src/services/ports.ts";
import { commentsActions } from "../src/state/comments.store.ts";

withDom();

const fixedSub = <T,>(value: T) => ({
  get: () => value,
  subscribe: () => () => {},
});

function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    rerender: (next: ReactNode) => act(() => root.render(next)),
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function stateWith(
  overrides: Partial<ScriptCommentsState> = {},
): ScriptCommentsState {
  return {
    docId: "doc-1",
    access: "edit",
    role: "editor",
    canComment: true,
    canEdit: true,
    loading: false,
    threads: {},
    items: {},
    rounds: {},
    flags: {},
    notes: [],
    people: [
      { userId: "u-dana", name: "Dana Reyes" },
      { userId: "u-leo", name: "Leo Park" },
    ],
    peopleState: "loaded",
    removedIds: new Set(),
    blockScenes: new Map<string, SceneBlockInfo>([
      [
        "b-1",
        {
          sceneBlockId: "b-scene",
          sceneNumber: "4",
          heading: "INT. HARBOUR - NIGHT",
          pageLabel: "3",
        },
      ],
    ]),
    ...overrides,
  };
}

test("annotations list marks only the open annotation active and hides resolved threads unless opened", () => {
  const a1 = textAnchorAt({ id: "b-1", text: "Hello world" }, 0, 5);
  const a2 = textAnchorAt({ id: "b-1", text: "Hello world" }, 6, 11);
  const a3 = textAnchorAt({ id: "b-2", text: "Second line" }, 0, 6);
  const state = stateWith({
    threads: {
      tOpen: {
        v: 1,
        anchor: a1,
        roundId: null,
        authorUserId: "u-dana",
        createdAt: 1000,
        state: { kind: "open" },
      },
      tResolved: {
        v: 1,
        anchor: a2,
        roundId: null,
        authorUserId: "u-leo",
        createdAt: 2000,
        state: {
          kind: "resolved",
          byUserId: "u-dana",
          at: 3000,
          outcome: null,
          reason: null,
        },
      },
    },
    notes: [
      {
        id: "n1",
        note: {
          v: 1,
          anchor: a3,
          text: "Check timing",
          writerName: "Dana Reyes",
          at: 4000,
        },
      },
    ],
  });

  expect(annotationsFor(state, null)).toEqual([
    { id: "tOpen", kind: "comment", anchor: a1, open: false },
    { id: "n1", kind: "note", anchor: a3, open: false },
  ]);

  expect(annotationsFor(state, "n1")).toEqual([
    { id: "tOpen", kind: "comment", anchor: a1, open: false },
    { id: "n1", kind: "note", anchor: a3, open: true },
  ]);

  expect(annotationsFor(state, "tResolved")).toEqual([
    { id: "tOpen", kind: "comment", anchor: a1, open: false },
    { id: "tResolved", kind: "comment", anchor: a2, open: true },
    { id: "n1", kind: "note", anchor: a3, open: false },
  ]);
});

test("scene scanner keeps explicit scene numbers on scene headings and does not invent numbers for chapters", () => {
  const nodes = [
    {
      type: { name: "block" },
      attrs: { id: "ch1", type: "chapter", num: null },
      textContent: "CHAPTER ONE",
    },
    {
      type: { name: "block" },
      attrs: { id: "p1", type: "action", num: null },
      textContent: "Opening text.",
    },
    {
      type: { name: "block" },
      attrs: { id: "sc1", type: "scene_heading", num: "12A" },
      textContent: "INT. DOCK - NIGHT",
    },
    {
      type: { name: "block" },
      attrs: { id: "a1", type: "action", num: null },
      textContent: "Rain falls.",
    },
    {
      type: { name: "block" },
      attrs: { id: "sc2", type: "slug", num: null },
      textContent: "LATER",
    },
  ];
  const doc = {
    descendants(
      fn: (node: (typeof nodes)[number], pos: number) => boolean | void,
    ) {
      nodes.forEach((node, i) => fn(node, i));
    },
  };

  const scanned = scanBlockScenes(doc, null);
  expect([
    scanned.get("ch1"),
    scanned.get("p1"),
    scanned.get("sc1"),
    scanned.get("a1"),
    scanned.get("sc2"),
  ]).toEqual([
    {
      sceneBlockId: "ch1",
      sceneNumber: null,
      heading: "CHAPTER ONE",
      pageLabel: null,
    },
    {
      sceneBlockId: "ch1",
      sceneNumber: null,
      heading: "CHAPTER ONE",
      pageLabel: null,
    },
    {
      sceneBlockId: "sc1",
      sceneNumber: "12A",
      heading: "INT. DOCK - NIGHT",
      pageLabel: null,
    },
    {
      sceneBlockId: "sc1",
      sceneNumber: "12A",
      heading: "INT. DOCK - NIGHT",
      pageLabel: null,
    },
    {
      sceneBlockId: "sc2",
      sceneNumber: "2",
      heading: "LATER",
      pageLabel: null,
    },
  ]);
});

test("gutter label formats comments, notes and mixed counts", () => {
  expect([
    COMMENTS_WORDS.gutterLabel(1),
    COMMENTS_WORDS.gutterLabel(2),
    COMMENTS_WORDS.gutterLabel(0, 1),
    COMMENTS_WORDS.gutterLabel(0, 3),
    COMMENTS_WORDS.gutterLabel(1, 1),
    COMMENTS_WORDS.gutterLabel(2, 3),
  ]).toEqual([
    "1 comment",
    "2 comments",
    "1 note",
    "3 notes",
    "1 comment, 1 note",
    "2 comments, 3 notes",
  ]);
});

test("mention field preserves draft text when submission is rejected", () => {
  const calls: string[] = [];
  let accept = false;
  const view = render(
    <MentionField
      placeholder="Write reply"
      submitLabel="Reply"
      mentions={false}
      people={[]}
      peopleState="loaded"
      onSubmit={({ body }) => {
        calls.push(body);
        return accept;
      }}
    />,
  );

  const textarea = view.container.querySelector("textarea")!;
  const submit = view.container.querySelector<HTMLButtonElement>("button")!;
  act(() => {
    textarea.focus();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, "Keep this draft");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
  act(() => submit.click());
  expect([calls, textarea.value]).toEqual([
    ["Keep this draft"],
    "Keep this draft",
  ]);

  accept = true;
  act(() => submit.click());
  expect([calls, textarea.value]).toEqual([
    ["Keep this draft", "Keep this draft"],
    "",
  ]);
  view.unmount();
});

test("thread body shows author metadata, quote accent, replies with avatars and aligned actions", () => {
  const anchor = textAnchorAt({ id: "b-1", text: "You say it twice." }, 0, 16);
  const state = stateWith({
    threads: {
      t1: {
        v: 1,
        anchor,
        roundId: null,
        authorUserId: "u-dana",
        createdAt: 1_700_000_000_000,
        state: { kind: "open" },
      },
    },
    items: {
      i1: {
        v: 1,
        threadId: "t1",
        authorUserId: "u-dana",
        createdAt: 1_700_000_000_000,
        body: "Trim the repeat.",
        mentionedUserIds: [],
      },
      i2: {
        v: 1,
        threadId: "t1",
        authorUserId: "u-leo",
        createdAt: 1_700_000_060_000,
        body: "Will cut it.",
        mentionedUserIds: [],
      },
    },
  });
  const services = { userId: "u-dana" } as PersonServices;
  const view = render(
    <ThreadBody
      docId="doc-1"
      threadId="t1"
      thread={state.threads.t1!}
      state={state}
      services={services}
      now={() => 1_700_000_120_000}
      onClose={() => {}}
    />,
  );

  const quote = view.container.querySelector("blockquote");
  const buttons = [
    ...view.container.querySelectorAll<HTMLButtonElement>("button"),
  ].map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim());

  expect([
    quote?.className.includes("mn-comment-quote"),
    quote?.className.includes("line-clamp-2"),
    view.container.textContent?.includes("Dana Reyes"),
    view.container.textContent?.includes("Leo Park"),
    view.container.textContent?.includes("p. 3"),
    view.container.querySelectorAll(".mn-avatar").length,
    buttons,
  ]).toEqual([true, true, true, true, true, 2, ["Resolve", "Reply"]]);

  view.unmount();
});

test("thread row and note row render author hierarchy and distinct quote accents", () => {
  const anchor = textAnchorAt(
    { id: "b-1", text: "Harbour light fades." },
    0,
    13,
  );
  const state = stateWith();
  const threadEntry = {
    id: "t1",
    thread: {
      v: 1 as const,
      anchor,
      roundId: null,
      authorUserId: "u-dana",
      createdAt: 1_700_000_000_000,
      state: { kind: "open" as const },
    },
    items: [
      {
        v: 1 as const,
        threadId: "t1",
        authorUserId: "u-dana",
        createdAt: 1_700_000_000_000,
        body: "Tighten this line.",
        mentionedUserIds: [],
      },
    ],
    flags: [],
  };
  const noteEntry: StoredNote = {
    id: "n1",
    note: {
      v: 1,
      anchor,
      text: "Check boat engine sound.",
      writerName: "Dana Reyes",
      at: 1_700_000_000_000,
    },
  };

  const view = render(
    <div>
      <ThreadRow
        entry={threadEntry}
        state={state}
        currentUserId="u-dana"
        active={false}
        now={1_700_000_120_000}
        onOpen={() => {}}
      />
      <NoteRow
        entry={noteEntry}
        removed={false}
        active={false}
        now={1_700_000_120_000}
        place="p. 3"
        onOpen={() => {}}
      />
    </div>,
  );

  const quotes = [...view.container.querySelectorAll("blockquote")];
  expect([
    quotes[0]?.className.includes("mn-comment-quote"),
    quotes[1]?.className.includes("mn-note-quote"),
    view.container.querySelectorAll(".mn-avatar").length,
    view.container.textContent?.includes("Writers only"),
    view.container.textContent?.includes("p. 3"),
  ]).toEqual([true, true, 2, true, true]);

  view.unmount();
});

test("comment popover labels notes distinctly, shows scene heading when composing and steps through mixed annotations on a block", async () => {
  const docId = "doc-popover-1";
  const commentsDoc = createDoc();
  const scriptDoc = createDoc();
  const anchor = textAnchorAt({ id: "b-1", text: "You say it twice." }, 0, 16);
  startThread(
    commentsDoc,
    {
      threadId: "t-mixed",
      itemId: "i-mixed",
      anchor,
      roundId: null,
      authorUserId: "u-dana",
      body: "Trim this line.",
      mentionedUserIds: [],
    },
    () => 1_700_000_000_000,
  );
  jsonMap(scriptDoc, NOTES_MAP).set("n-mixed", {
    v: 1,
    anchor,
    text: "Keep the pause before cut.",
    writerName: "Dana Reyes",
    at: 1_700_000_010_000,
  });

  const handle = {
    doc: () => commentsDoc,
    on: () => () => {},
    readOnly: fixedSub(null),
    close: () => Promise.resolve(),
  };
  const services = {
    userId: "u-dana",
    documents: {
      open: () => ({
        status: fixedSub({
          access: "edit",
          server: "synced",
          network: "online",
          neverSynced: false,
          waiting: 0,
        }),
      }),
      close() {},
    },
    library: {
      documentProject: () => fixedSub("proj-1"),
    },
    openComments: () => Promise.resolve(handle),
    onDevice: () => Promise.resolve(new Set<string>()),
  } as unknown as PersonServices;

  const stopEditor = registerLiveEditor({
    docId,
    doc: scriptDoc,
    editable: true,
    pagination: () => null,
    zoom: () => 1,
    frontPages: () => null,
  } as unknown as LiveEditor);
  const release = commentsActions.retain(docId, services);
  await Promise.resolve();
  await Promise.resolve();

  const switched: PopoverMode[] = [];
  const view = render(
    <CommentPopover
      docId={docId}
      mode={{
        kind: "thread",
        id: "t-mixed",
        blockIds: ["t-mixed", "n-mixed"],
        place: { left: 40, top: 40 },
      }}
      services={services}
      writerName="Dana Reyes"
      now={() => 1_700_000_120_000}
      onSwitchMode={(next) => switched.push(next)}
      onClose={() => {}}
    />,
  );

  const commentDialog = view.container.querySelector('[role="dialog"]');
  expect([
    commentDialog?.getAttribute("aria-label"),
    view.container.textContent?.includes("1 of 2"),
  ]).toEqual(["Comment", true]);

  const nextBtn = view.container.querySelector<HTMLButtonElement>(
    'button[aria-label="Next"]',
  )!;
  act(() => nextBtn.click());
  expect(switched).toEqual([
    {
      kind: "thread",
      id: "n-mixed",
      blockIds: ["t-mixed", "n-mixed"],
      place: { left: 40, top: 40 },
    },
  ]);

  view.rerender(
    <CommentPopover
      docId={docId}
      mode={switched[0]!}
      services={services}
      writerName="Dana Reyes"
      now={() => 1_700_000_120_000}
      onSwitchMode={(next) => switched.push(next)}
      onClose={() => {}}
    />,
  );

  const noteDialog = view.container.querySelector('[role="dialog"]');
  const noteQuote = view.container.querySelector("blockquote");
  expect([
    noteDialog?.getAttribute("aria-label"),
    view.container.textContent?.includes("Writers only"),
    view.container.textContent?.includes("2 of 2"),
    view.container.textContent?.includes("Dana Reyes"),
    noteQuote?.className.includes("mn-note-quote"),
  ]).toEqual(["Note", true, true, true, true]);

  const sceneAnchor = textAnchorAt(
    { id: "b-scene", text: "INT. DOCK - NIGHT" },
    0,
    0,
  );
  view.rerender(
    <CommentPopover
      docId={docId}
      mode={{
        kind: "comment",
        anchor: sceneAnchor,
        heading: "INT. DOCK - NIGHT",
        place: { left: 40, top: 40 },
      }}
      services={services}
      writerName="Dana Reyes"
      now={() => 1_700_000_120_000}
      onSwitchMode={() => {}}
      onClose={() => {}}
    />,
  );
  expect([
    view.container.querySelector("blockquote")?.textContent,
    view.container
      .querySelector("blockquote")
      ?.className.includes("mn-comment-quote"),
  ]).toEqual(["INT. DOCK - NIGHT", true]);

  view.unmount();
  release();
  stopEditor();
});

test("stepping through annotations on a block preserves focus on the switcher button across comment and note switches", async () => {
  const docId = "doc-popover-focus";
  const commentsDoc = createDoc();
  const scriptDoc = createDoc();
  const anchor = textAnchorAt({ id: "b-1", text: "You say it twice." }, 0, 16);
  startThread(
    commentsDoc,
    {
      threadId: "t-1",
      itemId: "i-1",
      anchor,
      roundId: null,
      authorUserId: "u-dana",
      body: "First comment.",
      mentionedUserIds: [],
    },
    () => 1_700_000_000_000,
  );
  startThread(
    commentsDoc,
    {
      threadId: "t-2",
      itemId: "i-2",
      anchor,
      roundId: null,
      authorUserId: "u-leo",
      body: "Second comment.",
      mentionedUserIds: [],
    },
    () => 1_700_000_020_000,
  );
  jsonMap(scriptDoc, NOTES_MAP).set("n-1", {
    v: 1,
    anchor,
    text: "Writer note on the same line.",
    writerName: "Dana Reyes",
    at: 1_700_000_010_000,
  });

  const handle = {
    doc: () => commentsDoc,
    on: () => () => {},
    readOnly: fixedSub(null),
    close: () => Promise.resolve(),
  };
  const services = {
    userId: "u-dana",
    documents: {
      open: () => ({
        status: fixedSub({
          access: "edit",
          server: "synced",
          network: "online",
          neverSynced: false,
          waiting: 0,
        }),
      }),
      close() {},
    },
    library: {
      documentProject: () => fixedSub("proj-1"),
    },
    openComments: () => Promise.resolve(handle),
    onDevice: () => Promise.resolve(new Set<string>()),
  } as unknown as PersonServices;

  const stopEditor = registerLiveEditor({
    docId,
    doc: scriptDoc,
    editable: true,
    pagination: () => null,
    zoom: () => 1,
    frontPages: () => null,
  } as unknown as LiveEditor);
  const release = commentsActions.retain(docId, services);
  await Promise.resolve();
  await Promise.resolve();

  let closed = 0;
  function Harness() {
    const [mode, setMode] = useState<PopoverMode>({
      kind: "thread",
      id: "t-1",
      blockIds: ["t-1", "n-1", "t-2"],
      place: { left: 40, top: 40 },
    });
    return (
      <CommentPopover
        docId={docId}
        mode={mode}
        services={services}
        writerName="Dana Reyes"
        now={() => 1_700_000_120_000}
        onSwitchMode={setMode}
        onClose={() => {
          closed += 1;
        }}
      />
    );
  }

  const view = render(<Harness />);
  const nextBtn = view.container.querySelector<HTMLButtonElement>(
    'button[aria-label="Next"]',
  )!;
  act(() => nextBtn.focus());
  expect(document.activeElement).toBe(nextBtn);

  act(() => nextBtn.click());
  expect([
    view.container.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    view.container.textContent?.includes("2 of 3"),
    document.activeElement === nextBtn,
  ]).toEqual(["Note", true, true]);

  act(() => nextBtn.click());
  expect([
    view.container.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    view.container.textContent?.includes("3 of 3"),
    view.container.textContent?.includes("Second comment."),
    document.activeElement === nextBtn,
  ]).toEqual(["Comment", true, true, true]);

  act(() => {
    nextBtn.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(closed).toBe(1);

  view.unmount();
  release();
  stopEditor();
});

test("mixed block popover displays one-click pills for every comment and note on the line", async () => {
  const docId = "doc-popover-strip";
  const commentsDoc = createDoc();
  const scriptDoc = createDoc();
  const anchor = textAnchorAt(
    { id: "b-1", text: "Not every object goes home." },
    4,
    9,
  );
  startThread(
    commentsDoc,
    {
      threadId: "t-1",
      itemId: "i-1",
      anchor,
      roundId: null,
      authorUserId: "u-dana",
      body: "First comment on this line.",
      mentionedUserIds: [],
    },
    () => 1_700_000_000_000,
  );
  startThread(
    commentsDoc,
    {
      threadId: "t-2",
      itemId: "i-2",
      anchor,
      roundId: null,
      authorUserId: "u-leo",
      body: "Second comment on this line.",
      mentionedUserIds: [],
    },
    () => 1_700_000_010_000,
  );
  jsonMap(scriptDoc, NOTES_MAP).set("n-1", {
    v: 1,
    anchor,
    text: "Private note on the same line.",
    writerName: "Dana Reyes",
    at: 1_700_000_020_000,
  });

  const handle = {
    doc: () => commentsDoc,
    on: () => () => {},
    readOnly: fixedSub(null),
    close: () => Promise.resolve(),
  };
  const services = {
    userId: "u-dana",
    documents: {
      open: () => ({
        status: fixedSub({
          access: "edit",
          server: "synced",
          network: "online",
          neverSynced: false,
          waiting: 0,
        }),
      }),
      close() {},
    },
    library: {
      documentProject: () => fixedSub("proj-1"),
    },
    openComments: () => Promise.resolve(handle),
    onDevice: () => Promise.resolve(new Set<string>()),
  } as unknown as PersonServices;

  const stopEditor = registerLiveEditor({
    docId,
    doc: scriptDoc,
    editable: true,
    pagination: () => null,
    zoom: () => 1,
    frontPages: () => null,
  } as unknown as LiveEditor);
  const release = commentsActions.retain(docId, services);
  await Promise.resolve();
  await Promise.resolve();

  function Harness() {
    const [mode, setMode] = useState<PopoverMode>({
      kind: "thread",
      id: "t-1",
      blockIds: ["t-1", "t-2", "n-1"],
      place: { left: 40, top: 40 },
    });
    return (
      <CommentPopover
        docId={docId}
        mode={mode}
        services={services}
        writerName="Dana Reyes"
        now={() => 1_700_000_120_000}
        onSwitchMode={setMode}
        onClose={() => {}}
      />
    );
  }

  const view = render(<Harness />);
  const pills = () => [
    ...view.container.querySelectorAll<HTMLButtonElement>(
      ".mn-annotation-pill",
    ),
  ];

  expect(
    pills().map((btn) => ({
      text: btn.textContent,
      kind: btn.dataset["kind"],
      current: btn.getAttribute("aria-current"),
    })),
  ).toEqual([
    { text: "Comment 1", kind: "comment", current: "true" },
    { text: "Comment 2", kind: "comment", current: null },
    { text: "Note", kind: "note", current: null },
  ]);

  // One click on Note jumps directly past Comment 2 to the private writer note.
  act(() => pills()[2]!.click());
  expect([
    view.container.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    view.container.textContent?.includes("Writers only"),
    view.container.textContent?.includes("Private note on the same line."),
    view.container.textContent?.includes("3 of 3"),
    pills()[2]!.getAttribute("aria-current"),
  ]).toEqual(["Note", true, true, true, "true"]);

  // One click on Comment 2 switches straight to the second comment.
  act(() => pills()[1]!.click());
  expect([
    view.container.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    view.container.textContent?.includes("Second comment on this line."),
    view.container.textContent?.includes("2 of 3"),
    pills()[1]!.getAttribute("aria-current"),
  ]).toEqual(["Comment", true, true, "true"]);

  view.unmount();
  release();
  stopEditor();
});
