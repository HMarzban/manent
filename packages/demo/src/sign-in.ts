// Sign-in without a password, and the directory of the demo's people.
import type { Directory, SignInProvider } from "@manent/server-core";
import type { Identity } from "@manent/sync-protocol";
import { DEMO_PEOPLE, DEMO_WORKSPACES } from "./people.ts";

function identityOf(userId: string): Identity | null {
  const person = DEMO_PEOPLE.find((p) => p.userId === userId);
  return person === undefined ? null : { userId, name: person.name };
}

function userIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("userId" in body))
    return null;
  return typeof body.userId === "string" ? body.userId : null;
}

/** The body names one of the demo's people: `{ userId }`. */
export function createDemoSignIn(): SignInProvider {
  return {
    describe: () => ({ choices: DEMO_PEOPLE }),
    async authenticate(body) {
      const userId = userIdOf(body);
      if (userId === null) return { ok: false, reason: "bad_request" };
      const identity = identityOf(userId);
      return identity === null
        ? { ok: false, reason: "unknown_user" }
        : { ok: true, identity };
    },
  };
}

export function createDemoDirectory(): Directory {
  return {
    user: identityOf,
    workspacesOf: (userId) =>
      DEMO_WORKSPACES.filter((workspace) =>
        workspace.memberUserIds.some((member) => member === userId),
      ).map(({ id, name }) => ({ id, name, seeding: null })),
  };
}
