// What the seed sends to a rundown's prompter.

export interface SeedPrompter {
  /** POST /api/prompter/send for the row `rowId` of `rundownId`. */
  send(userId: string, rundownId: string, rowId: string): Promise<void>;
  /** POST /api/prompter/send-previous for the row `rowId` of `rundownId`. */
  sendPrevious(userId: string, rundownId: string, rowId: string): Promise<void>;
}
