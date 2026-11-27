// Workspace settings API keys group: lists keys, lets owners create (shown once) and revoke in place.
import type { ApiKeyView } from "@manent/sync-protocol";
import {
  API_KEYS_WORDS,
  Input,
  Skeleton,
  TooltipProvider,
  WORKSPACE_WORDS,
  useSubscribable,
} from "@manent/ui";
import { CloudOffIcon, KeyRoundIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import {
  createApiKeysApi,
  workspaceApiKeysHolder,
} from "../../integrations/api-keys-api.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { readPerson } from "../../session.ts";
import { SettingsNotice } from "../../settings-shell/settings-card.tsx";
import {
  ApiKeyRow,
  GuardedButton,
  InlineRefusal,
  ShownOncePanel,
} from "./api-keys-parts.tsx";
import type { ShownOnceKey } from "./api-keys-parts.tsx";
import type { WorkspaceSettingsGroupProps } from "./groups.ts";

export function ApiKeysGroup(props: WorkspaceSettingsGroupProps): ReactNode {
  const { workspaceId, canChange, online } = props;
  const headingId = useId();
  const nameInputId = useId();
  const services = useServices();
  const environment = useEnvironment();

  const holder = useMemo(
    () => workspaceApiKeysHolder(services.userId, workspaceId),
    [services.userId, workspaceId],
  );
  const cached = useSubscribable(holder.state);
  const api = useMemo(
    () =>
      createApiKeysApi({
        fetch,
        token: () => {
          const person = readPerson(environment.tabStorage);
          return person?.userId === services.userId ? person.token : null;
        },
      }),
    [environment.tabStorage, services.userId],
  );

  const [nameInput, setNameInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [createRefusal, setCreateRefusal] = useState<string | null>(null);
  // Plaintext key lives only in transient component state and clears on unmount or workspace switch.
  const [createdKey, setCreatedKey] = useState<ShownOnceKey | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeRefusals, setRevokeRefusals] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());

  const activeWorkspaceRef = useRef<string | null>(workspaceId);

  useEffect(() => {
    activeWorkspaceRef.current = workspaceId;
    setNameInput("");
    setCreating(false);
    setCreateRefusal(null);
    setCreatedKey(null);
    setConfirmingId(null);
    setRevokingId(null);
    setRevokeRefusals(new Map());
    return () => {
      activeWorkspaceRef.current = null;
    };
  }, [workspaceId]);

  const reload = useCallback(async (): Promise<void> => {
    const targetWorkspaceId = workspaceId;
    const answer = await api.list(targetWorkspaceId);
    if (activeWorkspaceRef.current !== targetWorkspaceId) return;
    holder.set(
      answer.ok
        ? { keys: answer.value.keys, loadError: false }
        : { keys: holder.state.get().keys, loadError: true },
    );
  }, [api, holder, workspaceId]);

  useEffect(() => {
    if (online) void reload();
  }, [online, reload]);

  const setRevokeRefusal = useCallback(
    (id: string, sentence: string | null) => {
      setRevokeRefusals((prev) => {
        const next = new Map(prev);
        if (sentence === null) next.delete(id);
        else next.set(id, sentence);
        return next;
      });
    },
    [],
  );

  const trimmedName = nameInput.trim();
  const createDisabled = !online || creating || trimmedName.length === 0;
  const createReason = !online
    ? WORKSPACE_WORDS.needsConnection
    : trimmedName.length === 0
      ? API_KEYS_WORDS.createNeedsName
      : undefined;

  const handleCreate = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canChange || createDisabled) return;
    const targetWorkspaceId = workspaceId;
    setCreating(true);
    setCreateRefusal(null);
    void api.create(targetWorkspaceId, trimmedName).then(async (answer) => {
      if (activeWorkspaceRef.current !== targetWorkspaceId) return;
      setCreating(false);
      if (!answer.ok) {
        setCreateRefusal(API_KEYS_WORDS.couldNotCreate);
        return;
      }
      setNameInput("");
      setCreatedKey({
        id: answer.value.row.id,
        name: answer.value.row.name,
        key: answer.value.key,
      });
      holder.set({
        keys: [answer.value.row, ...(holder.state.get().keys ?? [])],
        loadError: false,
      });
      await reload();
    });
  };

  const handleConfirmRevoke = useCallback(
    (entry: ApiKeyView): void => {
      if (!canChange || !online) return;
      const targetWorkspaceId = workspaceId;
      setRevokingId(entry.id);
      setRevokeRefusal(entry.id, null);
      void api.revoke(targetWorkspaceId, entry.id).then(async (answer) => {
        if (activeWorkspaceRef.current !== targetWorkspaceId) return;
        setRevokingId(null);
        if (!answer.ok) {
          setRevokeRefusal(entry.id, API_KEYS_WORDS.couldNotRevoke(entry.name));
          return;
        }
        setConfirmingId(null);
        setCreatedKey((prev) => (prev?.id === entry.id ? null : prev));
        const current = holder.state.get().keys;
        if (current !== null) {
          const at = environment.now();
          holder.set({
            keys: current.map((row) =>
              row.id === entry.id ? { ...row, revokedAt: at } : row,
            ),
            loadError: false,
          });
        }
        services.messages.push({
          id: "workspace.api_key_revoked",
          text: API_KEYS_WORDS.revokedMessage(entry.name),
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
        await reload();
      });
    },
    [
      api,
      canChange,
      environment,
      holder,
      online,
      reload,
      services.messages,
      setRevokeRefusal,
      workspaceId,
    ],
  );

  const { keys, loadError } = cached;
  const now = environment.now();

  if (!online && keys === null) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <h2 id={headingId} className="text-title">
          {WORKSPACE_WORDS.groups.api_keys}
        </h2>
        <EmptyHeroCard
          compact
          icon={<CloudOffIcon aria-hidden="true" className="size-5" />}
          description={WORKSPACE_WORDS.needsConnection}
        />
      </section>
    );
  }

  return (
    <TooltipProvider>
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-title">
            {WORKSPACE_WORDS.groups.api_keys}
          </h2>
          <p className="text-ui text-fg-muted">{API_KEYS_WORDS.intro}</p>
        </div>
        {!online ? (
          <SettingsNotice tone="offline">
            {WORKSPACE_WORDS.needsConnection}
          </SettingsNotice>
        ) : null}
        {online && loadError ? (
          <InlineRefusal
            sentence={
              keys === null
                ? WORKSPACE_WORDS.couldNotLoad(WORKSPACE_WORDS.groups.api_keys)
                : WORKSPACE_WORDS.couldNotLoadCached(
                    WORKSPACE_WORDS.groups.api_keys,
                  )
            }
            onRetry={online ? () => void reload() : undefined}
          />
        ) : null}
        {canChange ? (
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 rounded-surface border border-line bg-raised p-4"
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor={nameInputId}
                className="text-meta font-medium text-fg"
              >
                {API_KEYS_WORDS.nameLabel}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id={nameInputId}
                  value={nameInput}
                  onChange={(event) => {
                    setNameInput(event.currentTarget.value);
                    if (createRefusal !== null) setCreateRefusal(null);
                  }}
                  placeholder={API_KEYS_WORDS.namePlaceholder}
                  disabled={!online || creating}
                  maxLength={120}
                  className="min-w-0 flex-1 border-line-strong bg-well text-ui text-fg"
                />
                <GuardedButton
                  label={API_KEYS_WORDS.createKey}
                  type="submit"
                  variant="default"
                  disabled={createDisabled}
                  reason={createReason}
                />
              </div>
            </div>
            {createRefusal === null ? null : (
              <InlineRefusal sentence={createRefusal} />
            )}
          </form>
        ) : null}
        {canChange && createdKey !== null ? (
          <ShownOncePanel
            created={createdKey}
            mac={environment.where.platform === "mac"}
            schedule={environment.schedule}
          />
        ) : null}
        {keys === null ? (
          online && !loadError ? (
            <div aria-busy="true" className="flex flex-col gap-3">
              <Skeleton aria-hidden="true" className="h-control w-48" />
              <Skeleton
                aria-hidden="true"
                className="h-16 w-full rounded-surface"
              />
            </div>
          ) : null
        ) : keys.length === 0 ? (
          <EmptyHeroCard
            compact
            icon={<KeyRoundIcon aria-hidden="true" className="size-5" />}
            title={WORKSPACE_WORDS.nothingSetUp}
            description={
              canChange ? API_KEYS_WORDS.emptyOwner : API_KEYS_WORDS.emptyMember
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-surface border border-line bg-raised">
            <table className="w-full border-collapse text-start">
              <thead>
                <tr className="border-b border-line">
                  <th
                    scope="col"
                    className="px-4 py-2 text-meta font-medium text-fg-muted"
                  >
                    {API_KEYS_WORDS.columns.name}
                  </th>
                  <th
                    scope="col"
                    className="whitespace-nowrap px-4 py-2 text-meta font-medium text-fg-muted"
                  >
                    {API_KEYS_WORDS.columns.created}
                  </th>
                  <th
                    scope="col"
                    className="whitespace-nowrap px-4 py-2 text-meta font-medium text-fg-muted"
                  >
                    {API_KEYS_WORDS.columns.lastUsed}
                  </th>
                  {canChange ? <th scope="col" className="px-4 py-2" /> : null}
                </tr>
              </thead>
              {keys.map((entry) => (
                <ApiKeyRow
                  key={entry.id}
                  entry={entry}
                  now={now}
                  canChange={canChange}
                  online={online}
                  confirming={confirmingId === entry.id}
                  revoking={revokingId === entry.id}
                  busy={revokingId !== null}
                  refusal={revokeRefusals.get(entry.id) ?? null}
                  onStartRevoke={(id) => {
                    setRevokeRefusal(id, null);
                    setConfirmingId(id);
                  }}
                  onCancelRevoke={() => {
                    if (confirmingId !== null)
                      setRevokeRefusal(confirmingId, null);
                    setConfirmingId(null);
                  }}
                  onConfirmRevoke={handleConfirmRevoke}
                />
              ))}
            </table>
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}
