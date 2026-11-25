// A tab holding edits from an old seed, on a demo of its own: after Reset it forgets them and pushes nothing.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docPath } from "@manent/demo";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readStatus, setConnection, statusButton } from "../offline/support.ts";
import { E2E_PORT } from "../support/ports.ts";
import { committedOnDevice, reseedDemo, signedInAs } from "../support/tour.ts";

const ROOT = join(import.meta.dirname, "..", "..");
// beside the Tour's own demo, which this test leaves alone
const PORT = E2E_PORT + 10;
const APP_URL = `http://localhost:${PORT}`;
// an install, a build of the web app and the foreground seed, at the hard fail of its budget
const START_MS = 180_000;
const SLACK_WATER = docPath("medium/harbour-lights/205");
const OLD_LINE = "OLD SEED LINE";

/** The demo command `args` with its data and web app in `dir`, as a tester runs it from the repository. */
function cli(dir: string, args: string[]): ChildProcess {
  return spawn("bun", ["tools/demo/cli.ts", ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      MANENT_DATA_DIR: dir,
      // never apps/web/dist, which the Tour's demo is serving
      MANENT_WEB_DIR: join(dir, "web"),
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

/** The command's exit code once it has ended, at once when it has already. */
const exitOf = (command: ChildProcess): Promise<number | null> =>
  command.exitCode !== null || command.signalCode !== null
    ? Promise.resolve(command.exitCode)
    : new Promise((resolve) => command.once("exit", resolve));

/** Opens 205 as `userId` and waits until the server's copy is shown. */
async function openSynced(page: Page, userId: string): Promise<void> {
  await signedInAs(page, userId, SLACK_WATER);
  await expect(
    page.locator("[data-tour='page'] [data-type='action']").first(),
  ).toBeVisible();
  await expect(statusButton(page)).toBeVisible();
  await expect
    .poll(() => readStatus(page), { timeout: 30_000 })
    .toBe("Saved · Synced");
}

test("after Reset a tab's waiting edits from the old seed never reach the new one", async ({
  browser,
  playwright,
}) => {
  test.setTimeout(2 * START_MS);
  const dir = await mkdtemp(join(tmpdir(), "manent demo "));
  const demo = cli(dir, [
    "demo",
    "--no-open",
    "--port",
    String(PORT),
    "--control-port",
    String(PORT + 1),
  ]);
  try {
    await expect
      .poll(
        async () => {
          if (demo.exitCode !== null)
            throw new Error(`the demo command ended with ${demo.exitCode}`);
          try {
            return (await fetch(`http://127.0.0.1:${PORT}/health`)).status;
          } catch {
            // nothing listens yet
            return 0;
          }
        },
        { timeout: START_MS },
      )
      .toBe(200);
    const api = await playwright.request.newContext({ baseURL: APP_URL });
    const sam = await (
      await browser.newContext({ baseURL: APP_URL })
    ).newPage();
    await openSynced(sam, "sam");
    await setConnection(sam, "offline");
    await sam
      .locator("[data-tour='page'] [data-type='action']")
      .first()
      .click();
    await sam.keyboard.press("End");
    await sam.keyboard.type(` ${OLD_LINE}`);
    await expect
      .poll(() => readStatus(sam))
      .toMatch(/^Saved · Offline, \d+ waiting$/);
    await committedOnDevice(sam, "sam");
    await reseedDemo(api);
    const seedId: unknown = Reflect.get(
      Object(await (await api.get("/api/demo")).json()),
      "seedId",
    );
    // useResetting may reload Sam onto the home route once the new seed answers, clearing the session and its Connection control
    const online = sam
      .getByRole("region", { name: "Demo" })
      .getByRole("group", { name: "Connection" })
      .getByRole("button", { name: "Online" });
    await expect(async () => {
      if (
        (await sam.evaluate(() => localStorage.getItem("manent.seed"))) ===
        seedId
      )
        return;
      if (await online.isVisible()) {
        await setConnection(sam, "online");
        await sam.reload();
      }
      expect(
        await sam.evaluate(() => localStorage.getItem("manent.seed")),
      ).toBe(seedId);
    }).toPass({ timeout: 30_000 });
    await expect(
      sam
        .getByRole("heading", { name: "Choose who you are" })
        .or(sam.getByRole("heading", { name: "Library" })),
    ).toBeVisible();
    await openSynced(sam, "sam");
    await expect(sam.getByText(OLD_LINE)).toHaveCount(0);
    const dana = await (
      await browser.newContext({ baseURL: APP_URL })
    ).newPage();
    await openSynced(dana, "dana");
    await expect(dana.getByText(OLD_LINE)).toHaveCount(0);
    await api.dispose();
  } finally {
    await exitOf(cli(dir, ["stop"]));
    // a demo stopped before it answered has written nothing that stop can find
    demo.kill("SIGTERM");
    await exitOf(demo);
    await rm(dir, { recursive: true, force: true });
  }
});
