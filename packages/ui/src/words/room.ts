// The words of working in one room: following another person's caret, driving, and pitching lines.

export const ROOM_WORDS = Object.freeze({
  stoppedFollowing: (name: string): string => `Stopped following ${name}.`,
  followedLeft: (name: string): string =>
    `Stopped following ${name}, who is no longer in this script.`,
  takeKeysAction: "Take keys",
  takeKeysLost: (name: string): string =>
    `Couldn't take keys. ${name} took them first.`,
  driverTookKeys: (name: string): string =>
    `${name} took keys. The room window follows ${name} now.`,
  driverStoppedPresenting: (name: string): string =>
    `${name} stopped presenting.`,
  pitchAction: "Pitch",
  pitchFieldLabel: "Pitch a line",
  pitchFieldPlaceholder: "Type another way to say this line. Enter pitches it.",
  pitchNeedsSpeech: (name: string): string =>
    `needs ${name}'s caret in a speech`,
});
