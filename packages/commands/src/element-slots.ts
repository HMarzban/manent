// A registration list: one line per element command.

/** Element command id → its key in the element picker ("1" for Scene Heading); the picker opens on Alt+Enter. */
export const ELEMENT_COMMAND_SLOTS: Readonly<Record<string, string>> =
  Object.freeze({
    "element.sceneHeading": "1",
    "element.action": "2",
    "element.character": "3",
    "element.parenthetical": "4",
    "element.dialogue": "5",
    "element.transition": "6",
    "element.shot": "7",
    "element.section": "8",
    "element.newAct": "9",
    "element.general": "0",
    "element.endOfAct": "E",
    "element.emote": "M",
    "element.camera": "C",
    "element.engineDirection": "G",
  });
