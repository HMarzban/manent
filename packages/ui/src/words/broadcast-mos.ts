// Words for Workspace settings → Broadcast (MOS external prompter) and Details → Rundown MOS toggle.

export const BROADCAST_MOS_WORDS = Object.freeze({
  group: "Broadcast",
  title: "External prompter (MOS)",
  description: "Sends Show and News rundowns to an external prompter over MOS.",
  systemLabel: "Prompter system",
  autoscript: "Autoscript WinPlus-IP",
  mosStandard: "MOS 2.8.5",
  addressLabel: "Prompter address",
  addressHint:
    "IP address or name on your studio network. Ports 10540 and 10541 are used automatically.",
  save: "Save",
  saving: "Saving…",
  check: "Check prompter",
  checking: "Checking…",
  remove: "Remove",
  removeConfirmTitle: "Remove prompter setup?",
  cancel: "Cancel",
  advancedToggle: "Advanced studio details",
  lowerPortLabel: "Lower port",
  upperPortLabel: "Upper port",
  ncsIdLabel: "NCS ID",
  mosIdLabel: "MOS ID",
  allowedNetworksLabel: "Allowed studio networks",
  allowedNetworksHint: "Private studio networks are allowed by default.",
  statusLive: "Live",
  statusWaiting: "Waiting for prompter",
  statusLost: "Feed lost",
  statusOff: "Off",
  statusOn: "On",
  rundownHeading: "Broadcast prompter",
  rundownToggle: "Send this rundown over MOS",
  airWindowNote:
    "Follows the air window: prompter text sends only when you send it.",
  notSetUp: "No external prompter set up",
  unreachable:
    "Couldn't reach the prompter. Check the address and that it is on this studio network.",
  outsideStudioNetwork: (host: string): string =>
    `${host} is outside the studio network. Use a private studio address, or add its network under Advanced studio details.`,
  couldNotLoad: "Couldn't load Broadcast.",
  couldNotLoadCached:
    "Couldn't load Broadcast. Showing what this device last saw.",
  needsConnection: "Changing these needs a connection.",
  nothingSetUp: "Nothing is set up",
  tryAgain: "Try again",
});
