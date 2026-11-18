// What the server's HTTP routes and the demo's server control answer, and what a client sends them.

export const HTTP_ERROR_CODES = [
  "bad_request",
  "forbidden_host",
  "not_found",
  "unauthenticated",
  "unknown_user",
] as const;

export type HttpErrorCode = (typeof HTTP_ERROR_CODES)[number];

export function isHttpErrorCode(value: unknown): value is HttpErrorCode {
  return HTTP_ERROR_CODES.some((code) => code === value);
}

export interface ErrorResponse {
  error: HttpErrorCode;
}

export interface HealthResponse {
  ok: true;
}

export interface Identity {
  userId: string;
  name: string;
}

/** One person a visitor may sign in as; `title` is a line of description, never an access level. */
export interface SignInChoice {
  userId: string;
  name: string;
  title: string;
  /** False for a person who starts without an account: choosing them issues no session. */
  registered: boolean;
}

/** The answer to GET /api/sign-in. */
export interface SignInOptions {
  choices: readonly SignInChoice[];
}

/** The answer to POST /api/sign-in. */
export interface SignInResponse {
  token: string;
  user: Identity;
}

export interface WorkspaceRef {
  id: string;
  name: string;
  /** Null once the workspace is ready. */
  seeding: { done: number; total: number } | null;
}

/** The answer to GET /api/me. */
export interface MeResponse extends Identity {
  workspaces: readonly WorkspaceRef[];
}

export interface ControlEndpoint {
  url: string;
  token: string;
}

/** The answer to GET /api/demo. */
export interface DemoResponse {
  demo: true;
  seedId: string | null;
  control: ControlEndpoint | null;
}

export const SERVER_STATES = [
  "running",
  "stopped",
  "starting",
  "failed",
] as const;

export type ServerState = (typeof SERVER_STATES)[number];

export function isServerState(value: unknown): value is ServerState {
  return SERVER_STATES.some((state) => state === value);
}

/** Every answer of the demo's server control. */
export interface ControlStatusResponse {
  server: ServerState;
}
