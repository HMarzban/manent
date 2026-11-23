// The person's workspaces as the server lists them: one query, which the Library, its switcher and the Tour all read.
import type { WorkspaceRef } from "@manent/sync-protocol";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Api } from "../api.ts";
import { POLL_MS } from "../demo/use-demo.ts";

/** The person's workspaces; a server that cannot list them throws, so the query keeps the last list it heard. */
function listWorkspaces(api: Api): () => Promise<readonly WorkspaceRef[]> {
  return async () => {
    const answer = await api.me();
    if (!answer.ok) {
      throw new Error(
        `the server did not list the workspaces: ${answer.reason}`,
      );
    }
    return answer.me.workspaces;
  };
}

/**
 * `userId`'s workspaces while `enabled`, asked again every POLL_MS while one is getting ready, so that every place
 * showing how far it has come shows the same count.
 */
export function useWorkspaces(
  api: Api,
  userId: string,
  enabled: boolean,
): UseQueryResult<readonly WorkspaceRef[]> {
  return useQuery({
    queryKey: ["me", userId],
    queryFn: listWorkspaces(api),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.some((ref) => ref.seeding?.failed === false)
        ? POLL_MS
        : false,
  });
}
