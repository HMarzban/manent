// Who is here: the person a request's node token names.
import type { SessionStore } from "@manent/server-core";
import type { NodeRecords, Person } from "../records/ports.ts";

const BEARER = new RegExp("^Bearer +(\\S+)$", "i");

/** The person whose node token the request carries as `Authorization: Bearer`; null without one, or for a token of nobody chosen here. */
export function readPerson(
  request: Request,
  from: { sessions: SessionStore; records: NodeRecords },
): Person | null {
  const token = BEARER.exec(request.headers.get("authorization") ?? "")?.[1];
  const session = token === undefined ? null : from.sessions.resolve(token);
  return session === null ? null : from.records.person(session.userId);
}
