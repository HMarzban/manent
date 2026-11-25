import { expect, test } from "bun:test";
import {
  CONTROL_KINDS,
  PROMPTER_DEFAULT_SPEED_LPS,
  PROMPTER_MAX_SPEED_LPS,
  PROMPTER_MIN_SPEED_LPS,
  PROMPTER_OPERATOR_TTL_MS,
  PROMPTER_SCROLL_ACTIONS,
  PROTOCOL_VERSION,
  decodeMessage,
  encodeMessage,
  encodePrompterOperatorChanged,
  encodePrompterScrollControl,
  isPrompterOperator,
  isPrompterScrollCommand,
  isPrompterScrollState,
  parsePrompterOperatorChanged,
  parsePrompterScrollControl,
} from "../src/index.ts";
import type {
  PrompterOperator,
  PrompterOperatorChanged,
  PrompterScrollCommand,
  PrompterScrollControlEvent,
  PrompterScrollState,
} from "../src/index.ts";
import { DOC_ID } from "./arbitraries.ts";

const OPERATOR: PrompterOperator = {
  userId: "u-ana",
  name: "Ana",
  deviceId: "dev-1",
  since: 1_700_000_000_000,
  expiresAt: 1_700_000_030_000,
};

const SCROLL_STATE: PrompterScrollState = {
  seq: 4,
  playing: true,
  linesPerSecond: 3.5,
  rowId: "row-2",
  lineOffset: 12.5,
  updatedAt: 1_700_000_005_000,
  operatorUserId: "u-ana",
  operatorDeviceId: "dev-1",
};

test("PROTOCOL_VERSION stays 1 and prompter control kinds append at indices 19 and 20", () => {
  expect(PROTOCOL_VERSION).toBe(1);
  expect(CONTROL_KINDS[19]).toBe("prompter_operator_changed");
  expect(CONTROL_KINDS[20]).toBe("prompter_scroll");
  expect(PROMPTER_OPERATOR_TTL_MS).toBe(30_000);
  expect(PROMPTER_SCROLL_ACTIONS).toEqual([
    "play",
    "pause",
    "speed",
    "cue",
    "nudge",
  ]);
  expect(PROMPTER_MIN_SPEED_LPS).toBe(0.5);
  expect(PROMPTER_MAX_SPEED_LPS).toBe(15);
  expect(PROMPTER_DEFAULT_SPEED_LPS).toBe(3);
});

test("prompter_operator_changed encodes, decodes and travels inside a CONTROL frame", () => {
  const taken: PrompterOperatorChanged = {
    docId: DOC_ID,
    operator: OPERATOR,
    serverTime: 1_700_000_000_000,
  };
  const released: PrompterOperatorChanged = {
    docId: DOC_ID,
    operator: null,
    serverTime: 1_700_000_010_000,
  };

  for (const event of [taken, released]) {
    const payload = encodePrompterOperatorChanged(event);
    expect(parsePrompterOperatorChanged(payload)).toEqual(event);

    const frame = encodeMessage({
      type: "CONTROL",
      docId: DOC_ID,
      generation: 1,
      seq: 1,
      kind: "prompter_operator_changed",
      data: payload,
    });
    const decoded = decodeMessage(frame, "server");
    expect(decoded?.type).toBe("CONTROL");
    if (decoded?.type === "CONTROL") {
      expect(decoded.kind).toBe("prompter_operator_changed");
      expect(parsePrompterOperatorChanged(decoded.data)).toEqual(event);
    }
  }
});

test("prompter_scroll encodes, decodes and travels inside a CONTROL frame", () => {
  const event: PrompterScrollControlEvent = {
    docId: DOC_ID,
    scroll: SCROLL_STATE,
    serverTime: 1_700_000_005_010,
  };
  const payload = encodePrompterScrollControl(event);
  expect(parsePrompterScrollControl(payload)).toEqual(event);

  const frame = encodeMessage({
    type: "CONTROL",
    docId: DOC_ID,
    generation: 2,
    seq: 9,
    kind: "prompter_scroll",
    data: payload,
  });
  const decoded = decodeMessage(frame, "server");
  expect(decoded?.type).toBe("CONTROL");
  if (decoded?.type === "CONTROL") {
    expect(decoded.kind).toBe("prompter_scroll");
    expect(parsePrompterScrollControl(decoded.data)).toEqual(event);
  }
});

const encodeJson = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

test("malformed operator and scroll control payloads return null", () => {
  expect(
    parsePrompterOperatorChanged(new Uint8Array([0xff, 0x00, 0x7b])),
  ).toBeNull();
  expect(
    parsePrompterOperatorChanged(
      encodeJson({ docId: "not-a-uuid", operator: null, serverTime: 1 }),
    ),
  ).toBeNull();
  expect(
    parsePrompterOperatorChanged(
      encodeJson({
        docId: DOC_ID,
        operator: { ...OPERATOR, expiresAt: OPERATOR.since - 1 },
        serverTime: 1,
      }),
    ),
  ).toBeNull();
  expect(
    parsePrompterOperatorChanged(
      encodeJson({ docId: DOC_ID, operator: null, serverTime: -1 }),
    ),
  ).toBeNull();

  expect(
    parsePrompterScrollControl(new TextEncoder().encode("not json")),
  ).toBeNull();
  expect(
    parsePrompterScrollControl(
      encodeJson({
        docId: DOC_ID,
        scroll: { ...SCROLL_STATE, linesPerSecond: 0 },
        serverTime: 1,
      }),
    ),
  ).toBeNull();
  expect(
    parsePrompterScrollControl(
      encodeJson({
        docId: DOC_ID,
        scroll: { ...SCROLL_STATE, seq: -1 },
        serverTime: 1,
      }),
    ),
  ).toBeNull();
  expect(
    parsePrompterScrollControl(
      encodeJson({
        docId: DOC_ID,
        scroll: { ...SCROLL_STATE, rowId: "" },
        serverTime: 1,
      }),
    ),
  ).toBeNull();
});

test("runtime guards accept valid DTOs and reject invalid commands", () => {
  expect(isPrompterOperator(OPERATOR)).toBe(true);
  expect(isPrompterOperator({ ...OPERATOR, deviceId: "" })).toBe(false);
  expect(isPrompterScrollState(SCROLL_STATE)).toBe(true);
  expect(
    isPrompterScrollState({
      ...SCROLL_STATE,
      rowId: null,
      operatorUserId: null,
      operatorDeviceId: null,
    }),
  ).toBe(true);
  expect(
    isPrompterScrollState({ ...SCROLL_STATE, lineOffset: Number.NaN }),
  ).toBe(false);

  const validCommands: PrompterScrollCommand[] = [
    { action: "play", deviceId: "dev-1" },
    { action: "play", deviceId: "dev-1", linesPerSecond: 4 },
    { action: "pause", deviceId: "dev-1" },
    { action: "speed", deviceId: "dev-1", linesPerSecond: 0.5 },
    { action: "speed", deviceId: "dev-1", linesPerSecond: 15 },
    { action: "cue", deviceId: "dev-1", rowId: "row-1" },
    { action: "cue", deviceId: "dev-1", rowId: "row-1", lineOffset: 3 },
    { action: "nudge", deviceId: "dev-1", deltaLines: -1 },
    { action: "nudge", deviceId: "dev-1", deltaLines: 2.5 },
  ];
  for (const cmd of validCommands)
    expect(isPrompterScrollCommand(cmd)).toBe(true);

  const invalidCommands: unknown[] = [
    null,
    {},
    { action: "play", deviceId: "" },
    { action: "play", deviceId: "dev-1", linesPerSecond: 0.1 },
    { action: "speed", deviceId: "dev-1", linesPerSecond: 16 },
    { action: "speed", deviceId: "dev-1" },
    { action: "cue", deviceId: "dev-1", rowId: "" },
    { action: "cue", deviceId: "dev-1", rowId: "row-1", lineOffset: -1 },
    { action: "nudge", deviceId: "dev-1", deltaLines: 0 },
    {
      action: "nudge",
      deviceId: "dev-1",
      deltaLines: Number.POSITIVE_INFINITY,
    },
    { action: "jump", deviceId: "dev-1" },
  ];
  for (const cmd of invalidCommands)
    expect(isPrompterScrollCommand(cmd)).toBe(false);
});
