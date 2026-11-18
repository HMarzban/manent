import { expect, test } from "bun:test";
import { dialogActions } from "../src/state/dialog.store.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { paletteActions } from "../src/state/palette.store.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import { renameActions } from "../src/state/rename.store.ts";

test("a store written during an editor transaction is a violation, and in the test flavour it throws", () => {
  const guard = createGuard({ flavour: "test" });
  bindGuard(guard);
  guard.enter();
  expect(() => panelsActions.open("side", "details")).toThrow(
    "panels was written during an editor transaction",
  );
  guard.leave();
  panelsActions.open("side", "details");
  expect(guard.violations()).toBe(1);
  const prod = createGuard({ flavour: "production" });
  prod.enter();
  prod.check("panels");
  expect(prod.violations()).toBe(1); // counts, does not throw
});

test("every interface store is guarded under its own name", () => {
  const guard = createGuard({ flavour: "test" });
  bindGuard(guard);
  guard.enter();
  const writes = [
    () => panelsActions.close("left"),
    () => paletteActions.open("all"),
    () => dialogActions.open("reset"),
    () => renameActions.start("doc-1"),
  ];
  const refusals = writes.map((write) => {
    try {
      write();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : null;
    }
  });
  guard.leave();
  expect([refusals, guard.violations()]).toEqual([
    [
      "panels was written during an editor transaction",
      "palette was written during an editor transaction",
      "dialog was written during an editor transaction",
      "rename was written during an editor transaction",
    ],
    4,
  ]);
});

test("a check outside a transaction, or after it ends, is not a violation", () => {
  const guard = createGuard({ flavour: "test" });
  guard.check("panels");
  guard.enter();
  guard.enter();
  guard.leave();
  expect(() => guard.check("panels")).toThrow(
    "panels was written during an editor transaction",
  );
  guard.leave();
  guard.check("panels");
  expect(guard.violations()).toBe(1);
});

test("leaving a transaction that was never entered is refused", () => {
  expect(() => createGuard({ flavour: "production" }).leave()).toThrow(
    RangeError,
  );
});
