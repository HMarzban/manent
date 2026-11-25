// The role a share gives, chosen from a list that starts with none chosen: the role is never defaulted.
import {
  SHARING_WORDS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@manent/ui";
import type { ReactNode } from "react";
import { SHARE_ROLES } from "./share-requests.ts";
import type { ShareRole } from "./share-requests.ts";

const ITEMS = SHARE_ROLES.map((role) => ({
  value: role,
  label: SHARING_WORDS.roles[role],
}));

/** Named by `labelledBy`, the id of the words it is for, or else by its placeholder. */
export function RoleSelect(props: {
  value: ShareRole | null;
  onChange(role: ShareRole): void;
  labelledBy?: string;
  className?: string;
}): ReactNode {
  const { onChange } = props;
  return (
    <Select
      items={ITEMS}
      value={props.value}
      onValueChange={(chosen) => {
        const role = SHARE_ROLES.find((r) => r === chosen);
        if (role !== undefined) onChange(role);
      }}
    >
      <SelectTrigger
        aria-labelledby={props.labelledBy}
        aria-label={
          props.labelledBy === undefined ? SHARING_WORDS.chooseRole : undefined
        }
        className={props.className}
      >
        <SelectValue placeholder={SHARING_WORDS.chooseRole} />
      </SelectTrigger>
      <SelectContent>
        {ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
