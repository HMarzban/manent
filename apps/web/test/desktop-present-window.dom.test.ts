import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import {
  activeDesktopHost,
  setActiveDesktopHost,
} from "../src/desktop/active-host.ts";
import { answerShell } from "../src/desktop/shell-channel.ts";
import { openPresentWindow } from "../src/screens/present/open-window.ts";
import { writePerson, tabStorage } from "../src/session.ts";
import { fakeHost } from "./desktop.fixtures.ts";
import { testEnvironment } from "./services.fixtures.ts";

withDom();

const DOC_ID = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const originalOpen = window.open;
let stopAnswering: (() => void) | null = null;

afterEach(() => {
  stopAnswering?.();
  stopAnswering = null;
  setActiveDesktopHost(null);
  writePerson(tabStorage(), null);
  window.open = originalOpen;
});

test("answerShell binds and unbinds the active desktop host", () => {
  expect(activeDesktopHost()).toBeNull();
  const host = fakeHost({ platform: "mac" });
  const environment = testEnvironment({ desktop: host });
  stopAnswering = answerShell({ host, environment, pathname: () => "/" });
  expect(activeDesktopHost()).toBe(host);
  stopAnswering();
  stopAnswering = null;
  expect(activeDesktopHost()).toBeNull();
});

test("openPresentWindow sends open_window with current userId on desktop and omits userId when unsigned", () => {
  const host = fakeHost({ platform: "mac" });
  const environment = testEnvironment({ desktop: host });
  stopAnswering = answerShell({ host, environment, pathname: () => "/" });

  let browserOpens = 0;
  window.open = (() => {
    browserOpens += 1;
    return null;
  }) as typeof window.open;

  writePerson(tabStorage(), { token: "tok", userId: "sam", name: "Sam" });
  const roomOk = openPresentWindow(DOC_ID, "room");
  const prompterOk = openPresentWindow(DOC_ID, "prompter");

  writePerson(tabStorage(), null);
  const anonOk = openPresentWindow(DOC_ID, "room");

  expect([roomOk, prompterOk, anonOk, browserOpens, host.sent]).toEqual([
    true,
    true,
    true,
    0,
    [
      { v: 1, t: "open_window", role: "room", docId: DOC_ID, userId: "sam" },
      {
        v: 1,
        t: "open_window",
        role: "prompter",
        docId: DOC_ID,
        userId: "sam",
      },
      { v: 1, t: "open_window", role: "room", docId: DOC_ID },
    ],
  ]);
});

test("openPresentWindow falls back to window.open after desktop host is unbound", () => {
  const host = fakeHost({ platform: "mac" });
  const environment = testEnvironment({ desktop: host });
  stopAnswering = answerShell({ host, environment, pathname: () => "/" });
  stopAnswering();
  stopAnswering = null;

  const opened: [string, string][] = [];
  window.open = ((url?: string | URL, target?: string) => {
    opened.push([String(url), String(target)]);
    return { closed: false, focus() {} } as unknown as Window;
  }) as typeof window.open;

  const ok = openPresentWindow(DOC_ID, "room");
  expect([ok, host.sent, opened]).toEqual([
    true,
    [],
    [[`/s/${DOC_ID}/present`, `manent-room-${DOC_ID}`]],
  ]);
});
