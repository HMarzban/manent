// The Checks row every Send form shows: what the script's checks find, each sentence after its mark.
import type { SendRow } from "../screens/send/send-frame.tsx";
import { CheckMark } from "../send/check-mark.tsx";
import { CHECK_SOURCES } from "./sources.ts";

/** Null when no source finds anything, so the form draws no Checks row. */
export function checksRow(docId: string): SendRow | null {
  const checks = CHECK_SOURCES.flatMap((source) =>
    source
      .find(docId)
      .map((check) => ({ ...check, key: `${source.id}:${check.id}` })),
  );
  if (checks.length === 0) return null;
  return {
    id: "checks",
    content: checks.map((check) => (
      <span key={check.key} className="flex items-start gap-2">
        <CheckMark ok={false} />
        {check.sentence}
      </span>
    )),
  };
}
