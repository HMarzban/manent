import { expect, test } from "bun:test";
import { createFakeClock } from "../src/testing/index.ts";

test("timers run in order when time is advanced, and not when it jumps", () => {
  const { clock, advance, jump, pending } = createFakeClock(1_000);
  const ran: string[] = [];
  clock.schedule(() => ran.push("b"), 20);
  clock.schedule(() => ran.push("a"), 10);
  const cancel = clock.schedule(() => ran.push("c"), 15);
  cancel();
  advance(9);
  expect(ran).toEqual([]);
  advance(11);
  expect(ran).toEqual(["a", "b"]);
  expect(clock.now()).toBe(1_020);
  clock.schedule(() => ran.push("d"), 5);
  jump(9_000_000);
  expect(ran).toEqual(["a", "b"]);
  expect(pending()).toBe(1);
  // it was due long ago: it runs at once, once
  advance(0);
  expect(ran).toEqual(["a", "b", "d"]);
});

test("a timer set by a running timer runs in the same advance once it falls due, after older timers due then", () => {
  const { clock, advance, pending } = createFakeClock();
  const ran: [string, number][] = [];
  clock.schedule(() => {
    ran.push(["first", clock.now()]);
    clock.schedule(() => ran.push(["second", clock.now()]), 5);
    clock.schedule(() => ran.push(["late", clock.now()]), 50);
  }, 10);
  clock.schedule(() => ran.push(["tie", clock.now()]), 15);
  advance(20);
  expect(ran).toEqual([
    ["first", 10],
    ["tie", 15],
    ["second", 15],
  ]);
  expect([clock.now(), pending()]).toEqual([20, 1]);
});

test("a timer overdue after a jump runs at the time jumped to, never earlier", () => {
  const { clock, advance, jump } = createFakeClock(100);
  const seen: number[] = [];
  clock.schedule(() => seen.push(clock.now()), 10);
  jump(5_000);
  advance(0);
  expect(seen).toEqual([5_000]);
});
