// Deterministic offline geometric SVG motif layered inside Avatar circles: unique per person,
// styled exclusively through theme tokens so it adapts across light, dark, and high-contrast modes.
import type { ReactNode } from "react";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Deterministic 32-bit FNV-1a hash of a person's normalised name. */
export function hashAvatarSeed(seed: string): number {
  const normalized = seed.trim().toLowerCase();
  let hash = FNV_OFFSET;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** Extracts an integer in [min, max] from shifted hash bits. */
const pickRange = (
  hash: number,
  shift: number,
  min: number,
  max: number,
): number => min + (((hash >>> shift) & 0xff) % (max - min + 1));

/**
 * Pure decorative geometric emblem for `seed`, rendered inside the circular avatar beneath the initials.
 * Four restrained editorial motif families (orbit, split, facet, halo) keep avatars distinct at every size
 * without introducing external assets, network fetches, or off-theme colours.
 */
export function AvatarArt({ seed }: { seed: string }): ReactNode {
  const hash = hashAvatarSeed(seed);
  const variant = hash & 3;
  const angle = pickRange(hash, 2, 0, 7) * 45;
  const cx = pickRange(hash, 8, 6, 26);
  const cy = pickRange(hash, 16, 6, 26);
  const r = pickRange(hash, 24, 9, 15);
  const transform = `rotate(${angle} 16 16)`;

  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className="mn-avatar-art pointer-events-none absolute inset-0 size-full"
    >
      {variant === 0 && (
        <g transform={transform}>
          <circle cx={cx} cy={cy} r={r} className="mn-avatar-art-hi" />
          <circle
            cx={32 - cx}
            cy={32 - cy}
            r={Math.max(6, r - 3)}
            className="mn-avatar-art-lo"
          />
          <circle
            cx={16}
            cy={16}
            r={11}
            fill="none"
            strokeWidth={1.25}
            className="mn-avatar-art-ring"
          />
        </g>
      )}
      {variant === 1 && (
        <g transform={transform}>
          <path
            d="M 0 0 L 32 0 L 32 15 Q 16 21 0 13 Z"
            className="mn-avatar-art-hi"
          />
          <circle cx={23} cy={24} r={9} className="mn-avatar-art-lo" />
        </g>
      )}
      {variant === 2 && (
        <g transform={transform}>
          <path
            d="M -2 24 Q 14 8 34 18 L 34 34 L -2 34 Z"
            className="mn-avatar-art-lo"
          />
          <path
            d="M -2 -2 L 22 -2 Q 12 14 -2 18 Z"
            className="mn-avatar-art-hi"
          />
        </g>
      )}
      {variant === 3 && (
        <g transform={transform}>
          <circle cx={cx} cy={cy} r={14} className="mn-avatar-art-hi" />
          <circle
            cx={cx}
            cy={cy}
            r={9}
            fill="none"
            strokeWidth={1.5}
            className="mn-avatar-art-ring"
          />
          <circle cx={32 - cx} cy={26} r={7} className="mn-avatar-art-lo" />
        </g>
      )}
    </svg>
  );
}
