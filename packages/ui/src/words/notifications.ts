// Words for Workspace settings -> Notifications.

export const NOTIFICATIONS_WORDS = Object.freeze({
  intro: (workspace: string): string =>
    `New comments, replies and mentions in ${workspace} go to each address here that is on.`,
  adapters: Object.freeze({
    webhook: "Webhook",
    slack: "Slack",
    email: "Email",
  }),
  on: "On",
  off: "Off",
  addressLabel: "Address",
  addressAriaLabel: (adapter: string): string => `${adapter} address`,
  placeholders: Object.freeze({
    webhook: "https://",
    slack: "https://hooks.slack.com/…",
    email: "name@example.com",
  }),
  save: "Save",
  saving: "Saving…",
  remove: "Remove",
  goesTo: (hint: string): string =>
    `Goes to ${hint}. To change it, type the whole address again.`,
  savedMessage: (adapter: string): string =>
    `Saved the ${adapter} address. From now on only its last 4 characters are shown.`,
  removedMessage: (adapter: string): string =>
    `Removed the ${adapter} address. Nothing goes to ${adapter} now.`,
  emailUnavailable:
    "Email is off until the server has a Resend key and an address to send from.",
  retrying: (time: string): string =>
    `Couldn't reach this address. Trying again at ${time}.`,
  stopped:
    "Couldn't reach this address after 6 tries, so Manent stopped trying. New comments are still tried.",
  slackCaveat:
    "Slack is built against its public API and not verified against a real Slack workspace.",
  notWebAddress: (raw: string): string =>
    `Couldn't save the address: "${raw}" isn't a web address starting with https:// or http://.`,
  notSlackAddress:
    "Couldn't save the address: a Slack address starts with https://hooks.slack.com/.",
  notEmailAddress: (raw: string): string =>
    `Couldn't save the address: "${raw}" isn't an email address.`,
  couldNotSave: "Couldn't save the address. Try again.",
});
