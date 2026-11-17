import { timingSafeEqual } from "node:crypto";

export interface SessionStore {
  issue(userId: string): string;
  resolve(token: string): { userId: string } | null;
}

const VERSION = "v1";
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DECIMAL = /^\d+$/;
const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Decodes unpadded base64url, or returns null for anything not in its canonical form. */
function decodeBase64url(text: string): Buffer | null {
  if (!BASE64URL.test(text)) return null;
  const bytes = Buffer.from(text, "base64url");
  return bytes.toString("base64url") === text ? bytes : null;
}

/**
 * Sessions held in the token itself:
 * `v1.<base64url(userId)>.<issuedAtMs>.<base64url(HMAC-SHA-256 of the first three parts)>`.
 * Any store with the same secret resolves the token, so a session survives a
 * restart. Demo sessions do not expire.
 */
export function createSignedSessionStore(options: {
  secret: Uint8Array;
}): SessionStore {
  const secret = Uint8Array.from(options.secret);
  if (secret.length !== 32) {
    throw new RangeError("The session secret must be 32 bytes.");
  }

  const sign = (payload: string): Buffer =>
    new Bun.CryptoHasher("sha256", secret).update(payload).digest();

  return {
    issue(userId) {
      const payload = `${VERSION}.${Buffer.from(userId).toString("base64url")}.${Date.now()}`;
      return `${payload}.${sign(payload).toString("base64url")}`;
    },
    resolve(token) {
      if (typeof token !== "string") return null;
      const parts = token.split(".");
      if (parts.length !== 4) return null;
      const [version, user, issuedAt, signature] = parts as [
        string,
        string,
        string,
        string,
      ];
      if (version !== VERSION || !DECIMAL.test(issuedAt)) return null;
      const given = decodeBase64url(signature);
      const userBytes = decodeBase64url(user);
      if (!given || !userBytes) return null;
      const expected = sign(`${version}.${user}.${issuedAt}`);
      if (
        given.length !== expected.length ||
        !timingSafeEqual(given, expected)
      ) {
        return null;
      }
      try {
        return { userId: utf8.decode(userBytes) };
      } catch {
        return null;
      }
    },
  };
}
