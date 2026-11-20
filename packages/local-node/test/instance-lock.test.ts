import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { createTempTrees } from "@manent/testkit";
import { acquireInstanceLock } from "../src/index.ts";

const HOLD_LOCK = join(import.meta.dir, "fixtures/hold-lock.ts");
const trees = createTempTrees("manent-lock-");
let root: string;

beforeEach(async () => {
  root = await trees.tree({});
});
afterAll(() => trees.removeAll());

type Child = Subprocess<"ignore", "pipe", "inherit">;
const children: Child[] = [];

// A test that fails part-way leaves no holder running.
afterEach(async () => {
  for (const child of children) child.kill("SIGKILL");
  await Promise.all(children.splice(0).map((child) => child.exited));
});

function holder(): Child {
  const child = Bun.spawn([process.execPath, HOLD_LOCK, root], {
    stdout: "pipe",
  });
  children.push(child);
  return child;
}

async function firstLine(child: Child, withinMs: number): Promise<string> {
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let timer: Timer | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RangeError(`no line within ${withinMs} ms`)),
      withinMs,
    );
  });
  try {
    while (!text.includes("\n")) {
      const { done, value } = await Promise.race([reader.read(), late]);
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  return text.split("\n")[0] ?? "";
}

async function lineFrom(child: Child, expected: string): Promise<void> {
  expect(await firstLine(child, 5_000)).toBe(expected);
}

test(
  "two processes started together: one holds the lock",
  async () => {
    const both = [0, 1].map(() => holder());
    const lines = await Promise.all(both.map((p) => firstLine(p, 5_000)));
    expect(lines.toSorted()).toEqual(["held", "locked"]);
  },
  { timeout: 20_000 },
);

test(
  "a second process cannot take the lock while the first holds it",
  async () => {
    const held = holder();
    await lineFrom(held, "locked");
    expect(acquireInstanceLock(root)).toEqual({ ok: false, reason: "held" });
    held.kill("SIGTERM");
    await held.exited;
    const mine = acquireInstanceLock(root);
    expect(mine.ok).toBe(true);
    if (mine.ok) mine.lock.release();
  },
  { timeout: 20_000 },
);

test(
  "a crash frees the lock",
  async () => {
    const held = holder();
    await lineFrom(held, "locked");
    held.kill("SIGKILL");
    await held.exited;
    const mine = acquireInstanceLock(root);
    expect(mine.ok).toBe(true);
    if (mine.ok) mine.lock.release();
  },
  { timeout: 20_000 },
);

test(
  "releasing lets another take it",
  async () => {
    const mine = acquireInstanceLock(root);
    if (!mine.ok) throw new Error("the lock was not taken");
    const refused = holder();
    await lineFrom(refused, "held");
    await refused.exited;
    mine.lock.release();
    await lineFrom(holder(), "locked");
  },
  { timeout: 20_000 },
);
