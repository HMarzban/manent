// The Checks row of Issue: each check a line with its mark and its sentence, and a check that needs attention with
// the way to it.
import type { ProductionCheck } from "@manent/revisions";
import { Button, PRODUCTION_WORDS, joinNames } from "@manent/ui";
import type { ReactNode } from "react";
import { CheckMark } from "../../send/check-mark.tsx";

const WORDS = PRODUCTION_WORDS;

/** Where a check that needs attention leads. */
export interface CheckActions {
  seePage(label: string): void;
  seeScene(scene: string): void;
  consolidate(labels: readonly string[]): void;
}

function sentenceOf(check: ProductionCheck): string {
  switch (check.kind) {
    case "numbers_unchanged":
      return WORDS.checkNumbersUnchanged;
    case "numbers_changed":
      return WORDS.checkNumbersChanged(joinNames(check.scenes));
    case "pages_intact":
      return WORDS.checkPagesIntact;
    case "pages_moved":
      return WORDS.checkPagesChanged(joinNames(check.pages));
    case "empty_page":
      return WORDS.checkEmpty(check.page);
    case "overflow":
      return WORDS.checkOverflow(check.page, check.next);
    case "fragments":
      return WORDS.checkFragments(check.first, check.last);
    case "omitted":
      return WORDS.checkOmitted(check.scenes);
  }
}

/** The button of a check that needs attention; null for one that passes. */
function actionOf(
  check: ProductionCheck,
  actions: CheckActions,
): { label: string; run(): void } | null {
  switch (check.kind) {
    case "numbers_unchanged":
    case "pages_intact":
      return null;
    case "numbers_changed":
    case "omitted":
      return {
        label: WORDS.seePage,
        run: () => actions.seeScene(check.scenes[0] ?? ""),
      };
    case "pages_moved":
      return {
        label: WORDS.seePage,
        run: () => actions.seePage(check.pages[0] ?? ""),
      };
    case "empty_page":
    case "overflow":
      return { label: WORDS.seePage, run: () => actions.seePage(check.page) };
    case "fragments":
      return {
        label: WORDS.consolidate,
        run: () => actions.consolidate(check.labels),
      };
  }
}

export function Checks(props: {
  checks: readonly ProductionCheck[];
  actions: CheckActions;
}): ReactNode {
  return (
    <ul className="flex flex-col gap-1">
      {props.checks.map((check, index) => {
        const action = actionOf(check, props.actions);
        return (
          <li key={index} className="flex flex-wrap items-start gap-2">
            <CheckMark ok={check.ok} />
            <span>{sentenceOf(check)}</span>
            {action === null ? null : (
              <Button variant="link" size="sm" onClick={action.run}>
                {action.label}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
