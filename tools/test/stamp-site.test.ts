import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SITE_ORIGIN,
  applyStamp,
  hashBytes,
  hashFile,
  stampOf,
  stampSite,
  stripStamp,
} from "../stamp-site.ts";

async function withTempSite(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "manent-stamp-site-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("applyStamp, stripStamp and stampOf place ?v=<hash> before #fragment and replace cleanly", () => {
  expect(applyStamp("assets/icons.svg#i-play", "1a2b3c4d")).toBe(
    "assets/icons.svg?v=1a2b3c4d#i-play",
  );
  expect(applyStamp("assets/icons.svg?v=00000000#i-play", "1a2b3c4d")).toBe(
    "assets/icons.svg?v=1a2b3c4d#i-play",
  );
  expect(stampOf("assets/icons.svg?v=1a2b3c4d#i-play")).toBe("1a2b3c4d");
  expect(stampOf("assets/icons.svg#i-play")).toBeNull();
  expect(stripStamp("assets/icons.svg?v=1a2b3c4d#i-play")).toBe(
    "assets/icons.svg#i-play",
  );
  expect(stripStamp(`${SITE_ORIGIN}og.png?v=1a2b3c4d`)).toBe(
    `${SITE_ORIGIN}og.png`,
  );
});

test("stampSite stamps CSS fonts, HTML pages, /manent/ prefixes, SVG sprite fragments and JSON-LD idempotently", async () => {
  await withTempSite(async (dir) => {
    const fontBytes = new TextEncoder().encode("fake-woff2-bytes");
    const jsBytes = new TextEncoder().encode("console.log('hi');\n");
    const iconBytes = new TextEncoder().encode(
      '<svg><symbol id="i-play"></symbol></svg>\n',
    );
    const pngBytes = new TextEncoder().encode("fake-png");
    const videoBytes = new TextEncoder().encode("fake-mp4");
    const webmBytes = new TextEncoder().encode("fake-webm");
    const posterBytes = new TextEncoder().encode("fake-webp");
    const vttBytes = new TextEncoder().encode("WEBVTT\n");

    await Bun.write(join(dir, "fonts/courier-prime-400.woff2"), fontBytes);
    await Bun.write(
      join(dir, "assets/site.css"),
      `@font-face {\n  src: url("../fonts/courier-prime-400.woff2") format("woff2");\n}\n`,
    );
    await Bun.write(
      join(dir, "assets/motion.css"),
      `.grain { background-image: url("data:image/svg+xml,%3Csvg%3E%3Crect filter='url(%23n)'/%3E%3C/svg%3E"); }\n`,
    );
    await Bun.write(join(dir, "assets/site.js"), jsBytes);
    await Bun.write(join(dir, "assets/icons.svg"), iconBytes);
    await Bun.write(join(dir, "favicon-32.png"), pngBytes);
    await Bun.write(join(dir, "apple-touch-icon.png"), pngBytes);
    await Bun.write(join(dir, "og.png"), pngBytes);
    await Bun.write(join(dir, "media/demo-recording.mp4"), videoBytes);
    await Bun.write(join(dir, "media/demo-recording.webm"), webmBytes);
    await Bun.write(join(dir, "media/demo-recording-poster.webp"), posterBytes);
    await Bun.write(join(dir, "media/demo-recording.vtt"), vttBytes);

    await Bun.write(
      join(dir, "index.html"),
      `<!doctype html>
<html lang="en-GB" data-m-sprite="assets/icons.svg">
  <head>
    <link rel="canonical" href="${SITE_ORIGIN}" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg/%3E" />
    <link rel="icon" sizes="32x32" href="favicon-32.png" />
    <link rel="apple-touch-icon" href="apple-touch-icon.png" />
    <meta property="og:url" content="${SITE_ORIGIN}" />
    <meta property="og:image" content="${SITE_ORIGIN}og.png" />
    <meta name="twitter:image" content="${SITE_ORIGIN}og.png" />
    <link rel="preload" href="fonts/courier-prime-400.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="assets/site.css" />
    <script src="assets/site.js" defer></script>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            "url": "${SITE_ORIGIN}",
            "primaryImageOfPage": {
              "@type": "ImageObject",
              "url": "${SITE_ORIGIN}og.png"
            }
          },
          {
            "@type": "SoftwareApplication",
            "image": "${SITE_ORIGIN}og.png",
            "screenshot": "${SITE_ORIGIN}og.png"
          },
          {
            "@type": "VideoObject",
            "thumbnailUrl": "${SITE_ORIGIN}media/demo-recording-poster.webp",
            "contentUrl": "${SITE_ORIGIN}media/demo-recording.mp4"
          }
        ]
      }
    </script>
  </head>
  <body>
    <a href="media/demo-recording.mp4" data-watch="watch">Watch</a>
    <a href="design-system.html">Design</a>
    <svg><use href="assets/icons.svg#i-play" /></svg>
    <video poster="media/demo-recording-poster.webp">
      <source src="media/demo-recording.webm" type="video/webm" />
      <source src="media/demo-recording.mp4" type="video/mp4" />
      <track src="media/demo-recording.vtt" />
    </video>
  </body>
</html>
`,
    );

    await Bun.write(
      join(dir, "404.html"),
      `<!doctype html>
<html lang="en-GB" data-m-sprite="/manent/assets/icons.svg">
  <head>
    <link rel="preload" href="/manent/fonts/courier-prime-400.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/manent/assets/site.css" />
    <script src="/manent/assets/site.js" defer></script>
  </head>
  <body>
    <a href="/manent/media/demo-recording.mp4" data-watch="watch">Watch</a>
    <svg><use href="/manent/assets/icons.svg#i-play" /></svg>
  </body>
</html>
`,
    );

    await Bun.write(
      join(dir, "design-system.html"),
      `<!doctype html>
<html lang="en-GB" data-m-sprite="assets/icons.svg">
  <head>
    <link rel="stylesheet" href="assets/site.css" />
  </head>
  <body></body>
</html>
`,
    );

    const first = await stampSite(dir);
    expect(first.changed).toEqual([
      "assets/site.css",
      "404.html",
      "design-system.html",
      "index.html",
    ]);

    const fontHash = hashBytes(fontBytes);
    const cssHash = await hashFile(join(dir, "assets/site.css"));
    const jsHash = hashBytes(jsBytes);
    const iconHash = hashBytes(iconBytes);
    const pngHash = hashBytes(pngBytes);
    const mp4Hash = hashBytes(videoBytes);
    const webmHash = hashBytes(webmBytes);
    const posterHash = hashBytes(posterBytes);
    const vttHash = hashBytes(vttBytes);

    const stampedCss = await Bun.file(join(dir, "assets/site.css")).text();
    expect(stampedCss).toContain(
      `url("../fonts/courier-prime-400.woff2?v=${fontHash}")`,
    );

    const stampedIndex = await Bun.file(join(dir, "index.html")).text();
    expect(stampedIndex).toContain(
      `data-m-sprite="assets/icons.svg?v=${iconHash}"`,
    );
    expect(stampedIndex).toContain(
      `href="assets/icons.svg?v=${iconHash}#i-play"`,
    );
    expect(stampedIndex).toContain(`href="assets/site.css?v=${cssHash}"`);
    expect(stampedIndex).toContain(`src="assets/site.js?v=${jsHash}"`);
    expect(stampedIndex).toContain(
      `href="fonts/courier-prime-400.woff2?v=${fontHash}"`,
    );
    expect(stampedIndex).toContain(`href="favicon-32.png?v=${pngHash}"`);
    expect(stampedIndex).toContain(`href="apple-touch-icon.png?v=${pngHash}"`);
    expect(stampedIndex).toContain(`href="data:image/svg+xml,%3Csvg/%3E"`);
    expect(stampedIndex).toContain(
      `content="${SITE_ORIGIN}og.png?v=${pngHash}"`,
    );
    expect(stampedIndex).toContain(
      `"image": "${SITE_ORIGIN}og.png?v=${pngHash}"`,
    );
    expect(stampedIndex).toContain(
      `"screenshot": "${SITE_ORIGIN}og.png?v=${pngHash}"`,
    );
    expect(stampedIndex).toContain(
      `"url": "${SITE_ORIGIN}og.png?v=${pngHash}"`,
    );
    expect(stampedIndex).toContain(
      `"thumbnailUrl": "${SITE_ORIGIN}media/demo-recording-poster.webp?v=${posterHash}"`,
    );
    expect(stampedIndex).toContain(
      `"contentUrl": "${SITE_ORIGIN}media/demo-recording.mp4?v=${mp4Hash}"`,
    );
    expect(stampedIndex).toContain(
      `href="media/demo-recording.mp4?v=${mp4Hash}" data-watch="watch"`,
    );
    expect(stampedIndex).toContain(
      `poster="media/demo-recording-poster.webp?v=${posterHash}"`,
    );
    expect(stampedIndex).toContain(
      `src="media/demo-recording.webm?v=${webmHash}"`,
    );
    expect(stampedIndex).toContain(
      `src="media/demo-recording.mp4?v=${mp4Hash}"`,
    );
    expect(stampedIndex).toContain(
      `src="media/demo-recording.vtt?v=${vttHash}"`,
    );
    // Page links and canonical URLs stay unstamped.
    expect(stampedIndex).toContain(
      `<link rel="canonical" href="${SITE_ORIGIN}" />`,
    );
    expect(stampedIndex).toContain(`<a href="design-system.html">Design</a>`);

    const stamped404 = await Bun.file(join(dir, "404.html")).text();
    expect(stamped404).toContain(
      `data-m-sprite="/manent/assets/icons.svg?v=${iconHash}"`,
    );
    expect(stamped404).toContain(
      `href="/manent/fonts/courier-prime-400.woff2?v=${fontHash}"`,
    );
    expect(stamped404).toContain(`href="/manent/assets/site.css?v=${cssHash}"`);
    expect(stamped404).toContain(
      `href="/manent/assets/icons.svg?v=${iconHash}#i-play"`,
    );
    expect(stamped404).toContain(
      `href="/manent/media/demo-recording.mp4?v=${mp4Hash}" data-watch="watch"`,
    );

    const stampedDesign = await Bun.file(
      join(dir, "design-system.html"),
    ).text();
    expect(stampedDesign).toContain(`href="assets/site.css?v=${cssHash}"`);

    // Re-running produces zero changes (idempotent).
    const second = await stampSite(dir);
    expect(second.changed).toEqual([]);

    // Modifying an asset updates its stamp on the next run.
    await Bun.write(join(dir, "assets/site.js"), "console.log('updated');\n");
    const third = await stampSite(dir, { check: true });
    expect(third.changed).toEqual(["404.html", "index.html"]);
    const fourth = await stampSite(dir);
    expect(fourth.changed).toEqual(["404.html", "index.html"]);
    const newJsHash = await hashFile(join(dir, "assets/site.js"));
    expect(newJsHash).not.toBe(jsHash);
    expect(await Bun.file(join(dir, "index.html")).text()).toContain(
      `src="assets/site.js?v=${newJsHash}"`,
    );
  });
});
