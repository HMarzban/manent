import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Api } from "../api.ts";
import { focusHeading } from "../focus.ts";
import { safeNext } from "../session.ts";
import type { TabPerson } from "../session.ts";
import { TEXT, pageTitle } from "../text.ts";

const RETRY_PEOPLE_MS = 2000;

export function ChooseScreen(props: {
  api: Api;
  person: TabPerson | null;
  setPerson: (person: TabPerson) => void;
  next: string | null;
}) {
  const { api, person, setPerson } = props;
  const next = safeNext(props.next);
  const navigate = useNavigate();
  const [unreachable, setUnreachable] = useState(false);

  const people = useQuery({
    queryKey: ["people"],
    queryFn: api.people,
    refetchInterval: (query) =>
      query.state.status === "error" ? RETRY_PEOPLE_MS : false,
  });

  const choose = useMutation({
    mutationFn: api.signIn,
    onSuccess: async (result) => {
      setUnreachable(result.status === "unreachable");
      if (result.status === "unknown_person") await people.refetch();
      if (result.status !== "ok") return;
      setPerson(result.person);
      await navigate({ href: next });
    },
  });

  useEffect(() => {
    document.title = pageTitle(TEXT.chooseTitle, null);
    focusHeading(document);
  }, []);

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 tabIndex={-1} className="text-2xl font-semibold outline-none">
        {TEXT.chooseTitle}
      </h1>
      <p className="mt-2 text-neutral-600">{TEXT.chooseHint}</p>
      {(people.isError || unreachable) && (
        <p
          role="alert"
          className="mt-4 rounded bg-amber-100 p-3 text-amber-900"
        >
          {TEXT.chooseUnreachable}
        </p>
      )}
      {people.isPending && <p className="mt-4">{TEXT.loading}</p>}
      <ul className="mt-4 grid gap-2">
        {(people.data ?? []).map((candidate) => (
          <li key={candidate.id}>
            <button
              type="button"
              disabled={choose.isPending}
              onClick={() => choose.mutate(candidate.id)}
              className="flex w-full items-baseline gap-3 rounded border border-neutral-300 p-3 text-left hover:bg-neutral-100"
            >
              <span className="font-medium">{candidate.name}</span>
              <span className="text-neutral-600">{candidate.role}</span>
              {person?.userId === candidate.id && (
                <span className="ml-auto text-sm font-medium">
                  {TEXT.current}
                </span>
              )}
            </button>
          </li>
        ))}
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
