import { withDom } from "@manent/testkit/dom";
import * as commandsModule from "@manent/commands";
import { afterEach, expect, mock, test } from "bun:test";
import { messageFor } from "@manent/ui";
import { act } from "react";
import {
  DOC_ID,
  NEW_SCRIPT,
  buttonNamed,
  click,
  nameOf,
  press,
  region,
  renderFrame,
  typeInto,
  unmountFrame,
} from "./document-frame.fixtures.tsx";

withDom();

const REAL_COMMANDS = { ...commandsModule };

afterEach(() => {
  unmountFrame();
  mock.module("@manent/commands", () => REAL_COMMANDS);
});

const SYNCED = { ...NEW_SCRIPT, neverSynced: false };

/** The text of each part of the open Sync centre, top to bottom. */
function syncCentreParts(): string[] {
  const popup = document.querySelector("[data-slot='popover-content']");
  if (popup === null) throw new Error("the Sync centre is not open");
  return [...popup.querySelectorAll("h2, p, li, button")].map(nameOf);
}

const menuItems = (): string[] =>
  [...document.querySelectorAll("[role='menuitem']")].map(nameOf);

test("a new script as You shows nine controls and no state bar", async () => {
  const { container } = await renderFrame();
  const controls = ["title_bar", "status_bar"].flatMap((name) =>
    [...region(container, name).querySelectorAll("button")].map(nameOf),
  );
  expect(controls).toEqual([
    "‹ Library",
    "Untitled script",
    "Saved · Only in this browser — not backed up",
    "History",
    "Share",
    "Element: scene_heading",
    "Page 1 of 1",
    "View",
    "Commands",
  ]);
  expect(
    region(container, "state_bar").querySelector("[role='status']") !== null,
  ).toBe(false);
});

test("the tab's title is the document's title and the person", async () => {
  await renderFrame({ title: "The Long Night" });
  expect(document.title).toBe("The Long Night — You — Manent demo");
});

test("a commenter's state bar says so", async () => {
  const frame = await renderFrame({
    status: { ...SYNCED, access: "comment" },
  });
  act(() => frame.stateFacts.set([{ kind: "role_comment" }]));
  expect(
    region(frame.container, "state_bar").querySelector("[role='status']")
      ?.textContent,
  ).toBe("View only — you can comment");
});

test("the state bar's region is hidden while it has no line, so F6 passes it by", async () => {
  const frame = await renderFrame();
  const hidden = () => region(frame.container, "state_bar").className;
  const before = hidden();
  act(() => frame.stateFacts.set([{ kind: "role_comment" }]));
  expect([before, hidden()]).toEqual(["hidden", ""]);
});

test("Title ▾ holds Script settings and Rename for an editor, and not Rename for a reader", async () => {
  const title = "The Long Night";
  const editor = await renderFrame({ title });
  await click(buttonNamed(region(editor.container, "title_bar"), title));
  const editorItems = menuItems();
  unmountFrame();
  const reader = await renderFrame({ title, role: "viewer" });
  await click(buttonNamed(region(reader.container, "title_bar"), title));
  expect([editorItems, menuItems()]).toEqual([
    [
      "Script settings",
      "Project settings",
      "Rename",
      "Favourite",
      "Export…",
      "Print…⌘P",
      "Copy link",
      "Name this draft…⌘⇧S",
      "Open beside",
    ],
    [
      "Script settings",
      "Project settings",
      "Export…",
      "Print…⌘P",
      "Copy link",
      "Open beside",
      "Favourite",
    ],
  ]);
});

test("Rename commits on Enter, cancels on Escape, and returns focus to the title", async () => {
  const { container, services } = await renderFrame({ title: "Low Tide" });
  const titleBar = region(container, "title_bar");
  const field = (): HTMLInputElement => {
    const input = titleBar.querySelector("input");
    if (input === null) throw new Error("no rename field is open");
    return input;
  };
  // the page takes focus on open; the rename starts from the title
  act(() => titleBar.querySelector("h1")?.focus());
  act(() => {
    services.commands.run("doc.rename", "menu");
  });
  const opened = field();
  const selected = [opened.value, opened.selectionStart, opened.selectionEnd];
  typeInto(opened, "Slack Water");
  press(opened, "Enter");
  const afterEnter = [
    services.library.documentTitle(DOC_ID).get(),
    titleBar.querySelector("input") !== null,
    nameOf(document.activeElement ?? document.body),
  ];
  act(() => {
    services.commands.run("doc.rename", "menu");
  });
  typeInto(field(), "The Ferry");
  press(field(), "Escape");
  expect([
    selected,
    afterEnter,
    [
      services.library.documentTitle(DOC_ID).get(),
      titleBar.querySelector("input") !== null,
      nameOf(document.activeElement ?? document.body),
    ],
  ]).toEqual([
    ["Low Tide", 0, 8],
    ["Slack Water", false, "Slack Water"],
    ["Slack Water", false, "Slack Water"],
  ]);
});

test("the Sync centre offers Sign in to sync to You, and Everything is on the server to a synced person", async () => {
  const you = await renderFrame();
  const status = "Saved · Only in this browser — not backed up";
  await click(buttonNamed(region(you.container, "title_bar"), status));
  const yours = syncCentreParts();
  unmountFrame();
  const sam = await renderFrame({ status: SYNCED });
  await click(
    buttonNamed(region(sam.container, "title_bar"), "Saved · Synced"),
  );
  expect([yours, syncCentreParts()]).toEqual([
    [
      "Sync centre",
      "This script is only in this browser, so it is not backed up and you cannot open it anywhere else. Sign in to sync it.",
      "Sign in to sync",
      "Export a copy",
    ],
    ["Sync centre", "Everything is on the server.", "Export a copy"],
  ]);
});

test("the Sync centre lists what waits by scene, what is to review and the explanation of a status", async () => {
  const frame = await renderFrame({
    status: { ...SYNCED, server: "server_old", waiting: 12, toReview: 2 },
  });
  act(() => frame.waitingByScene.set([{ scene: "8", count: 12 }]));
  await click(
    buttonNamed(
      region(frame.container, "title_bar"),
      "Saved · Server out of date, 12 waiting",
    ),
  );
  const outOfDate = syncCentreParts();
  act(() =>
    frame.status.set({ ...SYNCED, device: "failing", network: "offline" }),
  );
  const alert = syncCentreParts();
  expect([outOfDate, alert.slice(0, 2)]).toEqual([
    [
      "Sync centre",
      "The server runs an older Manent than this app. Your changes are saved here and sync once it runs a newer one.",
      "2 to review",
      "Review",
      "Sc. 8 · 12 waiting",
      "Export a copy",
    ],
    ["Sync centre", "Can't save on this device — export a copy"],
  ]);
});

test("avatars are named by their people, and the count by how many more", async () => {
  const frame = await renderFrame();
  act(() =>
    frame.people.set(
      [
        ["dana", "Dana Reyes", "DR"],
        ["sam", "Sam Okafor", "SO"],
        ["priya", "Priya Nair", "PN"],
        ["leo", "Leo Marsh", "LM"],
        ["ana", "Ana Costa", "AC"],
      ].map(([userId = "", name = "", initials = ""], index) => ({
        userId,
        name,
        initials,
        colour: index + 1,
      })),
    ),
  );
  const titleBar = region(frame.container, "title_bar");
  const named = (selector: string): string[][] =>
    [...titleBar.querySelectorAll(selector)].map((el) => [
      nameOf(el),
      el.textContent ?? "",
    ]);
  expect([named("[data-who]"), named("[data-more]")]).toEqual([
    [
      ["Dana Reyes", "DR"],
      ["Sam Okafor", "SO"],
      ["Priya Nair", "PN"],
    ],
    [["2 more people", "+2"]],
  ]);
});

test("a message about your own work stays and is repeated in the Sync centre", async () => {
  const frame = await renderFrame({ status: SYNCED });
  const text = "Your last 3 changes were already saved.";
  act(() =>
    frame.services.messages.push(
      messageFor({ kind: "crash_recovered", count: 3 }),
    ),
  );
  act(() => frame.clock.advance(60_000));
  const slot = region(frame.container, "status_bar").querySelector(
    "[role='status']",
  );
  await click(
    buttonNamed(region(frame.container, "title_bar"), "Saved · Synced"),
  );
  expect([slot?.querySelector("p")?.textContent, syncCentreParts()]).toEqual([
    text,
    ["Sync centre", "Everything is on the server.", text, "Export a copy"],
  ]);
});

/** The sentence in the page's place when access is removed, and the actions drawn under it. */
function noAccessParts(container: HTMLElement): string[] {
  const sentence = [...container.querySelectorAll("p")].find(
    (p) => p.textContent === "You no longer have access",
  );
  return [
    ...(sentence?.parentElement?.querySelectorAll("p, button") ?? []),
  ].map(nameOf);
}

test("with no access, the page's place offers Export once its command is registered", async () => {
  const status = { ...SYNCED, server: "access_removed", notSent: 4 } as const;
  mock.module("@manent/commands", () => ({
    ...REAL_COMMANDS,
    COMMANDS: REAL_COMMANDS.COMMANDS.filter((c) => c.id !== "doc.export"),
  }));
  const before = noAccessParts((await renderFrame({ status })).container);
  unmountFrame();
  mock.module("@manent/commands", () => REAL_COMMANDS);
  const after = noAccessParts((await renderFrame({ status })).container);
  expect([before, after]).toEqual([
    ["You no longer have access"],
    ["You no longer have access", "Export"],
  ]);
});
