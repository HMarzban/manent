import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { act } from "react";
import { Avatar, AvatarStack, ViewerCount } from "../src/index.ts";
import { hashAvatarSeed } from "../src/components/avatar/avatar-art.tsx";

withDom();

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

function render(node: React.ReactNode): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

test("hashAvatarSeed is deterministic, case-insensitive, and distinguishes people", () => {
  expect(hashAvatarSeed("Dana Reyes")).toBe(hashAvatarSeed("  dana reyes "));
  const hashes = new Set(
    [
      "Dana Reyes",
      "Sam Okafor",
      "Priya Nair",
      "Leo Marsh",
      "Ana Costa",
      "Niamh Corrigan",
    ].map(hashAvatarSeed),
  );
  expect(hashes.size).toBe(6);
});

test("Avatar renders deterministic decorative SVG art behind initials, or a plus with data-new when unregistered", () => {
  const el = render(
    <div>
      <Avatar name="Dana Reyes" initials="DR" colour={3} size="md" />
      <Avatar name="Sam Okafor" initials="SO" colour={null} size="lg" />
      <Avatar name="You" initials={null} colour={null} size="lg" />
    </div>,
  );
  const avatars = [...el.querySelectorAll<HTMLElement>(".mn-avatar")];
  expect(avatars).toHaveLength(3);
  expect(avatars[0]!.getAttribute("aria-label")).toBe("Dana Reyes");
  expect(avatars[0]!.dataset["who"]).toBe("3");
  expect(
    avatars[0]!.querySelector("svg.mn-avatar-art")?.getAttribute("aria-hidden"),
  ).toBe("true");
  expect(avatars[0]!.textContent).toBe("DR");
  expect(avatars[1]!.dataset["who"]).toBeUndefined();
  expect(avatars[1]!.querySelector("svg.mn-avatar-art")).not.toBeNull();
  expect(avatars[2]!.dataset["new"]).toBe("");
  expect(avatars[2]!.querySelector("svg.mn-avatar-art")).toBeNull();
});

test("AvatarStack renders cohesive overlapping stack with capsule overflow count for large rooms", () => {
  const people = Array.from({ length: 20 }, (_, i) => ({
    userId: `u${i}`,
    name: `Writer ${i}`,
    initials: `W${i}`,
    colour: (i % 10) + 1,
  }));
  const el = render(
    <div>
      <AvatarStack people={people} size="md" />
      <AvatarStack people={people} size="sm" layout="overlapping" />
      <ViewerCount viewers={3} />
    </div>,
  );
  const stack = el.querySelector<HTMLElement>(".mn-avatar-stack")!;
  expect(stack.querySelectorAll(".mn-avatar[data-who]").length).toBe(3);
  const more = stack.querySelector<HTMLElement>(".mn-avatar[data-more]")!;
  expect(more.textContent).toBe("+17");
  expect(more.getAttribute("aria-label")).toBe("17 more people");
  const overlap = el.querySelector<HTMLElement>(".mn-avatar-overlap")!;
  expect(overlap.querySelectorAll(".mn-avatar[data-who]").length).toBe(2);
  expect(
    overlap.querySelector<HTMLElement>(".mn-avatar[data-more]")!.textContent,
  ).toBe("+18");
});
