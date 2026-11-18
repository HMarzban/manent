// The sign-in port: how a visitor becomes an identity.
import type { Identity, SignInOptions } from "@manent/sync-protocol";

export type SignInAttempt =
  | { ok: true; identity: Identity }
  | { ok: false; reason: "bad_request" | "unknown_user" };

/** One way of signing in. The provider alone knows the shape of its request body. */
export interface SignInProvider {
  describe(): SignInOptions;
  /** Never throws for a body it cannot read: that is `bad_request`. */
  authenticate(body: unknown): Promise<SignInAttempt>;
}
