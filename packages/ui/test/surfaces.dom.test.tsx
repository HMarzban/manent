import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { createAnnouncer, createFocusOrigin } from "../src/index.ts";

withDom();

afterEach(() => {
  document.body.replaceChildren();
});

const watchedButton = (name: string, calls: unknown[]): HTMLButtonElement => {
  const button = document.createElement("button");
  button.textContent = name;
  const focus = button.focus.bind(button);
  button.focus = (options) => {
    calls.push([name, options]);
    focus(options);
  };
  document.body.append(button);
  return button;
};

test("focus returns to the opener, else to the fallback, and never scrolls", () => {
  const calls: unknown[] = [];
  const fallback = (): void => {
    calls.push("fallback");
  };
  const origin = createFocusOrigin();
  const opener = watchedButton("opener", calls);
  const inner = watchedButton("inner", calls);
  origin.push(opener);
  origin.push(inner);
  origin.pop();
  origin.restore(fallback);
  const removed = watchedButton("removed", calls);
  removed.remove();
  origin.push(removed);
  origin.restore(fallback);
  const disabled = watchedButton("disabled", calls);
  disabled.disabled = true;
  origin.push(disabled);
  origin.restore(fallback);
  origin.push(null);
  origin.restore(fallback);
  origin.restore(fallback);
  expect(calls).toEqual([
    ["opener", { preventScroll: true }],
    "fallback",
    ["disabled", { preventScroll: true }],
    "fallback",
    "fallback",
    "fallback",
  ]);
  expect(document.activeElement).toBe(opener);
});

test("an announcement is written afresh into its own live region, so the same words are read again", () => {
  const region = document.createElement("div");
  region.innerHTML =
    '<div aria-live="polite"></div><div aria-live="assertive"></div>';
  document.body.append(region);
  const [polite, assertive] = [...region.children];
  const announcer = createAnnouncer(region);
  announcer.announce("Left panel");
  const first = polite?.firstChild;
  announcer.announce("Left panel");
  announcer.announce("Can't save on this device — export a copy", "assertive");
  expect([
    polite?.textContent,
    assertive?.textContent,
    polite?.childNodes.length,
    polite?.firstChild === first,
  ]).toEqual([
    "Left panel",
    "Can't save on this device — export a copy",
    1,
    false,
  ]);
});

test("an announcer without its two live regions is refused", () => {
  const region = document.createElement("div");
  region.innerHTML = '<div aria-live="polite"></div>';
  expect(() => createAnnouncer(region)).toThrow(TypeError);
});
