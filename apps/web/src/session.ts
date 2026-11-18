// Who this browser tab is. Each tab keeps its own person, so two tabs can be two people.

import type { SignInChoice } from "@manent/sync-protocol";
import type { Api, MeResult, SignInResult } from "./api.ts";
import { TEXT } from "./text.ts";

export const SESSION_KEY = "manent.demo.session";

export interface TabPerson {
  /** Null for a person who has not signed in. */
  token: string | null;
  userId: string;
  name: string;
}

export interface TabStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** This tab's storage; null when the browser refuses it. */
export function tabStorage(): TabStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    // the browser refuses tab storage: the person is kept for this page load only
    return null;
  }
}

function readStored(storage: TabStorage | null): unknown {
  try {
    const raw = storage?.getItem(SESSION_KEY) ?? null;
    return raw === null ? null : JSON.parse(raw);
  } catch {
    // storage refused, or what it holds is not JSON: the tab has no person
    return null;
  }
}

/** The person this tab keeps; null when there is none or it cannot be read. */
export function readPerson(storage: TabStorage | null): TabPerson | null {
  const value = readStored(storage);
  if (typeof value !== "object" || value === null) return null;
  if (!("token" in value && "userId" in value && "name" in value)) return null;
  const { token, userId, name } = value;
  if (token !== null && typeof token !== "string") return null;
  if (typeof userId !== "string" || typeof name !== "string") return null;
  return { token, userId, name };
}

/** Keeps `person` for this tab; when the browser refuses storage, nothing is kept beyond this page load. */
export function writePerson(
  storage: TabStorage | null,
  person: TabPerson | null,
): void {
  try {
    if (person === null) storage?.removeItem(SESSION_KEY);
    else
      storage?.setItem(
        SESSION_KEY,
        JSON.stringify({
          token: person.token,
          userId: person.userId,
          name: person.name,
        }),
      );
  } catch {
    // storage refused: the person store still holds the person for this page load
  }
}

/** The person this tab still is: only the server saying no signs a tab out; one who never signed in is not asked about. */
export async function confirmPerson(
  person: TabPerson | null,
  me: () => Promise<MeResult>,
): Promise<TabPerson | null> {
  if (person === null || person.token === null) return person;
  const result = await me();
  return !result.ok && result.reason === "unauthenticated" ? null : person;
}

/** What choosing `choice` makes the tab: a person without an account is set without asking the server. */
export async function choosePerson(
  choice: SignInChoice,
  api: Api,
): Promise<SignInResult> {
  if (choice.registered) return api.signIn(choice.userId);
  return {
    ok: true,
    person: { token: null, userId: choice.userId, name: choice.name },
  };
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
