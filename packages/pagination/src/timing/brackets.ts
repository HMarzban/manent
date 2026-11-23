// The `T=` time forms in a bracket's text: `T=m:ss` or `T=mm:ss`, the first well-formed one per bracket.

export const BRACKET_TIME_CODES = ["malformed", "repeated"] as const;
export type BracketTimeCode = (typeof BRACKET_TIME_CODES)[number];
/** One `T=` form; `from` and `to` are UTF-16 offsets of the form in the block's text, `to` exclusive. */
export type BracketTime =
  | { ok: true; ms: number; from: number; to: number }
  | { ok: false; code: BracketTimeCode; from: number; to: number };

const WELL_FORMED = /^T=(\d{1,2}):([0-5]\d)$/;

const isFormStart = (text: string, at: number): boolean =>
  at === 0 || text[at - 1] === " " || text[at - 1] === "[";

function formEnd(text: string, from: number): number {
  for (let at = from; at < text.length; at += 1)
    if (text[at] === " " || text[at] === "]") return at;
  return text.length;
}

/**
 * Every `T=` form in a bracket's text, in order. A form starts at `T=` at the start of the text or
 * after a space or `[`, and runs to the next space, `]` or the end. The first well-formed form is
 * `ok`; a form before it is `malformed`, and every form after it is `repeated`.
 */
export function findBracketTimes(text: string): BracketTime[] {
  const times: BracketTime[] = [];
  let counted = false;
  for (let from = text.indexOf("T="); from !== -1;) {
    if (!isFormStart(text, from)) {
      from = text.indexOf("T=", from + 1);
      continue;
    }
    const to = formEnd(text, from + 2);
    const form = WELL_FORMED.exec(text.slice(from, to));
    if (counted) times.push({ ok: false, code: "repeated", from, to });
    else if (form === null)
      times.push({ ok: false, code: "malformed", from, to });
    else {
      counted = true;
      times.push({
        ok: true,
        ms: (Number(form[1]) * 60 + Number(form[2])) * 1000,
        from,
        to,
      });
    }
    from = text.indexOf("T=", to);
  }
  return times;
}
