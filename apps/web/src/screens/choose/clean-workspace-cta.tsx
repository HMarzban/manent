// Prominent primary Clean Workspace CTA on Choose who you are: removes Demo and Tour for an empty personal desk.
import { CHOOSE_WORDS, cleanWorkspaceBodyFor } from "@manent/ui";
import { ArrowRightIcon, LoaderCircleIcon, SquarePenIcon } from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";

export function CleanWorkspaceCta(props: {
  readonly onDesktop: boolean;
  readonly pending: boolean;
  readonly dimmed: boolean;
  readonly disabled: boolean;
  readonly onEnter: () => void;
  readonly onSpotlight: (active: boolean) => void;
}): ReactNode {
  const { onDesktop, pending, dimmed, disabled, onEnter, onSpotlight } = props;
  const subtitleId = useId();
  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={disabled}
        aria-describedby={subtitleId}
        aria-busy={pending ? "true" : undefined}
        data-pending={pending ? "true" : undefined}
        data-dimmed={dimmed ? "true" : undefined}
        onClick={onEnter}
        onMouseEnter={() => onSpotlight(true)}
        onMouseLeave={() => onSpotlight(false)}
        onFocus={() => onSpotlight(true)}
        onBlur={() => onSpotlight(false)}
        className="mn-choose-clean-cta flex w-full items-center gap-3.5 p-4 text-start"
      >
        <span
          aria-hidden="true"
          className="mn-choose-clean-cta-icon flex size-10 shrink-0 items-center justify-center rounded-control"
        >
          <SquarePenIcon className="size-5 shrink-0" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-title font-semibold">
            {CHOOSE_WORDS.cleanWorkspaceTitle}
          </span>
          <span id={subtitleId} className="text-meta font-normal">
            {cleanWorkspaceBodyFor(onDesktop)}
          </span>
        </span>
        {pending ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-icon-lg shrink-0 animate-spin"
          />
        ) : (
          <ArrowRightIcon
            aria-hidden="true"
            className="mn-choose-clean-cta-arrow size-icon-lg shrink-0"
          />
        )}
      </button>
      {pending ? (
        <p role="status" className="sr-only">
          {CHOOSE_WORDS.cleanWorkspaceOpening}
        </p>
      ) : null}
    </div>
  );
}
