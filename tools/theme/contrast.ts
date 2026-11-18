// Colour arithmetic for the theme's contrast checks: parsing, compositing and WCAG 2 contrast.

/** A colour in sRGB: channels 0–255, alpha 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB =
  /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/;

/** Reads `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(…)` in either syntax, or `transparent`; throws a TypeError for anything else. */
export function parseColour(text: string): Rgba {
  const value = text.trim();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = HEX.exec(value)?.[1];
  if (hex !== undefined) {
    const digits =
      hex.length <= 4
        ? [...hex].map((digit) => digit + digit)
        : hex.match(/../g);
    const [r = 0, g = 0, b = 0, a = 255] = (digits ?? []).map((pair) =>
      Number.parseInt(pair, 16),
    );
    return { r, g, b, a: a / 255 };
  }
  const rgb = RGB.exec(value);
  if (rgb !== null) {
    const [, r = "", g = "", b = "", a = "1"] = rgb;
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  throw new TypeError(`not a colour the theme check reads: ${value}`);
}

/** `top` painted over `bottom`, as the browser blends in sRGB. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  // over an opaque colour the result is exactly opaque, whatever the rounding
  const a = bottom.a === 1 ? 1 : top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (front: number, back: number): number =>
    (front * top.a + back * bottom.a * (1 - top.a)) / a;
  return {
    r: mix(top.r, bottom.r),
    g: mix(top.g, bottom.g),
    b: mix(top.b, bottom.b),
    a,
  };
}

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2 relative luminance of the colour's channels; alpha is ignored, so composite first. */
export function luminance(colour: Rgba): number {
  return (
    0.2126 * linear(colour.r) +
    0.7152 * linear(colour.g) +
    0.0722 * linear(colour.b)
  );
}

/** The WCAG 2 contrast ratio of `fg` on `bg`; `bg` is composited over the opaque `ground` first, then `fg` over the result. */
export function contrastRatio(fg: Rgba, bg: Rgba, ground: Rgba): number {
  if (ground.a !== 1)
    throw new RangeError(`a ground must be opaque, not alpha ${ground.a}`);
  const back = composite(bg, ground);
  const front = luminance(composite(fg, back));
  const behind = luminance(back);
  return (Math.max(front, behind) + 0.05) / (Math.min(front, behind) + 0.05);
}
