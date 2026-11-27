// Adding a person with a role, or a group with the role it holds. A person's role is never defaulted: Add says it
// needs one until it is chosen.
import {
  Avatar,
  Button,
  DIALOG_WORDS,
  SHARING_WORDS,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@manent/ui";
import type { SignInChoice } from "@manent/sync-protocol";
import { UsersIcon } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import { RoleSelect } from "./role-select.tsx";
import { RowRefusal } from "./row-refusal.tsx";
import type { ShareActions } from "./share-actions.ts";
import { ADDABLE_GROUP_IDS, groupName } from "./share-groups.ts";
import type { ShareAccess, ShareRole } from "./share-requests.ts";

const WORDS = SHARING_WORDS;

type Target =
  { kind: "person"; choice: SignInChoice } | { kind: "group"; groupId: string };

interface TargetOption {
  readonly value: string;
  readonly label: string;
  readonly target: Target;
}

/** Who may be added: people with an account and no role yet, then the groups not yet given access. */
function targetsOf(
  access: ShareAccess,
  choices: readonly SignInChoice[],
): {
  readonly people: readonly TargetOption[];
  readonly groups: readonly TargetOption[];
  readonly all: readonly TargetOption[];
} {
  const people: TargetOption[] = choices
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
  const groups: TargetOption[] = ADDABLE_GROUP_IDS.filter(
    (id) => !access.groups.some((group) => group.groupId === id),
  ).map((groupId) => ({
    value: `group:${groupId}`,
    label: groupName(groupId),
    target: { kind: "group", groupId } as const,
  }));
  return { people, groups, all: [...people, ...groups] };
}

function TargetItem(props: {
  readonly item: TargetOption;
  readonly colours: ReadonlyMap<string, number>;
}): ReactNode {
  const { item, colours } = props;
  return (
    <SelectItem value={item.value}>
      {item.target.kind === "person" ? (
        <Avatar
          name={item.label}
          initials={initialsOf(item.label)}
          colour={colours.get(item.target.choice.userId) ?? null}
          size="sm"
          decorative
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-avatar-sm shrink-0 items-center justify-center rounded-full border border-line bg-raised text-fg-muted"
        >
          <UsersIcon className="size-3" />
        </span>
      )}
      <span className="truncate">{item.label}</span>
    </SelectItem>
  );
}

export function AddRow(props: {
  access: ShareAccess;
  choices: readonly SignInChoice[];
  colours: ReadonlyMap<string, number>;
  refusal: string | null;
  actions: ShareActions;
}): ReactNode {
  const { actions, colours } = props;
  const [chosen, setChosen] = useState<string | null>(null);
  const [role, setRole] = useState<ShareRole | null>(null);
  const [busy, setBusy] = useState(false);
  // a refusal is said while the one refused is still chosen
  const [tried, setTried] = useState<string | null>(null);
  const reasonId = useId();
  const grouped = targetsOf(props.access, props.choices);
  const items = grouped.all;
  const target = items.find((item) => item.value === chosen)?.target ?? null;
  const needsRole = target?.kind === "person" && role === null;

  const add = async (): Promise<void> => {
    if (target === null || busy) return;
    setBusy(true);
    setTried(chosen);
    try {
      const added =
        target.kind === "group"
          ? await actions.addGroup(target.groupId, groupName(target.groupId))
          : role !== null && (await actions.addPerson(target.choice, role));
      if (!added) return;
      setChosen(null);
      setRole(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-surface border border-line bg-subtle p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={items}
          value={chosen}
          disabled={items.length === 0 || busy}
          onValueChange={(value) => setChosen(value)}
        >
          <SelectTrigger
            aria-label={WORDS.addPlaceholder}
            className="min-w-0 flex-1 bg-raised!"
          >
            <SelectValue
              placeholder={
                items.length === 0 ? WORDS.everyoneAdded : WORDS.addPlaceholder
              }
            />
          </SelectTrigger>
          <SelectContent>
            {grouped.people.length > 0 && grouped.groups.length > 0 ? (
              <>
                <SelectGroup>
                  <SelectLabel>{WORDS.peopleGroup}</SelectLabel>
                  {grouped.people.map((item) => (
                    <TargetItem
                      key={item.value}
                      item={item}
                      colours={colours}
                    />
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>{WORDS.groupsGroup}</SelectLabel>
                  {grouped.groups.map((item) => (
                    <TargetItem
                      key={item.value}
                      item={item}
                      colours={colours}
                    />
                  ))}
                </SelectGroup>
              </>
            ) : (
              items.map((item) => (
                <TargetItem key={item.value} item={item} colours={colours} />
              ))
            )}
          </SelectContent>
        </Select>
        {target?.kind === "group" ? null : (
          <RoleSelect value={role} onChange={setRole} className="bg-raised!" />
        )}
        <Button
          variant={target !== null && !needsRole ? "default" : "outline"}
          disabled={target === null || busy}
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
