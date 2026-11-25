// State of the sign-out guard dialog, shared across the Library, Account pane, and palette fallback host.
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import type { WaitingScript } from "./export-waiting.ts";

export interface SignOutPrompt {
  readonly totalWaiting: number;
  readonly scripts: readonly WaitingScript[];
  readonly services: PersonServices;
  readonly now: () => number;
  onConfirm(): void;
  onCancel(): void;
}

const prompt = createValue<SignOutPrompt | null>(null);
let mountedHosts = 0;

export const signOutPrompt: Subscribable<SignOutPrompt | null> = prompt;

export function registerSignOutHost(): () => void {
  mountedHosts++;
  return () => {
    mountedHosts = Math.max(0, mountedHosts - 1);
  };
}

export function hasMountedSignOutHost(): boolean {
  return mountedHosts > 0;
}

export function openSignOutPrompt(next: SignOutPrompt): void {
  prompt.set(next);
}

export function closeSignOutPrompt(): void {
  prompt.set(null);
}

export function isSignOutPromptOpen(): boolean {
  return prompt.get() !== null;
}
