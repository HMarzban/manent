// Verified copy for inline graphics and broadcast chyrons (ADR 0074).
export const GRAPHICS_WORDS = Object.freeze({
  graphic: "Graphic",
  kinds: Object.freeze({
    image: "Image",
    lower_third: "Lower third",
    ots: "Over the shoulder",
    full_screen: "Full screen",
  }),
  commands: Object.freeze({
    insertImage: "Insert image",
    insertLowerThird: "Insert lower third",
    insertOts: "Insert over the shoulder",
    insertFullScreen: "Insert full screen",
  }),
  chooseImage: "Choose image…",
  replaceImage: "Replace image…",
  removeImage: "Remove image",
  height: "Height",
  lines: (n: number): string => `${n} lines`,
  cueTag: "Cue tag",
  figureLabel: "Figure label",
  description: "Description",
  cueTagPlaceholder: "Optional, e.g. Cue 1",
  figureLabelPlaceholder: "Optional, e.g. Figure 1",
  descriptionPlaceholder: "Describe the image for readers and screen readers",
  notOnDevice: "Not on this device yet",
  tryAgain: "Try again",
  refusals: Object.freeze({
    tooLarge:
      "Couldn't insert image: larger than 5 MB. Choose a smaller PNG, JPEG or WebP file.",
    unsupportedType: "Couldn't insert image: use a PNG, JPEG or WebP file.",
    dimensionsExceeded:
      "Couldn't insert image: wider or taller than 4,096 px. Resize it and try again.",
    quotaExceeded:
      "Couldn't insert image: this project has reached its 200 MB image limit.",
  }),
});
