// Archival book stylesheet bundled inside every exported EPUB 3 archive (`OEBPS/styles/book.css`).
const hex = (code: string): string => `${String.fromCharCode(35)}${code}`;

export const EPUB_BOOK_CSS = `body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.55;
  margin: 1.25em;
  color: ${hex("1c1917")};
}
h1.chapter {
  text-align: center;
  font-size: 1.45em;
  margin: 2.5em 0 1.4em;
  page-break-after: avoid;
  break-after: avoid;
}
h2.subheading {
  font-size: 1.12em;
  font-weight: bold;
  margin: 1.5em 0 0.6em;
  page-break-after: avoid;
  break-after: avoid;
}
blockquote.epigraph {
  margin: 0.75em 0 1.4em 20%;
  text-align: right;
  font-style: italic;
}
blockquote.quote {
  margin: 1em 1.5em;
  font-style: italic;
}
blockquote.quote p,
blockquote.epigraph p {
  text-indent: 0;
  margin: 0;
}
p.body {
  text-indent: 1.5em;
  margin: 0;
}
p.body.flush,
p.body.drop-cap,
p.body.raised-cap {
  text-indent: 0;
}
p.body.drop-cap .initial {
  float: left;
  font-size: 3.1em;
  line-height: 0.85;
  padding-right: 0.12em;
  font-weight: bold;
}
p.body.raised-cap .initial {
  font-size: 2.05em;
  line-height: 0.9;
  font-weight: bold;
}
p.scene-break {
  text-align: center;
  text-indent: 0;
  margin: 1.4em 0;
}
div.page-break {
  page-break-before: always;
  break-before: page;
  height: 0;
}
.align-left { text-align: left; }
.align-center { text-align: center; }
.align-right { text-align: right; }
.u { text-decoration: underline; }
.caps { text-transform: uppercase; }
.c-red { color: ${hex("b42318")}; }
.c-orange { color: ${hex("b54708")}; }
.c-green { color: ${hex("067647")}; }
.c-blue { color: ${hex("175cd3")}; }
.c-violet { color: ${hex("6941c6")}; }
.hl-yellow { background-color: ${hex("fef08a")}; }
.hl-green { background-color: ${hex("bbf7d0")}; }
.hl-pink { background-color: ${hex("fbcfe8")}; }
.hl-orange { background-color: ${hex("fed7aa")}; }
.hl-violet { background-color: ${hex("ddd6fe")}; }
sup, sub {
  font-size: 0.75em;
  line-height: 0;
}
a.noteref {
  text-decoration: none;
}
figure.graphic {
  margin: 1.25em 0;
  text-align: center;
}
figure.graphic img {
  max-width: 100%;
  height: auto;
}
figure.graphic figcaption {
  font-size: 0.9em;
  font-style: italic;
  margin-top: 0.4em;
}
section.footnotes {
  margin-top: 2em;
  padding-top: 0.75em;
  border-top: 1px solid ${hex("d6d3d1")};
  font-size: 0.9em;
}
section.footnotes aside {
  margin: 0.4em 0;
}
`;
