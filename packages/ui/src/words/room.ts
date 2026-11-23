// The words of working in one room: the messages when following another person's caret ends.

export const ROOM_WORDS = Object.freeze({
  stoppedFollowing: (name: string): string => `Stopped following ${name}.`,
  followedLeft: (name: string): string =>
    `Stopped following ${name}, who is no longer in this script.`,
});
