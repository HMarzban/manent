// Who this browser tab is. Each tab keeps its own person, so two tabs can be two people.

import { TEXT } from "./text.ts";

export const SESSION_KEY = "manent.demo.session";

export interface TabPerson {
  token: string;
  userId: string;
  name: string;
}

export interface TabStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function readPerson(storage: TabStorage | null): TabPerson | null {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Record<keyof TabPerson, unknown>>;
    const { token, userId, name } = value ?? {};
    if (
      typeof token !== "string" ||
      typeof userId !== "string" ||
      typeof name !== "string"
    )
      return null;
    return { token, userId, name };
  } catch {
    return null;
  }
}

/**
 * The tab's person, kept in `storage` so a reload restores it. When the
 * browser refuses storage, the person is kept for this page load only.
 */
export function createTabSession(storage: TabStorage | null): {
  get(): TabPerson | null;
  set(person: TabPerson | null): void;
} {
  let current = readPerson(storage);
  return {
    get: () => current,
    set(person) {
      current = person;
      try {
        if (person) storage?.setItem(SESSION_KEY, JSON.stringify(person));
        else storage?.removeItem(SESSION_KEY);
      } catch {
        // Storage refused: the person still holds for this page load.
      }
    },
  };
}

/** Only the server saying no signs a tab out; a server that cannot be reached does not. */
export function startScreen(
  person: TabPerson | null,
  me: "ok" | "unauthenticated" | "unreachable" | "unknown",
): "choose" | "library" {
  if (!person || me === "unauthenticated") return "choose";
  return "library";
}

export function personLabel(person: TabPerson | null): string {
  return person ? `${TEXT.person}: ${person.name}` : TEXT.person;
}

export function chooseUrl(currentPath: string): string {
  return `/choose?next=${encodeURIComponent(currentPath)}`;
}

const BASE = "http://manent.invalid";

/** `next` when it is a path inside this app, otherwise "/". */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/";
  try {
    return new URL(next, BASE).origin === BASE ? next : "/";
  } catch {
    return "/";
  }
}
