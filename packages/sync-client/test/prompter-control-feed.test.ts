import { expect, test } from "bun:test";
import {
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
  encodePrompterOperatorChanged,
  encodePrompterScrollControl,
} from "@manent/sync-protocol";
import type {
  Message,
  PrompterFeed,
  PrompterOperator,
  PrompterScrollState,
} from "@manent/sync-protocol";
import type { LeaderPort } from "../src/index.ts";
import { setup, subscribed, utf8, v } from "./scripted-server.ts";

const RUNDOWN = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cf";

const followerLeader: LeaderPort = {
  tabId: "tab-prompter-control",
  campaign: () => () => {},
  post() {},
  listen: () => () => {},
};

const OPERATOR: PrompterOperator = {
  userId: "u-ana",
  name: "Ana",
  deviceId: "dev-1",
  since: 10_500,
  expiresAt: 40_500,
};

const SCROLL_1: PrompterScrollState = {
  seq: 1,
  playing: true,
  linesPerSecond: 3.5,
  rowId: "row-1",
  lineOffset: 4,
  updatedAt: 11_500,
  operatorUserId: "u-ana",
  operatorDeviceId: "dev-1",
};

test("PrompterHandle exposes operator and scroll state with smoothed server clock offset and ignores stale/malformed frames", async () => {
  const base = await setup();
  let sendToClient: ((msg: Message) => void) | null = null;
  const feed: PrompterFeed = { v: 1, runOrder: [], stories: [] };

  base.network.serve({
    connected(end) {
      const decoder = createFrameDecoder({ from: "client" });
      const encoder = createFrameEncoder({ ids: createMessageIds() });
      const send = (message: Message): void => {
        for (const frame of encoder.encode(message)) end.send(frame);
      };
      sendToClient = send;
      end.onFrame = (frame) => {
        const res = decoder.push(frame);
        if (res.kind !== "message") return;
        const msg = res.message;
        if (msg.type === "HELLO") {
          send({
            type: "WELCOME",
            session: { userId: end.userId, name: end.userId },
            limits: {
              frameBytes: FRAME_LIMIT_BYTES,
              messageBytes: MESSAGE_LIMIT_BYTES,
            },
            server: { current: v(1, 2, 1, 1), min: v(1, 2, 1, 1) },
          });
        } else if (msg.type === "SUBSCRIBE" && msg.mode === "prompter") {
          send(subscribed(msg.docId, 1, 1));
          send({
            type: "VIEW_SNAPSHOT",
            docId: msg.docId,
            generation: 1,
            viewSeq: 1,
            content: utf8(JSON.stringify(feed)),
          });
        }
      };
    },
    createDocument: () => ({ ok: true }),
  });

  base.fake.advance(10_000); // local now = 10_000
  const client = base.makeClient({ leader: followerLeader });
  const handle = client.prompter(RUNDOWN);
  await base.settle();

  expect(handle.operator).toBeDefined();
  expect(handle.scroll).toBeDefined();
  const operatorCell = handle.operator!;
  const scrollCell = handle.scroll!;
  expect(operatorCell.get()).toBeNull();
  expect(scrollCell.get()).toEqual({ state: null, clockOffsetMs: 0 });

  const operators: (PrompterOperator | null)[] = [];
  const scrolls: { seq: number | null; offset: number }[] = [];
  operatorCell.subscribe(() => operators.push(operatorCell.get()));
  scrollCell.subscribe(() => {
    const cur = scrollCell.get();
    scrolls.push({ seq: cur.state?.seq ?? null, offset: cur.clockOffsetMs });
  });

  // First control frame: serverTime = 10_500 while localNow = 10_000 -> offset = +500 ms
  sendToClient!({
    type: "CONTROL",
    docId: RUNDOWN,
    generation: 1,
    seq: 1,
    kind: "prompter_operator_changed",
    data: encodePrompterOperatorChanged({
      docId: RUNDOWN,
      operator: OPERATOR,
      serverTime: 10_500,
    }),
  });
  await base.settle();
  expect(operatorCell.get()).toEqual(OPERATOR);
  expect(scrollCell.get().clockOffsetMs).toBe(500);

  // Second frame at localNow = 11_000, serverTime = 11_580 -> sample = 580, EMA = 500 + 0.25*(580-500) = 520
  base.fake.advance(1_000);
  sendToClient!({
    type: "CONTROL",
    docId: RUNDOWN,
    generation: 1,
    seq: 2,
    kind: "prompter_scroll",
    data: encodePrompterScrollControl({
      docId: RUNDOWN,
      scroll: SCROLL_1,
      serverTime: 11_580,
    }),
  });
  await base.settle();
  expect(scrollCell.get()).toEqual({
    state: SCROLL_1,
    clockOffsetMs: 520,
  });

  // Stale scroll frame with lower seq is ignored
  sendToClient!({
    type: "CONTROL",
    docId: RUNDOWN,
    generation: 1,
    seq: 3,
    kind: "prompter_scroll",
    data: encodePrompterScrollControl({
      docId: RUNDOWN,
      scroll: { ...SCROLL_1, seq: 0, playing: false },
      serverTime: 12_000,
    }),
  });
  // Malformed payloads are ignored without throwing
  sendToClient!({
    type: "CONTROL",
    docId: RUNDOWN,
    generation: 1,
    seq: 4,
    kind: "prompter_operator_changed",
    data: utf8("not-json"),
  });
  sendToClient!({
    type: "CONTROL",
    docId: RUNDOWN,
    generation: 1,
    seq: 5,
    kind: "prompter_scroll",
    data: utf8("{}"),
  });
  await base.settle();
  expect(operatorCell.get()).toEqual(OPERATOR);
  expect(scrollCell.get().state).toEqual(SCROLL_1);

  // Operator release clears operator
  sendToClient!({
    type: "CONTROL",
    docId: RUNDOWN,
    generation: 1,
    seq: 6,
    kind: "prompter_operator_changed",
    data: encodePrompterOperatorChanged({
      docId: RUNDOWN,
      operator: null,
      serverTime: 11_520,
    }),
  });
  await base.settle();
  expect(operatorCell.get()).toBeNull();
  expect(operators).toEqual([OPERATOR, null]);
  expect(scrolls.at(-1)?.seq).toBe(1);

  handle.close();
  await client.close();
});
