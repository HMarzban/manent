# 0030. Interface stack: React, TanStack libraries, Zustand, shadcn components on Base UI

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

The interface needs a framework, routing and server data, local state, components and styling, a command palette, drag and drop, and icons. Each was chosen once, for the whole app.

## Options considered

| Need                    | Chosen                                        | Alternative                          | Why                                                                        |
| ----------------------- | --------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Framework               | React 19                                      | Preact with signals                  | The largest community, and first-class support in Bun                      |
| Routing and server data | TanStack Router and Query                     | TanStack Start and DB                | Start brings Vite and a server of its own; DB is a sync engine beside ours |
| Interface state         | Zustand                                       | TanStack Store                       | The project owner's choice                                                 |
| Components and styling  | shadcn components on Base UI, with Tailwind 4 | Base UI alone; React Aria Components | The largest community, and a template that Bun ships                       |
| Command palette         | Base UI Autocomplete                          | `cmdk`                               | `cmdk` brings a second primitive library beside Base UI                    |
| Drag and drop           | dnd-kit                                       | React Aria drag and drop             | Keyboard dragging, and it fits the components                              |
| Icons                   | Lucide                                        | —                                    | The components' default                                                    |

## Decision

The table's choices, plus TanStack Virtual and Hotkeys. The stock components are copied in as source with their one stylesheet; the component tool is not a dependency. Tailwind is pinned to the version the Bun Tailwind plugin compiles with. Chosen libraries nothing imports yet (TanStack Table, Form and Pacer, dnd-kit, resizable panels) stay out of the catalog until a change imports one.

## Consequences and trade-offs

- React's rendering must be kept off the keystroke path (decision 0031).
- Copied component source is updated by hand.
- Some TanStack libraries are young; the three-day release rule can hold one back a version.

## Revisit when

A chosen library stops being maintained, or React's rendering breaks the typing budget.
