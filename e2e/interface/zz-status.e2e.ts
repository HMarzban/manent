import { corpusDoc } from "@manent/pagination/testing";
import { test } from "@playwright/test";
import { DANA, corpusLine, groupHook, openScript } from "../editor/support.ts";

const SHOTS = process.env["SHOTS"]!;
const TAG = process.env["TAG"]!;
test("measure", async ({ page, browserName }) => {
  test.setTimeout(180_000);
  await openScript(page, "screenplay", corpusDoc([corpusLine("scene_heading", "INT. LAMP ROOM - NIGHT"), corpusLine("action", "Wind at the glass.")]), "sam");
  await groupHook(page, "remote", "join", DANA);
  await groupHook(page, "remote", "select", 1, 2);
  const set = (facts: object) => page.evaluate((patch) => (window as any).__manent.setStatus(patch), facts);
  const titles = ["Lamp", "The Lamp Room, a very long title that goes on and on until it fills the whole of the title bar"];
  for (const t of titles) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator("h1 button").click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByRole("textbox", { name: "Rename" }).fill(t);
    await page.keyboard.press("Enter");
    for (const width of [1440, 1280, 1024, 900, 768, 640, 520, 420, 360]) {
      await page.setViewportSize({ width, height: 800 });
      const rows: string[] = [];
      for (const [name, facts] of [
        ["synced", { access: "edit", device: "ok", network: "online", neverSynced: false, server: "synced", waiting: 0, toReview: 0, offlineSinceAt: null }],
        ["syncing", { server: "syncing", waiting: 3 }],
        ["offline12", { network: "offline", waiting: 12 }],
        ["since", { network: "offline", waiting: 1212, offlineSinceAt: new Date(2026, 10, 18, 22, 58).getTime(), now: new Date(2026,10,24,10,0).getTime() }],
        ["unreach", { network: "online", server: "unreachable", waiting: 1212, offlineSinceAt: null }],
        ["appold", { server: "app_old", waiting: 1212 }],
        ["never", { neverSynced: true }],
        ["view", { neverSynced: false, access: "view" }],
        ["alert", { access: "edit", device: "failing", server: "synced", waiting: 0 }],
        ["alertlong", { access: "edit", device: "failing", server: "app_old", waiting: 1212 }],
      ] as const) {
        await set(facts);
        await page.waitForTimeout(name === "synced" ? 2300 : 60);
        rows.push(name.padEnd(9) + " " + await page.evaluate(() => {
          const bar = document.querySelector("[data-region='title_bar']")!;
          const b = (e: Element | null | undefined) => { if (!e) return "-"; const r = e.getBoundingClientRect(); return `${Math.round(r.x)}+${Math.round(r.width)}@${Math.round(r.y - bar.getBoundingClientRect().y)}`; };
          const place = document.querySelector("[data-server-shape]")!;
          return [`bar${Math.round(bar.getBoundingClientRect().height)}`, "h1 " + b(bar.querySelector("h1")), "place " + b(place), "btn " + b(place.querySelector("button")), "right " + b(bar.lastElementChild), "people " + b(bar.lastElementChild?.firstElementChild)].join(" | ");
        }));
        if (["synced", "since", "alertlong"].includes(name) && [1280, 900, 640, 420, 360].includes(width)) await page.screenshot({ path: `${SHOTS}/e2e-status-${TAG}-${browserName}-${t.length < 10 ? "short" : "long"}-${width}-${name}.png`, clip: { x: 0, y: 0, width, height: 130 } });
      }
      console.log(`## ${t.slice(0, 6)} ${width}\n${rows.join("\n")}`);
    }
  }
});
