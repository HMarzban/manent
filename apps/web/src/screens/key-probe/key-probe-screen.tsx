// The test build's key probe: each default and candidate key of this system in turn, marked as it reaches the page
// or as the tester says it did not, and the record to commit as the probe's results.
import { probeChords } from "@manent/commands";
import type { ProbedKey } from "@manent/commands";
import {
  Button,
  KEY_PROBE_WORDS,
  Kbd,
  createKeyResolver,
  keyLabel,
} from "@manent/ui";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { focusHeading } from "../../focus.ts";
import type { Where } from "../../platform.ts";
import { useEnvironment } from "../../services/context.tsx";

const HOSTS: Readonly<
  Record<NonNullable<Where["browser"]>, ProbedKey["host"]>
> = Object.freeze({
  Chrome: "chromium",
  Edge: "chromium",
  Firefox: "firefox",
  Safari: "safari",
});

/** Where the keys are pressed: the desktop app, or the browser; null for a browser the record has no row for. */
function hostOf(where: Where): ProbedKey["host"] | null {
  if (where.shell === "desktop") return "desktop";
  return where.browser === null ? null : HOSTS[where.browser];
}

export function KeyProbeScreen(): ReactNode {
  const { where } = useEnvironment();
  const host = hostOf(where);
  const chords = useMemo(
    () => (host === null ? [] : probeChords(where.platform)),
    [host, where.platform],
  );
  const [results, setResults] = useState<readonly ProbedKey[]>([]);
  const current = chords[results.length] ?? null;

  useEffect(() => {
    focusHeading(document);
  }, []);

  useEffect(() => {
    if (current === null || host === null) return;
    const resolve = createKeyResolver({
      table: () => [{ id: current, chord: current }],
    });
    const heard = (event: KeyboardEvent): void => {
      if (resolve(event) === null) return;
      // the key is the probe's alone: no command and no browser action runs
      event.preventDefault();
      event.stopPropagation();
      setResults((made) => [
        ...made,
        { chord: current, platform: where.platform, host, arrived: true },
      ]);
    };
    window.addEventListener("keydown", heard, { capture: true });
    return () =>
      window.removeEventListener("keydown", heard, { capture: true });
  }, [current, host, where.platform]);

  const notArrived = (): void => {
    if (current === null || host === null) return;
    setResults((made) => [
      ...made,
      { chord: current, platform: where.platform, host, arrived: false },
    ]);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      <h1 tabIndex={-1} className="text-display outline-none">
        {KEY_PROBE_WORDS.title}
      </h1>
      <p className="text-ui text-fg-muted">{KEY_PROBE_WORDS.instruction}</p>
      <ol className="flex flex-col gap-2">
        {chords.map((chord, at) => {
          const result = results[at];
          return (
            <li
              key={chord}
              aria-current={chord === current ? "step" : undefined}
              className="flex items-center gap-3 text-ui"
            >
              <Kbd>{keyLabel(chord, where.platform)}</Kbd>
              {result === undefined ? null : (
                <span>
                  {result.arrived
                    ? KEY_PROBE_WORDS.arrived
                    : KEY_PROBE_WORDS.notArrived}
                </span>
              )}
              {chord === current ? (
                <Button variant="outline" onClick={notArrived}>
                  {KEY_PROBE_WORDS.notArrived}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
      <pre className="text-ui">{JSON.stringify(results, null, 2)}</pre>
    </div>
  );
}
