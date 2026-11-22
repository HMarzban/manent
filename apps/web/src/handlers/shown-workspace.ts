// The workspace a command that makes a script puts it in.
import type { HandlerDeps } from "./index.ts";

/** The workspace the Library shows: the one in its search, else the person's first, else the person's own desk. */
export async function shownWorkspace(deps: HandlerDeps): Promise<string> {
  const { w } = deps.router.here().search;
  if (typeof w === "string") return w;
  const me = await deps.api.me();
  return (me.ok ? me.me.workspaces[0]?.id : undefined) ?? deps.services.userId;
}
