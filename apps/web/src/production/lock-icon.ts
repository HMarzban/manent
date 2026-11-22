// The padlock of a locked page number in the page's gutter, which is drawn outside React: Lucide's Lock, as SVG data,
// carrying Lucide's class so it is drawn at the icon size and stroke every other icon has.

interface Shape {
  readonly tag: "rect" | "path";
  readonly attrs: Readonly<Record<string, string>>;
}

export const LOCK_ICON: {
  readonly svg: Readonly<Record<string, string>>;
  readonly shapes: readonly Shape[];
} = Object.freeze({
  svg: Object.freeze({
    class: "lucide lucide-lock",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
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
