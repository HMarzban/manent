// Speech synthesis runner for Read aloud: caret following and clean stop on Stop, Escape, navigation, edit, or end.
import {
  ORIGIN_LOAD,
  ORIGIN_REMOTE,
  ORIGIN_SYSTEM,
  scriptBody,
} from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import { WRITING_TOOLS_WORDS, messageFor } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import {
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import type { LiveEditor } from "../editor-host/live-editor.ts";
import type { HandlerDeps } from "../handlers/index.ts";
import { readAloudActions } from "../state/read-aloud.store.ts";
import { availableVoices, planSpeech } from "./voices.ts";
import type { SpeechBlock, SpokenLine } from "./voices.ts";

interface ActiveSession {
  stop(cancelSynth?: boolean): void;
}

let activeSession: ActiveSession | null = null;

function caretBlockIdOf(editor: LiveEditor): string | null {
  const id: unknown = editor.view.state.selection.$from.parent.attrs.id;
  return typeof id === "string" && id !== "" ? id : null;
}

function editorBlocksOf(docId: string, editor: LiveEditor): SpeechBlock[] {
  const pagination = livePagination(docId);
  if (pagination !== null) {
    return pagination.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      text: block.text,
    }));
  }
  return blocksOf(scriptBody(editor.doc).materialize()).map((block) => ({
    id: block.attrs.id ?? null,
    type: block.attrs.type,
    text: blockText(block),
  }));
}

function readerBlocksFromDom(): SpeechBlock[] {
  if (typeof document === "undefined") return [];
  const frame = document.querySelector("[data-reader-frame]");
  if (frame === null) return [];
  const nodes = frame.querySelectorAll<HTMLElement>("[data-type]");
  const blocks: SpeechBlock[] = [];
  for (const node of nodes) {
    blocks.push({
      id: node.getAttribute("data-id"),
      type: node.getAttribute("data-type") ?? "action",
      text: node.textContent ?? "",
    });
  }
  return blocks;
}

function scrollReaderBlock(blockId: string): void {
  if (typeof document === "undefined") return;
  const frame = document.querySelector("[data-reader-frame]");
  if (frame === null) return;
  const target = frame.querySelector<HTMLElement>(
    `[data-id=${JSON.stringify(blockId)}]`,
  );
  target?.scrollIntoView({ block: "nearest" });
}

function isInsideDialog(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("[role='dialog'], [role='alertdialog']") !== null
  );
}

/** Stops any active Read aloud session and clears active state. */
export function stopReadAloud(): void {
  const current = activeSession;
  if (current !== null) {
    current.stop(true);
    return;
  }
  globalThis.speechSynthesis?.cancel();
  readAloudActions.setInactive();
}

/** Starts reading the open script (from the caret's scene) or reader draft aloud. */
export function startReadAloud(deps: HandlerDeps): void {
  const shell = deps.shellState();
  const docId = shell.docId;
  const readerMode = docId === null && shell.screen === "reader";
  const editor = docId === null ? null : liveEditor(docId);
  runReadAloud({
    messages: deps.services.messages,
    docId,
    editor,
    readerMode,
    stillActive: () => {
      const nowShell = deps.shellState();
      if (docId !== null)
        return nowShell.docId === docId && liveEditor(docId) === editor;
      return (
        nowShell.screen === "reader" &&
        (typeof document === "undefined" ||
          document.querySelector("[data-reader-frame]") !== null)
      );
    },
    goToBlock: (blockId) => {
      deps.services.editor.run({ kind: "go_to", blockId, offset: 0 });
    },
  });
}

/** Starts reading the mounted `/r/$token` reader frame aloud, even when viewing anonymously (`services === null`). */
export function startReaderReadAloud(messages: MessageQueue): void {
  runReadAloud({
    messages,
    docId: null,
    editor: null,
    readerMode: true,
    stillActive: () =>
      typeof document === "undefined" ||
      document.querySelector("[data-reader-frame]") !== null,
    goToBlock: scrollReaderBlock,
  });
}

function runReadAloud(options: {
  readonly messages: MessageQueue;
  readonly docId: string | null;
  readonly editor: LiveEditor | null;
  readonly readerMode: boolean;
  readonly stillActive: () => boolean;
  readonly goToBlock: (blockId: string) => void;
}): void {
  const { messages, docId, editor, readerMode, stillActive, goToBlock } =
    options;
  stopReadAloud();

  const synth = globalThis.speechSynthesis;
  const voices = synth === undefined ? [] : availableVoices("en");
  readAloudActions.refreshVoices("en");

  if (
    synth === undefined ||
    typeof SpeechSynthesisUtterance === "undefined" ||
    voices.length === 0
  ) {
    messages.push(
      messageFor({
        kind: "command_unavailable",
        label: WRITING_TOOLS_WORDS.readAloud,
        reason: WRITING_TOOLS_WORDS.readAloudNoVoice,
      }),
    );
    return;
  }

  let blocks: readonly SpeechBlock[];
  let caretBlockId: string | null = null;
  if (editor !== null && docId !== null) {
    blocks = editorBlocksOf(docId, editor);
    caretBlockId = caretBlockIdOf(editor);
  } else if (readerMode) {
    blocks = readerBlocksFromDom();
  } else {
    return;
  }

  const lines: readonly SpokenLine[] = planSpeech({
    blocks,
    voices,
    caretBlockId,
  });
  if (lines.length === 0) return;

  let stopped = false;
  const cleanups: (() => void)[] = [];

  const stop = (cancelSynth = true): void => {
    if (stopped) return;
    stopped = true;
    if (activeSession === session) activeSession = null;
    for (const cleanup of cleanups.splice(0)) cleanup();
    if (cancelSynth) synth.cancel();
    readAloudActions.setInactive();
  };

  const session: ActiveSession = { stop };
  activeSession = session;
  readAloudActions.setActive(docId);

  if (typeof window !== "undefined") {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.isComposing) return;
      if (isInsideDialog(event.target)) return;
      stop(true);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    cleanups.push(() =>
      window.removeEventListener("keydown", onKeyDown, { capture: true }),
    );

    const onPopState = (): void => {
      stop(true);
    };
    window.addEventListener("popstate", onPopState);
    cleanups.push(() => window.removeEventListener("popstate", onPopState));
  }

  if (editor !== null && docId !== null) {
    cleanups.push(
      subscribeLiveEditors(() => {
        if (liveEditor(docId) !== editor) stop(true);
      }),
    );
    cleanups.push(
      editor.doc.subscribe((_update, origin) => {
        if (
          origin !== ORIGIN_REMOTE &&
          origin !== ORIGIN_LOAD &&
          origin !== ORIGIN_SYSTEM
        )
          stop(true);
      }),
    );
  }

  const speakAt = (index: number): void => {
    if (stopped) return;
    if (index >= lines.length) {
      stop(false);
      return;
    }
    if (!stillActive()) {
      stop(true);
      return;
    }

    const line = lines[index];
    if (line === undefined) {
      stop(false);
      return;
    }
    if (line.blockId !== null) {
      if (docId !== null) goToBlock(line.blockId);
      else scrollReaderBlock(line.blockId);
    }

    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.voice = line.voice;
    utterance.lang = line.voice.lang;
    utterance.addEventListener(
      "end",
      () => {
        if (stopped) return;
        speakAt(index + 1);
      },
      { once: true },
    );
    utterance.addEventListener(
      "error",
      () => {
        if (stopped) return;
        stop(false);
      },
      { once: true },
    );
    synth.speak(utterance);
  };

  synth.cancel();
  speakAt(0);
}
