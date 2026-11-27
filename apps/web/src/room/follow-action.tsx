// Follow, in the submenu of a person's row in the people list.
import { DropdownMenuItem, useCommandState } from "@manent/ui";
import { EyeIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { PeopleRowActionProps } from "../selection/people-list-slots.ts";
import { useServices } from "../services/context.tsx";
import { chooseToFollow } from "./follow-state.ts";

/** Offered on every person present but you. */
export function FollowAction(props: PeopleRowActionProps): ReactNode {
  const { docId, userId } = props;
  const services = useServices();
  const follow = useCommandState("room.follow");
  if (!follow.visible || userId === services.userId) return null;
  return (
    <DropdownMenuItem
      className="text-ui"
      onClick={() => {
        chooseToFollow(docId, userId);
        services.commands.run("room.follow", "menu");
      }}
    >
      <EyeIcon aria-hidden="true" className="size-icon shrink-0" />
      {follow.label}
    </DropdownMenuItem>
  );
}
