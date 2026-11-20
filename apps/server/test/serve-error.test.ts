import { expect, spyOn, test } from "bun:test";
import { onServeError } from "../src/serve-error.ts";

test("a handler that throws answers a plain 500", async () => {
  const lines: string[] = [];
  const spy = spyOn(console, "error").mockImplementation((line) => {
    lines.push(String(line));
  });
  const response = onServeError(new Error("boom at secret/path.ts"));
  spy.mockRestore();
  expect(response.status).toBe(500);
  expect(response.headers.get("content-type")).toStartWith("text/plain");
  expect(await response.text()).toBe("Manent could not answer that request.");
  expect(lines).toEqual(["A request could not be answered."]);
});
