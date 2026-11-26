// SSRF and peer allowlist for MOS TCP bridges: node:net BlockList + DNS pinning (ADR 0073).
import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export const MOS_MIN_PORT = 1024;
export const MOS_MAX_PORT = 65535;

export interface PinnedTarget {
  readonly ok: true;
  readonly address: string;
  readonly family: 4 | 6;
  readonly port: number;
}

export interface TargetRefusal {
  readonly ok: false;
  readonly code: "bad_host" | "bad_port" | "host_not_allowed" | "unreachable";
}

export type ResolveTargetResult = PinnedTarget | TargetRefusal;

export type DnsLookupFn = (
  host: string,
  options: { all: true; verbatim: true },
) => Promise<readonly { address: string; family: number }[]>;

const HOST_CONTROL = /[\s/@?#\\]/;
const IPV4_PART = /^\d{1,3}$/;
const HEX_GROUP = /^[0-9a-fA-F]{1,4}$/;

/** Hard-denied targets that can never be overridden by user-configured studio CIDRs. */
function buildHardDenyList(): BlockList {
  const deny = new BlockList();
  deny.addSubnet("169.254.0.0", 16, "ipv4"); // cloud metadata & link-local
  deny.addSubnet("0.0.0.0", 8, "ipv4"); // unspecified / this-network bypass
  deny.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
  deny.addSubnet("240.0.0.0", 4, "ipv4"); // reserved / broadcast
  deny.addAddress("::", "ipv6"); // unspecified
  deny.addSubnet("fe80::", 10, "ipv6"); // IPv6 link-local
  deny.addSubnet("ff00::", 8, "ipv6"); // IPv6 multicast
  deny.addAddress("fd00:ec2::254", "ipv6"); // AWS EC2 IPv6 IMDS
  return deny;
}

const HARD_DENY = buildHardDenyList();

function buildDefaultStudioAllowList(): BlockList {
  const allow = new BlockList();
  allow.addSubnet("127.0.0.0", 8, "ipv4");
  allow.addSubnet("10.0.0.0", 8, "ipv4");
  allow.addSubnet("172.16.0.0", 12, "ipv4");
  allow.addSubnet("192.168.0.0", 16, "ipv4");
  allow.addAddress("::1", "ipv6");
  allow.addSubnet("fc00::", 7, "ipv6");
  return allow;
}

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!IPV4_PART.test(part)) return null;
    const n = Number.parseInt(part, 10);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
}

function expandIpv6Part(tokens: readonly string[]): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.includes(".")) {
      if (i !== tokens.length - 1) return null;
      const v4 = parseIpv4Octets(token);
      if (v4 === null) return null;
      out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      continue;
    }
    if (!HEX_GROUP.test(token)) return null;
    out.push(Number.parseInt(token, 16));
  }
  return out;
}

/** Parses an IPv6 literal into 8 16-bit groups, or null if malformed. */
function parseIpv6Groups(raw: string): number[] | null {
  if (raw.includes("%")) return null;
  const halves = raw.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] === "" ? [] : expandIpv6Part(halves[0]!.split(":"));
  const right =
    halves.length === 1 || halves[1] === ""
      ? []
      : expandIpv6Part(halves[1]!.split(":"));
  if (left === null || right === null) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

/** Detects `::ffff:0:0/96` IPv4-mapped IPv6 addresses in dotted or hex form. */
export function isIpv4MappedIpv6(ip: string): boolean {
  const groups = parseIpv6Groups(ip);
  if (groups === null) return false;
  return (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  );
}

/** Extracts the embedded IPv4 address from a dual-stack socket's `::ffff:` peer address. */
export function unwrapDualStackIpv4(ip: string): string | null {
  const groups = parseIpv6Groups(ip);
  if (groups === null) return null;
  if (
    groups[0] !== 0 ||
    groups[1] !== 0 ||
    groups[2] !== 0 ||
    groups[3] !== 0 ||
    groups[4] !== 0 ||
    groups[5] !== 0xffff
  )
    return null;
  const g6 = groups[6]!;
  const g7 = groups[7]!;
  return `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;
}

export function isValidMosPort(port: number): boolean {
  return (
    Number.isSafeInteger(port) && port >= MOS_MIN_PORT && port <= MOS_MAX_PORT
  );
}

export function parseCidr(
  cidr: string,
): { network: string; prefix: number; type: "ipv4" | "ipv6" } | null {
  const trimmed = cidr.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash !== trimmed.lastIndexOf("/")) return null;
  const network = trimmed.slice(0, slash);
  const prefixRaw = trimmed.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefixRaw)) return null;
  const prefix = Number.parseInt(prefixRaw, 10);
  const fam = isIP(network);
  if (fam === 4 && prefix >= 0 && prefix <= 32)
    return { network, prefix, type: "ipv4" };
  if (fam === 6 && !isIpv4MappedIpv6(network) && prefix >= 0 && prefix <= 128)
    return { network, prefix, type: "ipv6" };
  return null;
}

export function validateCidrs(cidrs: readonly string[]): boolean {
  return cidrs.length <= 32 && cidrs.every((c) => parseCidr(c) !== null);
}

function buildAllowList(extraCidrs: readonly string[]): BlockList {
  const allow = buildDefaultStudioAllowList();
  for (const cidr of extraCidrs) {
    const parsed = parseCidr(cidr);
    if (parsed !== null)
      allow.addSubnet(parsed.network, parsed.prefix, parsed.type);
  }
  return allow;
}

/**
 * True only when `rawIp` is a clean IPv4/IPv6 studio address outside hard-denied ranges.
 * Always rejects `::ffff:` IPv4-mapped IPv6 bypasses, `169.254.0.0/16`, `0.0.0.0/8`, and `fd00:ec2::254`.
 */
export function isIpAllowed(
  rawIp: string,
  extraCidrs: readonly string[] = [],
): boolean {
  const trimmed = rawIp.trim();
  if (trimmed === "" || trimmed.includes("%")) return false;
  const fam = isIP(trimmed);
  if (fam === 0) return false;
  if (fam === 6 && isIpv4MappedIpv6(trimmed)) return false;
  const type = fam === 4 ? "ipv4" : "ipv6";
  if (HARD_DENY.check(trimmed, type)) return false;
  return buildAllowList(extraCidrs).check(trimmed, type);
}

/** Resolves `host` once, checks EVERY returned IP against hard-deny + studio allowlist, and returns the pinned IP. */
export async function resolvePinnedTarget(
  host: string,
  port: number,
  options?: {
    allowedCidrs?: readonly string[];
    lookup?: DnsLookupFn;
  },
): Promise<ResolveTargetResult> {
  if (!isValidMosPort(port)) return { ok: false, code: "bad_port" };
  const trimmed = host.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 253 ||
    HOST_CONTROL.test(trimmed)
  )
    return { ok: false, code: "bad_host" };
  const unwrapped =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
  const extra = options?.allowedCidrs ?? [];

  const literalFamily = isIP(unwrapped);
  if (literalFamily !== 0) {
    if (!isIpAllowed(unwrapped, extra))
      return { ok: false, code: "host_not_allowed" };
    return {
      ok: true,
      address: unwrapped,
      family: literalFamily as 4 | 6,
      port,
    };
  }

  let records: readonly { address: string; family: number }[];
  try {
    const fn: DnsLookupFn = options?.lookup ?? dnsLookup;
    records = await fn(unwrapped, { all: true, verbatim: true });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  if (records.length === 0) return { ok: false, code: "unreachable" };

  for (const rec of records) {
    if (!isIpAllowed(rec.address, extra))
      return { ok: false, code: "host_not_allowed" };
  }
  const first = records[0]!;
  return {
    ok: true,
    address: first.address,
    family: first.family === 6 ? 6 : 4,
    port,
  };
}
