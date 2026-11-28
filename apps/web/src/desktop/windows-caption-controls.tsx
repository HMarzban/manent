// Right-aligned Windows caption controls (Minimise, Maximise/Restore, Close) for the custom desktop titlebar.
import type { WindowAction } from "@manent/sync-protocol";
import { DESKTOP_WORDS } from "@manent/ui";
import type { ReactNode } from "react";

function MinimizeGlyph(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
    >
      <path d="M0.5 5.5H9.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function MaximizeGlyph(props: { readonly maximised: boolean }): ReactNode {
  if (props.maximised) {
    return (
      <svg
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
      >
        <path
          d="M2.5 2.5V0.5H9.5V7.5H7.5"
          stroke="currentColor"
          strokeWidth="1"
        />
        <rect
          x="0.5"
          y="2.5"
          width="7"
          height="7"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
    >
      <rect
        x="0.5"
        y="0.5"
        width="9"
        height="9"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function CloseGlyph(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
    >
      <path
        d="M1 1L9 9M9 1L1 9"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function WindowsCaptionControls(props: {
  readonly maximised: boolean;
  readonly closeOnly?: boolean;
  readonly onAction: (action: WindowAction) => void;
}): ReactNode {
  const { maximised, closeOnly = false, onAction } = props;
  const maxLabel = maximised
    ? DESKTOP_WORDS.restoreWindow
    : DESKTOP_WORDS.maximizeWindow;
  return (
    <div
      data-slot="windows-controls"
      className="mn-windowbar-no-drag flex h-full shrink-0 items-stretch"
    >
      {closeOnly ? null : (
        <>
          <button
            type="button"
            className="mn-windowbar-btn"
            aria-label={DESKTOP_WORDS.minimizeWindow}
            title={DESKTOP_WORDS.minimizeWindow}
            onClick={() => onAction("minimize")}
          >
            <MinimizeGlyph />
          </button>
          <button
            type="button"
            className="mn-windowbar-btn"
            aria-label={maxLabel}
            title={maxLabel}
            onClick={() => onAction("toggle_maximize")}
          >
            <MaximizeGlyph maximised={maximised} />
          </button>
        </>
      )}
      <button
        type="button"
        className="mn-windowbar-btn mn-windowbar-btn-close"
        aria-label={DESKTOP_WORDS.closeWindow}
        title={DESKTOP_WORDS.closeWindow}
        onClick={() => onAction("close")}
      >
        <CloseGlyph />
      </button>
    </div>
  );
}
