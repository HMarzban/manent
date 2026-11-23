// The Writing switch's requests to the server, each made as the person whose sync asks it.
import type { VersionPosition } from "@manent/sync-protocol";
import { readPerson, tabStorage } from "../session.ts";
import { isFields } from "./writing-index.ts";

/** What a hand-in did, as the switch reads the answer. */
export interface HandedIn {
  /** The "Before hand-in" version. */
  versionId: string;
  scenes: number;
  /** The passages listed under To review. */
  overlaps: number;
}

export type HandInOutcome =
  | { ok: true; handedIn: HandedIn }
  | { ok: false; code: "already_handed_in" | "no_private_copy" | "failed" };

/** Someone with a role on the script: `name` is what the interface calls them. */
interface ScriptPerson {
  userId: string;
  name: string;
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isScriptPerson = (value: unknown): value is ScriptPerson =>
  isFields(value) &&
  typeof value.userId === "string" &&
  typeof value.name === "string";

/** The session of `userId` while they are the tab's own person and signed in; null otherwise, and nothing is asked. */
function sessionOf(userId: string): Record<string, string> | null {
  const person = readPerson(tabStorage());
  const token = person?.userId === userId ? person.token : null;
  return token === null ? null : { Authorization: `Bearer ${token}` };
}

/** A POST of `body` as `userId`; null when it was not sent, or its body is not JSON. */
async function post(
  userId: string,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown } | null> {
  const session = sessionOf(userId);
  if (session === null) return null;
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...session },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } catch {
    // unreachable, or a body that is not JSON: the caller treats it as no answer
    return null;
  }
}

/** Everyone with a role on the script; null while the server cannot say. */
export async function askPeople(
  userId: string,
  docId: string,
): Promise<readonly ScriptPerson[] | null> {
  const answer = await post(userId, "/api/docs/people", { docId });
  if (answer === null || answer.status !== 200 || !isFields(answer.body))
    return null;
  const { people } = answer.body;
  return Array.isArray(people) && people.every(isScriptPerson) ? people : null;
}

/** The person's open private copy of the script, made when they have none; null when the server did not make one. */
export async function createPrivateCopy(
  userId: string,
  docId: string,
): Promise<string | null> {
  const answer = await post(userId, "/api/private/create", { docId });
  if (answer === null || answer.status !== 200 || !isFields(answer.body))
    return null;
  const { privateDocId } = answer.body;
  return typeof privateDocId === "string" ? privateDocId : null;
}

function readHandedIn(body: unknown): HandedIn | null {
  if (!isFields(body)) return null;
  const { versionId, scenes, overlaps } = body;
  if (typeof versionId !== "string" || !isCount(scenes)) return null;
  return Array.isArray(overlaps)
    ? { versionId, scenes, overlaps: overlaps.length }
    : null;
}

/** Hands the person's private copy of the script in; a retry under the same `key` answers the same again. */
export async function handInPrivateCopy(
  userId: string,
  request: { docId: string; key: string },
): Promise<HandInOutcome> {
  const answer = await post(userId, "/api/private/handin", request);
  const handedIn = answer?.status === 200 ? readHandedIn(answer.body) : null;
  if (handedIn !== null) return { ok: true, handedIn };
  const code = isFields(answer?.body) ? answer.body.error : null;
  return code === "already_handed_in" || code === "no_private_copy"
    ? { ok: false, code }
    : { ok: false, code: "failed" };
}

/** The document's synced head as the server holds it; null when it cannot say. */
export async function askHead(
  userId: string,
  docId: string,
): Promise<VersionPosition | null> {
  const session = sessionOf(userId);
  if (session === null) return null;
  try {
    const query = new URLSearchParams({ docId, limit: "1" }).toString();
    const response = await fetch(`/api/versions?${query}`, {
      headers: session,
    });
    const body: unknown = response.ok ? await response.json() : null;
    const head = isFields(body) ? body.head : null;
    return isFields(head) && isCount(head.generation) && isCount(head.seq)
      ? { generation: head.generation, seq: head.seq }
      : null;
  } catch {
    // unreachable, or a body that is not JSON: nothing is known of the head
    return null;
  }
}
