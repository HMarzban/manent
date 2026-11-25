// MOS 2.8.5 and Autoscript WinPlus-IP message builders and parsers.
import { FormatError } from "../script/model.ts";
import type { XmlNode } from "../xml/node.ts";
import { decodeUtf16Be, encodeUtf16Be } from "./utf16be.ts";
import {
  childElement,
  childElements,
  elementText,
  mosElement,
  parseMosXml,
  writeMosXml,
} from "./xml.ts";

export const MOS_DIALECTS = ["autoscript_winplus_ip", "mos_2_8_5"] as const;
export type MosDialect = (typeof MOS_DIALECTS)[number];

export const MOS_ELEMENT_ACTIONS = [
  "INSERT",
  "REPLACE",
  "MOVE",
  "DELETE",
  "SWAP",
] as const;
export type MosElementActionOp = (typeof MOS_ELEMENT_ACTIONS)[number];

const AUTOSCRIPT_RO_SCHEMA = "http://www.autoscript.tv/mos";
const AUTOSCRIPT_STORY_SCHEMA = "http://www.autoscript.tv/mos/story";
const ACTION_SET = new Set<string>(MOS_ELEMENT_ACTIONS);
const TARGET_OPS = new Set<MosElementActionOp>(["INSERT", "REPLACE", "MOVE"]);

export interface MosEnvelope {
  readonly mosId: string;
  readonly ncsId: string;
  readonly messageId?: number;
}
export interface MosStoryHeader {
  readonly storyId: string;
  readonly storySlug: string;
  readonly storyNum?: string;
}
export interface MosRoEntry {
  readonly roId: string;
  readonly roSlug: string;
}
export type MosHeartbeatMessage = MosEnvelope & {
  readonly kind: "heartbeat";
  readonly time: string;
};
export type MosRoCreateMessage = MosEnvelope & {
  readonly kind: "roCreate";
  readonly roId: string;
  readonly roSlug: string;
  readonly stories: readonly MosStoryHeader[];
  readonly dialect?: MosDialect;
  readonly roEdStart?: string;
  readonly roEdDur?: string;
};
export type MosRoStorySendMessage = MosEnvelope & {
  readonly kind: "roStorySend";
  readonly roId: string;
  readonly storyId: string;
  readonly storySlug: string;
  readonly storyNum?: string;
  readonly paragraphs: readonly string[];
  readonly dialect?: MosDialect;
  readonly presenter?: string;
  readonly durationMs?: number | null;
};
export type MosRoElementActionMessage = MosEnvelope & {
  readonly kind: "roElementAction";
  readonly roId: string;
  readonly operation: MosElementActionOp;
  readonly targetStoryId?: string;
  readonly sourceStoryIds?: readonly string[];
  readonly stories?: readonly MosStoryHeader[];
  readonly dialect?: MosDialect;
};
export type MosRoDeleteMessage = MosEnvelope & {
  readonly kind: "roDelete";
  readonly roId: string;
};
export type MosRoAckMessage = MosEnvelope & {
  readonly kind: "roAck";
  readonly roId: string;
  readonly roStatus: string;
};
export type MosRoReqMessage = MosEnvelope & {
  readonly kind: "roReq";
  readonly roId: string;
};
export type MosRoReqAllMessage = MosEnvelope & { readonly kind: "roReqAll" };
export type MosRoListAllMessage = MosEnvelope & {
  readonly kind: "roListAll";
  readonly runningOrders: readonly MosRoEntry[];
};

export type MosMessage =
  | MosHeartbeatMessage
  | MosRoCreateMessage
  | MosRoStorySendMessage
  | MosRoElementActionMessage
  | MosRoDeleteMessage
  | MosRoAckMessage
  | MosRoReqMessage
  | MosRoReqAllMessage
  | MosRoListAllMessage;

const tx = (name: string, value: string): XmlNode => mosElement(name, [value]);
function fail(
  message: string,
  code: "malformed" | "unsupported" = "malformed",
): never {
  throw new FormatError(code, message);
}

function wrap(env: MosEnvelope, payload: XmlNode): XmlNode {
  const children = [tx("mosID", env.mosId), tx("ncsID", env.ncsId)];
  if (env.messageId !== undefined)
    children.push(tx("messageID", String(env.messageId)));
  children.push(payload);
  return mosElement("mos", children);
}

function storyNode(story: MosStoryHeader, fallbackNum?: string): XmlNode {
  const children = [
    tx("storyID", story.storyId),
    tx("storySlug", story.storySlug),
  ];
  const num = story.storyNum ?? fallbackNum;
  if (num !== undefined) children.push(tx("storyNum", num));
  return mosElement("story", children);
}

export const buildHeartbeat = (msg: Omit<MosHeartbeatMessage, "kind">) =>
  wrap(msg, mosElement("heartbeat", [tx("time", msg.time)]));

export function buildRoCreate(msg: Omit<MosRoCreateMessage, "kind">): XmlNode {
  const winPlus = msg.dialect === "autoscript_winplus_ip";
  const children: XmlNode[] = [tx("roID", msg.roId), tx("roSlug", msg.roSlug)];
  if (msg.roEdStart !== undefined)
    children.push(tx("roEdStart", msg.roEdStart));
  if (msg.roEdDur !== undefined) children.push(tx("roEdDur", msg.roEdDur));
  if (winPlus)
    children.push(
      mosElement("mosExternalMetadata", [
        tx("mosScope", "PLAYLIST"),
        tx("mosSchema", AUTOSCRIPT_RO_SCHEMA),
        mosElement("mosPayload", [tx("dialect", "WinPlus-IP")]),
      ]),
    );
  for (const [i, story] of msg.stories.entries())
    children.push(storyNode(story, winPlus ? String(i + 1) : undefined));
  return wrap(msg, mosElement("roCreate", children));
}

export function buildRoStorySend(
  msg: Omit<MosRoStorySendMessage, "kind">,
): XmlNode {
  const children: XmlNode[] = [
    tx("roID", msg.roId),
    tx("storyID", msg.storyId),
    tx("storySlug", msg.storySlug),
  ];
  if (msg.storyNum !== undefined) children.push(tx("storyNum", msg.storyNum));
  children.push(
    mosElement(
      "storyBody",
      msg.paragraphs.map((line) => tx("p", line)),
    ),
  );
  if (msg.dialect === "autoscript_winplus_ip") {
    const fields: XmlNode[] = [];
    if (msg.presenter !== undefined)
      fields.push(tx("Presenter", msg.presenter));
    if (msg.durationMs !== undefined && msg.durationMs !== null)
      fields.push(tx("DurationMs", String(Math.round(msg.durationMs))));
    children.push(
      mosElement("mosExternalMetadata", [
        tx("mosScope", "STORY"),
        tx("mosSchema", AUTOSCRIPT_STORY_SCHEMA),
        mosElement("mosPayload", [mosElement("WinPlusIP", fields)]),
      ]),
    );
  }
  return wrap(msg, mosElement("roStorySend", children));
}

export function buildRoElementAction(
  msg: Omit<MosRoElementActionMessage, "kind">,
): XmlNode {
  const children: XmlNode[] = [tx("roID", msg.roId)];
  if (TARGET_OPS.has(msg.operation)) {
    const target =
      msg.targetStoryId !== undefined ? [tx("storyID", msg.targetStoryId)] : [];
    children.push(mosElement("element_target", target));
  }
  const source: XmlNode[] = [
    ...(msg.stories ?? []).map((story) => storyNode(story)),
    ...(msg.sourceStoryIds ?? []).map((id) => tx("storyID", id)),
  ];
  children.push(mosElement("element_source", source));
  return wrap(
    msg,
    mosElement("roElementAction", children, { operation: msg.operation }),
  );
}

export const buildRoDelete = (msg: Omit<MosRoDeleteMessage, "kind">) =>
  wrap(msg, mosElement("roDelete", [tx("roID", msg.roId)]));

export const buildRoAck = (msg: Omit<MosRoAckMessage, "kind">) =>
  wrap(
    msg,
    mosElement("roAck", [tx("roID", msg.roId), tx("roStatus", msg.roStatus)]),
  );

export const buildRoReq = (msg: Omit<MosRoReqMessage, "kind">) =>
  wrap(msg, mosElement("roReq", [tx("roID", msg.roId)]));

export const buildRoListAll = (msg: Omit<MosRoListAllMessage, "kind">) =>
  wrap(
    msg,
    mosElement(
      "roListAll",
      msg.runningOrders.map((ro) =>
        mosElement("ro", [tx("roID", ro.roId), tx("roSlug", ro.roSlug)]),
      ),
    ),
  );

const BUILDERS: Readonly<Record<MosMessage["kind"], (msg: never) => XmlNode>> =
  {
    heartbeat: buildHeartbeat,
    roCreate: buildRoCreate,
    roStorySend: buildRoStorySend,
    roElementAction: buildRoElementAction,
    roDelete: buildRoDelete,
    roAck: buildRoAck,
    roReq: buildRoReq,
    roReqAll: (msg: MosRoReqAllMessage) => wrap(msg, mosElement("roReqAll")),
    roListAll: buildRoListAll,
  };

export const buildMosMessage = (msg: MosMessage): XmlNode =>
  BUILDERS[msg.kind](msg as never);

export const formatMosMessage = (msg: MosMessage): string =>
  writeMosXml(buildMosMessage(msg));

export const encodeMosMessage = (msg: MosMessage): Uint8Array =>
  encodeUtf16Be(formatMosMessage(msg));

const req = (parent: XmlNode, tag: string): string => {
  const el = childElement(parent, tag);
  if (el === null) fail(`missing <${tag}> inside <${parent.name}>`);
  return elementText(el);
};
const opt = (parent: XmlNode, tag: string): string | undefined => {
  const el = childElement(parent, tag);
  return el === null ? undefined : elementText(el);
};
const parseHeader = (node: XmlNode): MosStoryHeader => {
  const storyNum = opt(node, "storyNum");
  return {
    storyId: req(node, "storyID"),
    storySlug: opt(node, "storySlug") ?? "",
    ...(storyNum !== undefined ? { storyNum } : {}),
  };
};
const detectDialect = (payload: XmlNode): MosDialect => {
  const meta = childElement(payload, "mosExternalMetadata");
  const schema = meta === null ? undefined : opt(meta, "mosSchema");
  return schema?.startsWith(AUTOSCRIPT_RO_SCHEMA)
    ? "autoscript_winplus_ip"
    : "mos_2_8_5";
};

function parseStorySend(env: MosEnvelope, p: XmlNode): MosRoStorySendMessage {
  const storyNum = opt(p, "storyNum");
  const body = childElement(p, "storyBody");
  const meta = childElement(p, "mosExternalMetadata");
  const mp = meta === null ? null : childElement(meta, "mosPayload");
  const wp = mp === null ? null : childElement(mp, "WinPlusIP");
  const presenter = wp === null ? undefined : opt(wp, "Presenter");
  const durRaw = wp === null ? undefined : opt(wp, "DurationMs");
  const durationMs =
    durRaw !== undefined && /^\d+$/.test(durRaw)
      ? Number.parseInt(durRaw, 10)
      : undefined;
  return {
    ...env,
    kind: "roStorySend",
    roId: req(p, "roID"),
    storyId: req(p, "storyID"),
    storySlug: opt(p, "storySlug") ?? "",
    ...(storyNum !== undefined ? { storyNum } : {}),
    dialect: detectDialect(p),
    ...(presenter !== undefined ? { presenter } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    paragraphs: body === null ? [] : childElements(body, "p").map(elementText),
  };
}

const ENVELOPE_TAGS = new Set(["mosID", "ncsID", "messageID"]);

export function parseMosMessage(input: string | XmlNode): MosMessage {
  const root = typeof input === "string" ? parseMosXml(input) : input;
  if (root.name !== "mos") fail(`expected <mos> root, got <${root.name}>`);
  const idRaw = opt(root, "messageID");
  if (idRaw !== undefined && idRaw !== "" && !/^\d+$/.test(idRaw))
    fail(`invalid MOS messageID "${idRaw}"`);
  const env: MosEnvelope = {
    mosId: req(root, "mosID"),
    ncsId: req(root, "ncsID"),
    ...(idRaw ? { messageId: Number.parseInt(idRaw, 10) } : {}),
  };
  const payload = root.children.find(
    (c): c is XmlNode => typeof c !== "string" && !ENVELOPE_TAGS.has(c.name),
  );
  if (payload === undefined) fail("MOS message has no payload element");

  switch (payload.name) {
    case "heartbeat":
      return { ...env, kind: "heartbeat", time: req(payload, "time") };
    case "roCreate": {
      const roEdStart = opt(payload, "roEdStart");
      const roEdDur = opt(payload, "roEdDur");
      return {
        ...env,
        kind: "roCreate",
        roId: req(payload, "roID"),
        roSlug: opt(payload, "roSlug") ?? "",
        dialect: detectDialect(payload),
        ...(roEdStart !== undefined ? { roEdStart } : {}),
        ...(roEdDur !== undefined ? { roEdDur } : {}),
        stories: childElements(payload, "story").map(parseHeader),
      };
    }
    case "roStorySend":
      return parseStorySend(env, payload);
    case "roElementAction": {
      const op = payload.attributes.operation;
      if (op === undefined || !ACTION_SET.has(op))
        fail(`unknown roElementAction operation "${op ?? ""}"`);
      const tgt = childElement(payload, "element_target");
      const src = childElement(payload, "element_source");
      const targetStoryId = tgt === null ? undefined : opt(tgt, "storyID");
      const stories = src ? childElements(src, "story").map(parseHeader) : [];
      const sourceStoryIds = src
        ? childElements(src, "storyID").map(elementText)
        : [];
      return {
        ...env,
        kind: "roElementAction",
        roId: req(payload, "roID"),
        operation: op as MosElementActionOp,
        ...(targetStoryId !== undefined ? { targetStoryId } : {}),
        ...(stories.length > 0 ? { stories } : {}),
        ...(sourceStoryIds.length > 0 ? { sourceStoryIds } : {}),
      };
    }
    case "roDelete":
      return { ...env, kind: "roDelete", roId: req(payload, "roID") };
    case "roAck":
      return {
        ...env,
        kind: "roAck",
        roId: req(payload, "roID"),
        roStatus: req(payload, "roStatus"),
      };
    case "roReq":
      return { ...env, kind: "roReq", roId: req(payload, "roID") };
    case "roReqAll":
      return { ...env, kind: "roReqAll" };
    case "roListAll":
      return {
        ...env,
        kind: "roListAll",
        runningOrders: childElements(payload, "ro").map((ro) => ({
          roId: req(ro, "roID"),
          roSlug: opt(ro, "roSlug") ?? "",
        })),
      };
    default:
      fail(`unsupported MOS payload <${payload.name}>`, "unsupported");
  }
}

export const decodeMosMessage = (bytes: Uint8Array): MosMessage =>
  parseMosMessage(decodeUtf16Be(bytes));
