// Adding a person with a role, or a group with the role it holds. A person's role is never defaulted: Add says it
// needs one until it is chosen.
import {
  Button,
  DIALOG_WORDS,
  SHARING_WORDS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@manent/ui";
import type { SignInChoice } from "@manent/sync-protocol";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { RoleSelect } from "./role-select.tsx";
import { RowRefusal } from "./row-refusal.tsx";
import type { ShareActions } from "./share-actions.ts";
import { ADDABLE_GROUP_IDS, groupName } from "./share-groups.ts";
import type { ShareAccess, ShareRole } from "./share-requests.ts";

const WORDS = SHARING_WORDS;

type Target =
  { kind: "person"; choice: SignInChoice } | { kind: "group"; groupId: string };

/** Who may be added: people with an account and no role yet, then the groups not yet given access. */
function targetsOf(
  access: ShareAccess,
  choices: readonly SignInChoice[],
): readonly { value: string; label: string; target: Target }[] {
  const people = choices
    .filter(
      (choice) =>
        choice.registered &&
        !access.people.some((person) => person.userId === choice.userId),
    )
    .map((choice) => ({
      value: `person:${choice.userId}`,
      label: choice.name,
      target: { kind: "person", choice } as const,
    }));
  const groups = ADDABLE_GROUP_IDS.filter(
    (id) => !access.groups.some((group) => group.groupId === id),
  ).map((groupId) => ({
    value: `group:${groupId}`,
    label: groupName(groupId),
    target: { kind: "group", groupId } as const,
  }));
  return [...people, ...groups];
}

export function AddRow(props: {
  access: ShareAccess;
  choices: readonly SignInChoice[];
  refusal: string | null;
  actions: ShareActions;
}): ReactNode {
  const { actions } = props;
  const [chosen, setChosen] = useState<string | null>(null);
  const [role, setRole] = useState<ShareRole | null>(null);
  // a refusal is said while the one refused is still chosen
  const [tried, setTried] = useState<string | null>(null);
  const reasonId = useId();
  const items = targetsOf(props.access, props.choices);
  const target = items.find((item) => item.value === chosen)?.target ?? null;
  const needsRole = target?.kind === "person" && role === null;

  const add = async (): Promise<void> => {
    if (target === null) return;
    setTried(chosen);
    const added =
      target.kind === "group"
        ? await actions.addGroup(target.groupId, groupName(target.groupId))
        : role !== null && (await actions.addPerson(target.choice, role));
    if (!added) return;
    setChosen(null);
    setRole(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={items}
          value={chosen}
          onValueChange={(value) => setChosen(value)}
        >
          <SelectTrigger
            aria-label={WORDS.addPlaceholder}
            className="min-w-0 flex-1"
          >
            <SelectValue placeholder={WORDS.addPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {target?.kind === "group" ? null : (
          <RoleSelect value={role} onChange={setRole} />
        )}
        <Button
          variant="outline"
          disabled={target === null}
          aria-disabled={needsRole ? true : undefined}
          aria-describedby={needsRole ? reasonId : undefined}
          onClick={() => {
            if (!needsRole) void add();
          }}
        >
          {WORDS.add}
        </Button>
      </div>
      {needsRole ? (
        <p id={reasonId} className="text-meta text-fg-muted">
          {DIALOG_WORDS.disabledLine(WORDS.add, WORDS.needsRole)}
        </p>
      ) : null}
      {props.refusal === null || tried !== chosen ? null : (
        <RowRefusal sentence={props.refusal} />
      )}
    </div>
  );
}
