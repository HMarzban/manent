import { expect, test } from "bun:test";
import type { NativeMenu, NativeMenuItem } from "@manent/sync-protocol";
import { ABOUT_ACTION, menuTemplate } from "../src/menu-template.ts";

const item = (
  id: string,
  label: string,
  fields: Partial<NativeMenuItem> = {},
): NativeMenuItem => ({
  id,
  label,
  enabled: true,
  checked: null,
  accelerator: null,
  role: null,
  submenu: null,
  ...fields,
});

const EDIT_ROLES = [
  { role: "cut" },
  { role: "copy" },
  { role: "paste" },
  { role: "selectAll" },
];

test("before the page speaks, the menu is the fixed minimum", () => {
  const edit = { label: "Edit", submenu: EDIT_ROLES };
  const window = {
    label: "Window",
    submenu: [{ role: "minimize" }, { role: "zoom" }],
  };
  expect(menuTemplate(null, "mac")).toEqual([
    {
      label: "Manent",
      submenu: [
        { label: "About Manent", action: ABOUT_ACTION, enabled: true },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    edit,
    window,
  ]);
  expect(menuTemplate(null, "windows")).toEqual([edit, window]);
});

test("the page's model becomes the native menu, with Preferences in the right place", () => {
  const menus: NativeMenu[] = [
    {
      menu: "app",
      label: "Manent",
      groups: [[item("app.preferences", "Preferences", { accelerator: "," })]],
    },
    {
      menu: "file",
      label: "File",
      groups: [
        [item("doc.new", "New script", { accelerator: "n" })],
        [item("doc.export", "Export", { enabled: false })],
      ],
    },
    {
      menu: "edit",
      label: "Edit",
      groups: [
        [item("edit.undo", "Undo", { accelerator: "z" })],
        [item("edit.copy", "Copy", { role: "copy" })],
      ],
    },
    {
      menu: "view",
      label: "View",
      groups: [[item("view.ruler", "Ruler", { checked: true })]],
    },
  ];
  expect(menuTemplate(menus, "mac")).toEqual([
    {
      label: "Manent",
      submenu: [
        { label: "About Manent", action: ABOUT_ACTION, enabled: true },
        {
          label: "Preferences",
          action: "app.preferences",
          accelerator: ",",
          enabled: true,
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New script",
          action: "doc.new",
          accelerator: "n",
          enabled: true,
        },
        { type: "separator" },
        { label: "Export", action: "doc.export", enabled: false },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", action: "edit.undo", accelerator: "z", enabled: true },
        { type: "separator" },
        { label: "Copy", role: "copy" },
        { type: "separator" },
        { role: "cut" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Ruler", action: "view.ruler", enabled: true, checked: true },
      ],
    },
  ]);
  expect(menuTemplate(menus.slice(1, 2), "windows")).toEqual([
    {
      label: "File",
      submenu: [
        {
          label: "New script",
          action: "doc.new",
          accelerator: "n",
          enabled: true,
        },
        { type: "separator" },
        { label: "Export", action: "doc.export", enabled: false },
      ],
    },
    { label: "Edit", submenu: EDIT_ROLES },
  ]);
});

test("a submenu of the model is one submenu entry, at its first item's place", () => {
  const theme = { submenu: "Theme" };
  const menus: NativeMenu[] = [
    {
      menu: "view",
      label: "View",
      groups: [
        [
          item("view.ruler", "Ruler"),
          item("view.light", "Light", { ...theme, checked: false }),
          item("view.dark", "Dark", { ...theme, checked: true }),
          item("view.zoomIn", "Zoom in"),
        ],
      ],
    },
  ];
  const [, view] = menuTemplate(menus, "windows");
  expect(view).toEqual({
    label: "View",
    submenu: [
      { label: "Ruler", action: "view.ruler", enabled: true },
      {
        label: "Theme",
        submenu: [
          {
            label: "Light",
            action: "view.light",
            enabled: true,
            checked: false,
          },
          { label: "Dark", action: "view.dark", enabled: true, checked: true },
        ],
      },
      { label: "Zoom in", action: "view.zoomIn", enabled: true },
    ],
  });
});
