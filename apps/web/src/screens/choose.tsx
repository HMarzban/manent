import {
  BRAND_WORDS,
  ManentMark,
  Skeleton,
  SurfaceState,
  TimingProvider,
  buttonVariants,
} from "@manent/ui";
import type { SurfaceRenderers, SurfaceStateValue } from "@manent/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { SignInChoice } from "@manent/sync-protocol";
import { CloudExclamationPointIcon } from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { Api } from "../api.ts";
import { AiPledge } from "../account/ai-pledge.tsx";
import { focusHeading } from "../focus.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { CloseGuard } from "../services/sync/close-guard.ts";
import { CloseQuestion } from "../services/sync/close-question.tsx";
import { choosePerson } from "../session.ts";
import { FactsContext } from "../state/bridge-contexts.ts";
import type { TabPerson } from "../session.ts";
import { TEXT, pageTitle } from "../text.ts";
import {
  CHOOSE_GRID_COMPACT,
  CHOOSE_GRID_SPLIT,
  PeopleGrid,
} from "./choose/people-grid.tsx";
import {
  PersonaSpotlight,
  StudioPillars,
} from "./choose/persona-spotlight.tsx";
import { StudioFooter } from "./choose/studio-footer.tsx";
import { ThemeToggle } from "./choose/theme-toggle.tsx";

const RETRY_CHOICES_MS = 2000;
const PLACEHOLDER_CARDS = 6;

/** Cards of the final size and anatomy, with no words. */
function Placeholders(props: { compact: boolean }): ReactNode {
  return (
    <ul className={props.compact ? CHOOSE_GRID_COMPACT : CHOOSE_GRID_SPLIT}>
      {Array.from({ length: PLACEHOLDER_CARDS }, (_, i) => (
        <li
          key={i}
          aria-hidden="true"
          data-placeholder
          className="flex min-h-[5.5rem] items-start gap-3.5 rounded-surface border border-line bg-raised p-4"
        >
          <Skeleton className="size-avatar-lg shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
            <Skeleton className="h-4 w-28 rounded-micro" />
            <Skeleton className="h-3.5 w-44 max-w-full rounded-micro" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// with no list to draw, the alert above it says why when there is a reason
const nothing = (): ReactNode => null;
const WITHOUT_LIST = {
  empty: nothing,
  problem: nothing,
  offline: nothing,
  read_only: nothing,
  no_access: nothing,
} satisfies Omit<SurfaceRenderers, "ready" | "loading">;

function Back(props: { next: string }): ReactNode {
  const navigate = useNavigate();
  return (
    <a
      href={props.next}
      onClick={(event) => {
        event.preventDefault();
        void navigate({ href: props.next });
      }}
      className={buttonVariants({
        variant: "ghost",
        className: "self-start text-fg-muted hover:text-fg",
      })}
    >
      {TEXT.back}
    </a>
  );
}

/** Inside the shell, where a person's documents may be open, a switch first asks their close guard. */
function SwitchGuard(props: { into: RefObject<CloseGuard | null> }): ReactNode {
  // the shell provides the services together with the bridge's contexts
  const inShell = useContext(FactsContext) !== null;
  return inShell ? <PersonSwitchGuard {...props} /> : null;
}

function PersonSwitchGuard(props: {
  into: RefObject<CloseGuard | null>;
}): ReactNode {
  const { guard } = useServices().closing;
  const { into } = props;
  useEffect(() => {
    into.current = guard;
    return () => {
      into.current = null;
    };
  }, [guard, into]);
  return <CloseQuestion />;
}

/** Goes on unless a document this device cannot save is open and the person keeps it. */
async function mayLeave(guard: CloseGuard | null): Promise<boolean> {
  return guard === null || (await guard.ask()) === "leave";
}

/**
 * The people to choose from, and choosing one: on success the tab has that person and goes on to `next`. In the desktop
 * app every person, You included, signs in at the node, which keeps the person's work and keeps You off the cloud.
 */
function useChooser(
  api: Api,
  setPerson: (person: TabPerson) => void,
  next: string,
  guard: RefObject<CloseGuard | null>,
) {
  const navigate = useNavigate();
  const { where } = useEnvironment();
  const [unreachable, setUnreachable] = useState(false);

  const choices = useQuery({
    queryKey: ["choices"],
    queryFn: api.choices,
    refetchInterval: (query) =>
      query.state.status === "error" ? RETRY_CHOICES_MS : false,
  });

  const choose = useMutation({
    mutationFn: (choice: SignInChoice) =>
      where.shell === "desktop"
        ? api.signIn(choice.userId)
        : choosePerson(choice, api),
    onSuccess: async (result) => {
      setUnreachable(!result.ok && result.reason === "unreachable");
      if (!result.ok) {
        if (result.reason === "unknown_user") await choices.refetch();
        return;
      }
      if (!(await mayLeave(guard.current))) return;
      setPerson(result.person);
      await navigate({ href: next });
    },
  });

  return { choices, choose, unreachable };
}

export function ChooseScreen(props: {
  api: Api;
  person: TabPerson | null;
  setPerson: (person: TabPerson) => void;
  next: string;
  compact?: boolean;
}): ReactNode {
  const { api, person, setPerson, next, compact = false } = props;
  const { now, schedule } = useEnvironment();
  // before a person is chosen the chooser is drawn outside the shell, which times every other surface
  const timing = useMemo(() => ({ now, schedule }), [now, schedule]);
  const [loadingSince] = useState(now);
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const guard = useRef<CloseGuard | null>(null);
  const { choices, choose, unreachable } = useChooser(
    api,
    setPerson,
    next,
    guard,
  );

  useEffect(() => {
    document.title = pageTitle(TEXT.chooseTitle, null);
    focusHeading(document);
  }, []);

  const list = choices.data ?? [];
  const state: SurfaceStateValue =
    choices.data !== undefined
      ? { kind: choices.data.length === 0 ? "empty" : "ready" }
      : choices.isError
        ? { kind: "problem", reason: "unreachable" }
        : { kind: "loading", sinceMs: loadingSince };

  const activeChoice =
    list.find((c) => c.userId === (hoveredUserId ?? person?.userId)) ??
    list[0] ??
    null;
  const pendingUserId = choose.isPending
    ? (choose.variables?.userId ?? null)
    : null;
  const showStudio =
    !compact && state.kind === "ready" && activeChoice !== null;

  const render: SurfaceRenderers = {
    ...WITHOUT_LIST,
    loading: () => <Placeholders compact={compact} />,
    ready: () => (
      <div
        className="mn-choose-split animate-in fade-in-0 duration-(--dur-fast) ease-out"
        data-split={showStudio ? "two" : undefined}
      >
        <div className="flex min-w-0 flex-col">
          <PeopleGrid
            choices={list}
            chosenUserId={person?.userId ?? null}
            spotlightUserId={hoveredUserId}
            pendingUserId={pendingUserId}
            disabled={choose.isPending}
            compact={compact}
            onChoose={(choice) => choose.mutate(choice)}
            onSpotlight={setHoveredUserId}
          />
          {!compact && person === null && <StudioPillars />}
        </div>
        {showStudio && (
          <PersonaSpotlight choice={activeChoice} choices={list} />
        )}
      </div>
    ),
  };

  return (
    <div
      className="mn-choose-stage flex min-h-full w-full flex-1 flex-col"
      data-compact={compact ? "" : undefined}
    >
      <div
        className={
          compact
            ? "mn-choose-shell mx-auto flex w-full max-w-content-wide flex-col px-6 py-8"
            : "mn-choose-shell mx-auto flex w-full max-w-[68rem] flex-col px-6 py-10 sm:py-12"
        }
      >
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="mn-choose-brand-badge inline-flex size-9 shrink-0 items-center justify-center rounded-surface">
              <ManentMark className="size-6 text-fg" decorative />
            </span>
            {showStudio && (
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 animate-in fade-in-0 duration-(--dur-fast) ease-out">
                <span className="text-heading tracking-tight text-fg">
                  {BRAND_WORDS.name}
                </span>
                <span
                  aria-hidden="true"
                  className="hidden h-3.5 w-px self-center bg-line sm:inline-block"
                />
                <span className="hidden text-meta text-fg-muted sm:inline">
                  {BRAND_WORDS.tagline}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showStudio && <ThemeToggle />}
            {person && <Back next={next} />}
          </div>
        </div>

        <h1 tabIndex={-1} className="text-display text-fg outline-none">
          {TEXT.chooseTitle}
        </h1>
        <p className="mt-1.5 max-w-[38rem] text-ui text-fg-muted">
          {TEXT.chooseHint}
        </p>

        {(choices.isError || unreachable) && (
          <p
            role="alert"
            className="mt-5 flex items-center gap-2.5 rounded-surface border border-line bg-raised px-3.5 py-2.5 text-ui text-attention"
          >
            <CloudExclamationPointIcon
              aria-hidden="true"
              className="size-icon-lg shrink-0"
            />
            {TEXT.chooseUnreachable}
          </p>
        )}

        <div className="mt-6">
          <TimingProvider timing={timing}>
            <SurfaceState surface="choose" state={state} render={render} />
          </TimingProvider>
        </div>

        <div className="mt-8 flex flex-col gap-5 border-t border-line pt-6">
          {showStudio && <StudioFooter />}
          <AiPledge />
        </div>
        {person && <SwitchGuard into={guard} />}
      </div>
    </div>
  );
}
