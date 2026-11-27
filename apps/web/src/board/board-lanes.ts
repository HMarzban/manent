// Qualitative lane colour resolution for Board storylines (1..10 mapped to --collab-* tokens).
import type { BoardStoryline, StorylineTone } from "./model.ts";

/** Deterministic FNV-1a hash mapping a storyline id to a qualitative lane 1..10. */
function hashLane(id: string): StorylineTone {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (((h >>> 0) % 10) + 1) as StorylineTone;
}

/**
 * Resolves a qualitative lane token (1..10) for every storyline: explicit `tone` wins, and automatic lanes stay stable
 * across filters while avoiding duplicates among visible storylines when possible.
 */
export function resolveStorylineLanes(
  storylines: readonly BoardStoryline[],
): ReadonlyMap<string, StorylineTone> {
  const lanes = new Map<string, StorylineTone>();
  const used = new Set<StorylineTone>();
  for (const s of storylines) {
    if (s.tone !== undefined && s.tone !== null) {
      lanes.set(s.id, s.tone);
      used.add(s.tone);
    }
  }
  for (const s of storylines) {
    if (lanes.has(s.id)) continue;
    let candidate = hashLane(s.id);
    if (used.size < 10) {
      for (let step = 0; step < 10 && used.has(candidate); step += 1) {
        candidate = ((candidate % 10) + 1) as StorylineTone;
      }
    }
    lanes.set(s.id, candidate);
    used.add(candidate);
  }
  return lanes;
}
