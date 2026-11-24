// Whether the person can add to the workspace the Library shows; written by the Library, read by the commands.

import type { CommandContext } from "@manent/commands";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

type Workspace = CommandContext["workspace"];

const store = createStore<{ workspace: Workspace }>()(() => ({
  workspace: "writable",
}));

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const workspaceActions: {
  set(workspace: Workspace): void;
  get(): Workspace;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  set(workspace: Workspace) {
    guardWrite("workspace");
    store.setState({ workspace });
  },
  get: () => store.getState().workspace,
  subscribe: (listener: () => void) => store.subscribe(() => listener()),
});
