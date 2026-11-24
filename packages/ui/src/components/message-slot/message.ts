// A message for the message slot, and the queue that holds messages until each has had its time.

/** `reverse` and `brief` messages leave after their time; `until_dismissed` stays until it is dismissed. */
export type MessageLifetime = "reverse" | "until_dismissed" | "brief";

export interface Message {
  id: string;
  text: string;
  /** At most two. */
  actions: readonly { label: string; commandId: string }[];
  lifetime: MessageLifetime;
  ownWork: boolean;
}

export interface MessageQueue {
  push(message: Message): void;
  current(): Message | null;
  dismiss(id: string): void;
  /** Takes away every message with `id`, shown or waiting. */
  withdraw(id: string): void;
  withdrawUndo(): void;
  receipts(): readonly Message[];
  subscribe(listener: () => void): () => void;
}
