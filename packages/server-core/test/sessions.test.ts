import { expect, test } from "bun:test";
import { createSignedSessionStore } from "../src/index.ts";

const secret = new Uint8Array(32).fill(7);
const now = () => 1_700_000_000_000;
const flip = (s: string) =>
  s.at(-1) === "A" ? `${s.slice(0, -1)}B` : `${s.slice(0, -1)}A`;

test("a token's bytes are fixed", () => {
  const store = createSignedSessionStore({
    secret: new Uint8Array(32).fill(7),
    now: () => 1_700_000_000_000,
  });
  const token =
    "v1.bGVv.1700000000000.bSDYfxhS2tMjUf7ustNIltsFmXr9clTfxXZuOxs-ols";
  expect(store.issue("leo")).toBe(token);
  expect(store.resolve(token)).toEqual({ userId: "leo" });
});

test("a secret of the wrong length is the caller's mistake", () => {
  expect(() =>
    createSignedSessionStore({ secret: new Uint8Array(31), now: () => 0 }),
  ).toThrow(new RangeError("a session secret must be 32 bytes, not 31"));
});

test("a session outlives the process", () => {
  const token = createSignedSessionStore({ secret, now }).issue("leo");
  // a second store stands for the restarted server
  expect(createSignedSessionStore({ secret, now }).resolve(token)).toEqual({
    userId: "leo",
  });
});

test("a token has the documented shape", () => {
  const token = createSignedSessionStore({ secret, now }).issue("priya");
  const parts = token.split(".");
  expect(parts).toHaveLength(4);
  expect(parts[0]).toBe("v1");
  expect(Buffer.from(parts[1] ?? "", "base64url").toString()).toBe("priya");
  expect(parts[2]).toMatch(/^\d+$/);
  expect(token).not.toContain("=");
});

test("a user id outside ASCII survives the round trip", () => {
  const store = createSignedSessionStore({ secret, now });
  expect(store.resolve(store.issue("ana-\u{1F3AC}-ع"))).toEqual({
    userId: "ana-\u{1F3AC}-ع",
  });
});

test("a token that was altered, truncated or signed with another secret is refused", () => {
  const store = createSignedSessionStore({ secret, now });
  const token = store.issue("leo");
  const [version, user, issuedAt, signature] = token.split(".") as [
    string,
    string,
    string,
    string,
  ];
  const other = createSignedSessionStore({
    secret: new Uint8Array(32).fill(8),
    now,
  });
  const bad = [
    "",
    "x".repeat(10_000),
    "v1." + "a".repeat(10_000),
    token.slice(0, -1),
    token.slice(0, 10),
    `${token}.`,
    `${token}x`,
    `v2.${user}.${issuedAt}.${signature}`,
    `${version}.${Buffer.from("dana").toString("base64url")}.${issuedAt}.${signature}`,
    `${version}.${user}.${Number(issuedAt) + 1}.${signature}`,
    `${version}.${user}.${issuedAt}.${flip(signature)}`,
    `${version}.${user}.${issuedAt}.`,
    `${version}.${user}.${issuedAt}`,
    `${version}.${user}.abc.${signature}`,
    "...",
    other.issue("leo"),
  ];
  for (const t of bad) expect(store.resolve(t)).toBeNull();
});
