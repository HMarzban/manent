// Client-side remote prompter operator and scroll state with smoothed server clock offset (ADR 0072).
import {
  parsePrompterOperatorChanged,
  parsePrompterScrollControl,
} from "@manent/sync-protocol";
import type {
  ControlKind,
  PrompterOperator,
  PrompterScrollState,
} from "@manent/sync-protocol";
import type { Clock, Subscribable } from "../ports/ports.ts";
import { createCell } from "./cell.ts";

/** Exponential moving average weight for server-to-local clock offset smoothing. */
const CLOCK_OFFSET_ALPHA = 0.25;

/** Remote scroll anchor plus smoothed `serverTime - localNow` offset in milliseconds. */
export interface PrompterRemoteScroll {
  readonly state: PrompterScrollState | null;
  readonly clockOffsetMs: number;
}

export interface PrompterControlState {
  readonly operator: Subscribable<PrompterOperator | null>;
  readonly scroll: Subscribable<PrompterRemoteScroll>;
  handleControl(kind: ControlKind, data: Uint8Array): void;
  /** Clears operator and scroll state on fresh snapshot/reconnect while keeping the learned clock offset. */
  resetForSnapshot(): void;
}

export function createPrompterControlState(clock: Clock): PrompterControlState {
  const operatorCell = createCell<PrompterOperator | null>(null);
  const scrollCell = createCell<PrompterRemoteScroll>({
    state: null,
    clockOffsetMs: 0,
  });
  let hasOffset = false;
  let offsetMs = 0;
  let lastSeq = -1;

  function sampleClockOffset(serverTime: number): number {
    const sample = serverTime - clock.now();
    if (!hasOffset) {
      hasOffset = true;
      offsetMs = sample;
    } else {
      offsetMs += CLOCK_OFFSET_ALPHA * (sample - offsetMs);
    }
    return offsetMs;
  }

  return {
    operator: operatorCell.view,
    scroll: scrollCell.view,
    handleControl(kind, data) {
      if (kind === "prompter_operator_changed") {
        const event = parsePrompterOperatorChanged(data);
        if (event === null) return;
        const nextOffset = sampleClockOffset(event.serverTime);
        const notifyOp = operatorCell.stage(event.operator);
        const curScroll = scrollCell.get();
        const notifyScroll =
          curScroll.clockOffsetMs === nextOffset
            ? null
            : scrollCell.stage({
                state: curScroll.state,
                clockOffsetMs: nextOffset,
              });
        notifyOp?.();
        notifyScroll?.();
        return;
      }
      if (kind === "prompter_scroll") {
        const event = parsePrompterScrollControl(data);
        if (event === null) return;
        if (event.scroll.seq < lastSeq) return;
        lastSeq = event.scroll.seq;
        const nextOffset = sampleClockOffset(event.serverTime);
        const notifyScroll = scrollCell.stage({
          state: event.scroll,
          clockOffsetMs: nextOffset,
        });
        notifyScroll?.();
      }
    },
    resetForSnapshot() {
      lastSeq = -1;
      const notifyOp = operatorCell.stage(null);
      const notifyScroll = scrollCell.stage({
        state: null,
        clockOffsetMs: offsetMs,
      });
      notifyOp?.();
      notifyScroll?.();
    },
  };
}
