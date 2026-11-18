# 0029. Desktop shell: Electrobun with bundled Chromium, Electron as the fallback

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner

## Context

The desktop app must run on macOS, Windows and Linux, work fully offline, and run the server's local node. Most desktop shells need a second runtime beside Bun to run that node.

## Options considered

- Electrobun with bundled Chromium. Chosen: its main process is Bun, so the local node runs in the same runtime as the server.
- Electron. The fallback: one Chromium engine and a mature path for updates, signing and packaging, at the cost of a second runtime and the largest download.
- Tauri v2. Not chosen: it renders with each system's own webview, and its Chromium runtime was in alpha.

## Decision

The shell is Electrobun 2.0.6 with bundled Chromium. The compiled server binary always ships too, so every system has something runnable. A throwaway prototype is to check the shell before any desktop code depends on it. The fallback is declared only if it fires, on a narrow trigger: on macOS, the one system available to the prototype, the app cannot be built, cannot be started, or cannot load the page. A slower start or a larger download than Electron is recorded, not treated as a trigger. If the shell does not work on Windows or Linux, that system is unsupported in this release until the project owner decides.

## Consequences and trade-offs

- One runtime from server to desktop.
- The shell is young, with a small maintainer base. File associations work on macOS only, Linux needs WebKitGTK installed even with bundled Chromium, and builds are unsigned, so people see a warning the first time they open the app.
- The budgets, 2.0 s from launch to the first frame and 400 MB of idle memory, are estimates until measured.
- A one-window app with bundled Chromium has been built and run on macOS only. Nothing has been installed or run on Windows or Linux.

## Revisit when

The prototype meets the trigger, or the shell's maintenance stalls.
