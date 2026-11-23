import { expect, test } from "bun:test";
import {
  createMemoryBag,
  createRegistry,
  createSettingsStore,
  setting,
  t,
} from "../src/index.ts";
import type { Bag, SetResult } from "../src/index.ts";

const registry = createRegistry(
  [
    setting({
      key: "writing.flag",
      scope: "personal",
      type: t.boolean(),
      default: false,
      label: "Flag",
      description: null,
      noun: null,
      surfaces: [{ in: "preferences", section: "writing", order: 10 }],
      apply: { how: "read" },
      boot: false,
      guard: null,
      keywords: [],
    }),
    setting({
      key: "script.paperLike",
      scope: "script",
      type: t.choice([
        { value: "letter", label: "US Letter" },
        { value: "a4", label: "A4" },
      ]),
      default: "letter",
      label: "Paper",
      description: null,
      noun: "paper size",
      surfaces: [{ in: "scriptSettings", group: "page_setup", order: 20 }],
      apply: { how: "editor", effect: "layout" },
      boot: false,
      guard: "layout",
      keywords: [],
    }),
  ],
  [],
  [],
);

type MemoryBag = ReturnType<typeof createMemoryBag>;

const memory = (
  initial: Record<string, unknown> = {},
  writable: (key: string) => boolean = () => true,
): MemoryBag => createMemoryBag({ initial, writable });

function store(
  options: {
    personal?: Bag;
    device?: Bag;
    script?: Bag | null;
    beforeWrite?: (key: string) => void;
    deferRemote?: (apply: () => void) => void;
    locked?: (key: string) => boolean;
  } = {},
) {
  return createSettingsStore({
    registry,
    bags: {
      personal: options.personal ?? memory(),
      device: options.device ?? memory(),
      script: options.script === undefined ? memory() : options.script,
      project: null,
    },
    beforeWrite: options.beforeWrite ?? (() => {}),
    deferRemote: options.deferRemote ?? ((apply) => apply()),
    locked: options.locked ?? (() => false),
  });
}

const writeCounts = new WeakMap<Bag, number>();
const writes = (bag: Bag): number => writeCounts.get(bag) ?? 0;
function counted(bag: MemoryBag): MemoryBag {
  const wrapped: MemoryBag = {
    ...bag,
    write(patch) {
      writeCounts.set(wrapped, writes(wrapped) + 1);
      bag.write(patch);
    },
  };
  return wrapped;
}

test("the stored value wins when its type accepts it, else the default; nothing is overwritten", () => {
  const personal = createMemoryBag({
    initial: { "writing.flag": "garbage" },
    writable: () => true,
  });
  const s = store({ personal });
  expect(s.get("writing.flag")).toBe(false);
  expect(personal.read()["writing.flag"]).toBe("garbage");
  expect(s.explain("writing.flag")).toEqual({
    value: false,
    source: "default",
    modified: false,
    writable: true,
    provenance: null,
  });
  const accepted = store({ personal: memory({ "writing.flag": true }) });
  expect(accepted.explain("writing.flag")).toEqual({
    value: true,
    source: "own",
    modified: true,
    writable: true,
    provenance: null,
  });
});

test("set validates, guards, notifies only that key, and calls beforeWrite first", () => {
  const order: string[] = [];
  const personal = memory();
  const s = store({
    personal: {
      ...personal,
      write(patch) {
        order.push(`write ${Object.keys(patch).join()}`);
        personal.write(patch);
      },
    },
    beforeWrite: (key) => order.push(`before ${key}`),
    locked: (key) => key === "script.paperLike",
  });
  const heard: string[] = [];
  s.subscribe("writing.flag", () => heard.push("flag"));
  s.subscribe("script.paperLike", () => heard.push("paper"));

  expect(s.set("writing.flag", "x" as never)).toEqual({
    ok: false,
    reason: "invalid",
    message: "writing.flag refuses the value: not_boolean",
  });
  expect(s.set("script.paperLike", "a4")).toEqual({
    ok: false,
    reason: "needs_authority",
    message:
      "script.paperLike changes the layout of a script whose page numbers are locked",
  });
  const readOnly: SetResult = {
    ok: false,
    reason: "read_only",
    message: "Only editors can change script settings.",
  };
  expect([
    store({ script: memory({}, () => false) }).set("script.paperLike", "a4"),
    store({ script: null }).set("script.paperLike", "a4"),
  ]).toEqual([readOnly, readOnly]);

  expect(s.set("writing.flag", true)).toEqual({ ok: true });
  expect([order, heard, s.get("writing.flag")]).toEqual([
    ["before writing.flag", "write writing.flag"],
    ["flag"],
    true,
  ]);
});

test("a held key ignores a remote value until release", () => {
  const personal = memory();
  const counting = counted(personal);
  const s = store({ personal: counting });
  const h = s.hold("writing.flag");
  h.preview(true);
  expect(s.get("writing.flag")).toBe(true);
  personal.receive({ "writing.flag": false }, null);
  expect(s.get("writing.flag")).toBe(true);
  h.commit();
  expect([s.get("writing.flag"), writes(counting)]).toEqual([true, 1]); // stored once
});

test("a cancelled hold puts back what was there, then what arrived while it was held", () => {
  const personal = memory();
  const counting = counted(personal);
  let deferred = 0;
  const s = store({
    personal: counting,
    deferRemote: (apply) => {
      deferred += 1;
      apply();
    },
  });
  let heard = 0;
  s.subscribe("writing.flag", () => (heard += 1));

  const first = s.hold("writing.flag");
  first.preview(true);
  first.cancel();
  expect([s.get("writing.flag"), heard]).toEqual([false, 2]);

  const second = s.hold("writing.flag");
  second.preview(true);
  personal.receive({ "writing.flag": true }, null);
  expect([heard, deferred]).toEqual([3, 0]);
  second.cancel();
  expect([s.get("writing.flag"), s.explain("writing.flag").source]).toEqual([
    true,
    "own",
  ]);
  expect(writes(counting)).toBe(0);
});

test("a remote change is deferred while keys were pressed in the last five seconds", () => {
  const personal = memory();
  const waiting: (() => void)[] = [];
  const s = store({ personal, deferRemote: (apply) => waiting.push(apply) });
  personal.receive({ "writing.flag": true }, null);
  expect(s.get("writing.flag")).toBe(false);
  waiting[0]!();
  expect(s.get("writing.flag")).toBe(true);
});

test("a remote value says who set it and what it replaced", () => {
  const script = memory();
  const s = store({ script });
  script.receive({ "script.paperLike": "a4" }, "u_sam");
  script.receive({ "script.paperLike": "letter" }, "u_priya");
  expect(s.explain("script.paperLike").provenance).toEqual({
    at: null,
    on: null,
    byUserId: "u_priya",
    was: "a4",
  });
  s.set("script.paperLike", "a4");
  expect(s.explain("script.paperLike").provenance).toBeNull();
});

test("reset all of a scope can be restored, but not over a later change", () => {
  const s = store();
  s.set("writing.flag", true);
  expect(s.modified("personal")).toEqual(["writing.flag"]);
  const receipt = s.reset({ scope: "personal" });
  expect([receipt, s.get("writing.flag"), s.modified("personal")]).toEqual([
    { entries: [{ key: "writing.flag", was: true }] },
    false,
    [],
  ]);
  s.restore(receipt);
  expect(s.get("writing.flag")).toBe(true);

  const again = s.reset({ scope: "personal" });
  s.set("writing.flag", true);
  s.set("writing.flag", false);
  s.restore(again);
  expect([s.get("writing.flag"), s.explain("writing.flag").source]).toEqual([
    false,
    "own",
  ]);
});

test("resetting one setting puts back its default and keeps what it held", () => {
  const s = store({ script: memory({ "script.paperLike": "a4" }) });
  expect(s.reset("script.paperLike")).toEqual({
    entries: [{ key: "script.paperLike", was: "a4" }],
  });
  expect(s.explain("script.paperLike")).toEqual({
    value: "letter",
    source: "default",
    modified: false,
    writable: true,
    provenance: null,
  });
});
