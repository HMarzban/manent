// People: the project's groups as raised cards, each with its role, watermark switch and members; only the owner changes them.
import { readGroups, writeGroup } from "@manent/crdt";
import type { CrdtDoc, GroupEntry } from "@manent/crdt";
import { Avatar, PROJECT_WORDS, Row, Skeleton, Switch } from "@manent/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../../initials.ts";
import type { ProjectIndex } from "../../project/project-index.ts";
import { SettingsCard } from "../../settings-shell/settings-card.tsx";
import { PERSON_ROW_SLOTS } from "../../sharing/person-row-slots.ts";
import { useIndexRead } from "./project-data.ts";
import type { ProjectPerson } from "./project-data.ts";

const groupsOf = (doc: CrdtDoc): readonly GroupEntry[] => [
  ...readGroups(doc).values(),
];

const PLACEHOLDER_GROUPS = 2;

function PeopleGroupSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      {Array.from({ length: PLACEHOLDER_GROUPS }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex flex-col gap-3 rounded-surface border border-line bg-raised p-4"
        >
          <Skeleton className="h-4 w-44" />
          <div className="flex min-h-row-2 items-center justify-between gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
          </div>
          <div className="flex min-h-row items-center gap-2">
            <Skeleton className="size-avatar-sm shrink-0 rounded-full" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PeopleGroup(props: {
  index: ProjectIndex;
  projectId: string;
  people: readonly ProjectPerson[];
  canChange: boolean;
}): ReactNode {
  const { index, projectId, people, canChange } = props;
  const groups = useIndexRead(index, "groups", groupsOf);
  if (groups.kind === "loading") return <PeopleGroupSkeleton />;
  if (groups.kind === "unavailable") return null;
  const write = async (group: GroupEntry): Promise<void> => {
    writeGroup((await index.handle()).doc(), group);
  };
  return (
    <div className="flex flex-col gap-4">
      {groups.value.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          projectId={projectId}
          people={people}
          canChange={canChange}
          onWatermark={(watermark) => void write({ ...group, watermark })}
        />
      ))}
    </div>
  );
}

function GroupSection(props: {
  group: GroupEntry;
  projectId: string;
  people: readonly ProjectPerson[];
  canChange: boolean;
  onWatermark(watermark: boolean): void;
}): ReactNode {
  const { group, projectId, people, canChange, onWatermark } = props;
  const ids = { group: useId(), watermark: useId(), line: useId() };
  const role =
    group.role === null ? null : PROJECT_WORDS.groupRoles[group.role];
  const heading = PROJECT_WORDS.groupRow(
    group.name,
    role,
    group.memberUserIds.length,
  );
  // a member the server has not named is counted, and listed once it is
  const members = group.memberUserIds.flatMap((userId) =>
    people.filter((person) => person.userId === userId),
  );
  return (
    <SettingsCard asSection divided title={heading}>
      <span id={ids.group} className="sr-only">
        {heading}
      </span>
      <div className="flex min-h-row-2 flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={ids.watermark} className="text-ui font-medium text-fg">
            {PROJECT_WORDS.watermark}
          </span>
          <p id={ids.line} className="text-meta text-fg-muted">
            {PROJECT_WORDS.watermarkLine}
          </p>
        </div>
        <Switch
          checked={group.watermark}
          onCheckedChange={onWatermark}
          aria-labelledby={`${ids.watermark} ${ids.group}`}
          aria-describedby={ids.line}
          disabled={!canChange}
        />
      </div>
      {members.length === 0 ? null : (
        <div role="list" className="divide-y divide-line px-1 py-1">
          {members.map((person) => (
            <div key={person.userId} role="listitem">
              <Row
                leading={
                  <Avatar
                    name={person.name}
                    initials={initialsOf(person.name)}
                    colour={null}
                    size="sm"
                    decorative
                  />
                }
                trailing={
                  PERSON_ROW_SLOTS.length === 0
                    ? []
                    : [
                        <span key="slots" className="flex items-center gap-2">
                          {PERSON_ROW_SLOTS.map((Slot, at) => (
                            <Slot
                              // the list is append-only, so a slot keeps its place
                              key={at}
                              userId={person.userId}
                              place={{ kind: "project", projectId }}
                            />
                          ))}
                        </span>,
                      ]
                }
              >
                <span title={person.name} className="min-w-0 truncate">
                  {person.name}
                </span>
              </Row>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}
