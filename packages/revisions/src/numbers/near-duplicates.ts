// Near-duplicate scene-heading location grouping using exact-minus-dot and findNearMatches.
import type { LayoutBlock } from "@manent/pagination";
import { findNearMatches } from "../names/near-match.ts";
import { parseSceneLocation } from "./numbers.ts";

export interface NearDuplicateLocationGroup {
  /** Most frequently used spelling in the group (earliest first use on a tie). */
  readonly canonical: string;
  /** Rarer spellings to merge into `canonical`, in descending count / first-use order. */
  readonly variants: readonly string[];
  /** All distinct spellings in display order (`canonical` first, then `variants`). */
  readonly spellings: readonly string[];
  /** Total scene headings currently written with one of `variants`. */
  readonly affectedCount: number;
}

interface SpellingEntry {
  readonly spelling: string;
  count: number;
  readonly firstUse: number;
}

const TRAILING_DOTS = /\.+$/;
const stripDot = (text: string): string => text.replace(TRAILING_DOTS, "");

function coversWhole(candidate: string, target: string): boolean {
  const matches = findNearMatches(candidate, [target]);
  return matches.some((m) => m.from === 0 && m.to === candidate.length);
}

function areNearDuplicates(a: string, b: string): boolean {
  const sa = stripDot(a).trim();
  const sb = stripDot(b).trim();
  if (sa === "" || sb === "") return false;
  if (sa.toLowerCase() === sb.toLowerCase()) return true;
  return coversWhole(sa, sb) || coversWhole(sb, sa);
}

/**
 * Finds groups of 2+ distinct scene-heading location spellings that look like one location
 * (equal after stripping trailing `.` and case, or near-matches via `findNearMatches`).
 */
export function findNearDuplicateLocations(
  blocks: readonly LayoutBlock[],
): readonly NearDuplicateLocationGroup[] {
  const bySpelling = new Map<string, SpellingEntry>();
  let order = 0;
  for (const block of blocks) {
    if (block.type !== "scene_heading") continue;
    const { location } = parseSceneLocation(block.text);
    if (location === "") continue;
    const existing = bySpelling.get(location);
    if (existing !== undefined) {
      existing.count += 1;
    } else {
      bySpelling.set(location, {
        spelling: location,
        count: 1,
        firstUse: order++,
      });
    }
  }

  const entries = [...bySpelling.values()];
  if (entries.length < 2) return [];

  const parent = entries.map((_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    let cur = x;
    while (parent[cur] !== root) {
      const next = parent[cur]!;
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  const unite = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (areNearDuplicates(entries[i]!.spelling, entries[j]!.spelling)) {
        unite(i, j);
      }
    }
  }

  const buckets = new Map<number, SpellingEntry[]>();
  for (let i = 0; i < entries.length; i++) {
    const root = find(i);
    let list = buckets.get(root);
    if (list === undefined) {
      list = [];
      buckets.set(root, list);
    }
    list.push(entries[i]!);
  }

  const groups: NearDuplicateLocationGroup[] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const sorted = list.toSorted(
      (a, b) => b.count - a.count || a.firstUse - b.firstUse,
    );
    const canonical = sorted[0]!.spelling;
    const rest = sorted.slice(1);
    const variants = rest.map((entry) => entry.spelling);
    const affectedCount = rest.reduce((sum, entry) => sum + entry.count, 0);
    groups.push({
      canonical,
      variants,
      spellings: [canonical, ...variants],
      affectedCount,
    });
  }
  return groups;
}
