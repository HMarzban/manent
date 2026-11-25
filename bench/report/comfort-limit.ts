// The length at which the app tells a person a script is long, read from the web app's source as
// text, because the benchmark never imports an app.

import { join } from "node:path";

const COMFORT_FILE = "apps/web/src/editor-host/comfort.ts";
const COMFORT_LIMIT = /\bCOMFORT_LIMIT_PAGES = (\d+)\b/;

/** The pages of `COMFORT_LIMIT_PAGES` in the repository at `root`. Throws naming the file when they are not there. */
export async function readComfortLimit(root: string): Promise<number> {
  const path = join(root, COMFORT_FILE);
  const file = Bun.file(path);
  const digits = (await file.exists())
    ? COMFORT_LIMIT.exec(await file.text())?.[1]
    : undefined;
  if (digits === undefined)
    throw new Error(`${path} holds no COMFORT_LIMIT_PAGES = <digits>`);
  return Number(digits);
}
