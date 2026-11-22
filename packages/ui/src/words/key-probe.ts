// What the key probe says: a development screen that asks a tester to press each key and records which arrived.

export const KEY_PROBE_WORDS = {
  title: "Key probe",
  instruction:
    "Press each key in turn. When nothing happens here, choose Not arrived.",
  arrived: "Arrived",
  notArrived: "Not arrived",
} as const;
