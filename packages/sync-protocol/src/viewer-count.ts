// The data of CONTROL `viewers_counted`, UTF-8 JSON: a number and nothing that says who is counted.

/** `count` is how many people besides the one it is sent to have the document open to read only. */
export function encodeViewerCount(count: number): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ viewers: count }));
}

/** Null for anything but a whole number of people, 0 or more. */
export function parseViewerCount(data: Uint8Array): number | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(data));
  } catch {
    // bytes that are not JSON hold no count
    return null;
  }
  if (typeof value !== "object" || value === null || !("viewers" in value))
    return null;
  const { viewers } = value;
  return typeof viewers === "number" &&
    Number.isSafeInteger(viewers) &&
    viewers >= 0
    ? viewers
    : null;
}
