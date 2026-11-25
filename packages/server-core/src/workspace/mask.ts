// Value masking for workspace settings so raw addresses and secrets are never returned after save.

const MASK_SUFFIX_LENGTH = 4;

function maskUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return null;
    if (parsed.host.length === 0) return null;
    const tail = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const suffix =
      tail.length > MASK_SUFFIX_LENGTH ? tail.slice(-MASK_SUFFIX_LENGTH) : "";
    return `${parsed.host}/…${suffix}`;
  } catch {
    // not a URL; caller falls back to generic masking
    return null;
  }
}

function extractWrappedUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null) return null;
    const url: unknown = Reflect.get(parsed, "url");
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch {
    // not JSON; caller falls back to generic masking
    return null;
  }
}

/**
 * Masks a stored workspace setting value for an owner: URLs become `<host>/…<last4>`,
 * and non-URL values become `…<last4>` (or `"…"` when 4 characters or fewer).
 * Returns null for an empty value.
 */
export function maskSettingValue(raw: string): string | null {
  if (raw.length === 0) return null;
  const wrapped = extractWrappedUrl(raw);
  const candidate = wrapped ?? raw;
  const maskedUrl = maskUrl(candidate);
  if (maskedUrl !== null) return maskedUrl;
  return candidate.length > MASK_SUFFIX_LENGTH
    ? `…${candidate.slice(-MASK_SUFFIX_LENGTH)}`
    : "…";
}
