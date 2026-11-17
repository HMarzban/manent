export type BindRefusalReason =
  "public" | "wildcard" | "private_needs_lan" | "not_an_address";

export type BindCheck =
  | { ok: true; scope: "loopback" | "private" }
  | { ok: false; reason: BindRefusalReason };

type Scope = "loopback" | "private" | "public" | "wildcard";

const IPV4_PART = /^(0|[1-9]\d{0,2})$/;
const IPV6_GROUP = /^[0-9a-f]{1,4}$/;

/** Four octets in dotted decimal, no leading zeros; null for anything else. */
function parseIPv4(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!IPV4_PART.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

/** The 16-bit groups of one side of `::`; a dotted IPv4 may end the last side. */
function groupsOf(half: string, isLast: boolean): number[] | null {
  if (half === "") return [];
  const out: number[] = [];
  const pieces = half.split(":");
  for (const [i, piece] of pieces.entries()) {
    if (isLast && i === pieces.length - 1 && piece.includes(".")) {
      const v4 = parseIPv4(piece);
      if (!v4) return null;
      out.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
    } else if (IPV6_GROUP.test(piece)) {
      out.push(parseInt(piece, 16));
    } else {
      return null;
    }
  }
  return out;
}

/** Eight 16-bit groups, accepting `::` and a trailing dotted IPv4; null for anything else. */
function parseIPv6(text: string): number[] | null {
  const lower = text.toLowerCase();
  const halves = lower.split("::");
  if (halves.length > 2) return null;
  if (halves.length === 1) {
    const groups = groupsOf(lower, true);
    return groups && groups.length === 8 ? groups : null;
  }
  const head = groupsOf(halves[0]!, false);
  const tail = groupsOf(halves[1]!, true);
  if (!head || !tail || head.length + tail.length > 7) return null;
  return [
    ...head,
    ...Array.from({ length: 8 - head.length - tail.length }, () => 0),
    ...tail,
  ];
}

function scopeOfIPv4([a, b, c, d]: number[]): Scope {
  if (a === 0 && b === 0 && c === 0 && d === 0) return "wildcard";
  if (a === 127) return "loopback";
  if (a === 10) return "private";
  if (a === 172 && b! >= 16 && b! <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  return "public";
}

function scopeOfIPv6(groups: number[]): Scope {
  const firstFive = groups.slice(0, 5).every((g) => g === 0);
  if (firstFive && groups[5] === 0xffff) {
    const [hi, lo] = [groups[6]!, groups[7]!];
    return scopeOfIPv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  }
  if (groups.slice(0, 7).every((g) => g === 0)) {
    if (groups[7] === 0) return "wildcard";
    if (groups[7] === 1) return "loopback";
  }
  if ((groups[0]! & 0xfe00) === 0xfc00) return "private";
  return "public";
}

/** The scope of a literal address or the name `localhost`; null when it is neither. */
function scopeOf(host: string): Scope | null {
  if (host.toLowerCase() === "localhost") return "loopback";
  const v4 = parseIPv4(host);
  if (v4) return scopeOfIPv4(v4);
  const bare =
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const v6 = parseIPv6(bare);
  return v6 ? scopeOfIPv6(v6) : null;
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
  const scope = scopeOf(host);
  if (scope === null) return { ok: false, reason: "not_an_address" };
  if (scope === "loopback") return { ok: true, scope };
  if (scope === "private") {
    return options.lan
      ? { ok: true, scope }
      : { ok: false, reason: "private_needs_lan" };
  }
  return { ok: false, reason: scope };
}

/** The sentence printed when the demo refuses to listen on `host`. */
export function bindRefusal(host: string, reason: BindRefusalReason): string {
  if (reason === "private_needs_lan") {
    return `${host} is a private network address. Run make demo LAN=1 to allow it.`;
  }
  return `Demo mode has no passwords, so it only starts on this machine or a private network. Refusing ${host}.`;
}

/** True for a literal address in 127.0.0.0/8, ::1, or 127.x.x.x mapped into IPv6. */
export function isLoopbackAddress(address: string): boolean {
  if (address.toLowerCase() === "localhost") return false;
  return scopeOf(address) === "loopback";
}
