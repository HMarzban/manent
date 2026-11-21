import { Row, SurfaceState, TimingProvider } from "@manent/ui";
import type { SurfaceRenderers, SurfaceStateValue } from "@manent/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { SignInChoice } from "@manent/sync-protocol";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { Api } from "../api.ts";
import { focusHeading } from "../focus.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { CloseGuard } from "../services/sync/close-guard.ts";
import { CloseQuestion } from "../services/sync/close-question.tsx";
import { choosePerson } from "../session.ts";
import { FactsContext } from "../state/bridge-contexts.ts";
import type { TabPerson } from "../session.ts";
import { TEXT, pageTitle } from "../text.ts";

const RETRY_CHOICES_MS = 2000;
const PLACEHOLDER_ROWS = 6;

/** Rows of the final height, with no words. */
function placeholders(): ReactNode {
  return (
    <ul className="flex flex-col gap-1">
      {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
        <li key={i} aria-hidden="true" data-placeholder>
          <Row meta="">{""}</Row>
        </li>
      ))}
    </ul>
  );
}

// with no list to draw, the alert above it says why when there is a reason
const nothing = (): ReactNode => null;
const WITHOUT_LIST = {
  loading: placeholders,
  empty: nothing,
  problem: nothing,
  offline: nothing,
  read_only: nothing,
  no_access: nothing,
} satisfies Omit<SurfaceRenderers, "ready">;

function People(props: {
  choices: readonly SignInChoice[];
  chosenUserId: string | null;
  disabled: boolean;
  onChoose(choice: SignInChoice): void;
}): ReactNode {
  return (
    <ul className="flex flex-col gap-1">
      {props.choices.map((choice) => {
        const chosen = props.chosenUserId === choice.userId;
        return (
          <li key={choice.userId}>
            {/* a row is not a control: the button around it is, so its name and its aria-current are on one element */}
            <button
              type="button"
              disabled={props.disabled}
              onClick={() => props.onChoose(choice)}
              aria-current={chosen ? "true" : undefined}
              className="w-full rounded-control text-start aria-[current=true]:bg-selected"
            >
              <Row
                meta={choice.title}
                currentLabel={chosen ? TEXT.chosen : undefined}
              >
                {choice.name}
              </Row>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Back(props: { next: string }): ReactNode {
  const navigate = useNavigate();
  return (
    <a
      href={props.next}
      onClick={(event) => {
        event.preventDefault();
        void navigate({ href: props.next });
      }}
      className="self-start text-ui underline"
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
}): ReactNode {
  const { api, person, setPerson, next } = props;
  const { now, schedule } = useEnvironment();
  // before a person is chosen the chooser is drawn outside the shell, which times every other surface
  const timing = useMemo(() => ({ now, schedule }), [now, schedule]);
  const [loadingSince] = useState(now);
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

  const state: SurfaceStateValue =
    choices.data !== undefined
      ? { kind: choices.data.length === 0 ? "empty" : "ready" }
      : choices.isError
        ? { kind: "problem", reason: "unreachable" }
        : { kind: "loading", sinceMs: loadingSince };
  const render: SurfaceRenderers = {
    ...WITHOUT_LIST,
    ready: () => (
      <People
        choices={choices.data ?? []}
        chosenUserId={person?.userId ?? null}
        disabled={choose.isPending}
        onChoose={(choice) => choose.mutate(choice)}
      />
    ),
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      <h1 tabIndex={-1} className="text-display outline-none">
        {TEXT.chooseTitle}
      </h1>
      <p className="text-ui text-fg-muted">{TEXT.chooseHint}</p>
      {(choices.isError || unreachable) && (
        <p
          role="alert"
          className="rounded-control bg-subtle p-3 text-ui text-attention"
        >
          {TEXT.chooseUnreachable}
        </p>
      )}
      <TimingProvider timing={timing}>
        <SurfaceState surface="choose" state={state} render={render} />
      </TimingProvider>
      {person && <Back next={next} />}
      {person && <SwitchGuard into={guard} />}
    </div>
  );
}
