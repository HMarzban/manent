// Sign-in without a password, and the directory of the demo's people and the members the seed adds.
import type { Directory, SignInProvider } from "@manent/server-core";
import type { Identity, WorkspaceRef } from "@manent/sync-protocol";
import { DEMO_PEOPLE, DEMO_WORKSPACES } from "./people.ts";
import { GENERATED_MEMBERS } from "./people/members.ts";

function identityIn(
  people: readonly { userId: string; name: string }[],
  userId: string,
): Identity | null {
  const person = people.find((p) => p.userId === userId);
  return person === undefined ? null : { userId, name: person.name };
}

/** A demo person, whom the chooser lists, or a member the seed adds, who never signs in. */
const memberOf = (userId: string): Identity | null =>
  identityIn(DEMO_PEOPLE, userId) ?? identityIn(GENERATED_MEMBERS, userId);

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
      const identity = identityIn(DEMO_PEOPLE, userId);
      return identity === null
        ? { ok: false, reason: "unknown_user" }
        : { ok: true, identity };
    },
  };
}

/** `seeding` says how far each workspace's seed has come; absent, every workspace is ready. */
export function createDemoDirectory(options?: {
  seeding?: (workspaceId: string) => WorkspaceRef["seeding"];
}): Directory {
  const seeding = options?.seeding ?? (() => null);
  return {
    user: memberOf,
    workspacesOf: (userId) =>
      DEMO_WORKSPACES.filter(
        (workspace) =>
          workspace.memberUserIds.some((member) => member === userId) ||
          GENERATED_MEMBERS.some(
            (m) => m.userId === userId && m.workspaceId === workspace.id,
          ),
      ).map(({ id, name }) => ({ id, name, seeding: seeding(id) })),
  };
}
