// The sharing routes as this tab asks them, every request carrying the person's token, and the shapes of their answers.
import type { DocRole, SignInChoice } from "@manent/sync-protocol";
import { readBody } from "../history/requests.ts";

export type ShareRole = Exclude<DocRole, "owner">;

export const SHARE_ROLES: readonly ShareRole[] = Object.freeze([
  "edit",
  "comment",
  "view",
]);

/** How long a new link holds, in milliseconds, in the order the Expires list offers it: never (null), 1, 7 and 30 days. */
export const LINK_EXPIRIES_MS: readonly (number | null)[] = Object.freeze([
  null,
  86_400_000,
  604_800_000,
  2_592_000_000,
]);

export interface SharePerson {
  userId: string;
  name: string;
  role: DocRole;
  /** The group whose grant gave the role; null for a role given to the person. */
  groupId: string | null;
  /** Null until the person is first active on the document. */
  lastActiveAt: number | null;
}

export interface ShareGroup {
  groupId: string;
  role: ShareRole;
}

export interface ShareLink {
  id: string;
  role: ShareRole;
  /** Null for a link that never expires. */
  expiresAt: number | null;
  createdAt: number;
}

/** Who has access: the links are listed to the owner only, and are [] for anyone else. */
export interface ShareAccess {
  people: readonly SharePerson[];
  groups: readonly ShareGroup[];
  links: readonly ShareLink[];
}

export interface ShareJoined {
  docId: string;
  role: DocRole;
  /** False when the person already held this role or a higher one. */
  joined: boolean;
}

/** `refused` is any other answer, or a body this build cannot read; `unreachable` the request never reached the server. */
export type ShareFailure =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "not_member"
  | "not_found"
  | "deleted"
  | "link_expired"
  | "link_revoked"
  | "unreachable"
  | "refused";

export type ShareAnswer<T> =
  { ok: true; value: T } | { ok: false; code: ShareFailure };

export interface ShareRequests {
  access(docId: string): Promise<ShareAnswer<ShareAccess>>;
  grant(
    docId: string,
    userId: string,
    role: ShareRole,
  ): Promise<ShareAnswer<ShareAccess>>;
  remove(docId: string, userId: string): Promise<ShareAnswer<ShareAccess>>;
  grantGroup(docId: string, groupId: string): Promise<ShareAnswer<ShareAccess>>;
  removeGroup(
    docId: string,
    groupId: string,
  ): Promise<ShareAnswer<ShareAccess>>;
  /** The new link with its token, which no later answer gives again. */
  createLink(
    docId: string,
    role: ShareRole,
    expiresInMs: number | null,
  ): Promise<ShareAnswer<{ link: ShareLink; token: string }>>;
  revokeLink(docId: string, linkId: string): Promise<ShareAnswer<ShareAccess>>;
  join(token: string): Promise<ShareAnswer<ShareJoined>>;
  /** The people a role may be given to, as Choose who you are lists them; empty when the server cannot say. */
  choices(): Promise<readonly SignInChoice[]>;
}

const FAILURES: readonly ShareFailure[] = Object.freeze([
  "bad_request",
  "unauthenticated",
  "forbidden",
  "not_member",
  "not_found",
  "deleted",
  "link_expired",
  "link_revoked",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isShareRole = (value: unknown): value is ShareRole =>
  SHARE_ROLES.some((role) => role === value);

const isDocRole = (value: unknown): value is DocRole =>
  value === "owner" || isShareRole(value);

const isNullable = <T>(value: unknown, is: (v: unknown) => v is T): boolean =>
  value === null || is(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isPerson = (value: unknown): value is SharePerson =>
  isRecord(value) &&
  isString(value.userId) &&
  isString(value.name) &&
  isDocRole(value.role) &&
  isNullable(value.groupId, isString) &&
  isNullable(value.lastActiveAt, isNumber);

const isGroup = (value: unknown): value is ShareGroup =>
  isRecord(value) && isString(value.groupId) && isShareRole(value.role);

const isLink = (value: unknown): value is ShareLink =>
  isRecord(value) &&
  isString(value.id) &&
  isShareRole(value.role) &&
  isNullable(value.expiresAt, isNumber) &&
  isNumber(value.createdAt);

const isListOf = <T>(value: unknown, is: (v: unknown) => v is T): boolean =>
  Array.isArray(value) && value.every(is);

const isAccess = (value: unknown): value is ShareAccess =>
  isRecord(value) &&
  isListOf(value.people, isPerson) &&
  isListOf(value.groups, isGroup) &&
  isListOf(value.links, isLink);

const isLinkMade = (
  value: unknown,
): value is { link: ShareLink; token: string } =>
  isRecord(value) && isLink(value.link) && isString(value.token);

const isJoined = (value: unknown): value is ShareJoined =>
  isRecord(value) &&
  isString(value.docId) &&
  isDocRole(value.role) &&
  typeof value.joined === "boolean";

const isChoice = (value: unknown): value is SignInChoice =>
  isRecord(value) &&
  isString(value.userId) &&
  isString(value.name) &&
  isString(value.title) &&
  typeof value.registered === "boolean";

const isChoices = (
  value: unknown,
): value is { choices: readonly SignInChoice[] } =>
  isRecord(value) && isListOf(value.choices, isChoice);

/** The failure a refusal's body names; `refused` for one this build does not tell apart. */
async function failureOf(response: Response): Promise<ShareFailure> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // no body, or not JSON: nothing names the refusal
    return "refused";
  }
  const code = isRecord(body) ? body.error : null;
  return FAILURES.find((failure) => failure === code) ?? "refused";
}

export function createShareRequests(options: {
  fetch: typeof fetch;
  token: () => string | null;
}): ShareRequests {
  // called as a plain function: a browser's fetch refuses another `this`
  const fetchFn = options.fetch;
  const headers = (): Record<string, string> => {
    const token = options.token();
    return token === null ? {} : { Authorization: `Bearer ${token}` };
  };
  const post = async <T>(
    path: string,
    body: unknown,
    is: (value: unknown) => value is T,
  ): Promise<ShareAnswer<T>> => {
    let response: Response;
    try {
      response = await fetchFn(path, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // the request never reached the server
      return { ok: false, code: "unreachable" };
    }
    if (!response.ok) return { ok: false, code: await failureOf(response) };
    const read = await readBody(response, is);
    return read === null
      ? { ok: false, code: "refused" }
      : { ok: true, value: read.value };
  };
  return {
    access: (docId) => post("/api/share/people", { docId }, isAccess),
    grant: (docId, userId, role) =>
      post("/api/share/grant", { docId, userId, role }, isAccess),
    remove: (docId, userId) =>
      post("/api/share/remove", { docId, userId }, isAccess),
    grantGroup: (docId, groupId) =>
      post("/api/share/grant-group", { docId, groupId }, isAccess),
    removeGroup: (docId, groupId) =>
      post("/api/share/remove-group", { docId, groupId }, isAccess),
    createLink: (docId, role, expiresInMs) =>
      post("/api/share/link", { docId, role, expiresInMs }, isLinkMade),
    revokeLink: (docId, linkId) =>
      post("/api/share/revoke-link", { docId, linkId }, isAccess),
    join: (token) => post("/api/share/join", { token }, isJoined),
    async choices() {
      try {
        const response = await fetchFn("/api/sign-in", { headers: headers() });
        if (!response.ok) return [];
        return (await readBody(response, isChoices))?.value.choices ?? [];
      } catch {
        // the server cannot be reached: nobody is offered until it can
        return [];
      }
    },
  };
}
