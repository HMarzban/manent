import { expect, test } from "bun:test";
import {
  MAC_TRAFFIC_LIGHT_OFFSET,
  mainWindowChrome,
  presentWindowChrome,
} from "../src/window-chrome.ts";

test("mainWindowChrome selects hiddenInset on macOS and Windows and default on Linux", () => {
  expect(mainWindowChrome("darwin")).toEqual({
    titleBarStyle: "hiddenInset",
    trafficLightOffset: { ...MAC_TRAFFIC_LIGHT_OFFSET },
  });
  expect(mainWindowChrome("win32")).toEqual({
    titleBarStyle: "hiddenInset",
  });
  expect(mainWindowChrome("linux")).toEqual({
    titleBarStyle: "default",
  });
});

test("presentWindowChrome uses hiddenInset on macOS and Windows and default on Linux", () => {
  expect(presentWindowChrome("darwin")).toEqual({
    titleBarStyle: "hiddenInset",
    trafficLightOffset: { ...MAC_TRAFFIC_LIGHT_OFFSET },
  });
  expect(presentWindowChrome("win32")).toEqual({
    titleBarStyle: "hiddenInset",
  });
  expect(presentWindowChrome("linux")).toEqual({
    titleBarStyle: "default",
  });
});
