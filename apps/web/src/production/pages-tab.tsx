// The left panel's Pages tab, present once page numbers are locked: each page's label, its lock and its revision,
// a selection of pages, and the row menu that locks, letters or renumbers them.
import {
  Input,
  PRODUCTION_WORDS,
  Row,
  SurfaceState,
  VirtualRows,
  useCommandState,
  useSubscribable,
  useTiming,
} from "@manent/ui";
import { LockIcon } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { panelRenderers } from "../screens/document/panel-surface.tsx";
import type { PanelTab } from "../shell/panel-tab.ts";
import { useProductionContext } from "../state/production-context.store.ts";
import { useProductionServices } from "./live-services.ts";
import { PageRowMenu } from "./page-row-menu.tsx";
import { NOTHING_OPEN } from "./services.ts";
import type { ProductionServices } from "./services.ts";

// the row the editor publishes, named without the editor, which no component imports
type PageRow = NonNullable<ReturnType<ProductionServices["pages"]["row"]>>;

const WORDS = PRODUCTION_WORDS;
const READY = Object.freeze({ kind: "ready" });

function LockGlyph(): ReactNode {
  return (
    <span role="img" aria-label={WORDS.lockMarkerName} className="flex">
      <LockIcon aria-hidden="true" />
    </span>
  );
}

/** The labels of rows `from` to `to`, in page order, whichever comes first. */
function labelsBetween(
  services: ProductionServices,
  from: number,
  to: number,
): string[] {
  const labels: string[] = [];
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
    const row = services.pages.row(i);
    if (row !== null) labels.push(row.label);
  }
  return labels;
}

/** The row's new label; Enter sends it with every chosen page, Escape keeps the old one. */
function RenumberField(props: {
  services: ProductionServices;
  label: string;
}): ReactNode {
  const { services } = props;
  const { label } = useCommandState("production.renumber");
  const [value, setValue] = useState(props.label);
  const onKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key === "Escape") services.open.set(NOTHING_OPEN);
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = value.trim();
    if (next !== "" && next !== props.label)
      void services.client.pages({
        op: "renumber",
        labels: [...services.chosenPages.get()],
        label: next,
      });
    services.open.set(NOTHING_OPEN);
  };
  return (
    <Input
      ref={(input) => input?.focus({ preventScroll: true })}
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      className="h-control text-ui"
    />
  );
}

function PageLine(props: {
  row: PageRow;
  chosen: boolean;
  renumbering: boolean;
  services: ProductionServices;
  handle: ReactNode;
  onChoose: (() => void) | undefined;
}): ReactNode {
  const { row, chosen, services, handle } = props;
  const revision =
    row.revision === null
      ? []
      : [
          <span
            key="chip"
            data-rev={row.revision}
            aria-hidden="true"
            className="mn-rev-chip"
          />,
          <span key="name">{row.revisionName}</span>,
        ];
  return (
    <Row
      selected={chosen}
      leading={
        row.locked ? (
          <LockGlyph />
        ) : (
          <span aria-hidden="true" className="w-icon" />
        )
      }
      trailing={revision}
      menu={handle ?? undefined}
      onActivate={props.onChoose}
    >
      {props.renumbering ? (
        <RenumberField services={services} label={row.label} />
      ) : (
        <span className="tabular-nums">{row.label}</span>
      )}
    </Row>
  );
}

/** How a click chooses: alone, as a range from the last row chosen (Shift), or added and removed (Mod). */
type Pick = "alone" | "range" | "toggle";

function pickOf(event: KeyboardEvent | MouseEvent): Pick {
  if (event.shiftKey) return "range";
  return event.metaKey || event.ctrlKey ? "toggle" : "alone";
}

const indexOf = (target: EventTarget): number | null => {
  const item =
    target instanceof Element ? target.closest('[role="listitem"]') : null;
  return item === null ? null : Number(item.getAttribute("aria-posinset")) - 1;
};

function PagesList(props: {
  docId: string;
  services: ProductionServices;
}): ReactNode {
  const { services } = props;
  const { pages, chosenPages } = services;
  // the rows are read again on every publish
  const [, published] = useReducer((n: number) => n + 1, 0);
  useEffect(() => pages.subscribe(published), [pages]);
  const count = pages.count();
  const chosen = new Set(useSubscribable(chosenPages));
  const open = useSubscribable(services.open);
  const canLock = useProductionContext(props.docId)?.canLock === true;
  const { now } = useTiming();
  const [since] = useState(now);
  const anchor = useRef(0);
  const pick = useRef<Pick>("alone");
  const choose = (index: number, how: Pick): void => {
    const row = pages.row(index);
    if (row === null) return;
    if (how === "range") {
      chosenPages.set(labelsBetween(services, anchor.current, index));
      return;
    }
    anchor.current = index;
    if (how === "alone") chosenPages.set([row.label]);
    else
      chosenPages.set(
        labelsBetween(services, 0, count - 1).filter((label) =>
          label === row.label ? !chosen.has(label) : chosen.has(label),
        ),
      );
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    pick.current = pickOf(event);
    const index = indexOf(event.target);
    if (index === null || !canLock || event.target instanceof HTMLInputElement)
      return;
    // an extension with nothing chosen yet starts from the row it leaves
    const extending = pick.current === "range" && event.key.startsWith("Arrow");
    if (extending && chosen.size === 0) choose(index, "alone");
    if (event.key !== " ") return;
    event.preventDefault();
    choose(index, "toggle");
  };
  const renumbered = open.kind === "renumber" ? chosenPages.get()[0] : null;
  const renderRow = (index: number): ReactNode => {
    const row = pages.row(index);
    if (row === null) return null;
    const line = (handle: ReactNode): ReactNode => (
      <PageLine
        row={row}
        chosen={chosen.has(row.label)}
        renumbering={row.label === renumbered}
        services={services}
        handle={handle}
        onChoose={canLock ? () => choose(index, pick.current) : undefined}
      />
    );
    if (!canLock) return line(null);
    return (
      <PageRowMenu
        label={row.label}
        onOpen={() => {
          if (!chosen.has(row.label)) choose(index, "alone");
        }}
      >
        {line}
      </PageRowMenu>
    );
  };
  return (
    <SurfaceState
      surface="left_panel"
      state={count === 0 ? { kind: "loading", sinceMs: since } : READY}
      render={panelRenderers({
        ready: () => (
          <div
            className="h-full"
            onKeyDownCapture={onKeyDown}
            onClickCapture={(event) => {
              pick.current = pickOf(event);
            }}
          >
            <VirtualRows
              count={count}
              rowHeight="one"
              label={WORDS.pagesTab}
              renderRow={renderRow}
              onKeyMove={(index) => {
                if (pick.current === "range") choose(index, "range");
              }}
            />
          </div>
        ),
        empty: () => null,
      })}
    />
  );
}

export function PagesTab(props: { docId: string | null }): ReactNode {
  const services = useProductionServices(props.docId);
  if (props.docId === null || services === null) return null;
  return <PagesList docId={props.docId} services={services} />;
}

export const pagesTab: PanelTab<"pages"> = {
  id: "pages",
  useTab: (docId) => ({
    present: useProductionContext(docId ?? "")?.locked === true,
    label: WORDS.pagesTab,
  }),
  Tab: PagesTab,
};
