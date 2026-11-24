// The routes that tell a client about a document: who its client ids are, who has a role on it, and who deleted it.
import { isDocId } from "@manent/sync-protocol";
import type {
  DocClientsResponse,
  DocPeopleResponse,
  RemovedDocResponse,
} from "@manent/sync-protocol";
import { failure, json } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";
import { isObject, readRequest } from "./docs.ts";

const CLIENT_IDS_LIMIT = 64;

/** An unsigned 32-bit integer, as a Yjs client id is. */
export const isClientId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 0xffff_ffff;

const isClientIds = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length <= CLIENT_IDS_LIMIT &&
  value.every(isClientId);

/** The directory's name for a user; their id when the directory no longer lists them. */
const nameOf = (context: RouteContext, userId: string): string =>
  context.config.auth.directory.user(userId)?.name ?? userId;

export const DOCS_INFO_ROUTES: readonly Route[] = [
  {
    method: "POST",
    path: "/api/docs/clients",
    async handle(context) {
      const read = await readRequest(context);
      if (!read.ok) return read.response;
      const { body, storage, userId } = read;
      if (
        !isObject(body) ||
        !isDocId(body.docId) ||
        !isClientIds(body.clientIds)
      )
        return failure("bad_request", 400);
      const { docId, clientIds } = body;
      const place = storage.directory.placeOf(docId);
      if (place === null) return failure("not_found", 404);
      if (storage.directory.roleOf(docId, userId) === null)
        return failure("forbidden", 403);
      const asked = new Set(clientIds);
      const ledger = storage.open(place.home).log.ledger(docId);
      const clients = [...ledger]
        .filter(([clientId]) => asked.has(clientId))
        .map(([clientId, entry]) => ({
          clientId,
          userId: entry.userId,
          name: nameOf(context, entry.userId),
        }));
      return json<DocClientsResponse>({ clients });
    },
  },
  {
    method: "POST",
    path: "/api/docs/people",
    async handle(context) {
      const read = await readRequest(context);
      if (!read.ok) return read.response;
      const { body, storage, userId } = read;
      if (!isObject(body) || !isDocId(body.docId))
        return failure("bad_request", 400);
      const { docId } = body;
      if (storage.directory.placeOf(docId) === null)
        return failure("not_found", 404);
      if (storage.directory.roleOf(docId, userId) === null)
        return failure("forbidden", 403);
      const people = storage.directory.rolesOf(docId).map((held) => ({
        userId: held.userId,
        name: nameOf(context, held.userId),
      }));
      return json<DocPeopleResponse>({ people });
    },
  },
  {
    method: "POST",
    path: "/api/docs/removed",
    async handle(context) {
      const read = await readRequest(context);
      if (!read.ok) return read.response;
      const { body, storage, userId } = read;
      if (!isObject(body) || !isDocId(body.docId))
        return failure("bad_request", 400);
      const tombstone = storage.directory.tombstoneOf(body.docId);
      if (tombstone === null) return failure("not_found", 404);
      // roles outlive the tombstone, so they still say who had the document
      if (storage.directory.roleOf(body.docId, userId) === null)
        return failure("forbidden", 403);
      return json<RemovedDocResponse>({
        deletedByUserId: tombstone.deletedByUserId,
        deletedByName: nameOf(context, tombstone.deletedByUserId),
        deletedAt: tombstone.deletedAt,
      });
    },
  },
];
