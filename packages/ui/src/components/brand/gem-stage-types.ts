// Shared types for Manent's 24 bespoke Hidden Gem collector stage animations and interactive bursts.

/** Resolved browser colours read from `.mn-gem-stage-probe` (zero colour literals in TS). */
export interface StageTokens {
  readonly ink: string;
  readonly surface: string;
  readonly accent: string;
  readonly accent2: string;
  readonly muted: string;
  readonly line: string;
  readonly desk: string;
  readonly tint: string;
  readonly subtle: string;
}

/** Per-frame geometry, timing, pointer parallax, and semantic palette tokens for a Canvas 2D scene. */
export interface SceneFrame {
  readonly w: number;
  readonly h: number;
  readonly cx: number;
  readonly cy: number;
  /** Normalised flourish progress in [0, 1] across the main 2.1 s choreography. */
  readonly t: number;
  /** Seconds elapsed after `t` reaches 1 (used for gentle damped ambient settle). */
  readonly idle: number;
  /** True when rendering a single calm static tableau for `prefers-reduced-motion: reduce`. */
  readonly reduced: boolean;
  /** Smoothly interpolated pointer parallax offset in [-1, 1] along X (0 at rest). */
  readonly px?: number;
  /** Smoothly interpolated pointer parallax offset in [-1, 1] along Y (0 at rest). */
  readonly py?: number;
  /** Hold-to-charge intensity in [0, 1] while pressing the stage (0 at rest). */
  readonly charge?: number;
  readonly tokens: StageTokens;
}

/** Interactive burst spawned at a pointer click position on the collector stage. */
export interface StageBurst {
  readonly x: number;
  readonly y: number;
  readonly startMs: number;
  readonly seed: number;
  /** Optional random die roll (1–20) for Gilded die bursts. */
  readonly roll?: number;
}

/** Web Animations API choreography for the crisp vector `<HiddenGemIcon>` hero (transform + opacity only). */
export interface HeroMotionSpec {
  readonly keyframes: readonly Keyframe[];
  readonly options: KeyframeAnimationOptions;
}

/** Complete kinetic specification for one studio palette's Hidden Gem vitrine. */
export interface GemSceneSpec {
  /** Curated progress timestamp in [0, 1] rendered as the serene static reduced-motion tableau. */
  readonly stillT: number;
  readonly draw: (ctx: CanvasRenderingContext2D, frame: SceneFrame) => void;
  readonly hero: HeroMotionSpec;
}
