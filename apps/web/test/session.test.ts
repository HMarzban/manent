import { expect, test } from "bun:test";
import type { Api, MeResult, SignInResult } from "../src/api.ts";
import {
  LAST_PERSON_KEY,
  SESSION_KEY,
  SIGN_IN_CHOICES_KEY,
  chooseUrl,
  choosePerson,
  confirmPerson,
  readCachedChoices,
  readPerson,
  safeNext,
  shouldRestoreLastPerson,
  writeCachedChoices,
  writePerson,
} from "../src/session.ts";
import type { TabStorage } from "../src/session.ts";

function fakeStorage(): TabStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

function refuse(): never {
  throw new Error("storage is disabled");
}

function storageHolding(value: string): TabStorage {
  const storage = fakeStorage();
  storage.setItem(SESSION_KEY, value);
  return storage;
}

const LEO = { token: "tok", userId: "leo", name: "Leo Marsh" };
const answers = (result: MeResult) => () => Promise.resolve(result);

test("the tab-storage key and what is stored under it are fixed", () => {
  const storage = fakeStorage();
  writePerson(storage, { name: "Leo Marsh", userId: "leo", token: "t" });
  expect(SESSION_KEY).toBe("manent.demo.session");
  expect(storage.getItem("manent.demo.session")).toBe(
    '{"token":"t","userId":"leo","name":"Leo Marsh"}',
  );
  writePerson(storage, { token: null, userId: "you", name: "You" });
  expect(storage.getItem("manent.demo.session")).toBe(
    '{"token":null,"userId":"you","name":"You"}',
  );
  expect(readPerson(storage)).toEqual({
    token: null,
    userId: "you",
    name: "You",
  });
  writePerson(storage, null);
  expect(storage.getItem("manent.demo.session")).toBeNull();
});

test("what a tab cannot read is no person", () => {
  for (const storage of [
    null,
    { getItem: refuse, setItem: refuse, removeItem: refuse },
    storageHolding("{not json"),
    storageHolding('{"token":"tok"}'),
    storageHolding('{"token":7,"userId":"leo","name":"Leo Marsh"}'),
    storageHolding("null"),
  ])
    expect(readPerson(storage)).toBeNull();
});

test("only the server saying no signs a tab out", async () => {
  const leo = { token: "t", userId: "leo", name: "Leo Marsh" };
  const you = { token: null, userId: "you", name: "You" };
  expect(
    await confirmPerson(null, answers({ ok: false, reason: "unreachable" })),
  ).toBeNull();
  expect(
    await confirmPerson(
      leo,
      answers({
        ok: true,
        me: { userId: "leo", name: "Leo Marsh", workspaces: [] },
      }),
    ),
  ).toEqual(leo);
  expect(
    await confirmPerson(leo, answers({ ok: false, reason: "unreachable" })),
  ).toEqual(leo);
  expect(
    await confirmPerson(leo, answers({ ok: false, reason: "unauthenticated" })),
  ).toBeNull();
  let asked = 0;
  expect(
    await confirmPerson(you, () => {
      asked++;
      return Promise.resolve({ ok: false, reason: "unauthenticated" });
    }),
  ).toEqual(you);
  expect(asked).toBe(0); // a person who never signed in is not asked about
});

test("a person without an account is chosen without asking the server", async () => {
  const asked: string[] = [];
  const api: Api = {
    choices: () => Promise.reject(new Error("not asked")),
    me: () => Promise.reject(new Error("not asked")),
    demo: () => Promise.reject(new Error("not asked")),
    removedDoc: () => Promise.reject(new Error("not asked")),
    role: () => Promise.reject(new Error("not asked")),
    docClients: () => Promise.reject(new Error("not asked")),
    prepareTour: () => Promise.reject(new Error("not asked")),
    writers: () => Promise.reject(new Error("not asked")),
    runningWriters: () => Promise.reject(new Error("not asked")),
    rebuild: () => Promise.reject(new Error("not asked")),
    signIn(userId): Promise<SignInResult> {
      asked.push(userId);
      return Promise.resolve({ ok: true, person: LEO });
    },
  };
  expect(
    await choosePerson(
      { userId: "you", name: "You", title: "A new person", registered: false },
      api,
    ),
  ).toEqual({ ok: true, person: { token: null, userId: "you", name: "You" } });
  expect(asked).toEqual([]);
  expect(
    await choosePerson(
      { userId: "leo", name: "Leo Marsh", title: "", registered: true },
      api,
    ),
  ).toEqual({ ok: true, person: LEO });
  expect(asked).toEqual(["leo"]);
});

test("next is only ever a path inside the app", () => {
  expect(chooseUrl("/s/abc?x=1")).toBe("/choose?next=%2Fs%2Fabc%3Fx%3D1");
  for (const bad of [
    null,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
  ])
    expect(safeNext(bad)).toBe("/");
  expect(safeNext("/s/abc")).toBe("/s/abc");
});

test("cold PWA launch restores last-active person from localStorage while keeping sessionStorage per-tab", () => {
  const local = fakeStorage();
  const tab1 = fakeStorage();
  const tab2 = fakeStorage();
  const priya = { token: "p-tok", userId: "priya", name: "Priya Nair" };

  writePerson(tab1, LEO, local);
  expect(local.getItem(LAST_PERSON_KEY)).toBe(
    '{"token":"tok","userId":"leo","name":"Leo Marsh"}',
  );

  // Cold launch (empty sessionStorage) seeds from localStorage and copies into tab2's own sessionStorage.
  expect(readPerson(tab2, local)).toEqual(LEO);
  expect(tab2.getItem(SESSION_KEY)).toBe(
    '{"token":"tok","userId":"leo","name":"Leo Marsh"}',
  );

  // Switching tab2 to Priya keeps tab1 independently on Leo.
  writePerson(tab2, priya, local);
  expect([readPerson(tab1, local), readPerson(tab2, local)]).toEqual([
    LEO,
    priya,
  ]);

  // Explicit sign-out clears both tab storage and last-active mirror.
  writePerson(tab2, null, local);
  expect([tab2.getItem(SESSION_KEY), local.getItem(LAST_PERSON_KEY)]).toEqual([
    null,
    null,
  ]);
  expect(readPerson(fakeStorage(), local)).toBeNull();
});

test("automatic last-person restore runs only for standalone PWA windows or offline relaunches", () => {
  expect(shouldRestoreLastPerson({ standalone: false, onLine: true })).toBe(
    false,
  );
  expect(shouldRestoreLastPerson({ standalone: false, onLine: false })).toBe(
    true,
  );
  expect(shouldRestoreLastPerson({ standalone: true, onLine: true })).toBe(
    true,
  );
  expect(shouldRestoreLastPerson({ standalone: true, onLine: false })).toBe(
    true,
  );
});

test("sign-in choices cache round-trips valid entries and ignores corrupt data", () => {
  const local = fakeStorage();
  const choices = [
    { userId: "leo", name: "Leo Marsh", title: "Writer", registered: true },
    { userId: "you", name: "You", title: "A new person", registered: false },
  ];
  writeCachedChoices(choices, local);
  expect(local.getItem(SIGN_IN_CHOICES_KEY)).not.toBeNull();
  expect(readCachedChoices(local)).toEqual(choices);
  local.setItem(SIGN_IN_CHOICES_KEY, '[{"bad":true}]');
  expect(readCachedChoices(local)).toBeNull();
});
