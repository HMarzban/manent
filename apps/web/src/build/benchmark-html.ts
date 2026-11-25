// Renders the published Markdown benchmark report (or a clean placeholder when absent) into a
// self-contained light/dark HTML document served statically at /benchmark-report.html.

const PLACEHOLDER_MARKDOWN = `# Benchmark report

The benchmark report has not been published for this build yet.

Run the benchmark suite and publish the results to populate this page.
`;

const TABLE_SEPARATOR = new RegExp(
  "^\\|?(\\s*:?-+:?\\s*\\|)+\\s*:?-+:?\\s*\\|?$",
);
const ORDERED_ITEM = /^\d+\.\s+(.*)$/;
const UNORDERED_ITEM = /^[-*]\s+(.*)$/;
const HEADING_LINE = /^(#{1,4})\s+(.*)$/;
const SAFE_HREF = /^(https?:\/\/|\/|\.\/|\.\.\/|#|[a-zA-Z0-9_.-]+\/)/;
const INLINE_TOKEN = new RegExp(
  "(`[^`]+`|\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|\\[[^\\]]+\\]\\([^)]+\\))",
  "g",
);

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderInline(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) out += escapeHtml(text.slice(last, index));
    const token = match[0];
    if (token.startsWith("`"))
      out += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    else if (token.startsWith("**"))
      out += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    else if (token.startsWith("*"))
      out += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    else {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1).trim();
      if (SAFE_HREF.test(href)) {
        const external =
          href.startsWith("http://") || href.startsWith("https://");
        const rel = external
          ? ' target="_blank" rel="noopener noreferrer"'
          : "";
        out += `<a href="${escapeHtml(href)}"${rel}>${escapeHtml(label)}</a>`;
      } else {
        out += escapeHtml(label);
      }
    }
    last = index + token.length;
  }
  if (last < text.length) out += escapeHtml(text.slice(last));
  return out;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderTable(lines: readonly string[]): string {
  const header = splitRow(lines[0] ?? "");
  const rows = lines.slice(2).map(splitRow);
  const headHtml = header
    .map((cell) => `<th>${renderInline(cell)}</th>`)
    .join("");
  const bodyHtml = rows
    .map(
      (cells) =>
        `<tr>${cells.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`,
    )
    .join("\n");
  return `<div class="table-wrap"><table><thead><tr>${headHtml}</tr></thead><tbody>\n${bodyHtml}\n</tbody></table></div>`;
}

function isBlockStarter(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed === "" ||
    trimmed.startsWith("```") ||
    trimmed === "---" ||
    trimmed.startsWith("> ") ||
    HEADING_LINE.test(trimmed) ||
    UNORDERED_ITEM.test(trimmed) ||
    ORDERED_ITEM.test(trimmed)
  );
}

/** Converts a Markdown document into safe HTML body markup. */
export function renderMarkdownBody(markdown: string): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed === "") {
      i += 1;
      continue;
    }
    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        codeLines.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
      );
      continue;
    }
    if (trimmed === "---") {
      blocks.push("<hr />");
      i += 1;
      continue;
    }
    const heading = HEADING_LINE.exec(trimmed);
    if (heading !== null) {
      const level = heading[1]!.length;
      const content = heading[2]!.trim();
      const id = slugOf(content);
      const idAttr = id.length > 0 ? ` id="${escapeHtml(id)}"` : "";
      blocks.push(`<h${level}${idAttr}>${renderInline(content)}</h${level}>`);
      i += 1;
      continue;
    }
    const next = lines[i + 1]?.trim() ?? "";
    if (trimmed.includes("|") && TABLE_SEPARATOR.test(next)) {
      const tableLines = [line, lines[i + 1]!];
      i += 2;
      while (i < lines.length && lines[i]!.trim().includes("|")) {
        tableLines.push(lines[i]!);
        i += 1;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }
    if (trimmed.startsWith("> ")) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("> ")) {
        quoted.push(lines[i]!.trim().slice(2));
        i += 1;
      }
      blocks.push(
        `<blockquote><p>${renderInline(quoted.join(" "))}</p></blockquote>`,
      );
      continue;
    }
    if (UNORDERED_ITEM.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const match = UNORDERED_ITEM.exec(lines[i]!.trim());
        if (match === null) break;
        items.push(`<li>${renderInline(match[1]!)}</li>`);
        i += 1;
      }
      blocks.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }
    if (ORDERED_ITEM.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const match = ORDERED_ITEM.exec(lines[i]!.trim());
        if (match === null) break;
        items.push(`<li>${renderInline(match[1]!)}</li>`);
        i += 1;
      }
      blocks.push(`<ol>\n${items.join("\n")}\n</ol>`);
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && !isBlockStarter(lines[i]!)) {
      const peek = lines[i + 1]?.trim() ?? "";
      if (
        paragraph.length > 0 &&
        lines[i]!.includes("|") &&
        TABLE_SEPARATOR.test(peek)
      )
        break;
      paragraph.push(lines[i]!.trim());
      i += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }
  return blocks.join("\n");
}

const REPORT_CSS = `
:root {
  color-scheme: light dark;
  --bg: #f6f4f0;
  --surface: #fdfcfa;
  --fg: #1f1d1a;
  --fg-muted: #5a564f;
  --line: #d8d3ca;
  --accent: #2450be;
  --code-bg: #efece6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1918;
    --surface: #1f1d1a;
    --fg: #efece6;
    --fg-muted: #b8b2a7;
    --line: #423f3a;
    --accent: #8daeff;
    --code-bg: #121211;
  }
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.6 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
main {
  max-width: 60rem;
  margin: 0 auto;
  padding: 3rem 1.5rem 4rem;
}
h1 { font-size: 1.5rem; line-height: 1.3; font-weight: 600; letter-spacing: -0.015em; margin: 0 0 1rem; }
h2 { font-size: 1.125rem; line-height: 1.35; font-weight: 600; letter-spacing: -0.01em; margin: 2.25rem 0 0.75rem; padding-bottom: 0.375rem; border-bottom: 1px solid var(--line); }
h3 { font-size: 0.9375rem; line-height: 1.4; font-weight: 600; margin: 1.5rem 0 0.5rem; }
h4 { font-size: 0.8125rem; line-height: 1.4; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted); margin: 1.25rem 0 0.5rem; }
p, ul, ol, blockquote { margin: 0 0 1rem; }
ul, ol { padding-left: 1.5rem; }
li { margin-bottom: 0.25rem; }
blockquote { padding: 0.5rem 1rem; border-left: 2px solid var(--line); color: var(--fg-muted); }
hr { border: 0; border-top: 1px solid var(--line); margin: 2rem 0; }
a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
a:hover { opacity: 0.85; }
code { font: 12.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--code-bg); padding: 0.1rem 0.35rem; border-radius: 3px; }
pre { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 0.875rem 1rem; overflow-x: auto; margin: 0 0 1.25rem; }
pre code { background: transparent; padding: 0; }
.table-wrap { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; overflow-x: auto; margin: 0 0 1.25rem; }
table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line); vertical-align: top; }
thead th { background: var(--bg); color: var(--fg-muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
tbody tr:last-child td { border-bottom: 0; }
`;

/** Wraps `markdown` (or the placeholder when null) into a standalone HTML page titled `Benchmark report`. */
export function renderBenchmarkReportHtml(markdown: string | null): string {
  const body = renderMarkdownBody(markdown ?? PLACEHOLDER_MARKDOWN);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>Benchmark report</title>
<style>${REPORT_CSS.trim()}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}
