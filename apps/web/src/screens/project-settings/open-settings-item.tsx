// Project settings in a project's row menu in the Library: Back returns to the Library as it was.
import { DropdownMenuItem, PROJECT_WORDS } from "@manent/ui";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { SlidersHorizontalIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The address of Project settings of `projectId`, Back returning to `from`. */
const settingsHref = (projectId: string, from: string): string =>
  `/p/${projectId}/settings?from=${encodeURIComponent(from)}`;

export function OpenSettingsItem(props: { id: string }): ReactNode {
  const navigate = useNavigate();
  const from = useRouterState({ select: (state) => state.location.href });
  return (
    <DropdownMenuItem
      onClick={() => void navigate({ href: settingsHref(props.id, from) })}
    >
      <SlidersHorizontalIcon
        aria-hidden="true"
        className="size-icon shrink-0"
      />
      {PROJECT_WORDS.heading}
    </DropdownMenuItem>
  );
}
