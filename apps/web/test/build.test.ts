import { expect, test } from "bun:test";

test("the web app builds to static files with absolute asset paths", async () => {
  expect((await Bun.$`bun apps/web/build.ts`.quiet()).exitCode).toBe(0);
  const html = await Bun.file("apps/web/dist/index.html").text();
  expect(html).toMatch(/src="\/chunk-[a-z0-9]+\.js"/);
  expect(html).toMatch(/href="\/chunk-[a-z0-9]+\.css"/);
}, 30_000);
