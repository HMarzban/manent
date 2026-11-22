// Details → Script → Production: Lock for production while page numbers are not locked; once they are, what they
// are locked with, each revision, oldest first, and Unlock and End production.
import { formatRevisionDate } from "@manent/revisions";
import type { ProductionState } from "@manent/sync-protocol";
import { CommandButton, PRODUCTION_WORDS, useSubscribable } from "@manent/ui";
import type { ReactNode } from "react";
import { useProductionContext } from "../state/production-context.store.ts";
import { useProductionServices } from "./live-services.ts";
import type { ProductionServices } from "./services.ts";
import { colourOf, defaultsLine, deviceDay } from "./state-facts.ts";

const WORDS = PRODUCTION_WORDS;

/** Each revision with its colour beside its name, so a colour is never the only sign. */
function Revisions(props: { state: ProductionState }): ReactNode {
  const { state } = props;
  const order = state.colourOrder.flatMap((colour) => colourOf(colour) ?? []);
  return (
    <>
      <p className="text-meta text-fg-muted">
        {defaultsLine(state.numbering, order)}
      </p>
      <ul className="flex flex-col gap-1 text-meta">
        {state.sets.map((set) => (
          <li key={set.setId} className="flex items-center gap-2">
            <span
              data-rev={colourOf(set.colour) ?? undefined}
              aria-hidden="true"
              className="mn-rev-chip"
            />
            {WORDS.revisionRow(
              set.name,
              formatRevisionDate(set.issuedOn ?? deviceDay(set.startedAt)),
              set.mark,
              set.fullDraft,
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Group(props: { services: ProductionServices }): ReactNode {
  const held = useSubscribable(props.services.client.current());
  const state = held?.state ?? null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-meta font-semibold">{WORDS.groupTitle}</h3>
      {state !== null && state.locked ? <Revisions state={state} /> : null}
      <div className="flex flex-wrap gap-2">
        <CommandButton id="production.lock" variant="outline" size="sm" />
        <CommandButton id="production.unlock" variant="outline" size="sm" />
        <CommandButton id="production.end" variant="outline" size="sm" />
      </div>
    </section>
  );
}

/** Nothing for a person who can neither lock nor see a lock, and while the script's production is not known. */
export function ProductionGroup(props: { docId: string }): ReactNode {
  const services = useProductionServices(props.docId);
  const production = useProductionContext(props.docId);
  if (services === null || production === null) return null;
  if (!production.locked && !production.canLock) return null;
  return <Group services={services} />;
}
