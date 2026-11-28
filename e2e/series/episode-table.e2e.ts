// Dana views Harbour Lights' seasons and episode table, and naming a draft moves an episode's stage.
import { docPath } from "@manent/demo";
import { DOCUMENT_WORDS, HISTORY_WORDS, SERIES_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { EDITABLE } from "../editor/support.ts";
import { labelOf } from "../support/interface.ts";
import { reseedDemo, signedInAs } from "../support/tour.ts";

const TIMEOUT_MS = 180_000;

test("Dana sees Harbour Lights' seasons and episode table, and naming a draft moves its stage", async ({
  page,
  request,
}) => {
  test.setTimeout(TIMEOUT_MS);
  await reseedDemo(request);
  try {
    await signedInAs(page, "dana", "/?panels=closed");

    const heading = SERIES_WORDS.seasonHeading("Harbour Lights", 2);
    const section = page.locator(`section[aria-label="${heading}"]`);
    await expect(section).toBeVisible();

    const table = section.locator("[data-tour='episode_table']");
    await expect(table).toBeVisible();
    for (const column of Object.values(SERIES_WORDS.columns)) {
      await expect(table.locator(".mn-table-head")).toContainText(column);
    }

    const rowOf = (ep: string) =>
      table.getByRole("listitem").filter({ hasText: ep }).first();

    await expect(rowOf("Low Tide")).toContainText("Sam Okafor");
    await expect(rowOf("Low Tide")).toContainText("Blue");
    await expect(rowOf("Low Tide")).toContainText("58");

    await expect(rowOf("Salt")).toContainText("Dana Reyes");
    await expect(rowOf("Salt")).toContainText("White");
    await expect(rowOf("Salt")).toContainText("56");

    await expect(rowOf("Undertow")).toContainText("Dana Reyes");
    await expect(rowOf("Undertow")).toContainText("Network · 4 open");
    await expect(rowOf("Undertow")).toContainText("61");
    await expect(rowOf("Undertow")).toContainText("▲3");

    await expect(rowOf("The Ferry")).toContainText("Sam Okafor");
    await expect(rowOf("The Ferry")).toContainText("Studio");
    await expect(rowOf("The Ferry")).toContainText("52");

    await expect(rowOf("Slack Water")).toContainText("Sam Okafor");
    await expect(rowOf("Slack Water")).toContainText("Writer's First");
    await expect(rowOf("Slack Water")).toContainText("31");

    await expect(rowOf("The Bar")).toContainText("Dana Reyes");
    await expect(rowOf("The Bar")).toContainText("Outline");

    // Open 205 Slack Water and name a draft on Harbour Lights' ladder to advance its stage
    await page.goto(`${docPath("medium/harbour-lights/205")}?panels=closed`);
    await expect(page.locator(EDITABLE)).toBeVisible();
    await expect(page.locator("[data-tour='status:server']")).toHaveText(
      "Synced",
    );
    await page.getByRole("heading", { level: 1 }).getByRole("button").click();
    await page
      .getByRole("menuitem", { name: labelOf("history.nameDraft") })
      .click();
    const field = page.getByRole("textbox", { name: HISTORY_WORDS.nameField });
    await expect(field).toBeVisible();
    await field.fill("Studio");
    await field.press("Enter");
    await expect(page.locator("[data-tour='history_list']")).toContainText(
      "Studio",
    );

    // Return from History -> script -> Library and verify 205's stage moved to Studio
    await page
      .getByRole("button", { name: HISTORY_WORDS.backToScript })
      .click();
    await expect(page.locator(EDITABLE)).toBeVisible();
    await page.getByRole("button", { name: DOCUMENT_WORDS.back }).click();
    await page.waitForURL((at) => at.pathname === "/");
    const updatedTable = page
      .locator(`section[aria-label="${heading}"]`)
      .locator("[data-tour='episode_table']");
    await expect(
      updatedTable
        .getByRole("listitem")
        .filter({ hasText: "Slack Water" })
        .first(),
    ).toContainText("Studio");
  } finally {
    await reseedDemo(request);
  }
});

test("Library episode, project, and rundown tables keep uniform padding, non-overlapping columns, and pixel-aligned headers across viewports", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signedInAs(page, "dana", "/");

  const checkEpisodeTables = async (
    width: number,
    height: number,
    minTitleWidth: number,
    expectAllColumns: boolean,
  ): Promise<void> => {
    await page.setViewportSize({ width, height });
    const tables = page.locator("[data-tour='episode_table']");
    await expect(tables.first()).toBeVisible();
    const count = await tables.count();
    expect(count).toBeGreaterThan(0);

    for (let t = 0; t < count; t += 1) {
      const report = await tables.nth(t).evaluate((tableEl) => {
        const tableRect = tableEl.getBoundingClientRect();
        const head = tableEl.querySelector<HTMLElement>(".mn-table-head");
        const rows = [...tableEl.querySelectorAll<HTMLElement>(".mn-row")];
        if (head === null || rows.length === 0)
          return {
            error: "missing head or rows",
            visibleCount: 0,
            titleWidth: 0,
            headOverlaps: [] as string[],
            rowIssues: [] as string[],
          };

        const headCells = [...head.children] as HTMLElement[];
        const visibleHead = headCells
          .map((el, index) => ({
            index,
            text: el.textContent?.trim() ?? "",
            rect: el.getBoundingClientRect(),
            visible: getComputedStyle(el).display !== "none",
          }))
          .filter((cell) => cell.visible);

        const headOverlaps: string[] = [];
        for (let i = 1; i < visibleHead.length; i += 1) {
          const prev = visibleHead[i - 1]!;
          const curr = visibleHead[i]!;
          if (prev.rect.right > curr.rect.left + 0.5) {
            headOverlaps.push(
              `${prev.text}(${prev.rect.right.toFixed(1)}) > ${curr.text}(${curr.rect.left.toFixed(1)})`,
            );
          }
        }

        const titleHead = visibleHead.find((cell) => cell.index === 1);
        const rowIssues: string[] = [];
        for (const [rowIdx, row] of rows.entries()) {
          const rowMain = row.firstElementChild as HTMLElement | null;
          if (rowMain === null) continue;
          const cells = [...rowMain.children] as HTMLElement[];
          const firstVisible = cells[0]?.getBoundingClientRect();
          const lastVisible = cells[cells.length - 1]?.getBoundingClientRect();
          if (firstVisible && firstVisible.left - tableRect.left < 10) {
            rowIssues.push(
              `row ${rowIdx} left inset ${(firstVisible.left - tableRect.left).toFixed(1)}px`,
            );
          }
          if (lastVisible && tableRect.right - lastVisible.right < 10) {
            rowIssues.push(
              `row ${rowIdx} right inset ${(tableRect.right - lastVisible.right).toFixed(1)}px`,
            );
          }
          for (const h of visibleHead) {
            const cell = cells[h.index];
            if (cell === undefined) continue;
            const cellRect = cell.getBoundingClientRect();
            if (Math.abs(cellRect.left - h.rect.left) > 1.5) {
              rowIssues.push(
                `row ${rowIdx} col ${h.index} (${h.text}) left drift ${(cellRect.left - h.rect.left).toFixed(1)}px`,
              );
            }
            if (Math.abs(cellRect.right - h.rect.right) > 1.5) {
              rowIssues.push(
                `row ${rowIdx} col ${h.index} (${h.text}) right drift ${(cellRect.right - h.rect.right).toFixed(1)}px`,
              );
            }
            if (h.index === 5) {
              const inner = cell.firstElementChild as HTMLElement | null;
              if (inner !== null) {
                const innerRect = inner.getBoundingClientRect();
                const cellPadEnd =
                  parseFloat(getComputedStyle(cell).paddingInlineEnd) || 0;
                const expectedRight = cellRect.right - cellPadEnd;
                if (Math.abs(innerRect.right - expectedRight) > 1.5) {
                  rowIssues.push(
                    `row ${rowIdx} pages content right drift ${(innerRect.right - expectedRight).toFixed(1)}px`,
                  );
                }
              }
            }
          }
        }
        return {
          error: null,
          visibleCount: visibleHead.length,
          titleWidth: titleHead?.rect.width ?? 0,
          headOverlaps,
          rowIssues,
        };
      });

      expect(report.error).toBeNull();
      expect(report.headOverlaps).toEqual([]);
      expect(report.rowIssues).toEqual([]);
      expect(report.titleWidth).toBeGreaterThanOrEqual(minTitleWidth);
      if (expectAllColumns) expect(report.visibleCount).toBe(9);
    }
  };

  const checkPlainAndRundownTables = async (): Promise<void> => {
    const projectsCard = page
      .getByRole("region", { name: "Projects" })
      .locator(".mn-table")
      .first();
    await expect(projectsCard).toBeVisible();
    const plainDrift = await projectsCard.evaluate((card) => {
      const head = card.querySelector<HTMLElement>(".mn-table-head");
      const firstRow = card.querySelector<HTMLElement>(".mn-row");
      if (head === null || firstRow === null) return "missing";
      const headCells = [...head.children] as HTMLElement[];
      const statusHead = headCells[3]?.getBoundingClientRect();
      const statusCell = firstRow
        .querySelector<HTMLElement>("[data-trailing], [data-unavailable]")
        ?.getBoundingClientRect();
      if (!statusHead || !statusCell) return "missing status";
      const leftDrift = Math.abs(statusCell.left - statusHead.left);
      const rightDrift = Math.abs(statusCell.right - statusHead.right);
      return leftDrift > 1.5 || rightDrift > 1.5
        ? `left=${leftDrift.toFixed(1)} right=${rightDrift.toFixed(1)}`
        : null;
    });
    expect(plainDrift).toBeNull();

    const rundownCard = page.locator("[data-tour='library:rundowns']").first();
    await expect(rundownCard).toBeVisible();
    const rundownDrift = await rundownCard.evaluate((card) => {
      const head = card.querySelector<HTMLElement>(".mn-table-head");
      const firstRow = card.querySelector<HTMLElement>(".mn-row");
      if (head === null || firstRow === null) return "missing";
      const headCells = [...head.children] as HTMLElement[];
      const statusHead = headCells[4]?.getBoundingClientRect();
      const statusCell = firstRow
        .querySelector<HTMLElement>("[data-trailing], [data-unavailable]")
        ?.getBoundingClientRect();
      if (!statusHead || !statusCell) return "missing status";
      const leftDrift = Math.abs(statusCell.left - statusHead.left);
      const rightDrift = Math.abs(statusCell.right - statusHead.right);
      return leftDrift > 1.5 || rightDrift > 1.5
        ? `left=${leftDrift.toFixed(1)} right=${rightDrift.toFixed(1)}`
        : null;
    });
    expect(rundownDrift).toBeNull();
  };

  // Desktop with Tour open (~652–812px main column)
  await checkEpisodeTables(1440, 900, 120, false);
  await checkPlainAndRundownTables();
  await checkEpisodeTables(1366, 850, 120, false);
  await checkEpisodeTables(1280, 800, 120, false);

  // Close the Tour side panel: wide desktop shows all 8 columns + menu rail, then check tablet and mobile
  const closePanel = page.getByRole("button", { name: "Close side panel" });
  if (await closePanel.isVisible()) await closePanel.click();
  await checkEpisodeTables(1280, 800, 120, true);
  await checkPlainAndRundownTables();
  await checkEpisodeTables(768, 900, 120, false);
  await checkEpisodeTables(375, 812, 90, false);
});
