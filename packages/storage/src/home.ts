// A document's home, the file it lives in, and the one way it is written.
import type { Home } from "./ports.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `project:<uuid>` or `user:<userId>`. It does not check the home: `parseHome` does. */
export function homeKey(home: Home): string {
  return `${home.kind}:${home.id}`;
}

/** The home a key writes: a canonical lower-case UUID for a project, 1–64 characters of `[A-Za-z0-9_-]` for a user; null for anything else. */
export function parseHome(key: string): Home | null {
  if (key.startsWith("project:")) {
    const id = key.slice("project:".length);
    return UUID.test(id) ? { kind: "project", id } : null;
  }
  if (key.startsWith("user:")) {
    const id = key.slice("user:".length);
    return USER_ID.test(id) ? { kind: "user", id } : null;
  }
  return null;
}

/** The home's key, checked before anything is built from it: RangeError for a home that is not well formed. */
export function wellFormedKey(home: Home): string {
  const key = homeKey(home);
  if (parseHome(key) !== null) return key;
  throw new RangeError(`a home must be project:<uuid> or user:<id>: ${key}`);
}
