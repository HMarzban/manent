import { DEMO_PEOPLE, DEMO_WORKSPACES } from "./people.ts";
import type { DemoPerson } from "./people.ts";

export interface Identity {
  userId: string;
  name: string;
}

export interface WorkspaceRef {
  id: string;
  name: string;
  /** Progress while the workspace is still being filled; null once it is ready. */
  seeding: { done: number; total: number } | null;
}

export type SignInDescription =
  { provider: "demo"; people: readonly DemoPerson[] } | { provider: "google" };

/**
 * One interface for every way of signing in. `authenticate` is the direct
 * sign-in; `begin` and `complete` are the redirect-and-callback half that a
 * provider such as Google needs.
 */
export interface SignInProvider {
  readonly provider: "demo" | "google";
  describe(): SignInDescription;
  authenticate(body: unknown): Promise<Identity | null>;
  begin(request: {
    redirectUri: string;
  }): Promise<{ url: string; state: string; verifier: string } | null>;
  complete(request: {
    code: string;
    state: string;
    verifier: string;
    redirectUri: string;
  }): Promise<Identity | null>;
  lookup(userId: string): Identity | null;
  /** Every workspace the person belongs to, in order; [] for an unknown person. */
  workspaces(userId: string): readonly WorkspaceRef[];
}

/** Sign-in without a password: the body names one of the demo people. */
export function createDemoSignIn(): SignInProvider {
  const byId = new Map<string, DemoPerson>(DEMO_PEOPLE.map((p) => [p.id, p]));

  const lookup = (userId: string): Identity | null => {
    const person = byId.get(userId);
    return person ? { userId: person.id, name: person.name } : null;
  };

  return {
    provider: "demo",
    describe: () => ({ provider: "demo", people: DEMO_PEOPLE }),
    async authenticate(body) {
      if (typeof body !== "object" || body === null) return null;
      const personId: unknown = (body as { personId?: unknown }).personId;
      return typeof personId === "string" ? lookup(personId) : null;
    },
    begin: async () => null,
    complete: async () => null,
    lookup,
    workspaces(userId) {
      if (!byId.has(userId)) return [];
      return DEMO_WORKSPACES.filter((w) =>
        (w.members as readonly string[]).includes(userId),
      ).map((w) => ({ id: w.id, name: w.name, seeding: null }));
    },
  };
}
