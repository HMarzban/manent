import { expect, test } from "bun:test";
import { createCommandService, menuModel } from "../src/index.ts";
import type {
  CommandContext,
  CommandDefinition,
  MenuPlacement,
} from "../src/index.ts";

const command = (
  id: string,
  over: Partial<CommandDefinition> = {},
): CommandDefinition => ({
  id,
  label: "Go",
  group: "view",
  home: null,
  scope: "global",
  keys: { mac: [], windows: [], linux: [] },
  keysFixed: false,
  when: null,
  whyNot: null,
  visible: null,
  checked: null,
  passThrough: null,
  menus: [],
  palette: { keywords: [] },
  opens: null,
  reach: "self",
  setting: null,
  ...over,
});

const place = (
  menu: MenuPlacement["menu"],
  group: string,
  order: number,
  submenu: string | null = null,
): MenuPlacement => ({ menu, group, order, submenu });

const CTX: CommandContext = {
  screen: "document",
  focus: "page",
  docOpen: false,
  role: "editor",
  online: true,
  platform: "mac",
  shell: "web",
  demo: false,
  signedIn: true,
  panelOpen: { left: false, side: false },
  historyPresent: false,
  format: null,
  rulerShown: false,
  spaceBeforeSet: false,
  zoom: null,
  zoomPercent: null,
  production: {
    locked: true,
    canLock: false,
    canIssue: false,
    recallOpen: false,
    waiting: 0,
    activeName: "Pink",
    recallName: null,
    selection: null,
  },
};

const serviceOf = (
  commands: readonly CommandDefinition[],
  onDisabled: (label: string, reason: string) => void = () => {},
) =>
  createCommandService({
    commands,
    handlers: {},
    context: () => CTX,
    settings: { get: () => "dark", set: () => ({ ok: true }) },
    bindings: () => new Map([["test.a", ["Mod+Alt+1"]]]),
    onDisabled,
  });

test("a menu model is the commands placed in it, grouped and ordered, with their state", () => {
  const FIXTURE = [
    command("test.c", {
      label: "C",
      menus: [place("view", "panels", 20)],
      when: (c) => c.docOpen,
      whyNot: () => "needs a document open",
    }),
    command("test.light", {
      label: "Theme: Light",
      menus: [place("view", "theme", 10, "Theme")],
      checked: (_, read) => read.get("appearance.theme") === "light",
    }),
    command("test.hidden", {
      label: "Hidden",
      menus: [place("view", "panels", 5)],
      visible: (c) => c.demo,
    }),
    command("test.elsewhere", { menus: [place("edit", "panels", 1)] }),
    command("test.a", { label: "A", menus: [place("view", "panels", 10)] }),
  ];
  const s = serviceOf(FIXTURE);
  expect(menuModel("view", FIXTURE, s)).toEqual({
    menu: "view",
    groups: [
      [
        {
          id: "test.a",
          label: "A",
          enabled: true,
          checked: null,
          keys: ["Mod+Alt+1"],
          nativeRole: null,
          submenu: null,
        },
        {
          id: "test.c",
          label: "C",
          enabled: false,
          checked: null,
          keys: [],
          nativeRole: null,
          submenu: null,
        },
      ],
      [
        {
          id: "test.light",
          label: "Light",
          enabled: true,
          checked: false,
          keys: [],
          nativeRole: null,
          submenu: "Theme",
        },
      ],
    ],
  });
  expect(menuModel("help", FIXTURE, s)).toEqual({ menu: "help", groups: [] });
});

test("a label that names its object is the same in the menu, the state and the reason", () => {
  const said: string[][] = [];
  const FIXTURE = [
    command("test.issue", {
      label: (c) => `Issue ${c.production!.activeName}…`,
      menus: [place("production", "issue", 10)],
      when: (c) => c.production!.canIssue,
      whyNot: () => "needs a revision with changes",
    }),
  ];
  const s = serviceOf(FIXTURE, (label, reason) => said.push([label, reason]));
  expect(s.run("test.issue", "menu")).toBe("disabled");
  expect([
    s.state("test.issue").label,
    menuModel("production", FIXTURE, s).groups[0]?.[0]?.label,
    said,
  ]).toEqual([
    "Issue Pink…",
    "Issue Pink…",
    [["Issue Pink…", "needs a revision with changes"]],
  ]);
});

test("a submenu choice drops the submenu's name in the menu and keeps it elsewhere", () => {
  const FIXTURE = [
    command("test.fit", {
      label: "Zoom: Fit width",
      menus: [place("view", "zoom", 30, "Zoom")],
    }),
    command("test.page", {
      label: "Page view",
      menus: [place("view", "zoom", 20)],
    }),
    command("test.zoom125", {
      label: "Zoom: 125 %",
      menus: [place("view", "zoom", 10, "Zoom")],
    }),
  ];
  const s = serviceOf(FIXTURE);
  expect(
    menuModel("view", FIXTURE, s).groups.map((group) =>
      group.map((item) => [item.id, item.label, item.submenu]),
    ),
  ).toEqual([
    [
      ["test.zoom125", "125 %", "Zoom"],
      ["test.fit", "Fit width", "Zoom"],
      ["test.page", "Page view", null],
    ],
  ]);
  expect(s.state("test.zoom125").label).toBe("Zoom: 125 %");
});
