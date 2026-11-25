// Workspace settings People group: lists workspace members and lets owners change any member's role with Undo.
import { DOC_ROLES } from "@manent/sync-protocol";
import type { DocRole, WorkspacePerson } from "@manent/sync-protocol";
import {
  Avatar,
  Button,
  Row,
  SHARING_WORDS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  WORKSPACE_WORDS,
  useSubscribable,
} from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../../initials.ts";
import { useServices } from "../../services/context.tsx";
import { useWorkspaces } from "../../services/use-workspaces.ts";
import type { WorkspaceSettingsGroupProps } from "./groups.ts";
import {
  createWorkspaceApi,
  sessionTokenOf,
  workspacePeopleHolder,
} from "./workspace-api.ts";

const ROLE_ITEMS = DOC_ROLES.map((role) => ({
  value: role,
  label: SHARING_WORDS.roles[role],
}));

const firstName = (name: string): string => name.split(" ")[0] ?? name;

function InlineRefusal(props: {
  sentence: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 text-ui text-fg"
    >
      <span className="flex items-center gap-1">
        <TriangleExclamationPointIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-attention"
        />
        {props.sentence}
      </span>
      {props.onRetry === undefined ? null : (
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={props.onRetry}
        >
          {WORKSPACE_WORDS.tryAgain}
        </Button>
      )}
    </div>
  );
}

function WorkspaceRoleSelect(props: {
  value: DocRole;
  labelledBy: string;
  disabled: boolean;
  disabledReason?: string;
  onChange(role: DocRole): void;
}): ReactNode {
  const { value, labelledBy, disabled, disabledReason, onChange } = props;
  return (
    <Select
      items={ROLE_ITEMS}
      value={value}
      disabled={disabled}
      onValueChange={(chosen) => {
        const next = DOC_ROLES.find((role) => role === chosen);
        if (next !== undefined && next !== value) onChange(next);
      }}
    >
      <SelectTrigger
        aria-labelledby={labelledBy}
        title={disabled ? disabledReason : undefined}
        className={
          disabled ? "w-element cursor-not-allowed" : "w-element cursor-pointer"
        }
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_ITEMS.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            className="cursor-pointer"
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function WorkspacePersonRow(props: {
  person: WorkspacePerson;
  canChange: boolean;
  online: boolean;
  pending: boolean;
  refusal: string | null;
  onChangeRole(person: WorkspacePerson, role: DocRole): void;
}): ReactNode {
  const { person, canChange, online, pending, refusal, onChangeRole } = props;
  const nameId = useId();
  const meta =
    refusal === null ? undefined : <InlineRefusal sentence={refusal} />;
  const trailing = canChange ? (
    <WorkspaceRoleSelect
      value={person.role}
      labelledBy={nameId}
      disabled={!online || pending}
      disabledReason={!online ? WORKSPACE_WORDS.needsConnection : undefined}
      onChange={(next) => onChangeRole(person, next)}
    />
  ) : (
    <span className="text-meta text-fg-muted">
      {SHARING_WORDS.roles[person.role]}
    </span>
  );
  return (
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
      meta={meta}
      trailing={[trailing]}
    >
      <span id={nameId} className="truncate font-medium">
        {person.name}
      </span>
    </Row>
  );
}

export function PeopleGroup(props: WorkspaceSettingsGroupProps): ReactNode {
  const { workspaceId, canChange, online } = props;
  const headingId = useId();
  const services = useServices();
  const workspaces = useWorkspaces(services.api, services.userId, true).data;
  const workspaceName =
    workspaces?.find((ws) => ws.id === workspaceId)?.name ?? workspaceId;

  const holder = useMemo(
    () => workspacePeopleHolder(services.userId, workspaceId),
    [services.userId, workspaceId],
  );
  const cached = useSubscribable(holder.state);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );

  const api = useMemo(
    () =>
      createWorkspaceApi({
        fetch,
        token: () => sessionTokenOf(services.userId),
      }),
    [services.userId],
  );

  const reload = useCallback(async (): Promise<void> => {
    const answer = await api.people(workspaceId);
    if (answer.ok) {
      holder.set({ people: answer.value.people, loadError: false });
    } else {
      holder.set({ people: holder.state.get().people, loadError: true });
    }
  }, [api, holder, workspaceId]);

  const setRefusal = useCallback((userId: string, sentence: string | null) => {
    setRefusals((prev) => {
      const next = new Map(prev);
      if (sentence === null) next.delete(userId);
      else next.set(userId, sentence);
      return next;
    });
  }, []);

  const changeRole = useCallback(
    (person: WorkspacePerson, nextRole: DocRole) => {
      if (!canChange || !online) return;
      const previousRole = person.role;
      setPendingUserId(person.userId);
      void api
        .changeRole(workspaceId, person.userId, nextRole)
        .then(async (answer) => {
          setPendingUserId(null);
          if (!answer.ok) {
            const personFirst = firstName(person.name);
            setRefusal(
              person.userId,
              answer.code === "invalid"
                ? WORKSPACE_WORDS.needsAnOwner(personFirst, workspaceName)
                : WORKSPACE_WORDS.couldNotChangeRole(personFirst),
            );
            return;
          }
          setRefusal(person.userId, null);
          const current = holder.state.get().people;
          if (current !== null) {
            holder.set({
              people: current.map((entry) =>
                entry.userId === person.userId
                  ? { ...entry, role: nextRole }
                  : entry,
              ),
              loadError: false,
            });
          }
          const messageId = "workspace.role_changed";
          services.reverses.set(messageId, () => {
            void api
              .changeRole(workspaceId, person.userId, previousRole)
              .then((reverted) => {
                if (reverted.ok) void reload();
              });
          });
          services.messages.push({
            id: messageId,
            text: WORKSPACE_WORDS.roleChanged(
              firstName(person.name),
              workspaceName,
              SHARING_WORDS.roles[nextRole],
            ),
            actions: [
              { label: SHARING_WORDS.undo, commandId: "settings.undo" },
            ],
            lifetime: "reverse",
            ownWork: false,
          });
          await reload();
        });
    },
    [
      api,
      canChange,
      holder,
      online,
      reload,
      services.messages,
      services.reverses,
      setRefusal,
      workspaceId,
      workspaceName,
    ],
  );

  const { people, loadError } = cached;

  return (
    <section
      data-tour="workspace:people"
      aria-labelledby={headingId}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-title">
          {WORKSPACE_WORDS.groups.people}
        </h2>
        <p className="text-ui text-fg-muted">
          {WORKSPACE_WORDS.peopleScope(workspaceName)}
        </p>
      </div>
      {loadError ? (
        <InlineRefusal
          sentence={
            people === null
              ? WORKSPACE_WORDS.couldNotLoad(WORKSPACE_WORDS.groups.people)
              : WORKSPACE_WORDS.couldNotLoadCached(
                  WORKSPACE_WORDS.groups.people,
                )
          }
          onRetry={() => void reload()}
        />
      ) : null}
      {people === null ? null : people.length === 0 ? (
        <p className="text-ui text-fg-muted">{WORKSPACE_WORDS.nothingSetUp}</p>
      ) : (
        <div className="divide-y divide-line rounded-surface border border-line bg-raised">
          {people.map((person) => (
            <WorkspacePersonRow
              key={person.userId}
              person={person}
              canChange={canChange}
              online={online}
              pending={pendingUserId === person.userId}
              refusal={refusals.get(person.userId) ?? null}
              onChangeRole={changeRole}
            />
          ))}
        </div>
      )}
    </section>
  );
}
