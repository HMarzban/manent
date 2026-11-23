// The Writing switch's requests to the server, each made as the person whose sync asks it.
import { readPerson, tabStorage } from "../session.ts";
import { isFields } from "./writing-index.ts";

/** Someone with a role on the script: `name` is what the interface calls them. */
interface ScriptPerson {
  userId: string;
  name: string;
}

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
