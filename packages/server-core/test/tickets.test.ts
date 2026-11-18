import { expect, test } from "bun:test";
import { createTicketStore } from "../src/index.ts";

test("a ticket works once, for 30 seconds", () => {
  let now = 0;
  const t = createTicketStore({ now: () => now });
  const a = t.issue("sam");
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(t.redeem(a)).toEqual({ userId: "sam" });
  expect(t.redeem(a)).toBeNull();
  const b = t.issue("sam");
  now = 30_001;
  expect(t.redeem(b)).toBeNull();
  expect(t.redeem("nonsense")).toBeNull();
});
