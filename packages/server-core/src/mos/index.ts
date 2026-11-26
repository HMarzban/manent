// MOS 2.8.5 / Autoscript WinPlus-IP TCP bridge, SSRF allowlist, config store and HTTP routes.
export { answerMosRequest } from "../http/routes/mos.ts";
export {
  MOS_MAX_PORT,
  MOS_MIN_PORT,
  isIpAllowed,
  isIpv4MappedIpv6,
  isValidMosPort,
  parseCidr,
  resolvePinnedTarget,
  unwrapDualStackIpv4,
  validateCidrs,
} from "./allowlist.ts";
export type {
  DnsLookupFn,
  PinnedTarget,
  ResolveTargetResult,
  TargetRefusal,
} from "./allowlist.ts";
export { createMosBridgeService } from "./bridge.ts";
export type {
  MosBridgeService,
  MosCheckResult,
  MosLinkStatus,
  MosRundownStatus,
  MosWorkspaceStatus,
} from "./bridge.ts";
export {
  MOS_DEFAULT_LOWER_PORT,
  MOS_DEFAULT_MOS_ID,
  MOS_DEFAULT_NCS_ID,
  MOS_DEFAULT_UPPER_PORT,
  createMosConfigStore,
  parseMosWorkspaceConfig,
} from "./config.ts";
export type {
  MosConfigOutcome,
  MosConfigRefusal,
  MosConfigStore,
  MosRundownOptIn,
  MosWorkspaceConfig,
} from "./config.ts";
export { checkMosHandshake, createMosTcpClient } from "./tcp-client.ts";
export type { MosTcpClient } from "./tcp-client.ts";
export { MOS_MAX_CONNECTIONS, createMosTcpServer } from "./tcp-server.ts";
export type { MosTcpServer } from "./tcp-server.ts";
