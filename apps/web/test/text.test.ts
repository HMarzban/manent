import { expect, test } from "bun:test";
import { pageTitle, serverStatusText } from "../src/text.ts";

test("the server's state is said in words", () => {
  expect(serverStatusText("running")).toBe("Server running");
  expect(serverStatusText("stopped")).toBe(
    "Server stopped. Start it before reloading this tab.",
  );
  expect(serverStatusText("starting")).toBe("Starting the server…");
  expect(serverStatusText("failed")).toBe(
    "The server could not start. See the terminal.",
  );
  expect(serverStatusText("unreachable")).toBe(
    "The demo is not running. Run make demo again.",
  );
});

test("each tab is titled with its screen and person", () => {
  expect(pageTitle("Choose who you are", null)).toBe(
    "Choose who you are — Manent demo",
  );
  expect(pageTitle("Library", "Dana Reyes")).toBe(
    "Library — Dana Reyes — Manent demo",
  );
});
