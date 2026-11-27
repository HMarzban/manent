// Live Studio Desk folio preview and archival craft pillars for Choose who you are.
import type { SignInChoice } from "@manent/sync-protocol";
import { CHOOSE_WORDS, HiddenGemIcon } from "@manent/ui";
import type { ChooseSpotlightCopy } from "@manent/ui";
import {
  CompassIcon,
  FileTextIcon,
  LayersIcon,
  WifiOffIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { initialsOf } from "../../initials.ts";

function copyFor(choice: SignInChoice): ChooseSpotlightCopy {
  return CHOOSE_WORDS.personas[choice.userId] ?? CHOOSE_WORDS.fallback;
}

function revisionFor(userId: string): "white" | "blue" | "yellow" | "green" {
  switch (userId) {
    case "priya":
      return "blue";
    case "leo":
      return "yellow";
    case "ana":
      return "green";
    default:
      return "white";
  }
}

/** Miniature Courier Prime screenplay, rundown or blank sheet styled strictly via theme.css inside `.mn-pages`. */
function MiniatureSheet(props: {
  choice: SignInChoice;
  copy: ChooseSpotlightCopy;
  coWriters: readonly string[];
}): ReactNode {
  const { choice, copy, coWriters } = props;
  const id = choice.userId;

  if (id === "ana") {
    return (
      <div className="mn-choose-sheet">
        <div className="mn-choose-sheet-top">
          <span>{copy.sheetHeading}</span>
          <span>{copy.sheetPage}</span>
        </div>
        <div className="mn-choose-rundown">
          {CHOOSE_WORDS.rundownRows.map((row, index) => (
            <div
              key={row.code}
              className="mn-choose-rundown-row"
              data-live={index === 0 ? "true" : undefined}
            >
              <span>{row.code}</span>
              <span>{row.label}</span>
              <span>{row.time}</span>
            </div>
          ))}
          <div className="mn-choose-rundown-foot">
            <span>{CHOOSE_WORDS.rundownBadge}</span>
            <span>{CHOOSE_WORDS.rundownTotal}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!choice.registered || id === "you") {
    return (
      <div className="mn-choose-sheet" data-blank="true">
        <div className="mn-choose-sheet-top">
          <span />
          <span>{copy.sheetPage}</span>
        </div>
        <div className="mn-choose-slug">
          {CHOOSE_WORDS.blankOpening}
          <span className="mn-choose-caret" />
        </div>
        <div className="mn-choose-action">{copy.sheetLine}</div>
      </div>
    );
  }

  return (
    <div
      className="mn-choose-sheet"
      data-rev={id === "priya" ? "blue" : undefined}
    >
      <div className="mn-choose-sheet-top">
        {id === "dana" && coWriters.length > 0 ? (
          <span className="mn-choose-collab-row">
            {coWriters.slice(0, 2).map((initials, idx) => (
              <span
                key={initials}
                className="mn-choose-collab-pill"
                data-who={idx === 0 ? "1" : "2"}
              >
                {initials}
              </span>
            ))}
          </span>
        ) : (
          <span />
        )}
        <span>{copy.sheetPage}</span>
      </div>
      <div className="mn-choose-slug">{copy.sheetHeading}</div>
      <div className="mn-choose-action">
        {id === "priya" ? (
          <span className="mn-proof-removed">{copy.sheetLine}</span>
        ) : (
          copy.sheetLine
        )}
      </div>
      {copy.sheetSpeaker !== "" && (
        <div className="mn-choose-char">{copy.sheetSpeaker}</div>
      )}
      {copy.sheetDialogue !== "" && (
        <div className="mn-choose-dial">
          {id === "dana" ? (
            <span className="mn-proof-sel">{copy.sheetDialogue}</span>
          ) : id === "sam" || id === "priya" ? (
            <>
              <span className="mn-proof-added">{copy.sheetDialogue}</span>
              {id === "sam" && <span className="mn-choose-caret" />}
            </>
          ) : id === "leo" ? (
            <span className="mn-proof-comment">{copy.sheetDialogue}</span>
          ) : (
            copy.sheetDialogue
          )}
        </div>
      )}
      {id === "leo" && copy.sheetNote !== "" && (
        <div className="mn-choose-comment-card">{copy.sheetNote}</div>
      )}
    </div>
  );
}

/** Reactive right-column archival Studio Desk folio synced to whichever person card is hovered or focused. */
export function PersonaSpotlight(props: {
  choice: SignInChoice;
  choices: readonly SignInChoice[];
}): ReactNode {
  const { choice, choices } = props;
  const copy = copyFor(choice);
  const rev = revisionFor(choice.userId);
  const coWriters = choices
    .filter((c) => c.registered)
    .slice(0, 2)
    .map((c) => initialsOf(c.name));

  return (
    <aside
      aria-label={CHOOSE_WORDS.deskRegion}
      className="mn-choose-folio-wrap"
    >
      <div className="mn-choose-folio">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-chrome px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="flex shrink-0 gap-1">
              <span className="size-1.5 rounded-full bg-control" />
              <span className="size-1.5 rounded-full bg-control" />
              <span className="size-1.5 rounded-full bg-control" />
            </span>
            <span className="truncate text-micro font-medium text-fg-muted">
              {copy.deskTitle}
            </span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-micro text-fg-muted">
            <span
              aria-hidden="true"
              className="mn-choose-rev-chip"
              data-rev={rev}
            />
            <span>{copy.revisionLabel}</span>
          </span>
        </div>

        <div className="mn-choose-desk" aria-hidden="true">
          <div className="mn-pages">
            <div
              key={choice.userId}
              className="mn-choose-stack animate-in fade-in-0 slide-in-from-bottom-1 duration-(--dur-fast) ease-out"
            >
              <div className="mn-choose-sheet-back-2" />
              <div className="mn-choose-sheet-back-1" />
              <MiniatureSheet
                choice={choice}
                copy={copy}
                coWriters={coWriters}
              />
            </div>
          </div>
        </div>

        <div
          key={choice.userId}
          className="flex flex-col gap-2.5 border-t border-line bg-raised px-4 py-3.5 animate-in fade-in-0 duration-(--dur-fast) ease-out"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-ui font-semibold text-fg">
              {choice.name}
            </span>
            <span className="shrink-0 text-micro text-fg-muted">
              {copy.workspaceSummary}
            </span>
          </div>
          <p className="text-meta text-fg-muted">{copy.craftLine}</p>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <ul className="flex flex-wrap gap-1.5">
              {copy.tags.map((tag) => (
                <li key={tag} className="mn-tag">
                  {tag}
                </li>
              ))}
            </ul>
            <span
              aria-hidden="true"
              className="mn-gem-only shrink-0 text-fg-accent opacity-60"
            >
              <HiddenGemIcon palette="studio" className="size-icon" />
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

const PILLAR_ICONS = [FileTextIcon, WifiOffIcon, LayersIcon] as const;

/** Scannable archival capability pillars + quiet Tour cue shown on first visit. */
export function StudioPillars(): ReactNode {
  return (
    <div className="mt-6 flex flex-col gap-3 animate-in fade-in-0 duration-(--dur-fast) ease-out">
      <ul
        aria-label={CHOOSE_WORDS.pillarsLabel}
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
      >
        {CHOOSE_WORDS.pillars.map((pillar, index) => {
          const Icon = PILLAR_ICONS[index] ?? FileTextIcon;
          return (
            <li
              key={pillar.title}
              className="flex flex-col gap-1 rounded-surface border border-line bg-raised px-3.5 py-3"
            >
              <span className="flex items-center gap-1.5 text-meta font-semibold text-fg">
                <Icon
                  aria-hidden="true"
                  className="size-icon shrink-0 text-fg-accent"
                />
                <span>{pillar.title}</span>
              </span>
              <span className="text-meta text-fg-muted">{pillar.body}</span>
            </li>
          );
        })}
      </ul>
      <p className="flex items-center gap-2 text-meta text-fg-muted">
        <CompassIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-fg-accent"
        />
        <span>{CHOOSE_WORDS.tourTip}</span>
      </p>
    </div>
  );
}
