# Behaviour across section boundaries

Written by `bun harness/risk.ts --summarise`. Each check runs on a flat document, on 100-block sections with `content-visibility: auto`, and on the same sections with page breaks, at 1,000 pages in one browser; the two section builds are compared with the flat one. `correct`: every check of the group behaved as in the flat document, or is reported only. Otherwise the checks that differ are named. `not run`: no check of the group ran (zoom runs cover caret and selection only).

| Engine | Version | Platform | Zoom | Caret (B, K) | Selection (C) | Find (D) | Scroll (E–G) | Editing (H) | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chromium | 159.0.8154.6 | darwin-arm64 | 300 % | differs: B2_arrow_down_up_400, K2_across_oversized_section_B2, K2_inside_oversized_section_B2 | correct | not run | not run | not run | `risk-chromium-z300.json` |
| chromium | 159.0.8154.6 | darwin-arm64 | 50 % | correct | correct | not run | not run | not run | `risk-chromium-z50.json` |
| chromium | 159.0.8154.6 | darwin-arm64 | 100 % | correct | correct | correct | correct | correct | `risk-chromium.json` |
| firefox | 159.0 | darwin-arm64 | 100 % | correct | correct | correct | correct | correct | `risk-firefox.json` |
| webkit | 27.2 | darwin-arm64 | 100 % | correct | correct | correct | correct | correct | `risk-webkit.json` |
