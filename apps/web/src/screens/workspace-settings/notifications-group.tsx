// Workspace settings Notifications group: Webhook, Slack and Email delivery settings.
import { NOTIFICATION_ADAPTERS } from "@manent/sync-protocol";
import type {
  NotificationAdapter,
  NotificationAdapterStatus,
} from "@manent/sync-protocol";
import {
  NOTIFICATIONS_WORDS,
  TooltipProvider,
  WORKSPACE_WORDS,
  useSubscribable,
} from "@manent/ui";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createNotificationsApi,
  validateAddressInput,
  workspaceNotificationsHolder,
} from "../../integrations/notifications-api.ts";
import type { AddressValidationError } from "../../integrations/notifications-api.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useWorkspaces } from "../../services/use-workspaces.ts";
import { readPerson } from "../../session.ts";
import type { WorkspaceSettingsGroupProps } from "./groups.ts";
import {
  InlineRefusal,
  MemberAdapterRow,
  OwnerAdapterCard,
} from "./notifications-parts.tsx";

const EMPTY_DRAFTS: Readonly<Record<NotificationAdapter, string>> =
  Object.freeze({
    webhook: "",
    slack: "",
    email: "",
  });

function orderedAdapters(
  adapters: readonly NotificationAdapterStatus[],
): readonly NotificationAdapterStatus[] {
  return NOTIFICATION_ADAPTERS.map(
    (adapter) =>
      adapters.find((entry) => entry.adapter === adapter) ?? {
        adapter,
        on: false,
        available: adapter !== "email",
        hint: null,
        state: null,
        nextTryAt: null,
      },
  );
}

function refusalSentence(reason: AddressValidationError, raw: string): string {
  switch (reason) {
    case "not_web_address":
      return NOTIFICATIONS_WORDS.notWebAddress(raw);
    case "not_slack_address":
      return NOTIFICATIONS_WORDS.notSlackAddress;
    case "not_email_address":
      return NOTIFICATIONS_WORDS.notEmailAddress(raw);
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

export function NotificationsGroup(
  props: WorkspaceSettingsGroupProps,
): ReactNode {
  const { workspaceId, canChange, online } = props;
  const headingId = useId();
  const services = useServices();
  const environment = useEnvironment();
  const workspaces = useWorkspaces(services.api, services.userId, true).data;
  const workspaceName =
    workspaces?.find((ws) => ws.id === workspaceId)?.name ?? workspaceId;

  const holder = useMemo(
    () => workspaceNotificationsHolder(services.userId, workspaceId),
    [services.userId, workspaceId],
  );
  const cached = useSubscribable(holder.state);

  const api = useMemo(
    () =>
      createNotificationsApi({
        fetch,
        token: () => {
          const person = readPerson(environment.tabStorage);
          return person?.userId === services.userId ? person.token : null;
        },
      }),
    [environment.tabStorage, services.userId],
  );

  const [drafts, setDrafts] =
    useState<Readonly<Record<NotificationAdapter, string>>>(EMPTY_DRAFTS);
  const [busyAdapter, setBusyAdapter] = useState<NotificationAdapter | null>(
    null,
  );
  const [refusals, setRefusals] = useState<
    ReadonlyMap<NotificationAdapter, string>
  >(() => new Map());

  useEffect(() => {
    setDrafts(EMPTY_DRAFTS);
    setBusyAdapter(null);
    setRefusals(new Map());
  }, [workspaceId]);

  const reload = useCallback(async (): Promise<void> => {
    const answer = await api.get(workspaceId);
    holder.set(
      answer.ok
        ? { adapters: answer.value.adapters, loadError: false }
        : { adapters: holder.state.get().adapters, loadError: true },
    );
  }, [api, holder, workspaceId]);

  useEffect(() => {
    if (online) void reload();
  }, [online, reload]);

  const setRefusal = useCallback(
    (adapter: NotificationAdapter, sentence: string | null) => {
      setRefusals((prev) => {
        const next = new Map(prev);
        if (sentence === null) next.delete(adapter);
        else next.set(adapter, sentence);
        return next;
      });
    },
    [],
  );

  const handleDraftChange = useCallback(
    (adapter: NotificationAdapter, value: string) => {
      setDrafts((prev) => ({ ...prev, [adapter]: value }));
      setRefusal(adapter, null);
    },
    [setRefusal],
  );

  const handleSave = useCallback(
    (adapter: NotificationAdapter) => {
      if (!canChange || !online) return;
      const raw = drafts[adapter].trim();
      const validated = validateAddressInput(adapter, raw);
      if (!validated.ok) {
        setRefusal(adapter, refusalSentence(validated.reason, raw));
        return;
      }
      setBusyAdapter(adapter);
      setRefusal(adapter, null);
      void api.set(workspaceId, adapter, validated.address).then((answer) => {
        setBusyAdapter(null);
        if (!answer.ok) {
          setRefusal(adapter, NOTIFICATIONS_WORDS.couldNotSave);
          return;
        }
        holder.set({ adapters: answer.value.adapters, loadError: false });
        setDrafts((prev) => ({ ...prev, [adapter]: "" }));
        services.messages.push({
          id: `workspace.notifications.${adapter}.saved`,
          text: NOTIFICATIONS_WORDS.savedMessage(
            NOTIFICATIONS_WORDS.adapters[adapter],
          ),
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
      });
    },
    [
      api,
      canChange,
      drafts,
      holder,
      online,
      services.messages,
      setRefusal,
      workspaceId,
    ],
  );

  const handleRemove = useCallback(
    (adapter: NotificationAdapter) => {
      if (!canChange || !online) return;
      setBusyAdapter(adapter);
      setRefusal(adapter, null);
      void api.set(workspaceId, adapter, null).then((answer) => {
        setBusyAdapter(null);
        if (!answer.ok) {
          setRefusal(adapter, NOTIFICATIONS_WORDS.couldNotSave);
          return;
        }
        holder.set({ adapters: answer.value.adapters, loadError: false });
        services.messages.push({
          id: `workspace.notifications.${adapter}.removed`,
          text: NOTIFICATIONS_WORDS.removedMessage(
            NOTIFICATIONS_WORDS.adapters[adapter],
          ),
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
      });
    },
    [
      api,
      canChange,
      holder,
      online,
      services.messages,
      setRefusal,
      workspaceId,
    ],
  );

  const { adapters, loadError } = cached;

  if (!online && adapters === null) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <h2 id={headingId} className="text-title">
          {WORKSPACE_WORDS.groups.notifications}
        </h2>
        <p className="text-ui text-fg-muted">
          {WORKSPACE_WORDS.needsConnection}
        </p>
      </section>
    );
  }

  const ordered = adapters === null ? null : orderedAdapters(adapters);
  const allOff = ordered !== null && ordered.every((entry) => !entry.on);

  return (
    <TooltipProvider>
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-title">
            {WORKSPACE_WORDS.groups.notifications}
          </h2>
          <p className="text-ui text-fg-muted">
            {NOTIFICATIONS_WORDS.intro(workspaceName)}
          </p>
        </div>
        {!online ? (
          <p className="text-ui text-fg-muted">
            {WORKSPACE_WORDS.needsConnection}
          </p>
        ) : null}
        {loadError ? (
          <InlineRefusal
            sentence={
              adapters === null
                ? WORKSPACE_WORDS.couldNotLoad(
                    WORKSPACE_WORDS.groups.notifications,
                  )
                : WORKSPACE_WORDS.couldNotLoadCached(
                    WORKSPACE_WORDS.groups.notifications,
                  )
            }
            onRetry={online ? () => void reload() : undefined}
          />
        ) : null}
        {ordered === null ? null : !canChange ? (
          allOff ? (
            <p className="text-ui text-fg-muted">
              {WORKSPACE_WORDS.nothingSetUp}
            </p>
          ) : (
            <div className="divide-y divide-line rounded-surface border border-line bg-raised">
              {ordered.map((status) => (
                <MemberAdapterRow key={status.adapter} status={status} />
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            {ordered.map((status) => (
              <OwnerAdapterCard
                key={status.adapter}
                status={status}
                draft={drafts[status.adapter]}
                busy={busyAdapter === status.adapter}
                online={online}
                refusal={refusals.get(status.adapter) ?? null}
                onDraftChange={handleDraftChange}
                onSave={handleSave}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}
