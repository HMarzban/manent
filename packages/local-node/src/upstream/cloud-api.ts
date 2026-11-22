// The cloud's HTTP as the node uses it: signing a person in, the demo's seed, the two routes of a
// document the node hands over or mirrors, and a relayed script's requests sent on.
import { ConnectError } from "@manent/sync-client";
import { CAPABILITIES, DOC_ROLES, isDocKind } from "@manent/sync-protocol";
import type {
  AdoptResponse,
  Capability,
  DescribeResponse,
  DocRole,
} from "@manent/sync-protocol";
import type { CloudApi } from "../node/ports.ts";
import { call, errorCodeOf, isFields, readBody } from "./cloud-requests.ts";
import type { Fields } from "./cloud-requests.ts";

type DescribeRefusal = Extract<
  Awaited<ReturnType<CloudApi["describe"]>>,
  { ok: false }
>["code"];

const DESCRIBE_REFUSALS: readonly DescribeRefusal[] = Object.freeze([
  "unauthenticated",
  "forbidden",
  "deleted",
  "bad_request",
]);

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isRole = (value: unknown): value is DocRole =>
  DOC_ROLES.some((role) => role === value);

const isCapability = (value: unknown): value is Capability =>
  CAPABILITIES.some((capability) => capability === value);

/** Where the document lives, read from an answer; null when a field is missing or wrong. */
function readPlace(body: Fields) {
  const { docId, kind, home, generation } = body;
  if (typeof docId !== "string" || !isDocKind(kind)) return null;
  if (typeof home !== "string" || !isCount(generation)) return null;
  return { docId, kind, home, generation };
}

function readDescribe(body: unknown): DescribeResponse | null {
  if (!isFields(body)) return null;
  const place = readPlace(body);
  const { role, capabilities } = body;
  if (place === null) return null;
  if (!isRole(role) || !Array.isArray(capabilities)) return null;
  if (!capabilities.every(isCapability)) return null;
  return { ...place, role, capabilities };
}

function readAdopt(body: unknown): AdoptResponse | null {
  if (!isFields(body)) return null;
  const place = readPlace(body);
  const { adoptedSeq, created } = body;
  if (place === null) return null;
  if (!isCount(adoptedSeq) || typeof created !== "boolean") return null;
  return { ...place, adoptedSeq, created };
}

/** An answer neither read nor refused with a code this build knows: the cloud is as good as unreachable. */
const unreadable = (): ConnectError => new ConnectError("unreachable");

/** Every call rejects ConnectError("unreachable") when the cloud cannot be reached or its answer read. */
export function httpCloudApi(options: {
  baseUrl: string;
  fetch: typeof fetch;
}): CloudApi {
  const { baseUrl, fetch } = options;
  const post = async (path: string, token: string | null, body: unknown) => {
    const answer = await call(fetch, `${baseUrl}${path}`, {
      method: "POST",
      token,
      body,
    });
    return { status: answer.status, body: await readBody(answer) };
  };
  return {
    async signIn(userId) {
      const answer = await post("/api/sign-in", null, { userId });
      const token = isFields(answer.body) ? answer.body.token : null;
      if (answer.status === 200 && typeof token === "string")
        return { ok: true, token };
      if (errorCodeOf(answer.body) === "unknown_user")
        return { ok: false, code: "unknown_user" };
      throw unreadable();
    },
    async demo() {
      const url = `${baseUrl}/api/demo`;
      const answer = await call(fetch, url, { method: "GET", token: null });
      const body = await readBody(answer);
      const seedId = isFields(body) ? body.seedId : undefined;
      if (
        answer.status === 200 &&
        (seedId === null || typeof seedId === "string")
      )
        return { seedId };
      throw unreadable();
    },
    async describe(token, request) {
      const answer = await post("/api/docs/describe", token, request);
      const described =
        answer.status === 200 ? readDescribe(answer.body) : null;
      if (described !== null) return { ok: true, body: described };
      const code = errorCodeOf(answer.body);
      const refused = DESCRIBE_REFUSALS.find((known) => known === code);
      if (refused !== undefined) return { ok: false, code: refused };
      throw unreadable();
    },
    async adopt(token, request) {
      const answer = await post("/api/docs/adopt", token, request);
      const adopted = answer.status === 200 ? readAdopt(answer.body) : null;
      if (adopted !== null) return { ok: true, body: adopted };
      const code = errorCodeOf(answer.body);
      if (code !== null && answer.status < 500) return { ok: false, code };
      throw unreadable();
    },
    async forward(token, request) {
      const { pathname, search } = new URL(request.url);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      const type = request.headers.get("content-type");
      if (type !== null) headers["Content-Type"] = type;
      const body =
        request.method === "GET" ? undefined : await request.arrayBuffer();
      try {
        const answer = await fetch(`${baseUrl}${pathname}${search}`, {
          method: request.method,
          headers,
          body,
        });
        return new Response(await answer.arrayBuffer(), {
          status: answer.status,
          headers: {
            "Content-Type":
              answer.headers.get("content-type") ?? "application/json",
          },
        });
      } catch (cause) {
        throw new ConnectError("unreachable", { cause });
      }
    },
  };
}
