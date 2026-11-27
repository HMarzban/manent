// Layout-matched Studio Desk skeletons for /choose route loading and ChooseScreen's people-list loading state.
import { Skeleton } from "@manent/ui";
import type { ReactNode } from "react";

const PLACEHOLDER_CARDS = 6;
export const CHOOSE_GRID_SPLIT = "grid grid-cols-1 gap-3 sm:grid-cols-2";
export const CHOOSE_GRID_COMPACT =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 min-[68.75rem]:grid-cols-3";

const CARD_WIDTHS: readonly { readonly name: string; readonly role: string }[] =
  [
    { name: "w-24", role: "w-40" },
    { name: "w-28", role: "w-32" },
    { name: "w-24", role: "w-44" },
    { name: "w-24", role: "w-36" },
    { name: "w-24", role: "w-40" },
    { name: "w-14", role: "w-40" },
  ];

/** Zero-text miniature Studio Desk script folio skeleton matching PersonaSpotlight's exact proportions. */
function FolioSkeleton(): ReactNode {
  return (
    <div aria-hidden="true" className="mn-choose-folio-wrap">
      <div className="mn-choose-desk">
        <div className="mn-choose-desk-bar">
          <span className="flex items-center gap-2">
            <span className="mn-choose-dots">
              <span className="mn-choose-dot" />
              <span className="mn-choose-dot" />
              <span className="mn-choose-dot" />
            </span>
            <Skeleton className="h-3 w-36 rounded-micro" />
          </span>
          <Skeleton className="h-3 w-16 rounded-micro" />
        </div>

        <div className="mn-choose-folio-stage">
          <div className="mn-choose-sheet-stack">
            <div className="mn-choose-sheet-back-2" />
            <div className="mn-choose-sheet-back-1" />
            <div className="mn-pages">
              <div className="mn-choose-sheet flex flex-col gap-3">
                <div className="mn-choose-sheet-top">
                  <span className="flex items-center gap-1.5">
                    <Skeleton className="h-3.5 w-6 rounded-full" />
                    <Skeleton className="h-3.5 w-6 rounded-full" />
                  </span>
                  <Skeleton className="h-3 w-6 rounded-micro" />
                </div>
                <Skeleton className="h-3 w-44 max-w-full rounded-micro" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-2.5 w-full rounded-micro" />
                  <Skeleton className="h-2.5 w-3/4 rounded-micro" />
                </div>
                <div className="mt-1 flex flex-col items-center gap-1.5">
                  <Skeleton className="h-2.5 w-14 rounded-micro" />
                  <Skeleton className="h-2.5 w-3/5 rounded-micro" />
                  <Skeleton className="h-2.5 w-1/2 rounded-micro" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mn-choose-desk-foot">
          <div className="flex items-baseline justify-between gap-2">
            <Skeleton className="h-4 w-24 rounded-micro" />
            <Skeleton className="h-3 w-28 rounded-micro" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-full rounded-micro" />
            <Skeleton className="h-3 w-4/5 rounded-micro" />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="flex gap-1.5">
              <Skeleton className="h-5 w-20 rounded-micro" />
              <Skeleton className="h-5 w-20 rounded-micro" />
              <Skeleton className="h-5 w-16 rounded-micro" />
            </span>
            <Skeleton className="size-4 rounded-micro" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Layout-matched two-column Studio Desk skeleton for ChooseScreen's loading state.
 * Marks only the 6 person cards with `data-placeholder` so existing placeholder-count contracts stay exact.
 */
export function ChooseBodySkeleton(props: {
  readonly compact: boolean;
  readonly showPillars: boolean;
  readonly markPlaceholders?: boolean;
}): ReactNode {
  const { compact, showPillars, markPlaceholders = true } = props;
  return (
    <div
      className="mn-choose-split"
      data-split={compact ? undefined : "two"}
      data-choose-skeleton=""
    >
      <div className="flex min-w-0 flex-col">
        <ul className={compact ? CHOOSE_GRID_COMPACT : CHOOSE_GRID_SPLIT}>
          {Array.from({ length: PLACEHOLDER_CARDS }, (_, i) => {
            const widths = CARD_WIDTHS[i] ?? { name: "w-24", role: "w-36" };
            const isLast = i === PLACEHOLDER_CARDS - 1;
            return (
              <li
                key={i}
                aria-hidden="true"
                data-placeholder={markPlaceholders ? "" : undefined}
                className={
                  isLast
                    ? "flex min-h-[5.5rem] items-start gap-3.5 rounded-surface border border-dashed border-line-strong bg-desk p-4"
                    : "flex min-h-[5.5rem] items-start gap-3.5 rounded-surface border border-line bg-raised p-4"
                }
              >
                <Skeleton className="size-avatar-lg shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton
                      className={`h-4 ${widths.name} max-w-full rounded-micro`}
                    />
                    <Skeleton className="size-icon shrink-0 rounded-micro" />
                  </div>
                  <Skeleton
                    className={`h-3.5 ${widths.role} max-w-full rounded-micro`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        {!compact && showPillars ? (
          <div aria-hidden="true" className="mt-5 flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="mn-choose-pillar flex flex-col gap-2 rounded-surface p-3"
                >
                  <Skeleton className="h-3.5 w-24 rounded-micro" />
                  <Skeleton className="h-3 w-full rounded-micro" />
                  <Skeleton className="h-3 w-4/5 rounded-micro" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 px-1">
              <Skeleton className="size-icon shrink-0 rounded-full" />
              <Skeleton className="h-3 w-72 max-w-full rounded-micro" />
            </div>
          </div>
        ) : null}
      </div>
      {!compact ? <FolioSkeleton /> : null}
    </div>
  );
}

/** Route-level pending skeleton for `/choose` while the screen chunk loads, keeping the editorial desk backdrop seamless. */
export function ChooseRoutePending(): ReactNode {
  return (
    <div
      aria-busy="true"
      className="mn-choose-stage flex min-h-full w-full flex-1 flex-col"
    >
      <div
        aria-hidden="true"
        className="mn-choose-shell mx-auto flex w-full max-w-[68rem] flex-col px-6 py-10 sm:py-12"
      >
        <div className="mb-7 flex items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-surface" />
            <Skeleton className="h-4 w-20 rounded-micro" />
            <Skeleton className="hidden h-3.5 w-40 rounded-micro sm:block" />
          </div>
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>

        <Skeleton className="h-7 w-56 max-w-full rounded-micro" />
        <Skeleton className="mt-2.5 h-4 w-96 max-w-full rounded-micro" />

        <div className="mt-6">
          <ChooseBodySkeleton
            compact={false}
            showPillars
            markPlaceholders={false}
          />
        </div>

        <div className="mt-8 flex flex-col gap-5 border-t border-line pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-surface border border-line bg-raised px-3.5 py-3"
              >
                <Skeleton className="size-9 shrink-0 rounded-control" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-24 rounded-micro" />
                  <Skeleton className="h-3 w-36 max-w-full rounded-micro" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-3.5 w-80 max-w-full rounded-micro" />
            <Skeleton className="h-3.5 w-24 rounded-micro" />
          </div>
        </div>
      </div>
    </div>
  );
}
