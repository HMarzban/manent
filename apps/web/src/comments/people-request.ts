// Fetches the people with a role on a script for @mentions, cached per open script by the comments store.
import { readPerson, tabStorage } from "../session.ts";

export interface CommentPerson {
  readonly userId: string;
  readonly name: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPerson = (value: unknown): value is CommentPerson =>
  isRecord(value) &&
  typeof value.userId === "string" &&
  typeof value.name === "string";

export async function fetchDocPeople(
  docId: string,
  userId: string,
): Promise<readonly CommentPerson[] | null> {
  const person = readPerson(tabStorage());
  const token = person?.userId === userId ? person.token : null;
  if (token === null) return null;
  try {
    const response = await fetch("/api/docs/people", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ docId }),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.people)) return null;
    const people = body.people.filter(isPerson);
    return people.map((entry) => ({ userId: entry.userId, name: entry.name }));
  } catch {
    return null;
  }
}
