import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { SignInChoice } from "@manent/sync-protocol";
import { useEffect, useState } from "react";
import type { Api } from "../api.ts";
import { focusHeading } from "../focus.ts";
import { choosePerson } from "../session.ts";
import type { TabPerson } from "../session.ts";
import { TEXT, pageTitle } from "../text.ts";

const RETRY_CHOICES_MS = 2000;
/** How long the chooser shows nothing before its placeholder rows. */
const PLACEHOLDER_DELAY_MS = 150;
const PLACEHOLDER_ROWS = 6;

const ROW = "flex w-full items-baseline gap-3 rounded border p-3 text-left";

export function ChooseScreen(props: {
  api: Api;
  person: TabPerson | null;
  setPerson: (person: TabPerson) => void;
  next: string;
}) {
  const { api, person, setPerson, next } = props;
  const navigate = useNavigate();
  const [unreachable, setUnreachable] = useState(false);
  const [waited, setWaited] = useState(false);

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
    const timer = setTimeout(() => setWaited(true), PLACEHOLDER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 tabIndex={-1} className="text-2xl font-semibold outline-none">
        {TEXT.chooseTitle}
      </h1>
      <p className="mt-2 text-neutral-600">{TEXT.chooseHint}</p>
      {(choices.isError || unreachable) && (
        <p
          role="alert"
          className="mt-4 rounded bg-amber-100 p-3 text-amber-900"
        >
          {TEXT.chooseUnreachable}
        </p>
      )}
      <ul className="mt-4 grid gap-2">
        {choices.isPending &&
          waited &&
          Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
            <li key={i} aria-hidden="true" data-placeholder>
              <div className={`${ROW} border-neutral-200 bg-neutral-100`}>
                <span className="block h-6" />
              </div>
            </li>
          ))}
        {(choices.data ?? []).map((choice) => {
          const chosen = person?.userId === choice.userId;
          return (
            <li key={choice.userId}>
              <button
                type="button"
                disabled={choose.isPending}
                onClick={() => choose.mutate(choice)}
                aria-current={chosen ? "true" : undefined}
                className={`${ROW} hover:bg-neutral-100 ${chosen ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-300"}`}
              >
                <span className="font-medium">{choice.name}</span>{" "}
                <span className="text-neutral-600">{choice.title}</span>
                {chosen && (
                  <>
                    {" "}
                    <span className="ml-auto text-ui font-medium">
                      {TEXT.chosen}
                    </span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {person && (
        <a
          href={next}
          onClick={(event) => {
            event.preventDefault();
            void navigate({ href: next });
          }}
          className="mt-6 inline-block underline"
        >
          {TEXT.back}
        </a>
      )}
    </div>
  );
}
