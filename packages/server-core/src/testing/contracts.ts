// The tests every implementation of the sign-in and directory ports passes.
import { expect, test } from "bun:test";
import type { Identity, WorkspaceRef } from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import type { SignInProvider } from "../auth/sign-in.ts";

/** Registers the sign-in contract's tests; each calls `make` afresh. */
export function signInContract(
  make: () => {
    provider: SignInProvider;
    known: { body: unknown; identity: Identity };
    unknownBody: unknown;
    malformed: readonly unknown[];
  },
): void {
  test("every choice is a person with a user ID, a name and a title", () => {
    const { choices } = make().provider.describe();
    const kinds = choices.map((choice) =>
      Object.fromEntries(
        Object.entries(choice).map(([key, value]) => [key, typeof value]),
      ),
    );
    expect(kinds).toEqual(
      choices.map(() => ({
        userId: "string",
        name: "string",
        title: "string",
        registered: "boolean",
      })),
    );
  });

  test("a known body signs that person in", async () => {
    const { provider, known } = make();
    expect(await provider.authenticate(known.body)).toEqual({
      ok: true,
      identity: known.identity,
    });
  });

  test("a person nobody knows is refused as unknown_user", async () => {
    const { provider, unknownBody } = make();
    expect(await provider.authenticate(unknownBody)).toEqual({
      ok: false,
      reason: "unknown_user",
    });
  });

  test("a body the provider cannot read is refused, never thrown", async () => {
    const { provider, malformed } = make();
    for (const body of malformed)
      expect([body, await provider.authenticate(body)]).toEqual([
        body,
        { ok: false, reason: "bad_request" },
      ]);
  });
}

/** Registers the directory contract's tests; each calls `make` afresh. */
export function directoryContract(
  make: () => {
    directory: Directory;
    known: { identity: Identity; workspaces: readonly WorkspaceRef[] };
  },
): void {
  test("a known user, and their workspaces in order", () => {
    const { directory, known } = make();
    const { userId } = known.identity;
    expect([directory.user(userId), directory.workspacesOf(userId)]).toEqual([
      known.identity,
      known.workspaces,
    ]);
  });

  test("a user ID is matched exactly, never through inherited properties", () => {
    const { directory } = make();
    for (const userId of [
      "nobody",
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
    ])
      expect([
        userId,
        directory.user(userId),
        directory.workspacesOf(userId),
      ]).toEqual([userId, null, []]);
  });
}
