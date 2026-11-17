export {
  DEMO_PEOPLE,
  DEMO_WORKSPACES,
  type DemoPerson,
  type DemoPersonId,
  type DemoWorkspace,
  type DemoWorkspaceId,
} from "./people.ts";
export {
  createDemoSignIn,
  type Identity,
  type SignInDescription,
  type SignInProvider,
  type WorkspaceRef,
} from "./sign-in.ts";
export { createSignedSessionStore, type SessionStore } from "./sessions.ts";
export {
  bindRefusal,
  checkDemoBind,
  isLoopbackAddress,
  type BindCheck,
} from "./bind.ts";
