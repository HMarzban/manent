// The routes that sign a visitor in and say who they are.
import type {
  MeResponse,
  SignInOptions,
  SignInResponse,
} from "@manent/sync-protocol";
import type { SignInAttempt } from "../../auth/sign-in.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route } from "../route.ts";

type SignInRefusal = Extract<SignInAttempt, { ok: false }>["reason"];

const REFUSAL_STATUS: Readonly<Record<SignInRefusal, number>> = {
  bad_request: 400,
  unknown_user: 404,
};

export const AUTH_ROUTES: readonly Route[] = [
  {
    method: "GET",
    path: "/api/sign-in",
    handle: ({ config }) => json<SignInOptions>(config.auth.signIn.describe()),
  },
  {
    method: "POST",
    path: "/api/sign-in",
    async handle({ config, request }) {
      const read = await readJsonBody(request);
      if (!read.ok) return failure("bad_request", 400);
      const attempt = await config.auth.signIn.authenticate(read.body);
      if (!attempt.ok)
        return failure(attempt.reason, REFUSAL_STATUS[attempt.reason]);
      return json<SignInResponse>({
        token: config.auth.sessions.issue(attempt.identity.userId),
        user: attempt.identity,
      });
    },
  },
  {
    method: "GET",
    path: "/api/me",
    handle({ config, user }) {
      const identity = user();
      if (identity === null) return failure("unauthenticated", 401);
      return json<MeResponse>({
        ...identity,
        workspaces: config.auth.directory.workspacesOf(identity.userId),
      });
    },
  },
];
