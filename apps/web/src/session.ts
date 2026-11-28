// Who this browser tab is. Each tab keeps its own person in sessionStorage so two tabs can be two people,
// while localStorage mirrors the last-active person and sign-in choices so a cold PWA launch works offline.

import type { SignInChoice } from "@manent/sync-protocol";
import type { Api, MeResult, SignInResult } from "./api.ts";
import { isStandalone } from "./platform.ts";

export const SESSION_KEY = "manent.demo.session";
export const LAST_PERSON_KEY = "manent.last.session";
export const SIGN_IN_CHOICES_KEY = "manent.sign-in.choices";
export const CLEAN_WORKSPACE_KEY = "manent.workspace.clean";
const SEED_KEY = "manent.seed";
const DEMO_CONNECTION_KEY = "manent.demo.connection";
const TOUR_ACTIVE_STORAGE_KEY = "manent.demo.tour.active";

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

function safeLocalStorage(): TabStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isBrowserSessionStorage(storage: TabStorage | null): boolean {
  if (storage === null) return false;
  try {
    return typeof window !== "undefined" && storage === window.sessionStorage;
  } catch {
    return false;
  }
}

function readJsonAt(storage: TabStorage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key) ?? null;
    return raw === null ? null : JSON.parse(raw);
  } catch {
    // storage refused, or what it holds is not JSON
    return null;
  }
}

function parsePerson(value: unknown): TabPerson | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("token" in value && "userId" in value && "name" in value)) return null;
  const { token, userId, name } = value;
  if (token !== null && typeof token !== "string") return null;
  if (typeof userId !== "string" || typeof name !== "string") return null;
  return { token, userId, name };
}

function serializePerson(person: TabPerson): string {
  return JSON.stringify({
    token: person.token,
    userId: person.userId,
    name: person.name,
  });
}

/**
 * True when an empty browser tab should restore the last-active person from localStorage:
 * installed standalone PWA relaunches and cold offline relaunches (where /api/sign-in is unreachable).
 * Normal online browser tabs stay isolated so each tab can choose a different demo person.
 */
export function shouldRestoreLastPerson(env?: {
  readonly standalone?: boolean;
  readonly onLine?: boolean;
}): boolean {
  const standalone = env?.standalone ?? isStandalone();
  if (standalone) return true;
  const onLine =
    env?.onLine ?? (typeof navigator !== "undefined" ? navigator.onLine : true);
  return onLine === false;
}

/**
 * The person this tab keeps; null when there is none or it cannot be read.
 * When `storage` is empty, falls back to `fallback` when explicitly provided, or to `localStorage`
 * for `window.sessionStorage` when running as an installed PWA or cold-launching offline, seeding
 * `storage` so this tab keeps its own independent copy thereafter.
 */
export function readPerson(
  storage: TabStorage | null,
  fallback?: TabStorage | null,
): TabPerson | null {
  const own = parsePerson(readJsonAt(storage, SESSION_KEY));
  if (own !== null) return own;
  const seedStorage =
    fallback !== undefined
      ? fallback
      : isBrowserSessionStorage(storage) && shouldRestoreLastPerson()
        ? safeLocalStorage()
        : null;
  if (seedStorage === null || seedStorage === storage) return null;
  const seeded = parsePerson(readJsonAt(seedStorage, LAST_PERSON_KEY));
  if (seeded !== null) {
    try {
      storage?.setItem(SESSION_KEY, serializePerson(seeded));
    } catch {
      // storage refused: keep for this page load only
    }
  }
  return seeded;
}

/**
 * Keeps `person` for this tab and mirrors it as the last-active person in `fallback` (or `localStorage`
 * when writing to the browser's `sessionStorage`). Passing `null` clears both so signing out stays signed out.
 */
export function writePerson(
  storage: TabStorage | null,
  person: TabPerson | null,
  fallback?: TabStorage | null,
): void {
  const serialized = person === null ? null : serializePerson(person);
  try {
    if (serialized === null) storage?.removeItem(SESSION_KEY);
    else storage?.setItem(SESSION_KEY, serialized);
  } catch {
    // storage refused: the person store still holds the person for this page load
  }
  const mirror =
    fallback !== undefined
      ? fallback
      : isBrowserSessionStorage(storage)
        ? safeLocalStorage()
        : null;
  if (mirror !== null && mirror !== storage) {
    try {
      if (serialized === null) mirror.removeItem(LAST_PERSON_KEY);
      else mirror.setItem(LAST_PERSON_KEY, serialized);
    } catch {
      // mirror is best effort
    }
  }
}

function isSignInChoice(value: unknown): value is SignInChoice {
  return (
    typeof value === "object" &&
    value !== null &&
    "userId" in value &&
    "name" in value &&
    "title" in value &&
    "registered" in value &&
    typeof value.userId === "string" &&
    typeof value.name === "string" &&
    typeof value.title === "string" &&
    typeof value.registered === "boolean"
  );
}

/** Cached sign-in choices persisted in localStorage for offline chooser availability; null when absent or invalid. */
export function readCachedChoices(
  storage?: TabStorage | null,
): readonly SignInChoice[] | null {
  const source = storage !== undefined ? storage : safeLocalStorage();
  const value = readJsonAt(source, SIGN_IN_CHOICES_KEY);
  return Array.isArray(value) && value.every(isSignInChoice) ? value : null;
}

/** Persists sign-in choices in localStorage for offline chooser availability. */
export function writeCachedChoices(
  choices: readonly SignInChoice[],
  storage?: TabStorage | null,
): void {
  const target = storage !== undefined ? storage : safeLocalStorage();
  try {
    target?.setItem(SIGN_IN_CHOICES_KEY, JSON.stringify(choices));
  } catch {
    // storage refused: best effort
  }
}

/** True when the writer dismissed Demo and Tour to work in a clean workspace. */
export function readCleanWorkspaceFlag(storage?: TabStorage | null): boolean {
  const source = storage !== undefined ? storage : safeLocalStorage();
  try {
    return source?.getItem(CLEAN_WORKSPACE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persists or clears the clean-workspace choice in localStorage. */
export function writeCleanWorkspaceFlag(
  enabled: boolean,
  storage?: TabStorage | null,
): void {
  const target = storage !== undefined ? storage : safeLocalStorage();
  try {
    if (enabled) target?.setItem(CLEAN_WORKSPACE_KEY, "1");
    else target?.removeItem(CLEAN_WORKSPACE_KEY);
  } catch {
    // storage refused: keep for this page load only
  }
}

/** Clears remembered demo seed and tab connection throttle when leaving Demo mode. */
export function clearDemoStorageState(options?: {
  local?: TabStorage | null;
  session?: TabStorage | null;
}): void {
  const local =
    options?.local !== undefined ? options.local : safeLocalStorage();
  const session =
    options?.session !== undefined ? options.session : tabStorage();
  try {
    local?.removeItem(SEED_KEY);
  } catch {
    // storage refused
  }
  try {
    session?.removeItem(DEMO_CONNECTION_KEY);
    session?.removeItem(TOUR_ACTIVE_STORAGE_KEY);
  } catch {
    // storage refused
  }
}

/** Subscribes to cross-tab changes of the clean-workspace flag in localStorage. */
export function subscribeCleanWorkspaceStorage(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === CLEAN_WORKSPACE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
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

export function chooseUrl(currentPath: string): string {
  return `/choose?next=${encodeURIComponent(currentPath)}`;
}

const BASE = "http://manent.invalid";

function hasUnsafeNextChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    // ASCII control characters or backslashes that browsers may normalise into scheme/host separators
    if (code <= 0x1f || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/** `next` when it is a path inside this app, otherwise "/". */
export function safeNext(next: string | null): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    hasUnsafeNextChar(next)
  )
    return "/";
  try {
    const parsed = new URL(next, BASE);
    return parsed.origin === BASE && parsed.pathname.startsWith("/")
      ? next
      : "/";
  } catch {
    return "/";
  }
}
