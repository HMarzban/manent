import { withDom } from "@manent/testkit/dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Dialog } from "@base-ui/react/dialog";
import { expect, test } from "bun:test";

withDom();

test("a dialog of the component library opens in a test's DOM", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <Dialog.Root>
        <Dialog.Trigger>Open</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Popup>Inside</Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>,
    ),
  );
  const trigger = host.querySelector("button");
  await act(async () => trigger?.click());
  expect(document.body.textContent).toContain("Inside");
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect([document.body.textContent, document.activeElement]).toEqual([
    "Open",
    trigger,
  ]);
  await act(async () => root.unmount());
  host.remove();
});
