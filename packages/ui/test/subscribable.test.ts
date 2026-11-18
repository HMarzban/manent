import { expect, test } from "bun:test";
import { createValue } from "../src/index.ts";

test("a value notifies only when it changed", () => {
  const seen: number[] = [];
  const value = createValue(1);
  value.subscribe((v) => seen.push(v));
  value.set(1);
  value.set(2);
  expect([seen, value.get()]).toEqual([[2], 2]);
});

test("a value compares with the equality it was given", () => {
  const seen: (readonly string[])[] = [];
  const value = createValue<readonly string[]>(
    ["a"],
    (x, y) => x.join() === y.join(),
  );
  value.subscribe((v) => seen.push(v));
  value.set(["a"]);
  value.set(["b"]);
  expect(seen).toEqual([["b"]]);
});

test("a listener that unsubscribed hears nothing", () => {
  const seen: number[] = [];
  const value = createValue(1);
  const off = value.subscribe((v) => seen.push(v));
  value.set(2);
  off();
  value.set(3);
  expect(seen).toEqual([2]);
});
