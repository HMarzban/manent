// The Send screen's Issue form: what changed, how and to whom it goes, its colour and memo, and the pages as they
// will go; one request, which the authority applies once.
import {
  formatMemoDate,
  memoText,
  productionChecks,
  revisionName,
} from "@manent/revisions";
import type {
  DocPeopleResponse,
  IssueFile,
  ProductionState,
} from "@manent/sync-protocol";
import {
  PRODUCTION_WORDS,
  SEND_WORDS,
  Skeleton,
  formatDay,
  formatTime,
  useSubscribable,
} from "@manent/ui";
import type { Message } from "@manent/ui";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { showPage, showScene } from "../../editor-host/production.ts";
import { useProductionFormAvailability } from "../../screens/send/forms.ts";
import type { SendForm, SendFormProps } from "../../screens/send/forms.ts";
import {
  PageTilesSkeleton,
  SendFormSkeleton,
  SendFrame,
} from "../../screens/send/send-frame.tsx";
import type { SendRow } from "../../screens/send/send-frame.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { Choices } from "../choices.tsx";
import { useProductionServices } from "../live-services.ts";
import type { ProductionServices } from "../services.ts";
import { colourOf, colourOrderStart, deviceDay } from "../state-facts.ts";
import { Checks } from "./checks.tsx";
import { MemoRow, memoOf } from "./memo-row.tsx";
import { Packet } from "./packet.tsx";
import {
  useBackToPage,
  useLiveProduction,
  useProductionSend,
} from "./send-state.ts";
import { IssueWhatRow, Tick } from "./what-row.tsx";
import type { IssueWhat } from "./what-row.tsx";

const WORDS = PRODUCTION_WORDS;
// the Colour row names the first five colours of the order
const ORDER_COLOURS = 5;

const FILE_CHOICES: readonly { value: IssueFile; label: string }[] =
  Object.freeze([
    { value: "pdf_marked", label: WORDS.pdfMarked },
    { value: "pdf_clean", label: WORDS.pdfClean },
  ]);

/** "last issued: BLUE, Mon 16 Nov"; null before the first issue. */
function lastIssuedLine(state: ProductionState): string | null {
  const [issue] = state.issues;
  const set = state.sets.find((held) => held.setId === issue?.setId);
  if (issue === undefined || set === undefined) return null;
  const when = `${formatDay(issue.issuedAt)} ${formatMemoDate(issue.issuedOn)}`;
  return WORDS.lastIssued(set.name.toUpperCase(), when);
}

function issuedMessage(name: string, people: number): Message {
  return {
    id: "production.issued",
    text: WORDS.issued(name, people),
    actions: [{ label: `Recall ${name}…`, commandId: "production.recall" }],
    lifetime: "reverse",
    ownWork: false,
  };
}

/**
 * The people with a role on the script, as the server lists them; null while loading. The person's last choice is kept
 * for those who still have one.
 */
function useScriptPeople(
  services: ProductionServices,
  keep: (people: DocPeopleResponse["people"]) => void,
): DocPeopleResponse["people"] | null {
  const [people, setPeople] = useState<DocPeopleResponse["people"] | null>(
    null,
  );
  useEffect(() => {
    let shown = true;
    setPeople(null);
    void services.people().then(
      (known) => {
        if (!shown) return;
        setPeople(known ?? []);
        if (known !== null) keep(known);
      },
      () => {
        if (shown) setPeople([]);
      },
    );
    return () => {
      shown = false;
    };
  }, [services]);
  return people;
}

/** The people with a role on the script, each a switch, none on the first time; a skeleton while loading. */
function Recipients(props: {
  people: DocPeopleResponse["people"] | null;
  chosen: ReadonlySet<string>;
  onChange(chosen: ReadonlySet<string>): void;
}): ReactNode {
  const { people, chosen, onChange } = props;
  if (people === null)
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <div aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-control w-28" />
          ))}
        </div>
        <Skeleton aria-hidden="true" className="h-3.5 w-16" />
      </div>
    );
  const toggle = (userId: string, on: boolean): void => {
    const next = new Set(chosen);
    if (on) next.add(userId);
    else next.delete(userId);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {people.map((person) => (
          <li key={person.userId}>
            <Tick
              label={person.name}
              on={chosen.has(person.userId)}
              onChange={(on) => toggle(person.userId, on)}
            />
          </li>
        ))}
      </ul>
      <p className="text-meta text-fg-muted">{WORDS.people(chosen.size)}</p>
    </div>
  );
}

function Issue(props: {
  docId: string;
  services: ProductionServices;
}): ReactNode {
  const { docId, services } = props;
  const { messages } = useServices();
  const { now, frame } = useEnvironment();
  const back = useBackToPage(docId);
  const state = useSubscribable(services.client.current())?.state ?? null;
  const waiting = useSubscribable(services.client.waiting());
  const scenes = useSubscribable(services.pages.revisedScenes).size;
  const { live, countAgain } = useLiveProduction(docId, services);
  const request = useProductionSend("production.issue");
  const [last] = useState(() => services.view.lastIssue());
  const [what, setWhat] = useState<IssueWhat>("changed");
  // a clean PDF the first time, then as last time
  const [file, setFile] = useState<IssueFile>(last?.files[0] ?? "pdf_clean");
  const [tint, setTint] = useState(last?.tint ?? false);
  const [recipients, setRecipients] = useState<ReadonlySet<string>>(
    () => new Set(last?.recipientUserIds ?? []),
  );
  const people = useScriptPeople(services, (known) =>
    setRecipients(
      (chosen) =>
        new Set(
          known.flatMap((held) =>
            chosen.has(held.userId) ? [held.userId] : [],
          ),
        ),
    ),
  );
  const [memo, setMemo] = useState<string | null>(null);
  const checks = useMemo(
    () =>
      live === null || state === null
        ? []
        : productionChecks({
            flat: live.flat,
            layout: live.locked,
            records: live.records,
            issued: state.sceneNumbers,
          }),
    [live, state],
  );
  if (state === null) return <SendFormSkeleton rows={5} />;
  const active = state.sets.at(-1);
  if (active === undefined) return null;
  const { name } = active;
  const p = live?.locked.pagination ?? null;
  const revised = live?.revisedPages ?? [];
  const pages =
    what === "full" ? (p?.pages.map((page) => page.label) ?? []) : revised;
  const added = revised.filter(
    (label) => p?.pages.find((page) => page.label === label)?.locked === false,
  );
  const issued = state.sets
    .slice(0, -1)
    .findLast((set) => set.issuedAt !== null);
  const since =
    live !== null && revised.length === 0 ? (issued?.name ?? name) : null;
  const order = state.colourOrder.flatMap((colour) => colourOf(colour) ?? []);
  const today = deviceDay(now());
  const shownMemo = memoOf(memo, pages, (labels) =>
    memoText(name, today, labels),
  );
  const rows: SendRow[] = [
    {
      id: "checks",
      content: (
        <Checks
          checks={checks}
          actions={{
            seePage: (label) => {
              back();
              frame(() => showPage(docId, label));
            },
            seeScene: (scene) => {
              back();
              frame(() => showScene(docId, scene));
            },
            consolidate: (labels) =>
              void services.client.pages({
                op: "consolidate",
                labels: [...labels],
                label: null,
              }),
          }}
        />
      ),
    },
    {
      id: "what",
      content: (
        <IssueWhatRow
          name={name}
          since={since}
          what={what}
          onWhat={setWhat}
          pages={revised.length}
          scenes={scenes}
          added={added}
        />
      ),
    },
    {
      id: "as",
      content: (
        <div className="flex flex-col gap-2">
          <Choices<IssueFile>
            label={SEND_WORDS.as}
            value={file}
            choices={FILE_CHOICES}
            onChoose={setFile}
          />
          <Tick label={WORDS.tintInFile} on={tint} onChange={setTint} />
        </div>
      ),
    },
    {
      id: "to",
      content: (
        <Recipients
          people={people}
          chosen={recipients}
          onChange={setRecipients}
        />
      ),
    },
    {
      id: "colour",
      content: (
        <div className="flex flex-col gap-1">
          <p className="whitespace-pre">
            {WORDS.colourLine(
              name.toUpperCase(),
              colourOrderStart(order, ORDER_COLOURS),
            )}
          </p>
          <p>
            {WORDS.startsNext(name, revisionName(order, active.ordinal + 1))}
          </p>
        </div>
      ),
    },
  ];
  if (shownMemo !== null)
    rows.push({
      id: "memo",
      content: (
        <MemoRow memo={shownMemo} edited={memo !== null} onEdit={setMemo} />
      ),
    });
  const issue = (sentMemo: string): void =>
    request.send(
      (key) =>
        services.client.issue({
          key,
          expectedOrdinal: active.ordinal,
          what,
          pages: [...pages],
          files: [file],
          tint,
          recipientUserIds: [...recipients],
          memo: sentMemo,
          issuedOn: today,
        }),
      {
        ok: (response) => {
          services.view.setLastIssue({
            files: [file],
            tint,
            recipientUserIds: [...recipients],
          });
          messages.push(
            issuedMessage(name, response.issue.recipientUserIds.length),
          );
          back();
        },
        refused: (code, body) => {
          // a changed answer restates the counts, and the person decides again
          if (code === "changed") {
            countAgain();
            return null;
          }
          const first = body?.issued ?? null;
          return code === "already_issued" && first !== null
            ? WORDS.alreadyIssued(
                first.byName,
                first.name,
                formatTime(first.issuedAt),
                first.nextName,
              )
            : WORDS.issueRefused(name);
        },
      },
    );
  return (
    <SendFrame
      title={WORDS.issueTitle(name)}
      aside={lastIssuedLine(state)}
      rows={rows}
      pages={
        p === null || live === null ? (
          <PageTilesSkeleton />
        ) : (
          <Packet p={p} labels={pages} name={name} sources={live.sources} />
        )
      }
      action={request.action(
        {
          label: WORDS.issueButton(name),
          busyLabel: WORDS.issuingButton(name),
        },
        waiting,
        live === null || since !== null || shownMemo === null
          ? null
          : () => issue(shownMemo),
      )}
    />
  );
}

function IssueBody(props: SendFormProps): ReactNode {
  const services = useProductionServices(props.docId);
  return services === null ? (
    <SendFormSkeleton rows={5} />
  ) : (
    <Issue docId={props.docId} services={services} />
  );
}

export const issueForm: SendForm = {
  id: "issue",
  useAvailable(docId) {
    return useProductionFormAvailability(docId, "issue");
  },
  Body: IssueBody,
};
