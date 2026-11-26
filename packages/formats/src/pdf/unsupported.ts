// The text of a script the script font cannot draw, which a PDF prints as boxes,
// plus missing graphic assets that fall back to vector placeholders.
import { engineFor } from "@manent/pagination";
import type { Engine, Pagination } from "@manent/pagination";
import type { PdfAsset } from "./graphics.ts";

// The subset whose files hold every code point of `cluster`; null when no one subset does, so the
// font has no glyph for it.
function subsetOf(
  engine: Engine,
  cluster: string,
): "latin" | "latin-ext" | null {
  const subset = engine.fontSubset(cluster.codePointAt(0)!);
  for (const char of cluster)
    if (engine.fontSubset(char.codePointAt(0)!) !== subset) return null;
  return subset;
}

/**
 * Each block holding a cluster the script font has no glyph for, in block order, with those
 * clusters, each once, in the order they first appear. Clusters of 0 cells are left out: nothing
 * is drawn for them. Throws RangeError when this build does not carry the engine `p` was paginated
 * with.
 */
export function findUnsupportedCharacters(
  p: Pagination,
): { blockId: string; characters: string[] }[] {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(
      `no engine of version ${p.engineVersion} in this build`,
    );
  const found: { blockId: string; characters: string[] }[] = [];
  for (const { id, text } of p.blocks) {
    const characters = new Set<string>();
    for (let at = 0; at < text.length;) {
      const end = engine.graphemeEnd(text, at);
      const cluster = text.slice(at, end);
      if (
        subsetOf(engine, cluster) === null &&
        engine.clusterCells(text, at, end, false) > 0
      )
        characters.add(cluster);
      at = end;
    }
    if (characters.size > 0)
      found.push({ blockId: id, characters: [...characters] });
  }
  return found;
}

/** Graphic blocks referencing an `assetId` that is absent from `assets` (drawn as vector placeholders). */
export function findMissingPdfAssets(
  p: Pagination,
  assets?: ReadonlyMap<string, PdfAsset>,
): { readonly blockId: string; readonly assetId: string }[] {
  const missing: { readonly blockId: string; readonly assetId: string }[] = [];
  for (const block of p.blocks) {
    if (block.type !== "graphic") continue;
    const assetId = block.graphic?.assetId ?? null;
    if (assetId !== null && !assets?.has(assetId))
      missing.push({ blockId: block.id, assetId });
  }
  return missing;
}
