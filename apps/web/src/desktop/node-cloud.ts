// The person the desktop app's node holds, and whether it syncs them with the cloud.
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

/** The person the node holds and the cloud: on desktop the window's node token is never null, so it says nothing of the cloud. */
export interface NodeCloud {
  /** The node syncs this person with the cloud, as GET /api/local/person last answered; false until it answers. */
  signedIn: Subscribable<boolean>;
  /** POST /api/local/sign-in-to-sync, then `signedIn` is read again; a node that cannot reach the cloud leaves it as it was. */
  signIn(): Promise<void>;
}

const CLOUD_STATES = ["signed_in", "not_signed_in"] as const;
export type NodeCloudState = (typeof CLOUD_STATES)[number];

/** The person's `cloud` the node answered; null for anything else. */
async function readCloud(response: Response): Promise<NodeCloudState | null> {
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("cloud" in body))
    return null;
  const { cloud } = body;
  return CLOUD_STATES.find((state) => state === cloud) ?? null;
}

/** Reads the node's cloud state for the person whose node token `token` gives; null when the node does not answer. */
export async function readNodeCloud(options: {
  fetch: typeof fetch;
  token: string | null;
}): Promise<NodeCloudState | null> {
  const send = options.fetch;
  try {
    const response = await send("/api/local/person", {
      method: "GET",
      headers:
        options.token === null
          ? {}
          : { Authorization: `Bearer ${options.token}` },
    });
    return await readCloud(response);
  } catch {
    return null;
  }
}

/** Reads the node's answer for the person whose node token `token` gives, at once and after each `signIn`. */
export function createNodeCloud(options: {
  fetch: typeof fetch;
  token: () => string | null;
}): NodeCloud {
  // called as a plain function: a browser's fetch refuses another `this`
  const send = options.fetch;
  const signedIn = createValue(false);
  const request = (path: string, method: string): Promise<Response> => {
    const token = options.token();
    return send(path, {
      method,
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    });
  };
  const read = async (): Promise<void> => {
    const cloud = await readNodeCloud({ fetch: send, token: options.token() });
    if (cloud !== null) signedIn.set(cloud === "signed_in");
  };
  void read();
  return {
    signedIn,
    async signIn() {
      const answer = await request("/api/local/sign-in-to-sync", "POST").catch(
        () => null,
      );
      if (answer?.ok === true) await read();
    },
  };
}
