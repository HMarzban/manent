// Who has access, one row each: the people with their role and when they were last active, then the groups given
// access. The owner changes a role or removes it on the row; anyone else sees the list only.
import { Avatar, Button, Row, SHARING_WORDS, formatWhen } from "@manent/ui";
import { UsersIcon } from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import { useEnvironment } from "../services/context.tsx";
import { PERSON_ROW_SLOTS } from "./person-row-slots.ts";
import { RoleSelect } from "./role-select.tsx";
import { RowRefusal } from "./row-refusal.tsx";
import type { RowKey, ShareActions } from "./share-actions.ts";
import { groupName } from "./share-groups.ts";
import type { ShareAccess, ShareGroup, SharePerson } from "./share-requests.ts";

const WORDS = SHARING_WORDS;

/** A person's second line: the group the role came from, else when they were last active; null when neither applies. */
function secondLine(person: SharePerson, now: number): string | null {
  if (person.groupId !== null)
    return WORDS.fromGroup(groupName(person.groupId));
  if (person.lastActiveAt === null) return null;
  return WORDS.lastActive(formatWhen(person.lastActiveAt, now));
}

interface ListProps {
  docId: string;
  access: ShareAccess;
  /** The owner, online: rows carry their controls. */
  editing: boolean;
  colours: ReadonlyMap<string, number>;
  refusals: ReadonlyMap<RowKey, string>;
  actions: ShareActions;
}

function PersonRow(props: ListProps & { person: SharePerson }): ReactNode {
  const { person, editing, colours, actions } = props;
  const { now } = useEnvironment();
  const nameId = useId();
  const refusal = props.refusals.get(`person:${person.userId}`) ?? null;
  const line = secondLine(person, now());
  // a refusal takes the second line's place until the row's next change goes through
  const meta =
    refusal !== null ? (
      <RowRefusal sentence={refusal} />
    ) : line === null ? undefined : (
      <span className="text-meta text-fg-muted">{line}</span>
    );
  // the owner's role is never given or taken here
  const shareRole = editing && person.role !== "owner" ? person.role : null;
  const slots =
    !editing || PERSON_ROW_SLOTS.length === 0
      ? []
      : [
          <span key="slots" className="flex items-center gap-2">
            {PERSON_ROW_SLOTS.map((Slot, i) => (
              <Slot
                key={i}
                userId={person.userId}
                place={{ kind: "doc", docId: props.docId }}
              />
            ))}
          </span>,
        ];
  const role =
    shareRole === null ? (
      <span
        key="role"
        className={
          editing
            ? "inline-flex w-36 shrink-0 justify-end"
            : "inline-flex w-28 shrink-0 justify-end"
        }
      >
        {person.role === "owner" ? (
          <span className="inline-flex items-center rounded-micro border border-line bg-subtle px-2 py-0.5 text-micro font-medium text-fg-muted">
            {WORDS.roles[person.role]}
          </span>
        ) : (
          <span className="text-meta text-fg-muted">
            {WORDS.roles[person.role]}
          </span>
        )}
      </span>
    ) : (
      <RoleSelect
        key="role"
        value={shareRole}
        labelledBy={nameId}
        className="w-36"
        onChange={(chosen) => void actions.changeRole(person, chosen)}
      />
    );
  const remove = !editing
    ? []
    : shareRole === null
      ? [
          <span
            key="remove-spacer"
            aria-hidden="true"
            className="hidden sm:inline-block sm:w-16"
          />,
        ]
      : [
          <Button
            key="remove"
            variant="ghost"
            size="sm"
            className="w-16 text-fg-muted hover:text-danger"
            aria-label={WORDS.removeName(person.name)}
            onClick={() => void actions.removePerson(person)}
          >
            {WORDS.remove}
          </Button>,
        ];
  return (
    <Row
      leading={
        <Avatar
          name={person.name}
          initials={initialsOf(person.name)}
          colour={colours.get(person.userId) ?? null}
          size="md"
          decorative
        />
      }
      meta={meta}
      trailing={[...slots, role, ...remove]}
    >
      <span id={nameId} className="truncate font-medium text-fg">
        {person.name}
      </span>
    </Row>
  );
}

function GroupRow(props: ListProps & { group: ShareGroup }): ReactNode {
  const { group, access, editing, actions } = props;
  const name = groupName(group.groupId);
  const members = access.people.filter(
    (person) => person.groupId === group.groupId,
  ).length;
  const refusal = props.refusals.get(`group:${group.groupId}`) ?? null;
  return (
    <Row
      leading={
        <span
          aria-hidden="true"
          className="flex size-avatar shrink-0 items-center justify-center rounded-full border border-line bg-subtle text-fg-muted"
        >
          <UsersIcon className="size-3.5" />
        </span>
      }
      meta={refusal === null ? undefined : <RowRefusal sentence={refusal} />}
      trailing={
        editing
          ? [
              <Button
                key="remove"
                variant="ghost"
                size="sm"
                className="text-fg-muted hover:text-danger"
                aria-label={WORDS.removeName(name)}
                onClick={() => void actions.removeGroup(group, name)}
              >
                {WORDS.remove}
              </Button>,
            ]
          : []
      }
    >
      <span className="truncate font-medium text-fg">
        {WORDS.groupRow(name, WORDS.roles[group.role], members)}
      </span>
    </Row>
  );
}

/** The owner first, then everyone else by name. */
const byOwnerThenName = (a: SharePerson, b: SharePerson): number =>
  Number(b.role === "owner") - Number(a.role === "owner") ||
  a.name.localeCompare(b.name);

export function PeopleList(props: ListProps): ReactNode {
  const { access } = props;
  const people = access.people.toSorted(byOwnerThenName);
  const total = people.length + access.groups.length;
  return (
    <div
      role="list"
      className="mn-table flex flex-col [&_.mn-row]:flex-wrap [&_.mn-row]:gap-2 [&_.mn-row]:py-2 sm:[&_.mn-row]:flex-nowrap"
    >
      {people.map((person, index) => (
        <div
          role="listitem"
          aria-posinset={index + 1}
          aria-setsize={total}
          key={person.userId}
        >
          <PersonRow {...props} person={person} />
        </div>
      ))}
      {access.groups.map((group, index) => (
        <div
          role="listitem"
          aria-posinset={people.length + index + 1}
          aria-setsize={total}
          key={group.groupId}
        >
          <GroupRow {...props} group={group} />
        </div>
      ))}
    </div>
  );
}
