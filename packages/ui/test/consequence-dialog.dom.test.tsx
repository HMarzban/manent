import { withDom } from "@manent/testkit/dom";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, test } from "bun:test";
import { ConsequenceDialog, TimingProvider } from "../src/index.ts";
import type { ConsequenceDialogProps } from "../src/index.ts";

withDom();

// happy-dom lays nothing out: an element is as wide as 8 px per character it holds
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get(this: HTMLElement): number {
    return (this.textContent?.length ?? 0) * 8;
  },
});

const fakeClock = (): {
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => () => void;
  advance: (ms: number) => Promise<void>;
} => {
  let at = 0;
  let tasks: { at: number; fn: () => void }[] = [];
  return {
    now: () => at,
    schedule: (fn, delayMs) => {
      const task = { at: at + delayMs, fn };
      tasks.push(task);
      return () => {
        tasks = tasks.filter((t) => t !== task);
      };
    },
    advance: async (ms) => {
      const end = at + ms;
      for (;;) {
        const due = tasks
          .filter((t) => t.at <= end)
          .toSorted((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        tasks = tasks.filter((t) => t !== due);
        at = due.at;
        await act(async () => due.fn());
      }
      at = end;
    },
  };
};

const roots: Root[] = [];
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

const render = async (
  node: ReactNode,
  clock = fakeClock(),
): Promise<{
  rerender: (next: ReactNode) => Promise<void>;
  clock: ReturnType<typeof fakeClock>;
}> => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const rerender = async (next: ReactNode): Promise<void> => {
    await act(async () =>
      root.render(<TimingProvider timing={clock}>{next}</TimingProvider>),
    );
    // Base UI moves focus into a dialog that mounts open on the next frame
    await act(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  };
  await rerender(node);
  return { rerender, clock };
};

const press = async (key: string): Promise<void> => {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  });
};

const calls: string[] = [];
afterEach(() => {
  calls.length = 0;
});

const reset = (patch: Partial<ConsequenceDialogProps> = {}): ReactNode => (
  <ConsequenceDialog
    open
    title="Reset the demo?"
    body="Everyone in the demo loses what they wrote. The seeded scripts come back."
    action="Reset the demo"
    busyLabel={null}
    refusal={null}
    destructive
    onAction={() => calls.push("action")}
    onCancel={() => calls.push("cancel")}
    {...patch}
  />
);

const dialog = (): HTMLElement | null =>
  document.querySelector('[role="alertdialog"]');
const buttons = (): (string | null)[] =>
  [...(dialog()?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
const actionButton = (): HTMLButtonElement | null =>
  dialog()?.querySelector("button:last-of-type") ?? null;

test("the dialog says who is affected and what is kept, and its button is the title's start", async () => {
  await render(reset());
  const popup = dialog();
  const titleId = popup?.getAttribute("aria-labelledby") ?? "";
  const bodyId = popup?.getAttribute("aria-describedby") ?? "";
  expect([
    document.getElementById(titleId)?.textContent,
    document.getElementById(bodyId)?.textContent,
    buttons(),
  ]).toEqual([
    "Reset the demo?",
    "Everyone in the demo loses what they wrote. The seeded scripts come back.",
    ["Cancel", "Reset the demo"],
  ]);
});

test("a question title that is not a question, or whose action is not its start, is refused", async () => {
  await expect(render(reset({ title: "Reset the demo" }))).rejects.toThrow(
    RangeError,
  );
  await expect(
    render(reset({ title: "Reset the demo for everyone" })),
  ).rejects.toThrow(RangeError);
  await expect(render(reset({ action: "Delete" }))).rejects.toThrow(RangeError);
  await render(reset({ action: "Reset" }));
  await render(
    reset({
      title: "Lock for production",
      titledBy: "command",
      action: "Lock",
    }),
  );
  expect(document.querySelectorAll('[role="alertdialog"]').length).toBe(2);
});

test("focus starts on Cancel in every use", async () => {
  const focused: (string | null | undefined)[] = [];
  for (const use of [
    reset({ destructive: false }),
    reset(),
    reset({
      title: "Export a copy before closing?",
      action: "Export a copy",
      destructive: false,
      alternative: {
        label: "Close without exporting",
        destructive: true,
        onAction: () => {},
      },
    }),
    reset({
      title: "Lock for production",
      titledBy: "command",
      action: "Lock",
      destructive: false,
      children: <input aria-label="First revision" />,
    }),
  ]) {
    await render(use);
    focused.push(document.activeElement?.textContent);
    await act(async () => roots.pop()?.unmount());
  }
  expect(focused).toEqual(["Cancel", "Cancel", "Cancel", "Cancel"]);
});

test("Enter on open presses Cancel", async () => {
  await render(reset());
  const target = document.activeElement;
  const enter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    target?.dispatchEvent(enter);
    // happy-dom has no activation behaviour: do what the browser does with an Enter nothing prevented
    if (!enter.defaultPrevented && target instanceof HTMLElement)
      target.click();
  });
  expect(calls).toEqual(["cancel"]);
});

test("a click on the scrim leaves the dialog open", async () => {
  await render(reset());
  const scrim = document.querySelector<HTMLElement>(
    '[data-slot="alert-dialog-overlay"]',
  );
  await act(async () => {
    scrim?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    scrim?.click();
  });
  expect([scrim !== null, calls, dialog() !== null]).toEqual([true, [], true]);
});

test("a wide dialog draws its content between the body and the buttons", async () => {
  await render(
    reset({
      title: "Lock for production",
      titledBy: "command",
      action: "Lock",
      destructive: false,
      wide: true,
      refusal: "Couldn't lock page numbers. Try again.",
      children: <p data-choices>Numbering 12A · WGA colour order</p>,
    }),
  );
  const popup = dialog();
  const order = [
    ...(popup?.querySelectorAll("h2, [data-choices], p, button") ?? []),
  ].map((node) =>
    node.hasAttribute("data-choices") ? "choices" : node.tagName,
  );
  expect([popup?.style.maxWidth, order]).toEqual([
    "var(--dialog-w-wide)",
    ["H2", "P", "choices", "P", "BUTTON", "BUTTON"],
  ]);
});

test("a disabled action says why above the buttons and stays focusable", async () => {
  await render(
    reset({
      title: "Export a copy before closing?",
      action: "Export a copy…",
      destructive: false,
      disabledReason: "needs a connection",
    }),
  );
  const action = actionButton();
  const description = document.getElementById(
    action?.getAttribute("aria-describedby") ?? "",
  );
  await act(async () => action?.click());
  await act(async () => action?.focus());
  expect([
    dialog()?.style.maxWidth,
    description?.textContent,
    action?.getAttribute("aria-disabled"),
    document.activeElement === action,
    calls,
  ]).toEqual([
    "var(--dialog-w)",
    "Export a copy needs a connection.",
    "true",
    true,
    [],
  ]);
});

test("a refusal keeps the dialog open, takes focus, and offers Try again", async () => {
  const { rerender } = await render(reset());
  await rerender(
    reset({
      refusal: "Couldn't reset the demo. Start the server, then try again.",
    }),
  );
  const line = document.activeElement;
  await act(async () => actionButton()?.click());
  expect([
    line?.textContent,
    line?.closest("[aria-live]"),
    actionButton()?.textContent,
    calls,
    dialog() !== null,
  ]).toEqual([
    "Couldn't reset the demo. Start the server, then try again.",
    null,
    "Try again",
    ["action"],
    true,
  ]);
});

test("an alternative sits between Cancel and the action and runs its own handler", async () => {
  await render(
    reset({
      title: "Export a copy before closing?",
      action: "Export a copy",
      destructive: false,
      alternative: {
        label: "Close without exporting",
        destructive: true,
        onAction: () => calls.push("alternative"),
      },
    }),
  );
  const middle = dialog()?.querySelectorAll("button")[1];
  await act(async () => middle?.click());
  expect([
    buttons(),
    middle?.className.includes("text-destructive"),
    actionButton()?.className.includes("text-destructive"),
    calls,
  ]).toEqual([
    ["Cancel", "Close without exporting", "Export a copy"],
    true,
    false,
    ["alternative"],
  ]);
});

test("while busy the action keeps its width and aria-busy, and Still working announces politely", async () => {
  const { rerender, clock } = await render(reset());
  const idleBusy = actionButton()?.getAttribute("aria-busy");
  await rerender(reset({ busyLabel: "Resetting the demo…" }));
  const busy = [
    actionButton()?.textContent,
    actionButton()?.style.width,
    actionButton()?.getAttribute("aria-disabled"),
    actionButton()?.getAttribute("aria-busy"),
  ];
  await clock.advance(399);
  const before = actionButton()?.querySelector("svg") !== null;
  await clock.advance(1);
  const spinner = actionButton()?.querySelector("svg") !== null;
  await press("Escape");
  const early = [...calls];
  await clock.advance(4599);
  const waiting = dialog()?.textContent?.includes("Still working…");
  await clock.advance(1);
  const stillNode = dialog()?.querySelector('[role="status"]');
  const still = [
    stillNode?.textContent ?? null,
    stillNode?.getAttribute("aria-live") ?? null,
  ];
  await press("Escape");
  expect([
    idleBusy,
    busy,
    before,
    spinner,
    early,
    waiting,
    still,
    calls,
  ]).toEqual([
    null,
    ["Resetting the demo…", "112px", "true", "true"],
    false,
    true,
    [],
    false,
    ["Still working…", "polite"],
    ["cancel"],
  ]);
});

test("Escape cancels and returns focus to the opener", async () => {
  const opener = document.createElement("button");
  opener.textContent = "Reset";
  document.body.append(opener);
  opener.focus();
  const { rerender } = await render(reset({ open: false }));
  await rerender(reset());
  const inside = document.activeElement?.textContent;
  await press("Escape");
  await rerender(reset({ open: false }));
  expect([inside, calls, document.activeElement === opener]).toEqual([
    "Cancel",
    ["cancel"],
    true,
  ]);
});
