# Checks made by hand

Three checks that no script in this folder can make, because each needs a person at a real browser: the browser's own find bar, a real input method, and the red underline of spellcheck. Each check says how to serve the page, the exact steps, and where to write what happened. Until a check is done its outcome is `not run`.

Serve the page from this folder with:

```sh
bun install --frozen-lockfile
bun harness/serve.ts
```

It prints the base URL (for example `http://localhost:53124`) and keeps running; stop it with Ctrl+C. Below, `<base>` is that URL. The page's console helpers are the ones the harnesses use: `__risk`, `__view`, `__pg`. In Safari, turn on Settings → Advanced → "Show features for web developers" to open the console (Develop → Show JavaScript Console).

## 1. The find bar finds a word that sits only in a section that was never rendered

Each section of 100 blocks has `content-visibility: auto`, so a section far from the viewport is never rendered. The automated check uses `window.find()`; this one uses the browser's own find bar.

1. Open `<base>/?pages=2000` and wait until the text appears.
2. In the console, plant a word that appears nowhere else, 90 % of the way through the document, without scrolling:
   `__risk.insertRemote(Math.floor(__risk.textLen() * 0.9), ' quillorbit ')`
3. Click in the first line of the text, so the page is at its top.
4. Press Cmd+F (Ctrl+F on Windows and Linux), type `quillorbit`, press Enter.
5. Pass: the bar reports one match, the page scrolls to it, the word is highlighted and readable on screen. Fail: no match, the wrong place, or a blank area where the text should be.

| Browser | Version | Matches reported | Scrolled to the word and drew it | Outcome | Notes |
| --- | --- | --- | --- | --- | --- |
| Google Chrome | | | | not run | |
| Firefox | | | | not run | |
| Safari | | | | not run | |

## 2. Composing text next to a page break inside a block

A page break can fall inside a block; the break is a widget between two lines of the same paragraph. Chromium's input-method simulation is checked by script (`results/ime-chromium.json`); Firefox and Safari need a real input method.

1. Add an input method that composes, for example Japanese Romaji or Pinyin (macOS: System Settings → Keyboard → Text Input).
2. Open `<base>/?pages=120` and wait until the text appears.
3. In the console, bring the first break inside a block to the middle of the screen and count the breaks of that kind:
   `document.querySelector('.pb.mid').scrollIntoView({ block: 'center' }); document.querySelectorAll('.pb.mid').length`
4. Click at the start of the first line below that break (the first line of the new page). Switch to the input method, type `nihon` (Japanese) or `zhongwen` (Pinyin), pick the first candidate, and confirm with Enter.
5. Click at the end of the last line above the break and do the same.
6. Run the count of step 3 again.
7. Pass: each time the composing text and its underline stay at the caret, the confirmed characters appear once, at the caret, and nothing else changes; the break stays where it was and the count is unchanged. Fail: characters lost, doubled or placed elsewhere, the caret jumping across the break, or the count changing.

| Browser | Version | Input method | Below the break | Above the break | Count before / after | Outcome | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Firefox | | | | | | not run | |
| Safari | | | | | | not run | |

## 3. Spellcheck underlines a misspelt word

Headless browsers do not run spellcheck, and `harness/spell.ts` checks Google Chrome only (`results/spell-120.png`, `results/spell-2000.png`).

1. Open `<base>/?pages=120&spell=1` and wait until the text appears.
2. Click in the middle of a line of dialogue and type ` recieve teh `.
3. Wait five seconds, without scrolling.
4. Repeat with `<base>/?pages=2000&spell=1`.
5. Pass: both misspelt words get the browser's red underline at both sizes. Fail: no underline after five seconds.

| Browser | Version | 120 pages | 2,000 pages | Outcome | Notes |
| --- | --- | --- | --- | --- | --- |
| Firefox | | | | not run | |
| Safari | | | | not run | |
