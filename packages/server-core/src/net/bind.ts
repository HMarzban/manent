// Where the password-less demo may listen, and which callers are this machine.
import { BlockList, isIP } from "node:net";

export type BindRefusalReason =
  "public" | "wildcard" | "private_needs_lan" | "not_an_address";

export type BindCheck =
  | {
      ok: true;
      scope: "loopback" | "private";
      /** The host without brackets. */
      address: string;
    }
  | { ok: false; reason: BindRefusalReason };

type Scope = "loopback" | "private" | "public" | "wildcard";

function blockList(subnets: readonly (readonly [string, number])[]): BlockList {
  const list = new BlockList();
  for (const [network, prefix] of subnets)
    list.addSubnet(network, prefix, isIP(network) === 4 ? "ipv4" : "ipv6");
  return list;
}

const WILDCARD = blockList([
  ["0.0.0.0", 32],
  ["::", 128],
]);
const LOOPBACK = blockList([
  ["127.0.0.0", 8],
  ["::1", 128],
]);
const PRIVATE = blockList([
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["fc00::", 7],
]);

/** The scope of a literal address; null when it is not one. IPv4 mapped into IPv6 is judged as IPv4. */
function scopeOfAddress(address: string): Scope | null {
  const family = isIP(address);
  if (family === 0) return null;
  // A zone names an interface of this machine, which the address alone cannot place.
  if (address.includes("%")) return "public";
  const type = family === 4 ? "ipv4" : "ipv6";
  if (WILDCARD.check(address, type)) return "wildcard";
  if (LOOPBACK.check(address, type)) return "loopback";
  if (PRIVATE.check(address, type)) return "private";
  return "public";
}

/** The host without the brackets of an IPv6 literal; null for brackets around anything else. */
function unbracketed(host: string): string | null {
  if (!host.startsWith("[") || !host.endsWith("]")) return host;
  const inner = host.slice(1, -1);
  return isIP(inner) === 6 ? inner : null;
}

/**
 * Whether the password-less demo may listen on `host`: loopback always,
 * a private-range address only with `lan`, anything else never. Names other
 * than `localhost` are not resolved.
 */
export function checkDemoBind(
  host: string,
  options: { lan: boolean },
): BindCheck {
  const address = unbracketed(host);
  if (address === null) return { ok: false, reason: "not_an_address" };
  const scope =
    address.toLowerCase() === "localhost"
      ? "loopback"
      : scopeOfAddress(address);
  if (scope === null) return { ok: false, reason: "not_an_address" };
  if (scope === "loopback") return { ok: true, scope, address };
  if (scope === "private") {
    return options.lan
      ? { ok: true, scope, address }
      : { ok: false, reason: "private_needs_lan" };
  }
  return { ok: false, reason: scope };
}

/** True for a literal address in 127.0.0.0/8 or ::1, IPv4-mapped included; a name is never one. */
export function isLoopbackAddress(address: string): boolean {
  return scopeOfAddress(address) === "loopback";
}
