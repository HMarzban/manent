// The settings a document shows: the ones stored in it, with every requested value laid over them.
import { scriptSettings } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createSubscribable } from "../outbox/subscribable.ts";
import type { StoredSetting, Subscribable } from "../ports/ports.ts";

/**
 * A requested value is laid over the stored settings from its request until
 * its acknowledgement, and after that until every server update stored before
 * the acknowledgement is applied, since the server sends the stored value
 * first. A refused value is dropped at once. Every method shows the result.
 */
interface SettingsOverlay {
  readonly view: Subscribable<Readonly<Record<string, unknown>>>;
  request(entry: StoredSetting): void;
  /** `storedThrough`: the local sequence of the newest server update stored before this acknowledgement. */
  acknowledge(throughLocalSeq: number, storedThrough: number): void;
  refuse(localSeq: number): void;
  /** Every server update up to this local sequence is in the document. */
  applied(throughLocalSeq: number): void;
  /** The stored settings may have changed. */
  show(): void;
}

/** `release`: null until acknowledged, then the server update that must be applied first. */
interface Laid {
  localSeq: number;
  key: string;
  value: unknown;
  release: number | null;
}

/** Over the settings of `doc()`, read again each time, as the session may replace its document. */
export function createSettingsOverlay(doc: () => CrdtDoc): SettingsOverlay {
  let laid: Laid[] = [];
  let appliedThrough = 0;
  const view = createSubscribable<Readonly<Record<string, unknown>>>({});
  const show = (): void => {
    laid = laid.filter((l) => l.release === null || l.release > appliedThrough);
    const shown: Record<string, unknown> = scriptSettings(doc()).entries();
    for (const l of laid) shown[l.key] = l.value;
    view.set(shown);
  };
  return {
    view,
    request(entry) {
      const value: unknown = JSON.parse(entry.value);
      laid.push({
        localSeq: entry.localSeq,
        key: entry.key,
        value,
        release: null,
      });
      show();
    },
    acknowledge(throughLocalSeq, storedThrough) {
      laid = laid.map((l) =>
        l.release === null && l.localSeq <= throughLocalSeq
          ? { ...l, release: storedThrough }
          : l,
      );
      show();
    },
    refuse(localSeq) {
      laid = laid.filter((l) => l.localSeq !== localSeq);
      show();
    },
    applied(throughLocalSeq) {
      appliedThrough = Math.max(appliedThrough, throughLocalSeq);
      show();
    },
    show,
  };
}
