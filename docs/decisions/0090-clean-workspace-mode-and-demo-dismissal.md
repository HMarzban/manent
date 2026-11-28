# 0090. Clean workspace mode and dismissing Demo and Tour

- Date: 2026-11-28
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

The opening "Choose who you are" screen previously offered six roster cards ending with `+ You` ("A new person with an empty workspace"), but choosing `+ You` stayed inside Demo mode: the top Demo Stage bar, the Tour side tab and auto-open first-visit Tour, `Switch person`, demo-mode tab titles, and `/api/demo` polling remained active, and `FirstRun` immediately created an unsolicited Film script instead of leaving the workspace empty. Worse, both Web (`followDemoSeed`) and Desktop (`createReseed`) wiped local storage whenever a demo server's `seedId` changed, putting local-only work in `You` at risk, while Desktop's ephemeral loopback port (`port: 0`) meant a `localStorage`-only preference would not survive an app restart.

## Options considered

1. **Replace the `+ You` card inside `PeopleGrid` with a clean-workspace button.** Leaves an unbalanced five-card grid, breaks the demo-mode `You` persona used by Tour scenarios, and blurs demo personas with exiting the demo layer.
2. **Persist clean-workspace mode in browser `localStorage` alone.** Works on stable web origins, but resets on every Desktop launch because `local-node` binds `port: 0`, and leaves `local-node`'s `createReseed` able to wipe local SQLite files when the cloud demo resets.
3. **Add a prominent full-width primary Clean Workspace button directly below `PeopleGrid` backed by dual-layer persistence (Web `localStorage` + Desktop `records.sqlite` and frame-0 `bootScript`), hard demo-reset shields, complete Demo/Tour surface shutdown, empty-Library landing, and reversible restore in Preferences.** Chosen: keeps the six-card Studio Desk roster intact, survives Web reloads, new tabs, PWA launches and Desktop restarts with zero flicker, protects local work from demo resets, and gives writers a calm path back to Demo and Tour whenever they want.

## Decision

Introduce **Clean workspace mode** activated from a single high-prominence primary accent CTA (`.mn-choose-clean-cta`) directly beneath `PeopleGrid` on "Choose who you are" (shown outside `compact` embedded choosers whenever a local unregistered `You` choice is present):

- **Dual-layer persistence:**
  - **Web & PWA:** Store `manent.workspace.clean = "1"` in `localStorage` via `apps/web/src/session.ts` (an allowed storage module), synchronise across open tabs through `storage` events, and preserve the key in `packages/client-web/src/clear.ts`.
  - **Desktop (`packages/local-node`):** Bump `RECORDS_VERSION` from `1` to `2` with an additive `demo_dismissed INTEGER NOT NULL DEFAULT 0` column on `cloud` (`records.sqlite`, kept across resets in `KEPT_ON_RESET`), expose `POST /api/local/demo-mode` `{ dismissed: boolean }` behind `createLaunchGuard`, and inject `manent.workspace.clean` from `bootScript()` before hydration so restarts open with zero Demo-bar flicker.
- **Data safety and empty-Library landing:**
  - Never delete existing scripts belonging to `You`. When Clean workspace mode is active, skip `followSeed()` on Web, hard-gate `reseed.check()`, `reseed.run()` and background `resumeCloudPeople()` on Desktop, close active upstream demo relay connections, and clear remembered demo `seedId` so a demo server reset can never wipe the writer's local work.
  - Always navigate to `"/"` (never a stale demo `next` path) and suppress `<FirstRun>` auto-film creation so a new writer lands on the genuinely empty Library (`Your desk` with `Import…`, `New script` and `New project`), while returning writers see their existing scripts untouched.
  - On cold boots and new tabs while Clean workspace mode is active, auto-enter `You` without bouncing through `/choose`.
- **Complete Demo & Tour shutdown:**
  - Clear active Tour state (`tourActions.close()`, `TOUR_ACTIVE_KEY`), close the side panel when on `"tour"`, reset any Demo `Offline`/`Slow` connection throttle, stop `useDemo`/`useServerState` polling, unmount `DemoBar`, gate `TourFloatingHost` on `demo.tour` visibility, hide `demo.tour`, `app.switchPerson` and `app.openInBrowser` (including Desktop native menus), and render `"Manent"` rather than `"Manent demo"` in window titles and Preferences → About.
- **Calm reversibility:**
  - Keep writing and Library chrome completely free of Demo/Tour reminders. While Clean workspace mode is active, surface a quiet **Demo and Tour** card with **Turn Demo and Tour back on** in `Preferences → This browser` / `This device` and `Preferences → Account` (and automatically exit Clean workspace mode if the user explicitly picks a registered demo persona on `/choose` or opens a `?person=<registered>` link).

## Consequences and trade-offs

- **Cohesive personal studio experience:** Writers get one unmistakable button to strip away all demo and tour scaffolding and start in a calm, empty local workspace that persists cleanly across tabs, browser restarts and Desktop launches.
- **Store version bump:** Opening an existing Desktop store copies and migrates `records.sqlite` from version `1` to `2` via `openStore`'s existing `VACUUM INTO` flow; older Desktop binaries cleanly refuse a version-2 store rather than corrupting it.
- **No silent data destruction:** Returning to Clean workspace mode keeps whatever scripts the writer previously created under `You`, upholding "Write anywhere. Lose nothing."

## Revisit when

- Hosted personal accounts and password/passkey sign-in replace the local demo sign-in (ADR 0009/0010), at which point Demo mode becomes an optional sandbox rather than the default build entry.
