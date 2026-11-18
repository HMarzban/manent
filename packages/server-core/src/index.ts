export { DEMO_PEOPLE, DEMO_WORKSPACES } from "./people.ts";
export type {
  DemoPerson,
  DemoPersonId,
  DemoWorkspace,
  DemoWorkspaceId,
} from "./people.ts";
export { createDemoSignIn } from "./sign-in.ts";
export type {
  Identity,
  SignInDescription,
  SignInProvider,
  WorkspaceRef,
} from "./sign-in.ts";
export { createSignedSessionStore } from "./sessions.ts";
export type { SessionStore } from "./sessions.ts";
export { bindRefusal, checkDemoBind, isLoopbackAddress } from "./bind.ts";
export type { BindCheck } from "./bind.ts";
export { createServer } from "./server.ts";
export type { ConnectionData, ManentServer, ServerConfig } from "./server.ts";
