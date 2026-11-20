import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  DESKTOP_PROTOCOL_VERSION,
  FILE_REFUSALS,
  NATIVE_MENU_IDS,
  NATIVE_ROLES,
  OPENED_FILE_EXTENSIONS,
  UPDATE_STATES,
  parseDesktopGlobal,
  parsePageMessage,
  parseShellMessage,
} from "../src/index.ts";
import type {
  DesktopGlobal,
  NativeMenuItem,
  PageMessage,
  ShellMessage,
} from "../src/index.ts";

// A valid menus message with one field replaced by a value from that field's pool of wrong ones.
const ITEM: NativeMenuItem = {
  id: "file.open",
  label: "Open",
  enabled: true,
  checked: null,
  accelerator: "o",
  role: null,
  submenu: null,
};
const LONG = "x".repeat(201);
interface Shape {
  v: unknown;
  t: unknown;
  menus: unknown;
}
interface Menu {
  menu: unknown;
  label: unknown;
  groups: unknown;
}
interface Built {
  message: Shape;
  menu: Menu;
  item: Record<string, unknown>;
}
const shape = (): Built => {
  const item: Record<string, unknown> = { ...ITEM };
  const menu: Menu = { menu: "file", label: "File", groups: [[item]] };
  return { message: { v: 1, t: "menus", menus: [menu] }, menu, item };
};
const DAMAGES: readonly {
  field: string;
  pool: readonly unknown[];
  put(s: Built, value: unknown): void;
}[] = [
  {
    field: "v",
    pool: [2, 0, "1", null],
    put: (s, value) => {
      s.message.v = value;
    },
  },
  {
    field: "t",
    pool: ["menu", "", 1],
    put: (s, value) => {
      s.message.t = value;
    },
  },
  {
    field: "menus",
    pool: [null, {}, "file", [null]],
    put: (s, value) => {
      s.message.menus = value;
    },
  },
  {
    field: "menu",
    pool: ["title", "", null, 3],
    put: (s, value) => {
      s.menu.menu = value;
    },
  },
  {
    field: "menu label",
    pool: ["", LONG, null, 1],
    put: (s, value) => {
      s.menu.label = value;
    },
  },
  {
    field: "groups",
    pool: [null, {}, Array.from({ length: 65 }, () => [ITEM]), [null]],
    put: (s, value) => {
      s.menu.groups = value;
    },
  },
  {
    field: "group",
    pool: [null, {}, Array.from({ length: 65 }, () => ITEM), [null]],
    put: (s, value) => {
      s.menu.groups = [value];
    },
  },
  {
    field: "item",
    pool: [null, [], "item"],
    put: (s, value) => {
      s.menu.groups = [[value]];
    },
  },
  {
    field: "id",
    pool: ["../x", "", "A.b", "a".repeat(129), 7],
    put: (s, value) => {
      s.item.id = value;
    },
  },
  {
    field: "label",
    pool: ["", LONG, null],
    put: (s, value) => {
      s.item.label = value;
    },
  },
  {
    field: "enabled",
    pool: ["true", null, 1],
    put: (s, value) => {
      s.item.enabled = value;
    },
  },
  {
    field: "checked",
    pool: ["yes", 0, undefined],
    put: (s, value) => {
      s.item.checked = value;
    },
  },
  {
    field: "accelerator",
    pool: ["Shift+K", "K", "ab", "", "+", 1],
    put: (s, value) => {
      s.item.accelerator = value;
    },
  },
  {
    field: "role",
    pool: ["undo", "quit", "", 1],
    put: (s, value) => {
      s.item.role = value;
    },
  },
  {
    field: "submenu",
    pool: ["", LONG, 1],
    put: (s, value) => {
      s.item.submenu = value;
    },
  },
];
const nearMenus = fc.constantFrom(...DAMAGES).chain((damage) =>
  fc.constantFrom(...damage.pool).map((value) => {
    const built = shape();
    damage.put(built, value);
    return { field: damage.field, message: built.message };
  }),
);

test("the shell channel's messages are pinned", () => {
  expect([
    DESKTOP_PROTOCOL_VERSION,
    [...NATIVE_MENU_IDS],
    [...NATIVE_ROLES],
    [...OPENED_FILE_EXTENSIONS],
  ]).toEqual([
    1,
    [
      "app",
      "file",
      "edit",
      "view",
      "format",
      "script",
      "production",
      "window",
      "help",
    ],
    ["cut", "copy", "paste", "selectAll"],
    [".fdx", ".fountain", ".pdf", ".docx", ".ink"],
  ]);
  const menus: PageMessage = {
    v: 1,
    t: "menus",
    menus: [
      {
        menu: "file",
        label: "File",
        groups: [
          [
            {
              id: "library.newScript",
              label: "New script",
              enabled: true,
              checked: null,
              accelerator: null,
              role: null,
              submenu: null,
            },
            {
              id: "setting.appearance.theme.dark",
              label: "Dark",
              enabled: true,
              checked: true,
              accelerator: null,
              role: null,
              submenu: "Theme",
            },
          ],
        ],
      },
    ],
  };
  expect(parsePageMessage(JSON.parse(JSON.stringify(menus)))).toEqual(menus);
  expect(
    parseShellMessage({ v: 1, t: "menu_command", id: "app.palette" }),
  ).toEqual({ v: 1, t: "menu_command", id: "app.palette" });
  const global: DesktopGlobal = {
    v: 1,
    platform: "linux",
    version: "0.1.0",
    channel: "canary",
    dataDir: "/home/sam/.local/share/manent",
  };
  expect(parseDesktopGlobal(global)).toEqual(global);
  expect([[...FILE_REFUSALS], [...UPDATE_STATES]]).toEqual([
    ["type", "size"],
    ["checking", "up_to_date", "ready", "check_failed"],
  ]);
  const pages: PageMessage[] = [
    { v: 1, t: "show_folder" },
    { v: 1, t: "check_for_updates" },
    { v: 1, t: "close_answer", close: false },
  ];
  for (const m of pages) expect(parsePageMessage(m)).toEqual(m);
  const shells: ShellMessage[] = [
    { v: 1, t: "close_requested" },
    { v: 1, t: "update_state", state: "ready" },
    {
      v: 1,
      t: "files_opened",
      files: [],
      refused: [{ name: "draft.pdf", reason: "size" }],
    },
  ];
  for (const m of shells) expect(parseShellMessage(m)).toEqual(m);
});

test("anything that is not a message of this version is refused whole", () => {
  const item = {
    id: "a.b",
    label: "A",
    enabled: true,
    checked: null,
    accelerator: null,
    role: null,
    submenu: null,
  };
  for (const bad of [
    null,
    [],
    "menus",
    { v: 2, t: "first_frame" },
    { v: 1, t: "reload" },
    { v: 1, t: "menus" },
    { v: 1, t: "menus", menus: [{ menu: "title", label: "T", groups: [] }] },
    {
      v: 1,
      t: "menus",
      menus: [{ menu: "file", label: "", groups: [[item]] }],
    },
    {
      v: 1,
      t: "menus",
      menus: [
        {
          menu: "file",
          label: "File",
          groups: [[{ ...item, accelerator: "Shift+K" }]],
        },
      ],
    },
    {
      v: 1,
      t: "menus",
      menus: [
        { menu: "file", label: "File", groups: [[{ ...item, role: "undo" }]] },
      ],
    },
    {
      v: 1,
      t: "menus",
      menus: [
        { menu: "file", label: "File", groups: [[{ ...item, id: "../x" }]] },
      ],
    },
    {
      v: 1,
      t: "menus",
      menus: [
        { menu: "file", label: "File", groups: [[{ ...item, submenu: "" }]] },
      ],
    },
    {
      v: 1,
      t: "menus",
      menus: [
        {
          menu: "file",
          label: "File",
          groups: Array.from({ length: 65 }, () => [item]),
        },
      ],
    },
    { v: 1, t: "first_paint", writes: [["b", "x", null]] },
    { v: 1, t: "close_answer", close: "yes" },
  ])
    expect(parsePageMessage(bad)).toBeNull();
  expect(
    parseShellMessage({
      v: 1,
      t: "files_opened",
      files: [{ name: "a.fdx", bytes: 7 }],
      refused: [],
    }),
  ).toBeNull();
  expect(
    parseShellMessage({
      v: 1,
      t: "files_opened",
      files: [],
      refused: [{ name: "a.txt", reason: "colour" }],
    }),
  ).toBeNull();
  expect(
    parseShellMessage({ v: 1, t: "update_state", state: "installing" }),
  ).toBeNull();
  expect(
    parseDesktopGlobal({
      v: 1,
      platform: "beos",
      version: "0.1.0",
      channel: "stable",
      dataDir: "/d",
    }),
  ).toBeNull();
  expect(
    parseDesktopGlobal({
      v: 1,
      platform: "mac",
      version: "0.1.0",
      channel: "nightly",
      dataDir: "/d",
    }),
  ).toBeNull();
});

test("any input ends in a message or null, never a throw", () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      parsePageMessage(value);
      parseShellMessage(value);
      parseDesktopGlobal(value);
    }),
    { numRuns: 2000 },
  );
});

test("a menus message with one field made wrong is refused whole", () => {
  expect(parsePageMessage(shape().message)).toEqual({
    v: 1,
    t: "menus",
    menus: [{ menu: "file", label: "File", groups: [[ITEM]] }],
  });
  fc.assert(
    fc.property(nearMenus, ({ message }) => {
      expect(parsePageMessage(message)).toBeNull();
    }),
    { numRuns: 2000 },
  );
});
