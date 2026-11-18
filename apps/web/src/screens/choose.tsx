import { Row, SurfaceState, TimingProvider } from "@manent/ui";
import type { SurfaceRenderers, SurfaceStateValue } from "@manent/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { SignInChoice } from "@manent/sync-protocol";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Api } from "../api.ts";
import { focusHeading } from "../focus.ts";
import { useEnvironment } from "../services/context.tsx";
import { choosePerson } from "../session.ts";
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

export function ChooseScreen(props: {
  api: Api;
  person: TabPerson | null;
  setPerson: (person: TabPerson) => void;
  next: string;
}): ReactNode {
  const { api, person, setPerson, next } = props;
  const navigate = useNavigate();
  const { now, schedule } = useEnvironment();
  // before a person is chosen the chooser is drawn outside the shell, which times every other surface
  const timing = useMemo(() => ({ now, schedule }), [now, schedule]);
  const [loadingSince] = useState(now);
  const [unreachable, setUnreachable] = useState(false);

  const choices = useQuery({
    queryKey: ["choices"],
    queryFn: api.choices,
    refetchInterval: (query) =>
      query.state.status === "error" ? RETRY_CHOICES_MS : false,
  });

  const choose = useMutation({
    mutationFn: (choice: SignInChoice) => choosePerson(choice, api),
    onSuccess: async (result) => {
      setUnreachable(!result.ok && result.reason === "unreachable");
      if (!result.ok) {
        if (result.reason === "unknown_user") await choices.refetch();
        return;
      }
      setPerson(result.person);
      await navigate({ href: next });
    },
  });

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
    ready: () => (
      <ul className="flex flex-col gap-1">
        {(choices.data ?? []).map((choice) => {
          const chosen = person?.userId === choice.userId;
          return (
            <li key={choice.userId}>
              {/* a row is not a control: the button around it is, so its name and its aria-current are on one element */}
              <button
                type="button"
                disabled={choose.isPending}
                onClick={() => choose.mutate(choice)}
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
    ),
    loading: placeholders,
    empty: nothing,
    problem: nothing,
    offline: nothing,
    read_only: nothing,
    no_access: nothing,
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
      {person && (
        <a
          href={next}
          onClick={(event) => {
            event.preventDefault();
            void navigate({ href: next });
          }}
          className="self-start text-ui underline"
        >
          {TEXT.back}
        </a>
      )}
    </div>
  );
}
