// State of the sign-out guard dialog, shared across universal PersonMenu hosts, AccountPane, and the palette fallback host.
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
const primaryHost = createValue<symbol | null>(null);
const mountedHostTokens: symbol[] = [];

export const signOutPrompt: Subscribable<SignOutPrompt | null> = prompt;
export const primarySignOutHost: Subscribable<symbol | null> = primaryHost;

export function registerSignOutHost(token: symbol = Symbol()): () => void {
  mountedHostTokens.push(token);
  primaryHost.set(mountedHostTokens[0] ?? null);
  return () => {
    const index = mountedHostTokens.indexOf(token);
    if (index !== -1) mountedHostTokens.splice(index, 1);
    primaryHost.set(mountedHostTokens[0] ?? null);
  };
}

export function hasMountedSignOutHost(): boolean {
  return mountedHostTokens.length > 0;
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
