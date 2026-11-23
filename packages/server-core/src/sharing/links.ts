// Share links: a token is never stored, only its SHA-256, and a link is found again by hashing the token it is opened with.
import { createHash } from "node:crypto";
import type { ShareLinkRow } from "@manent/storage";

/** 32 bytes in base64url, as a link's token is made. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** How long a new link may hold, in milliseconds: never (null), 1 day, 7 days or 30 days. */
const LINK_EXPIRIES_MS: readonly (number | null)[] = Object.freeze([
  null,
  86_400_000,
  604_800_000,
  2_592_000_000,
]);

export const isLinkExpiry = (value: unknown): value is number | null =>
  LINK_EXPIRIES_MS.some((expiry) => expiry === value);

/** Whether the text has the shape of a link's token; anything else is refused before it is hashed. */
export const isLinkToken = (value: unknown): value is string =>
  typeof value === "string" && TOKEN.test(value);

/** The token's SHA-256, as a link stores it. */
export function hashToken(token: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(token).digest());
}

/** Why a link no longer opens at `now`; null while it holds. A turned-off link is refused before an expired one. */
export function linkRefusal(
  link: ShareLinkRow,
  now: number,
): "link_revoked" | "link_expired" | null {
  if (link.revokedAt !== null) return "link_revoked";
  return link.expiresAt !== null && now >= link.expiresAt
    ? "link_expired"
    : null;
}
