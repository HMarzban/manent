const INVISIBLE = /[\u00ad\u200b\u2060\ufeff]/g;

/**
 * Text pasted or imported, made safe for the page: line ends become U+000A, a tab one space, and
 * soft hyphens, zero-width spaces, word joiners and byte order marks are removed. Joiners are kept.
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(INVISIBLE, "");
}
