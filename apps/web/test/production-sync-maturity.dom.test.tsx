import { withDom } from "@manent/testkit/dom";
import { Row, SYNC_CENTRE_WORDS, StateBar } from "@manent/ui";
import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Choices } from "../src/production/choices.tsx";
import {
  NEW_SCRIPT,
  click,
  renderFrame,
  unmountFrame,
} from "./document-frame.fixtures.tsx";

withDom();

describe("Section 2 production & sync maturity", () => {
  test("Row uses aria-pressed and data-selected on role=button and keeps aria-selected otherwise", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <div>
          <Row selected onActivate={() => {}}>
            Page 1
          </Row>
          <Row selected>Static row</Row>
        </div>,
      );
    });

    const rows = host.querySelectorAll<HTMLElement>(".mn-row");
    expect(rows.length).toBe(2);
    const interactive = rows[0]!;
    expect(interactive.getAttribute("role")).toBe("button");
    expect(interactive.getAttribute("aria-pressed")).toBe("true");
    expect(interactive.getAttribute("data-selected")).toBe("true");
    expect(interactive.getAttribute("aria-selected")).toBeNull();

    const staticRow = rows[1]!;
    expect(staticRow.getAttribute("role")).toBeNull();
    expect(staticRow.getAttribute("aria-selected")).toBe("true");

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  test("StateBar sizes attention icon to size-icon and wraps actions cleanly", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <StateBar
          left={{
            sentence: "BLUE revision · 2 pages revised",
            chip: "blue",
            actions: [{ commandId: "production.issue", label: "Issue Blue…" }],
            dismiss: null,
            attention: true,
          }}
          right={null}
          run={() => {}}
          registered={() => true}
        />,
      );
    });

    const icon = host.querySelector("svg");
    expect(icon?.getAttribute("class")).toContain("size-icon");
    const btn = host.querySelector("button");
    expect(btn?.getAttribute("class")).toContain("shrink-0");

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  test("Choices renders visible legend with aria-labelledby when showLegend is set", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <Choices
          label="Colour order"
          value="us"
          showLegend
          disabled
          choices={[
            { value: "us", label: "US" },
            { value: "uk", label: "UK" },
          ]}
          onChoose={() => {}}
        />,
      );
    });

    const group = host.querySelector("[role='radiogroup']");
    const labelledBy = group?.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(host.querySelector(`#${CSS.escape(labelledBy!)}`)?.textContent).toBe(
      "Colour order",
    );

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  test("SyncCentre shows one Export a copy in alert state and Sign in to sync when session expired", async () => {
    try {
      const alertFrame = await renderFrame({
        status: { ...NEW_SCRIPT, neverSynced: false, device: "failing" },
      });
      const alertTrigger =
        alertFrame.container.querySelector<HTMLButtonElement>(
          "[data-tour='app.syncCentre']",
        );
      expect(alertTrigger).not.toBeNull();
      await click(alertTrigger!);
      const alertPopup = document.querySelector(
        "[data-slot='popover-content']",
      );
      expect(alertPopup).not.toBeNull();
      const exportButtons = [
        ...(alertPopup?.querySelectorAll("button") ?? []),
      ].filter((b) => b.textContent?.trim() === SYNC_CENTRE_WORDS.exportCopy);
      expect(exportButtons.length).toBe(1);
      expect(alertPopup?.querySelector("[role='alert']")).not.toBeNull();
      unmountFrame();

      const expiredFrame = await renderFrame({
        status: {
          ...NEW_SCRIPT,
          neverSynced: false,
          network: "online",
          server: "sign_in",
          waiting: 1,
        },
      });
      const statusTrigger =
        expiredFrame.container.querySelector<HTMLButtonElement>(
          "[data-tour='app.syncCentre']",
        );
      expect(statusTrigger).not.toBeNull();
      await click(statusTrigger!);
      const expiredPopup = document.querySelector(
        "[data-slot='popover-content']",
      );
      expect(expiredPopup?.textContent).toContain(
        SYNC_CENTRE_WORDS.signInExpired,
      );
      expect(expiredPopup?.textContent).toContain(SYNC_CENTRE_WORDS.signIn);
    } finally {
      unmountFrame();
    }
  });
});
