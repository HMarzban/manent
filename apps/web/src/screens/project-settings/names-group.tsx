// Names and facts' lists of the characters, sets and terms of the project the screen's address names.
import { useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { NamesLists } from "../../names/names-lists.tsx";

export function NamesGroup(): ReactNode {
  const { projectId }: { projectId: string } = useParams({ strict: false });
  return <NamesLists projectId={projectId} />;
}
