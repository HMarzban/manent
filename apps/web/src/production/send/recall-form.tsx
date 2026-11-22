// The Send screen's Recall form: the pages a correction replaces, sent to the same people as the issue, with its
// memo; one request, which the authority applies once.
import { recallMemo } from "@manent/revisions";
import type { RevisionSource } from "@manent/revisions";
import { PRODUCTION_WORDS, useSubscribable } from "@manent/ui";
import type { Message } from "@manent/ui";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { SendForm, SendFormProps } from "../../screens/send/forms.ts";
import { SendFrame } from "../../screens/send/send-frame.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useProductionContext } from "../../state/production-context.store.ts";
import { useProductionServices } from "../live-services.ts";
import type { ProductionServices } from "../services.ts";
import { deviceDay } from "../state-facts.ts";
import { MemoRow } from "./memo-row.tsx";
import { Packet } from "./packet.tsx";
import {
  useBackToPage,
  useLiveProduction,
  useProductionSend,
} from "./send-state.ts";
import { RecallWhatRow } from "./what-row.tsx";

const WORDS = PRODUCTION_WORDS;

function sentCorrectedMessage(name: string, people: number): Message {
  return {
    id: "production.sent_corrected",
    text: WORDS.sentCorrected(name, people),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}

/**
 * The revisions a correction's pages are headed and marked by: the recalled one last, as corrected on `day`, with
 * the marks made since its issue; the active revision goes out under it.
 */
function correctionSources(
  sources: readonly RevisionSource[],
  day: string,
): readonly RevisionSource[] {
  const active = sources.at(-1);
  const recalled = sources.at(-2);
  if (active === undefined || recalled === undefined) return sources;
  return [
    ...sources.slice(0, -2),
    {
      ...recalled,
      name: WORDS.corrected(recalled.name),
      day,
      marks: new Map([...recalled.marks, ...active.marks]),
    },
  ];
}

function Recall(props: {
  docId: string;
  services: ProductionServices;
}): ReactNode {
  const { docId, services } = props;
  const { messages } = useServices();
  const { now } = useEnvironment();
  const back = useBackToPage(docId);
  const state = useSubscribable(services.client.current())?.state ?? null;
  const waiting = useSubscribable(services.client.waiting());
  const { live } = useLiveProduction(docId, services);
  const today = deviceDay(now());
  const sources = useMemo(
    () => (live === null ? [] : correctionSources(live.sources, today)),
    [live, today],
  );
  const request = useProductionSend("production.recall");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const [memo, setMemo] = useState<string | null>(null);
  // the latest issued revision, which Recall withdraws, and its issue
  const set = state?.sets.at(-2);
  const issue = state?.issues.find(
    (held) => held.kind === "issue" && held.setId === set?.setId,
  );
  if (set === undefined || issue === undefined) return null;
  const { name } = set;
  const p = live?.locked.pagination ?? null;
  const changed = live?.revisedPages ?? [];
  // in page order, whatever order they were ticked in
  const pages = changed.filter((label) => ticked.has(label));
  // a memo names at least one page: with none ticked there is nothing to say yet
  const shownMemo =
    memo ??
    (pages.length === 0 ? "" : recallMemo(name, today, pages, issue.issuedOn));
  const tick = (label: string, on: boolean): void => {
    const next = new Set(ticked);
    if (on) next.add(label);
    else next.delete(label);
    setTicked(next);
  };
  const recall = (): void =>
    request.send(
      (key) =>
        services.client.recall({
          key,
          setId: set.setId,
          pages,
          memo: shownMemo,
          issuedOn: today,
          files: [...issue.files],
          tint: issue.tint,
        }),
      {
        ok: (response) => {
          messages.push(
            sentCorrectedMessage(name, response.issue.recipientUserIds.length),
          );
          back();
        },
        // the state the server answers says what happened, and the form has no words for it
        refused: () => {},
      },
    );
  return (
    <SendFrame
      title={WORDS.recallTitle(name)}
      aside={null}
      rows={[
        {
          id: "what",
          content: (
            <RecallWhatRow
              name={name}
              pages={changed}
              ticked={ticked}
              onTick={tick}
            />
          ),
        },
        { id: "to", content: WORDS.people(issue.recipientUserIds.length) },
        {
          id: "memo",
          content: (
            <MemoRow memo={shownMemo} edited={memo !== null} onEdit={setMemo} />
          ),
        },
      ]}
      pages={
        p === null || live === null ? null : (
          <Packet
            p={p}
            labels={pages}
            name={WORDS.corrected(name)}
            sources={sources}
          />
        )
      }
      action={{
        label: WORDS.recallButton(name),
        busyLabel: WORDS.recallingButton(name),
        busy: request.busy,
        disabledReason: request.disabledReason(waiting),
        problem: request.problem,
        progress: null,
        cancel: null,
        run: live === null || pages.length === 0 ? null : recall,
      }}
    />
  );
}

function RecallBody(props: SendFormProps): ReactNode {
  const services = useProductionServices(props.docId);
  return services === null ? null : (
    <Recall docId={props.docId} services={services} />
  );
}

export const recallForm: SendForm = {
  id: "recall",
  useAvailable(docId) {
    const production = useProductionContext(docId);
    return production !== null && production.recallOpen && production.canIssue;
  },
  Body: RecallBody,
};
