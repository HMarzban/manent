// The one preference that belongs to the device, not the person.
import { setting } from "../define.ts";
import { t } from "../types.ts";

export const DEVICE_SETTINGS = Object.freeze([
  setting({
    key: "device.interfaceSize",
    scope: "device",
    type: t.choice([
      { value: "100", label: "100 %" },
      { value: "125", label: "125 %" },
      { value: "150", label: "150 %" },
      { value: "200", label: "200 %" },
    ]),
    default: "100" as const,
    label: "Interface size",
    description:
      "Text and controls around the page. The page has its own zoom, in View ▾.",
    noun: null,
    surfaces: [
      { in: "preferences", section: "device", order: 10 },
      { in: "menu", menu: "view", group: "size", order: 10 },
      { in: "palette" },
    ],
    apply: {
      how: "attribute",
      name: "data-ui-size",
      values: { "100": null, "125": "125", "150": "150", "200": "200" },
    },
    boot: true,
    guard: null,
    keywords: [],
  }),
] as const);
