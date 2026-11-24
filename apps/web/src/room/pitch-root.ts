// The pitch popover's own React root, anchored to the state bar's Pitch button.
import { ROOM_WORDS } from "@manent/ui";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { PitchPopover } from "./pitch-popover.tsx";
import { submitPitch } from "./pitch.ts";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let nextSession = 0;

function ensureRoot(): Root {
  if (root !== null) return root;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  return root;
}

function stateBarPitchPlace(): { left: number; top: number } {
  const bar = document.querySelector("[data-region='state_bar']");
  const buttons = bar?.querySelectorAll("button") ?? [];
  let anchor: Element | null = null;
  for (const button of buttons) {
    if (button.textContent?.trim() === ROOM_WORDS.pitchAction) {
      anchor = button;
      break;
    }
  }
  const target = anchor ?? bar;
  if (target === null) return { left: 24, top: 64 };
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return { left: 24, top: 64 };
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.bottom + 6),
  };
}

export function openPitchPopover(options: {
  docId: string;
  blockId: string;
  authorUserId: string;
  onRestoreFocus(): void;
}): void {
  const sessionId = ++nextSession;
  const currentRoot = ensureRoot();
  const place = stateBarPitchPlace();

  const close = (): void => {
    if (sessionId !== nextSession) return;
    currentRoot.render(null);
    options.onRestoreFocus();
  };

  currentRoot.render(
    createElement(PitchPopover, {
      key: sessionId,
      place,
      onSubmit(text) {
        submitPitch({
          docId: options.docId,
          blockId: options.blockId,
          text,
          authorUserId: options.authorUserId,
        });
        close();
      },
      onClose: close,
    }),
  );
}
