// The sharing routes: who holds a role on a document, the groups given access to it, its share links, and joining by one.
import { isDocId } from "@manent/sync-protocol";
import { groupOfSource, isShareRole } from "../../sharing/grants.ts";
import type { ShareRole } from "../../sharing/grants.ts";
import { isLinkExpiry, isLinkToken } from "../../sharing/links.ts";
import type {
  ShareState,
  SharingOutcome,
  SharingRefusal,
  SharingService,
} from "../../sharing/service.ts";
import { failure, json } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";
import { isObject, readRequest } from "./docs.ts";

const STATUS: Readonly<Record<SharingRefusal, number>> = {
  bad_request: 400,
  not_found: 404,
  forbidden: 403,
  deleted: 410,
  unsupported_kind: 400,
  not_member: 403,
  link_expired: 410,
  link_revoked: 410,
};

/** The longest user, group or link id a body may carry. */
const ID_LIMIT = 128;

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= ID_LIMIT;

/** The directory's name for a user; their id when the directory no longer lists them. */
const nameOf = (context: RouteContext, userId: string): string =>
  context.config.auth.directory.user(userId)?.name ?? userId;

/** The link as a client sees it: never its token's hash. */
const linkView = (link: ShareState["links"][number]) => ({
  id: link.id,
  role: link.role,
  expiresAt: link.expiresAt,
  createdAt: link.createdAt,
});

/** Who has access, as the routes answer it: each role holder with their name, the group it came from and when they were last active. */
function peopleView(context: RouteContext, state: ShareState) {
  const lastActive = new Map(
    state.lastActive.map((row) => [row.userId, row.lastActiveAt]),
  );
  return {
    people: state.grants.map(({ userId, role, source }) => ({
      userId,
      name: nameOf(context, userId),
      role,
      groupId: groupOfSource(source),
      lastActiveAt: lastActive.get(userId) ?? null,
    })),
    groups: state.groups,
    links: state.links.map(linkView),
  };
}

interface ShareCall<T> {
  context: RouteContext;
  sharing: SharingService;
  userId: string;
  input: T;
}

/**
 * A sharing route: `read` takes the body into its input, null for one it refuses. 404 while sharing is off, 401
 * without a signed-in user, 400 for a body that is not JSON or that `read` refuses.
 */
function shareRoute<T>(
  path: string,
  read: (body: Record<string, unknown>) => T | null,
  handle: (call: ShareCall<T>) => Response,
): Route {
  return {
    method: "POST",
    path,
    async handle(context) {
      const request = await readRequest(context);
      if (!request.ok) return request.response;
      const sharing = context.config.sharing;
      if (sharing === undefined) return failure("not_found", 404);
      const input = isObject(request.body) ? read(request.body) : null;
      if (input === null) return failure("bad_request", 400);
      return handle({ context, sharing, userId: request.userId, input });
    },
  };
}

const answer = <T>(
  outcome: SharingOutcome<T>,
  view: (value: T) => unknown,
): Response =>
  outcome.ok
    ? json(view(outcome.value))
    : failure(outcome.code, STATUS[outcome.code]);

/** The outcome of a change to who has access, answered as the people route answers. */
const answerPeople = (
  context: RouteContext,
  outcome: SharingOutcome<ShareState>,
): Response => answer(outcome, (state) => peopleView(context, state));

const readDoc = (body: Record<string, unknown>): { docId: string } | null =>
  isDocId(body.docId) ? { docId: body.docId } : null;

const readPerson = (
  body: Record<string, unknown>,
): { docId: string; target: string } | null =>
  isDocId(body.docId) && isId(body.userId)
    ? { docId: body.docId, target: body.userId }
    : null;

const readGroup = (
  body: Record<string, unknown>,
): { docId: string; groupId: string } | null =>
  isDocId(body.docId) && isId(body.groupId)
    ? { docId: body.docId, groupId: body.groupId }
    : null;

function readGrant(
  body: Record<string, unknown>,
): { docId: string; target: string; role: ShareRole } | null {
  const person = readPerson(body);
  return person !== null && isShareRole(body.role)
    ? { ...person, role: body.role }
    : null;
}

function readLink(
  body: Record<string, unknown>,
): { docId: string; role: ShareRole; expiresInMs: number | null } | null {
  const { docId, role, expiresInMs } = body;
  return isDocId(docId) && isShareRole(role) && isLinkExpiry(expiresInMs)
    ? { docId, role, expiresInMs }
    : null;
}

const readRevoke = (
  body: Record<string, unknown>,
): { docId: string; linkId: string } | null =>
  isDocId(body.docId) && isId(body.linkId)
    ? { docId: body.docId, linkId: body.linkId }
    : null;

const readJoin = (body: Record<string, unknown>): { token: string } | null =>
  isLinkToken(body.token) ? { token: body.token } : null;

export const SHARE_ROUTES: readonly Route[] = [
  shareRoute(
    "/api/share/people",
    readDoc,
    ({ context, sharing, userId, input }) =>
      answerPeople(context, sharing.people(userId, input.docId)),
  ),
  shareRoute(
    "/api/share/grant",
    readGrant,
    ({ context, sharing, userId, input }) => {
      const { docId, target, role } = input;
      return answerPeople(context, sharing.grant(userId, docId, target, role));
    },
  ),
  shareRoute(
    "/api/share/remove",
    readPerson,
    ({ context, sharing, userId, input }) =>
      answerPeople(context, sharing.remove(userId, input.docId, input.target)),
  ),
  shareRoute(
    "/api/share/grant-group",
    readGroup,
    ({ context, sharing, userId, input }) =>
      answer(
        sharing.grantGroup(userId, input.docId, input.groupId),
        ({ state, skipped }) => ({ ...peopleView(context, state), skipped }),
      ),
  ),
  shareRoute(
    "/api/share/remove-group",
    readGroup,
    ({ context, sharing, userId, input }) =>
      answerPeople(
        context,
        sharing.removeGroup(userId, input.docId, input.groupId),
      ),
  ),
  shareRoute("/api/share/link", readLink, ({ sharing, userId, input }) => {
    const { docId, role, expiresInMs } = input;
    return answer(
      sharing.createLink(userId, docId, role, expiresInMs),
      (made) => ({
        link: linkView(made.link),
        token: made.token,
      }),
    );
  }),
  shareRoute(
    "/api/share/revoke-link",
    readRevoke,
    ({ context, sharing, userId, input }) =>
      answerPeople(
        context,
        sharing.revokeLink(userId, input.docId, input.linkId),
      ),
  ),
  shareRoute("/api/share/join", readJoin, ({ sharing, userId, input }) =>
    answer(sharing.join(userId, input.token), (joined) => joined),
  ),
];
