import type { LayoutPatches } from "@manent/pagination";
import type { VersionContent } from "@manent/sync-protocol";

export const productionVersionLayout: (
  content: VersionContent,
) => LayoutPatches | null = () => null;
