// The padlock of a locked page number, as SVG data: the Pages tab draws it with React and the page's marker as DOM.

interface Shape {
  readonly tag: "rect" | "path";
  readonly attrs: Readonly<Record<string, string>>;
}

export const LOCK_ICON: {
  readonly svg: Readonly<Record<string, string>>;
  readonly shapes: readonly Shape[];
} = Object.freeze({
  svg: Object.freeze({
    viewBox: "0 0 24 24",
    width: "12",
    height: "12",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }),
  shapes: Object.freeze<Shape[]>([
    {
      tag: "rect",
      attrs: { x: "3", y: "11", width: "18", height: "11", rx: "2", ry: "2" },
    },
    { tag: "path", attrs: { d: "M7 11V7a5 5 0 0 1 10 0v4" } },
  ]),
});
