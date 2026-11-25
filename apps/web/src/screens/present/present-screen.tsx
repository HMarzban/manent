// The Present screen: one document in a window with no chrome, drawn by the mode its route found.
import { useLoaderData, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { PresentMode } from "./modes.ts";

export function PresentScreen(): ReactNode {
  const { docId }: { docId: string } = useParams({ strict: false });
  const { Body }: PresentMode = useLoaderData({ strict: false });
  return <Body docId={docId} />;
}
