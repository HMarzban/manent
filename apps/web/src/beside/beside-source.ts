// Open beside's list: what each line of BESIDE_KINDS offers beside the open document, and opening the one chosen.
import { matchesQuery } from "@manent/ui";
import type { PaletteRow, PaletteSource } from "@manent/ui";
import { BESIDE_KINDS } from "./kinds.ts";
import type { BesideHere } from "./kinds.ts";
import { openBeside } from "./open-beside.ts";

const ROW = "beside:";
const OPEN_PREFIX = "open:";
const MAX_SOURCES = 16;

let nextSourceId = 0;
// Bounded lookup of per-instance create-on-first-open maps so separate sources never clobber each other.
const sourceMaps = new Map<number, ReadonlyMap<string, () => void>>();

function registerSourceMap(
  id: number,
  map: ReadonlyMap<string, () => void>,
): void {
  sourceMaps.set(id, map);
  if (sourceMaps.size > MAX_SOURCES) {
    const oldest = sourceMaps.keys().next().value;
    if (oldest !== undefined) sourceMaps.delete(oldest);
  }
}

function findPendingAction(rowId: string): (() => void) | undefined {
  for (const map of sourceMaps.values()) {
    const action = map.get(rowId);
    if (action !== undefined) return action;
  }
  return undefined;
}

/** Each kind's choices beside the document `here` gives, by their labels; none while no document is open. */
export function createBesideSource(options: {
  here: () => BesideHere | null;
}): PaletteSource {
  const sourceId = ++nextSourceId;
  const pendingOpen = new Map<string, () => void>();
  registerSourceMap(sourceId, pendingOpen);
  return {
    kind: "document",
    rows(query) {
      const here = options.here();
      if (here === null) return [];
      pendingOpen.clear();
      return BESIDE_KINDS.flatMap((kind) =>
        (kind.choices?.(here) ?? []).flatMap((choice, index): PaletteRow[] => {
          let rowId: string;
          if (choice.open !== undefined) {
            rowId = `${ROW}${kind.id}:${OPEN_PREFIX}${sourceId}:${index}:${choice.label}`;
            const open = choice.open;
            pendingOpen.set(rowId, () => {
              void Promise.resolve()
                .then(() => open(here))
                .then(
                  (docId) => {
                    if (docId !== null) openBeside(docId, kind.id, null);
                  },
                  () => {
                    // create-on-first-open refusals are handled by the caller's service; never emit an unhandled rejection
                  },
                );
            });
          } else if (choice.docId != null) {
            rowId = `${ROW}${kind.id}:${choice.docId}`;
          } else {
            return [];
          }
          return [
            {
              id: rowId,
              kind: "document",
              label: choice.label,
              value: null,
              scopeWord: null,
              home: null,
              keys: null,
              checked: null,
              enabled: true,
              whyNot: null,
            },
          ];
        }),
      ).filter((row) => matchesQuery(query, [row.label]));
    },
  };
}

/** Opens the document of a row this source made beside the page; false for any other row. */
export function runBesideRow(id: string): boolean {
  const action = findPendingAction(id);
  if (action !== undefined) {
    action();
    return true;
  }
  const kind = BESIDE_KINDS.find((entry) =>
    id.startsWith(`${ROW}${entry.id}:`),
  );
  if (kind === undefined) return false;
  const rest = id.slice(`${ROW}${kind.id}:`.length);
  if (rest.startsWith(OPEN_PREFIX)) return false;
  openBeside(rest, kind.id, null);
  return true;
}
