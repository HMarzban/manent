import { expect, test } from "bun:test";
import { join } from "node:path";
import { STUDIO_PALETTES } from "@manent/ui";
import { buildGemsDemoHtml } from "../theme/gems-demo.ts";

const repoRoot = join(import.meta.dir, "..", "..");

test("builds a self-contained offline 24-gem Museum showcase from live packages/ui sources", async () => {
  const html = await buildGemsDemoHtml(repoRoot);
  expect(html).toContain("<!doctype html>");
  expect(html).toContain("__MANENT_GEMS__");
  expect(html).toContain("__MANENT_GEMS_DATA__");
  expect(html).not.toMatch(/<script[^>]+src="https?:/i);
  for (const palette of STUDIO_PALETTES) {
    expect(html).toContain(`"id":"${palette.id}"`);
  }
});
