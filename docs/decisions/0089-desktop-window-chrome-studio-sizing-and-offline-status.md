# 0089. Custom desktop window chrome, display-aware studio sizing and offline-first cloud reachability

- Date: 2026-11-28
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

The Electrobun desktop app previously set `titleBarStyle: "hiddenInset"` on macOS with no top safe-area bar or drag region, causing the native traffic-light buttons to overlap the Demo Stage pill and top screen controls, while Windows used the unstyled `"default"` OS frame that clashed with Manent's 24 studio themes. The initial window size (`1280 × 800`) also clipped the Choose screen vertically on spacious displays and lacked display-aware clamping on compact laptops. In addition, the desktop app shipped without native app icons, carried browser-tab copy on the Choose screen, and `local-node` did not gate HTTP `CloudApi` calls during offline mode, emit live cloud reachability over `/api/local/shell/events`, or automatically adopt offline-created scripts when a cloud server became reachable again.

## Options considered

1. **Revert macOS to `titleBarStyle: "default"` across all platforms.** Eliminates the traffic-light overlap, but leaves macOS and Windows with jarring OS-default titlebars that clash with Manent's 24 studio themes and wastes chrome height.
2. **Pad individual screen headers and DemoBar on macOS only.** Fragile across 11 distinct top surfaces (including scrolling Choose screens and bare Present windows) and leaves Windows without integrated studio chrome or right-side window controls.
3. **Add a dedicated `36 px` theme-matched Desktop Titlebar (`windowbar` grid row), display-aware `1440 × 940` initial sizing, native Bound "M" icons, desktop-native onboarding copy, and full offline-first cloud gating and recovery.** Chosen: guarantees zero control overlap on every screen across macOS and Windows, preserves native Linux window-manager chrome under CEF, adapts cleanly to compact displays, and guarantees uninterrupted local SQLite writing and automatic sync recovery when the cloud is unreachable.

## Decision

Adopt a unified `36 px` (`--windowbar-h`) custom desktop window titlebar (`apps/web/src/desktop/desktop-title-bar.tsx`) mounted in a dedicated top `windowbar` row above `demobar` and every screen:

- **macOS (`darwin`):** Main and Present windows use `titleBarStyle: "hiddenInset"` with `trafficLightOffset: { x: 6, y: 2 }` centred vertically in the `36 px` bar, reserving an `80 px` left inset that collapses in fullscreen, with optically centred Bound "M" branding, live context title and full-bar drag.
- **Windows (`win32`):** Both the main window and secondary Present (Room/Prompter) windows use `titleBarStyle: "hiddenInset"` (native resize borders and snap without an OS bar) paired with a left-side Windows App Menu (`☰`) on the main window driven by `@manent/commands` (`menuModel`) and right-aligned `46 × 36 px` Minimise, Maximise/Restore and Close caption buttons routed cleanly by optional `windowKey` (`room:<docId>` / `prompter:<docId>`).
- **Linux (`linux`):** Keeps `titleBarStyle: "default"` under CEF and omits the custom bar.
- **Additive shell channel v1 messages:** Extend `packages/sync-protocol/src/desktop.ts` with `window_action` (optional `windowKey`), `window_title` (optional `windowKey`) and `restart_to_update` (`PageMessage`) and `window_state` and `cloud_state` (`ShellMessage`). Reserve the matching static titlebar height before hydration via `data-desktop-chrome` in `boot-script.ts` and `static-frame.css`.
- **Studio sizing, periodic updates, bespoke About window & unified Bound "M" icons:** Raise `DEFAULT_FRAME` to `1440 × 940` clamped to `Screen.getPrimaryDisplay().workArea` with `48 px` breathing margin and a `960 × 640` minimum resize floor. Run quiet 6-hour periodic background update checks (`PERIODIC_UPDATE_CHECK_MS`) while online and not already staged. Replace the bare native About panel with a compact, non-resizable theme-matched **About Manent** window (`360 × 484`, `/about`, `apps/desktop/src/shell/about-window.ts`, `apps/web/src/screens/about/about-screen.tsx`) triggered by `shell.about` from the menu bar, carrying the Bound "M" icon, version/channel, Layout engine, registered file types, **Copy details**, live update controls and the AI pledge. Generate and unify the Bound "M" icon set (`site/favicon.svg` → `apps/desktop/icon.iconset/`, `apps/desktop/assets/icon.png`, `apps/web/public/icons/`, and `site/apple-touch-icon.png`) via `tools/desktop/generate-icons.ts`, register `.fdx`, `.fountain`, `.ink` and `.docx` file associations and route `file://` opens through `readOpenedPaths`.
- **Offline-first local node, clean SSE teardown & live status:** Wrap every `CloudApi` consumer in `createCloudStatus` (`packages/local-node/src/node/cloud-status.ts`) with a `10 s` request timeout (`fetchWithTimeout`), short-circuiting HTTP cloud requests immediately in `"offline"` mode, exposing `GET /api/local/status` (with `?probe=1` immediate wake probe on OS network return), flushing initial `cloud_state` on `/api/local/shell/events` stream open, closing open SSE streams and heartbeat timers cleanly during `NodeCore.close()`, surfacing a calm **Offline · Saved on this device** pill in the desktop titlebar and a live **Connection** card in `Preferences → This device`, and automatically waking upstream clients, re-authenticating offline-chosen users and handing off locally created scripts when reachability returns.

## Consequences and trade-offs

- **Zero overlap and theme unity:** Every screen, Demo Stage bar, secondary Room/Prompter window, About window and studio theme aligns cleanly beneath the `36 px` window bar on macOS and Windows with zero colour literals outside `packages/ui/src/theme.css`.
- **Verified offline continuity:** Writers can launch, choose any person, create and edit scripts, persist across restarts and recover automatically when the server returns, with live status reflected in both the titlebar and `Preferences → This device`.
- **Unified Preferences & Settings:** Visible Visit Undo, per-pane customisation dots, inline Keyboard shortcut filtering/reset, Account workspaces navigation and Desktop Connection/Update controls keep web and desktop preferences cohesive.

## Revisit when

- Electrobun's Linux CEF backend supports frameless resize handles natively.
- Signed macOS notarisation and Windows Authenticode certificates are enabled on release builds.
