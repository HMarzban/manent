// Every sentence of the status and of the moments that test trust, each reached the way a person reaches it where the
// demo can, and otherwise by laying a fact over the real sync through the test build's hooks.
import { expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import {
  TITLE,
  choose,
  crashed,
  deletedWhileAway,
  inject,
  offlineFor,
  overlapped,
  rebuiltAway,
  recovered,
  reorganise,
  stopFromBar,
  synced,
  today,
  waiting,
  yourNewScript,
} from "./scenarios.ts";
import {
  SPEECH,
  goOffline,
  goOnline,
  message,
  readStatus,
  setConnection,
  syncHook,
  test,
  typeIn,
} from "./support.ts";

// two people in browsers of their own, each signing in, take longer than the default
test.describe.configure({ timeout: 120_000 });

interface Row {
  sentence: string;
  /** The page whose status reads `sentence` once it has been brought there. */
  reach(browser: Browser): Promise<Page>;
}

const STATUS_ROWS: readonly Row[] = [
  { sentence: "Saved · Synced", reach: synced },
  {
    sentence: "Saved · Syncing…",
    async reach(browser) {
      const page = await synced(browser);
      await setConnection(page, "slow");
      await typeIn(page, SPEECH, " tonight");
      return page;
    },
  },
  {
    sentence: "Saved · Offline",
    async reach(browser) {
      const page = await synced(browser);
      await setConnection(page, "offline");
      return page;
    },
  },
  {
    sentence: "Saved · Offline, 1 waiting",
    async reach(browser) {
      const page = await synced(browser);
      await setConnection(page, "offline");
      await typeIn(page, SPEECH, " tonight");
      return page;
    },
  },
  {
    sentence: "Saved · Offline since Tue 14:10, 1 waiting",
    reach: (browser) => offlineFor(browser, new Date(2026, 10, 17, 14, 10), 25),
  },
  {
    sentence: "Saved · Offline since 3 Nov, 1 waiting",
    reach: (browser) =>
      offlineFor(browser, new Date(2026, 10, 3, 14, 10), 7 * 24),
  },
  {
    sentence: "Saved · Can't reach Manent",
    async reach(browser) {
      const page = await synced(browser);
      await stopFromBar(page);
      return page;
    },
  },
  {
    sentence: "Saved · Can't reach Manent, 1 waiting",
    reach: (browser) => waiting(browser, 1),
  },
  {
    sentence: "Saved · Server out of date, 1 waiting",
    async reach(browser) {
      const page = await waiting(browser, 1);
      await inject(page, { issue: "server_old" });
      return page;
    },
  },
  {
    sentence: "Saved · Update Manent to sync, 1 waiting",
    async reach(browser) {
      const page = await waiting(browser, 1);
      await inject(page, { issue: "too_old" });
      return page;
    },
  },
  {
    sentence: "Saved · Sign in to sync",
    async reach(browser) {
      const page = await synced(browser);
      await inject(page, { issue: "sign_in" });
      return page;
    },
  },
  {
    sentence: "Saved · Sign in to sync, 1 waiting",
    async reach(browser) {
      const page = await waiting(browser, 1);
      await inject(page, { issue: "sign_in" });
      return page;
    },
  },
  {
    sentence: "Saved · Access removed",
    async reach(browser) {
      const page = await synced(browser);
      await inject(page, { side: "access_removed" });
      return page;
    },
  },
  {
    sentence: "Saved · Access removed, 2 not sent",
    async reach(browser) {
      const page = await waiting(browser, 2);
      await inject(page, { side: "access_removed" });
      return page;
    },
  },
  { sentence: "Saved · Deleted, 2 not sent", reach: deletedWhileAway },
  {
    sentence: "Saved · Only in this browser — not backed up",
    reach: yourNewScript,
  },
  {
    sentence: "Saved · Synced, 1 to review",
    reach: overlapped,
  },
  {
    sentence: "View only",
    async reach(browser) {
      const page = await synced(browser);
      await inject(page, { side: "view_only" });
      return page;
    },
  },
  {
    sentence: "Read-only — update Manent to edit",
    async reach(browser) {
      const page = await synced(browser);
      await inject(page, { side: "read_only" });
      return page;
    },
  },
  {
    sentence: "Not saved on this device · Synced",
    async reach(browser) {
      const page = await synced(browser);
      await syncHook(page, "refuseStore", "quota");
      await typeIn(page, SPEECH, " tonight");
      return page;
    },
  },
  {
    sentence: "Can't save on this device — export a copy",
    async reach(browser) {
      const page = await synced(browser);
      await syncHook(page, "refuseStore", "write_failed");
      await setConnection(page, "offline");
      await typeIn(page, SPEECH, " tonight");
      return page;
    },
  },
];

for (const row of STATUS_ROWS)
  test(`the status reads "${row.sentence}"`, async ({ browser }) => {
    const page = await row.reach(browser);
    await expect.poll(() => readStatus(page)).toBe(row.sentence);
  });

/** A message row; `undone`: its Undo opens the passage again. */
interface TrustRow extends Row {
  undone: boolean;
}

const TRUST_ROWS: readonly TrustRow[] = [
  {
    sentence: "1 change synced",
    undone: false,
    async reach(browser) {
      const page = await synced(browser);
      await setConnection(page, "offline");
      await typeIn(page, SPEECH, " tonight");
      await expect
        .poll(() => readStatus(page))
        .toBe("Saved · Offline, 1 waiting");
      await setConnection(page, "online");
      return page;
    },
  },
  {
    sentence:
      "Manent reorganised how this script is stored. Undo history for this script starts again from now.",
    undone: false,
    async reach(browser) {
      const page = await synced(browser);
      await reorganise(page);
      return page;
    },
  },
  {
    sentence:
      "Manent reorganised how this script is stored while you were away. Your 2 changes were re-applied. Undo history for this script starts again from now.",
    undone: false,
    reach: rebuiltAway,
  },
  {
    sentence: `Your changes made offline since ${today()} could not be merged automatically. They are saved as 'Recovered — this device, ${today()}'.`,
    undone: false,
    async reach(browser) {
      const page = await synced(browser);
      await inject(page, { event: { type: "past_window", versionId: "v" } });
      return page;
    },
  },
  {
    sentence:
      "Your changes made offline could not be merged automatically. They are saved as 'Recovered — this device'.",
    undone: false,
    async reach(browser) {
      const page = await yourNewScript(browser);
      await inject(page, { event: { type: "past_window", versionId: "v" } });
      return page;
    },
  },
  {
    sentence: `You no longer have access to '${TITLE}'. Your 2 changes that were not sent are kept on this device.`,
    undone: false,
    async reach(browser) {
      const page = await waiting(browser, 2);
      await inject(page, { side: "access_removed" });
      return page;
    },
  },
  {
    sentence: `'${TITLE}' was deleted by Dana Reyes on ${today()}. Your 2 changes that were not sent are kept on this device.`,
    undone: false,
    reach: deletedWhileAway,
  },
  ...[
    [
      3,
      "Manent could not accept some changes from this device. They are saved as 'Recovered — this device' and the rest were re-applied.",
    ] as const,
    [
      0,
      "Manent could not accept this device's changes. They are saved as 'Recovered — this device'.",
    ] as const,
  ].map(([replayed, sentence]) => ({
    sentence,
    undone: false,
    async reach(browser: Browser) {
      const page = await synced(browser);
      await inject(page, {
        event: { type: "rejected", code: 4400, replayed, setAside: 1 },
      });
      return page;
    },
  })),
  {
    sentence: "Your last 2 changes were already saved.",
    undone: false,
    reach: crashed,
  },
  {
    sentence:
      "Your change to paper size was made before page numbers were locked and was not applied.",
    undone: false,
    async reach(browser) {
      const page = await synced(browser);
      await inject(page, {
        event: { type: "setting_refused", key: "script.paper", message: "" },
      });
      return page;
    },
  },
  {
    sentence: "Used Dana's wording in Sc. 1.",
    undone: true,
    reach: choose(overlapped, "Use Dana's"),
  },
  {
    sentence: "Used your wording in Sc. 1.",
    undone: true,
    reach: choose(overlapped, "Use mine"),
  },
  {
    sentence: "Kept the merged wording in Sc. 1.",
    undone: true,
    reach: choose(overlapped, "Keep as merged"),
  },
  {
    sentence: "Put the recovered text back in Sc. 1.",
    undone: true,
    reach: choose(recovered, "Use mine"),
  },
];

for (const row of TRUST_ROWS)
  test(`the message reads "${row.sentence}"`, async ({ browser }) => {
    const page = await row.reach(browser);
    const shown = message(page, row.sentence);
    await expect(shown).toBeVisible({ timeout: 30_000 });
    if (!row.undone) return;
    await shown.getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(() => readStatus(page))
      .toBe("Saved · Synced, 1 to review");
  });

test("going offline shows no dialog and changes the status within two seconds", async ({
  browser,
}) => {
  const page = await synced(browser);
  const context = page.context();
  await goOffline(context, page);
  try {
    await expect
      .poll(() => readStatus(page), { timeout: 2000 })
      .toBe("Saved · Offline");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  } finally {
    await goOnline(context, page);
  }
});

test("the server stopped from the demo bar reads Can't reach Manent, and comes back by itself", async ({
  browser,
}) => {
  const page = await synced(browser);
  await stopFromBar(page);
  await typeIn(page, SPEECH, " tonight");
  await expect
    .poll(() => readStatus(page))
    .toBe("Saved · Can't reach Manent, 1 waiting");
  await page
    .getByRole("region", { name: "Demo" })
    .getByRole("button", { name: "Start the server" })
    .click();
  await expect
    .poll(() => readStatus(page), { timeout: 30_000 })
    .toBe("Saved · Synced");
});

test("Synced comes back only after two seconds with nothing waiting", async ({
  browser,
}) => {
  const page = await synced(browser);
  // before the first key, as the page's two seconds start after the last change is acknowledged
  const typingAt = Date.now();
  await typeIn(page, SPEECH, " tonight");
  await expect
    .poll(() => readStatus(page), { intervals: [50] })
    .toBe("Saved · Syncing…");
  await expect
    .poll(() => readStatus(page), { intervals: [50] })
    .toBe("Saved · Synced");
  expect(Date.now() - typingAt).toBeGreaterThanOrEqual(2000);
});
