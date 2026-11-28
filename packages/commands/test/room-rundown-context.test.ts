import { describe, expect, test } from "bun:test";
import {
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import { COMMANDS, createCommandService } from "../src/index.ts";
import type { CommandContext } from "../src/index.ts";

const BASE_CTX: CommandContext = {
  screen: "document",
  focus: "page",
  docOpen: true,
  role: "editor",
  online: true,
  platform: "mac",
  shell: "web",
  demo: false,
  signedIn: true,
  workspace: "writable",
  panelOpen: { left: false, side: false },
  historyPresent: false,
  format: "screenplay",
  rulerShown: false,
  layoutView: "page",
  spaceBeforeSet: false,
  zoom: 100,
  zoomPercent: 100,
  production: null,
  docKind: "script",
  projectKind: "series",
  outlineStart: false,
  writing: null,
  material: {
    caretInSpeech: false,
    alternates: 0,
    selection: false,
    cuts: 0,
  },
  rundown: null,
  prompter: null,
  inTrash: false,
  canDelete: false,
  focusMode: false,
  readingAloud: false,
  sprintRunning: false,
};

const noop = (): void => {};
const HANDLERS: Readonly<Record<string, () => void>> = Object.fromEntries(
  COMMANDS.map((c) => [c.id, noop]),
);

const makeBag = () => createMemoryBag({ initial: {}, writable: () => true });

function serviceFor(over: Partial<CommandContext>) {
  const settings = createSettingsStore({
    registry: SETTINGS,
    bags: {
      personal: makeBag(),
      device: makeBag(),
      script: makeBag(),
      project: null,
    },
    beforeWrite: noop,
    deferRemote: (apply) => apply(),
    locked: () => false,
  });
  return createCommandService({
    commands: COMMANDS,
    handlers: HANDLERS,
    context: () => ({ ...BASE_CTX, ...over }),
    settings,
    bindings: () => new Map(),
    onDisabled: noop,
  });
}

describe("room.takeKeys and room.pitch context precision", () => {
  test("room.takeKeys reports exact enabled/whyNot states for offline, no driver, self driving, and other driving", () => {
    expect(
      serviceFor({
        online: false,
        driver: { active: true, isSelf: false, name: "Dana" },
      }).state("room.takeKeys"),
    ).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "needs a connection",
    });

    expect(
      serviceFor({
        online: true,
        driver: { active: false, isSelf: false, name: null },
      }).state("room.takeKeys"),
    ).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "needs someone presenting to the room",
    });

    expect(
      serviceFor({
        online: true,
        driver: null,
      }).state("room.takeKeys"),
    ).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "needs someone presenting to the room",
    });

    expect(
      serviceFor({
        online: true,
        driver: { active: true, isSelf: true, name: "Sam" },
      }).state("room.takeKeys"),
    ).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "works when someone else is driving",
    });

    expect(
      serviceFor({
        online: true,
        driver: { active: true, isSelf: false, name: "Dana" },
      }).state("room.takeKeys"),
    ).toMatchObject({
      visible: true,
      enabled: true,
      whyNot: null,
    });

    // Legacy context omitting driver stays compatible when online.
    expect(serviceFor({ online: true }).state("room.takeKeys")).toMatchObject({
      visible: true,
      enabled: true,
      whyNot: null,
    });
  });

  test("room.pitch gates on online, another driver active, and driver caret in speech", () => {
    expect(
      serviceFor({
        online: false,
        driver: {
          active: true,
          isSelf: false,
          name: "Dana",
          caretInSpeech: true,
        },
      }).state("room.pitch"),
    ).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "needs a connection",
    });

    expect(
      serviceFor({
        online: true,
        driver: { active: false, isSelf: false, name: null },
      }).state("room.pitch"),
    ).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "needs someone driving",
    });

    expect(
      serviceFor({
        online: true,
        driver: { active: true, isSelf: true, name: "Sam" },
      }).state("room.pitch"),
    ).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "works when someone else is driving",
    });

    expect(
      serviceFor({
        online: true,
        driver: {
          active: true,
          isSelf: false,
          name: "Dana",
          caretInSpeech: false,
        },
      }).state("room.pitch"),
    ).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "needs Dana's caret in a speech",
    });

    expect(
      serviceFor({
        online: true,
        driver: { active: true, isSelf: false, caretInSpeech: false },
      }).state("room.pitch"),
    ).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "needs the driver's caret in a speech",
    });

    expect(
      serviceFor({
        online: true,
        driver: {
          active: true,
          isSelf: false,
          name: "Dana",
          caretInSpeech: true,
        },
      }).state("room.pitch"),
    ).toMatchObject({
      visible: true,
      enabled: true,
      whyNot: null,
    });

    // Falls back to material.caretInSpeech when driver.caretInSpeech is omitted.
    expect(
      serviceFor({
        online: true,
        driver: { active: true, isSelf: false, name: "Dana" },
        material: {
          caretInSpeech: false,
          alternates: 0,
          selection: false,
          cuts: 0,
        },
      }).state("room.pitch"),
    ).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "needs Dana's caret in a speech",
    });
  });
});

describe("rundown command context precision", () => {
  const baseRundown: NonNullable<CommandContext["rundown"]> = {
    canEdit: true,
    selectedRows: 1,
    scriptRowSelected: false,
    editingCell: false,
  };

  test("rundown.moveUp, moveDown, pasteRows, and previousValue report exact when/whyNot", () => {
    const blocked = serviceFor({
      docKind: "rundown",
      rundown: {
        ...baseRundown,
        canMoveUp: false,
        canMoveDown: false,
        hasClipboard: false,
        hasPreviousValue: false,
      },
    });
    expect(blocked.state("rundown.moveUp")).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "isn't available on the first row",
    });
    expect(blocked.state("rundown.moveDown")).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "isn't available on the last row",
    });
    expect(blocked.state("rundown.pasteRows")).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "needs rows copied from a rundown",
    });
    expect(blocked.state("rundown.previousValue")).toMatchObject({
      visible: true,
      enabled: false,
      whyNot: "needs a cell with a previous value",
    });

    const ready = serviceFor({
      docKind: "rundown",
      rundown: {
        ...baseRundown,
        canMoveUp: true,
        canMoveDown: true,
        hasClipboard: true,
        hasPreviousValue: true,
      },
    });
    expect(ready.state("rundown.moveUp")).toMatchObject({
      visible: true,
      enabled: true,
      whyNot: null,
    });
    expect(ready.state("rundown.moveDown")).toMatchObject({
      visible: true,
      enabled: true,
      whyNot: null,
    });
    expect(ready.state("rundown.pasteRows")).toMatchObject({
      visible: true,
      enabled: true,
      whyNot: null,
    });
    expect(ready.state("rundown.previousValue")).toMatchObject({
      visible: true,
      enabled: true,
      whyNot: null,
    });

    // Optional fields omitted remain enabled for backwards-compatibility.
    const legacy = serviceFor({
      docKind: "rundown",
      rundown: baseRundown,
    });
    expect(legacy.state("rundown.moveUp").enabled).toBe(true);
    expect(legacy.state("rundown.moveDown").enabled).toBe(true);
    expect(legacy.state("rundown.pasteRows").enabled).toBe(true);
    expect(legacy.state("rundown.previousValue").enabled).toBe(true);
  });
});
