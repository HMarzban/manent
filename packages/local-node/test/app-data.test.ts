import { expect, test } from "bun:test";
import { appDataDir } from "../src/index.ts";

test("the data directory is where each system keeps an app's data", () => {
  expect(appDataDir("darwin", {}, "/Users/sam")).toBe(
    "/Users/sam/Library/Application Support/Manent",
  );
  expect(
    appDataDir(
      "win32",
      { APPDATA: "C:\\Users\\sam\\AppData\\Roaming" },
      "C:\\Users\\sam",
    ),
  ).toBe("C:\\Users\\sam\\AppData\\Roaming\\Manent");
  expect(appDataDir("win32", {}, "C:\\Users\\sam")).toBe(
    "C:\\Users\\sam\\AppData\\Roaming\\Manent",
  );
  expect(appDataDir("linux", { XDG_DATA_HOME: "/data" }, "/home/sam")).toBe(
    "/data/manent",
  );
  expect(appDataDir("linux", {}, "/home/sam")).toBe(
    "/home/sam/.local/share/manent",
  );
  expect(appDataDir("linux", { MANENT_DATA_DIR: "/tmp/x" }, "/home/sam")).toBe(
    "/tmp/x",
  );
});
