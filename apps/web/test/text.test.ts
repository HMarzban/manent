import { expect, test } from "bun:test";
import { TEXT, pageTitle, serverStatusText } from "../src/text.ts";

test("the fixed sentences", () => {
  expect(TEXT).toEqual({
    appName: "Manent demo",
    chooseTitle: "Choose who you are",
    chooseHint:
      "Pick anyone. You can switch at any time, and each browser tab can be a different person.",
    chooseUnreachable:
      "Can't reach Manent. Start the server, then choose again.",
    chosen: "Chosen",
    back: "‹ Library",
    person: "Person",
    libraryTitle: "Library",
    projects: "Projects",
    libraryEmpty: "No scripts yet",
    tourTitle: "Tour",
    tourEmptyGroup: "Not in this build yet",
    demo: "Demo",
    stopServer: "Stop the server",
    startServer: "Start the server",
    serverRunning: "Server running",
    serverStopped: "Server stopped. Start it before reloading this tab.",
    serverStarting: "Starting the server…",
    serverFailed: "Couldn't start the server. See the terminal.",
    demoUnreachable: "The demo is not running. Run make demo again.",
    screenProblem: "Couldn't load this screen. Your work is unaffected.",
    reload: "Reload",
  });
});

test("the server's state is said in words", () => {
  expect(serverStatusText("running")).toBe("Server running");
  expect(serverStatusText("stopped")).toBe(
    "Server stopped. Start it before reloading this tab.",
  );
  expect(serverStatusText("starting")).toBe("Starting the server…");
  expect(serverStatusText("failed")).toBe(
    "Couldn't start the server. See the terminal.",
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
