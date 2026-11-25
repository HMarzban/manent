// The person's workspaces as the server lists them: one query, which the Library, its switcher and the Tour all read.
import type { WorkspaceRef } from "@manent/sync-protocol";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Api } from "../api.ts";
import { POLL_MS } from "../demo/use-demo.ts";

/** The person's workspaces; a server that cannot list them throws, so the query keeps the last list it heard. */
function listWorkspaces(
  api: Api,
  onListed?: (workspaces: readonly WorkspaceRef[]) => void,
): () => Promise<readonly WorkspaceRef[]> {
  return async () => {
    const answer = await api.me();
    if (!answer.ok) {
      throw new Error(
        `the server did not list the workspaces: ${answer.reason}`,
      );
    }
    onListed?.(answer.me.workspaces);
    return answer.me.workspaces;
  };
}

/**
 * `userId`'s workspaces while `enabled`, asked again every POLL_MS while one is getting ready, so that every place
 * showing how far it has come shows the same count. When `cached` is provided, renders immediately while revalidating.
 */
export function useWorkspaces(
  api: Api,
  userId: string,
  enabled: boolean,
  options?: {
    cached?: readonly WorkspaceRef[] | null;
    onListed?: (workspaces: readonly WorkspaceRef[]) => void;
  },
): UseQueryResult<readonly WorkspaceRef[]> {
  const cached = options?.cached ?? undefined;
  return useQuery({
    queryKey: ["me", userId],
    queryFn: listWorkspaces(api, options?.onListed),
    enabled,
    placeholderData:
      cached !== undefined && cached.length > 0 ? cached : undefined,
    refetchInterval: (query) =>
      query.state.data?.some((ref) => ref.seeding?.failed === false)
        ? POLL_MS
        : false,
  });
}
