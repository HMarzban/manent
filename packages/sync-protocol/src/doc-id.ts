// Document IDs and the kinds of document the server keeps.

/** Append only: a kind is stored with every document. */
export const DOC_KINDS = [
  "script",
  "comments",
  "index",
  "rundown",
  "outline",
  "room_log",
  "private",
  "ink",
] as const;

export type DocKind = (typeof DOC_KINDS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const hex = (value: number, digits: number): string =>
  value.toString(16).padStart(digits, "0");

export function isDocKind(value: unknown): value is DocKind {
  return DOC_KINDS.some((kind) => kind === value);
}

/** A canonical lower-case UUID, of any version. */
export function isDocId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * A version 7 UUID: 48 bits of `nowMs`, then 74 of the 80 bits in `random`.
 * Throws RangeError unless `random` holds 10 bytes and `nowMs` is an integer
 * that fits in 48 bits.
 */
export function docIdV7(nowMs: number, random: Uint8Array): string {
  if (random.length !== 10)
    throw new RangeError(
      `a version 7 ID takes 10 random bytes, not ${random.length}`,
    );
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs >= 2 ** 48)
    throw new RangeError(
      `a version 7 ID takes a time of 0 to 2^48 - 1 milliseconds, not ${nowMs}`,
    );
  const time = hex(nowMs, 12);
  const bits = Array.from(random, (byte) => hex(byte, 2)).join("");
  // variant 10, then the low 6 bits of byte 2
  const variant = hex(0x80 | (random[2]! & 0x3f), 2);
  return `${time.slice(0, 8)}-${time.slice(8)}-7${bits.slice(0, 3)}-${variant}${bits.slice(6, 8)}-${bits.slice(8)}`;
}

const FNV_OFFSET = 0x6c62272e07bb014262b821756295c58dn;
const FNV_PRIME = 0x0000000001000000000000000000013bn;
const MASK_128 = (1n << 128n) - 1n;

/** The FNV-1a 128 hash of the UTF-8 bytes of `text`, as a version 8 UUID. */
function hashId(text: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text))
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK_128;
  // version 8 in the high nibble of byte 6, variant 10 in the top two bits of byte 8
  const uuid =
    (hash & ~(0xf0n << 72n) & ~(0xc0n << 56n)) |
    (0x80n << 72n) |
    (0x80n << 56n);
  const h = uuid.toString(16).padStart(32, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * The id of a person's private index (`scope` "user", `id` their userId) or of a
 * workspace's index (`scope` "workspace"): the same on every device. A version 8
 * UUID of the FNV-1a 128 hash of the UTF-8 bytes of `manent:<scope>:<id>`.
 */
export function indexDocId(scope: "user" | "workspace", id: string): string {
  return hashId(`manent:${scope}:${id}`);
}

const SEED_KEY = /^[a-z0-9][a-z0-9/:-]{0,199}$/;

/**
 * The id of a seeded document or project, the same in every seed: the version 8 UUID
 * of `manent:seed:<key>`, hashed as indexDocId hashes. Throws RangeError unless `key`
 * is 1 to 200 characters of a-z, 0-9, "/", ":" and "-", starting with a letter or digit.
 */
export function seedDocId(key: string): string {
  if (!SEED_KEY.test(key))
    throw new RangeError(
      `a seed key is 1 to 200 characters of a-z, 0-9, "/", ":" and "-", not ${JSON.stringify(key)}`,
    );
  return hashId(`manent:seed:${key}`);
}

/** The home of a workspace's index: the file of its own project. */
export function workspaceHome(workspaceId: string): string {
  return projectHome(indexDocId("workspace", workspaceId));
}

/** The home of every document of a project: one file per project. */
export function projectHome(projectId: string): string {
  return `project:${projectId}`;
}
