// Zero-asset procedural Web Audio foley synthesizer for Manent's 24 Studio Hidden Gems (opt-in, muted by default).
import type { StudioPaletteId } from "@manent/settings";

type FoleyFamily =
  "ink" | "saber" | "cinema" | "synth" | "press" | "harp" | "timber" | "dice";

const PALETTE_FAMILY: Readonly<Record<StudioPaletteId, FoleyFamily>> =
  Object.freeze({
    studio: "ink",
    hyperdrive: "saber",
    starfleet: "synth",
    celluloid: "cinema",
    nightwire: "synth",
    viridian: "synth",
    marquee: "harp",
    newsdesk: "press",
    breakingdesk: "press",
    broadsheet: "ink",
    telegraph: "press",
    sylvan: "harp",
    clothbound: "ink",
    ambercourt: "harp",
    seaandink: "timber",
    copperplate: "ink",
    proscenium: "timber",
    globetimber: "timber",
    velvetbox: "harp",
    soundbooth: "cinema",
    reeltoreel: "cinema",
    nightfreq: "synth",
    chiaroscuro: "dice",
    nocturne: "harp",
  });

let sharedCtx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  if (sharedCtx === null) {
    try {
      sharedCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (sharedCtx.state === "suspended") {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

function playTone(
  ctx: AudioContext,
  freqStart: number,
  freqEnd: number,
  duration: number,
  type: OscillatorType,
  peakGain: number,
  delay = 0,
): void {
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freqEnd),
      now + duration,
    );
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(
    peakGain,
    now + Math.min(0.02, duration * 0.2),
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** Plays a soft, warm 180–380 ms procedural acoustic signature for `palette`. Silent when `enabled` is false. */
export function playGemFoley(
  palette: StudioPaletteId,
  options: {
    readonly enabled: boolean;
    readonly kind: "open" | "burst" | "crit";
  },
): void {
  if (!options.enabled) return;
  const ctx = audioContext();
  if (ctx === null) return;

  if (options.kind === "crit") {
    // Celebratory gilded brass triad on a Natural 20 roll
    playTone(ctx, 523.25, 523.25, 0.28, "triangle", 0.06, 0);
    playTone(ctx, 659.25, 659.25, 0.3, "triangle", 0.055, 0.06);
    playTone(ctx, 783.99, 783.99, 0.38, "sine", 0.065, 0.12);
    playTone(ctx, 1046.5, 1046.5, 0.46, "sine", 0.045, 0.18);
    return;
  }

  const family = PALETTE_FAMILY[palette];
  const scale = options.kind === "burst" ? 1.12 : 1;

  switch (family) {
    case "ink":
      playTone(ctx, 620 * scale, 340 * scale, 0.11, "triangle", 0.045);
      playTone(ctx, 880 * scale, 960 * scale, 0.16, "sine", 0.028, 0.04);
      return;
    case "saber":
      playTone(ctx, 155 * scale, 240 * scale, 0.24, "sawtooth", 0.028);
      playTone(ctx, 310 * scale, 480 * scale, 0.2, "triangle", 0.032, 0.03);
      return;
    case "cinema":
      playTone(ctx, 420 * scale, 210 * scale, 0.07, "square", 0.022);
      playTone(ctx, 320 * scale, 180 * scale, 0.08, "square", 0.018, 0.06);
      playTone(ctx, 540 * scale, 520 * scale, 0.18, "sine", 0.028, 0.1);
      return;
    case "synth":
      playTone(ctx, 440 * scale, 660 * scale, 0.22, "sine", 0.04);
      playTone(ctx, 880 * scale, 880 * scale, 0.26, "sine", 0.022, 0.07);
      return;
    case "press":
      playTone(ctx, 920 * scale, 880 * scale, 0.055, "triangle", 0.042);
      playTone(
        ctx,
        1180 * scale,
        1140 * scale,
        0.075,
        "triangle",
        0.036,
        0.075,
      );
      return;
    case "harp":
      playTone(ctx, 392 * scale, 392 * scale, 0.34, "triangle", 0.048);
      playTone(ctx, 587.33 * scale, 587.33 * scale, 0.36, "sine", 0.04, 0.055);
      playTone(ctx, 783.99 * scale, 783.99 * scale, 0.4, "sine", 0.028, 0.11);
      return;
    case "timber":
      playTone(ctx, 293.66 * scale, 280 * scale, 0.24, "triangle", 0.05);
      playTone(ctx, 440 * scale, 440 * scale, 0.28, "sine", 0.032, 0.05);
      return;
    case "dice":
      playTone(ctx, 520 * scale, 280 * scale, 0.06, "triangle", 0.048);
      playTone(ctx, 680 * scale, 410 * scale, 0.065, "triangle", 0.04, 0.055);
      playTone(ctx, 820 * scale, 640 * scale, 0.12, "sine", 0.035, 0.11);
      return;
  }
}
