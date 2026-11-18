// In-memory doubles of the sign-in and directory ports.
import type { Identity, WorkspaceRef } from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import type { SignInProvider } from "../auth/sign-in.ts";

function userIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("userId" in body))
    return null;
  return typeof body.userId === "string" ? body.userId : null;
}

/** Signs in any of `users` from a body `{ userId }`; each choice has title "" and is registered. */
export function createFakeSignIn(users: readonly Identity[]): SignInProvider {
  const byId = new Map(users.map((user) => [user.userId, user]));
  return {
    describe: () => ({
      choices: users.map(({ userId, name }) => ({
        userId,
        name,
        title: "",
        registered: true,
      })),
    }),
    async authenticate(body) {
      const userId = userIdOf(body);
      if (userId === null) return { ok: false, reason: "bad_request" };
      const identity = byId.get(userId);
      return identity === undefined
        ? { ok: false, reason: "unknown_user" }
        : { ok: true, identity };
    },
  };
}

export function createFakeDirectory(
  entries: readonly { user: Identity; workspaces: readonly WorkspaceRef[] }[],
): Directory {
  const byId = new Map(entries.map((entry) => [entry.user.userId, entry]));
  return {
    user: (userId) => byId.get(userId)?.user ?? null,
    workspacesOf: (userId) => byId.get(userId)?.workspaces ?? [],
  };
}
