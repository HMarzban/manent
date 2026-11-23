// People: the project's groups, each with its role, its members by full name and its watermark; only the owner changes them.
import { readGroups, writeGroup } from "@manent/crdt";
import type { CrdtDoc, GroupEntry } from "@manent/crdt";
import { Avatar, PROJECT_WORDS, Row, Switch } from "@manent/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../../initials.ts";
import type { ProjectIndex } from "../../project/project-index.ts";
import { PERSON_ROW_SLOTS } from "../../sharing/person-row-slots.ts";
import { useIndexRead } from "./project-data.ts";
import type { ProjectPerson } from "./project-data.ts";

const groupsOf = (doc: CrdtDoc): readonly GroupEntry[] => [
  ...readGroups(doc).values(),
];

export function PeopleGroup(props: {
  index: ProjectIndex;
  projectId: string;
  people: readonly ProjectPerson[];
  canChange: boolean;
}): ReactNode {
  const { index, projectId, people, canChange } = props;
  const groups = useIndexRead(index, "groups", groupsOf) ?? [];
  const write = async (group: GroupEntry): Promise<void> => {
    writeGroup((await index.handle()).doc(), group);
  };
  return groups.map((group) => (
    <GroupSection
      key={group.id}
      group={group}
      projectId={projectId}
      people={people}
      canChange={canChange}
      onWatermark={(watermark) => void write({ ...group, watermark })}
    />
  ));
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
  // a member the server has not named is counted, and listed once it is
  const members = group.memberUserIds.flatMap((userId) =>
    people.filter((person) => person.userId === userId),
  );
  return (
    <section aria-labelledby={ids.group} className="flex flex-col gap-1 py-1">
      <h3 id={ids.group} className="truncate pt-2 text-ui font-semibold">
        {PROJECT_WORDS.groupRow(group.name, role, group.memberUserIds.length)}
      </h3>
      <div className="flex min-h-row-2 items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span id={ids.watermark} className="text-ui font-medium">
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
        <div role="list" className="-mx-3">
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
    </section>
  );
}
