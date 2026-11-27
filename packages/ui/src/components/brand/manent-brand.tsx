// Manent brand identity: Bound "M" Monogram, optically matched [M]anent Monogram Ligature and Stacked Lockup.
// Zero colour literals: ink inherits currentColor and the live caret/revision spine binds to --bg-accent.
import type { ReactNode } from "react";
import { BRAND_WORDS } from "../../words/appearance.ts";

export interface BrandProps {
  className?: string;
  decorative?: boolean;
}

/** Standalone Bound "M" Monogram (8.5px matched stems, 4px caret/revision slit). */
export function ManentMark(props: BrandProps): ReactNode {
  const { className, decorative = false } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : BRAND_WORDS.name}
    >
      <path
        fill="currentColor"
        d="M11 12H17.5C18.2 12 18.8 12.3 19.2 12.9L32 31.2L41.3 17.8C41.7 17.2 42.5 17.5 42.5 18.2V29.8C42.5 30.3 42.3 30.7 42 31.1L33.7 42.6C33.3 43.1 32.7 43.4 32 43.4C31.3 43.4 30.7 43.1 30.3 42.6L17.5 24.8V50C17.5 51.1 16.6 52 15.5 52H11C9.9 52 9 51.1 9 50V14C9 12.9 9.9 12 11 12Z"
      />
      <rect
        x="46.5"
        y="12"
        width="8.5"
        height="40"
        rx="2"
        style={{ fill: "var(--bg-accent)" }}
      />
    </svg>
  );
}

/** Standalone typographic logo: optically matched 6.8px M ligature flowing directly into lowercase anent. */
export function ManentWordmark(props: BrandProps): ReactNode {
  const { className, decorative = false } = props;
  return (
    <span
      className={
        className === undefined
          ? "inline-flex items-baseline font-semibold tracking-tight select-none"
          : `inline-flex items-baseline font-semibold tracking-tight select-none ${className}`
      }
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : BRAND_WORDS.name}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 41.1 40"
        fill="none"
        aria-hidden="true"
        className="mn-wordmark-m"
      >
        <path
          fill="currentColor"
          d="M2 0H7.4C8.1 0 8.7 0.35 9.1 0.92L21.5 19.2L30.5 6.0C30.9 5.45 31.7 5.75 31.7 6.4V16.6C31.7 17.1 31.5 17.5 31.2 17.9L23.1 29.4C22.7 29.95 22.1 30.25 21.5 30.25C20.9 30.25 20.3 29.95 19.9 29.4L7.2 11.4V38.2C7.2 39.2 6.4 40 5.4 40H1.8C0.8 40 0 39.2 0 38.2V1.8C0 0.8 0.8 0 1.8 0H2Z"
        />
        <rect
          x="34.3"
          y="0"
          width="6.8"
          height="40"
          rx="1.6"
          style={{ fill: "var(--bg-accent)" }}
        />
      </svg>
      <span aria-hidden="true">{BRAND_WORDS.ligatureTail}</span>
    </span>
  );
}

/** Stacked lockup: Bound "M" mark above plain archival-ink Manent (zero double-bar repetition). */
export function ManentStackedLockup(props: BrandProps): ReactNode {
  const { className, decorative = false } = props;
  return (
    <span
      className={
        className === undefined
          ? "inline-flex flex-col items-center gap-2 select-none"
          : `inline-flex flex-col items-center gap-2 select-none ${className}`
      }
      aria-hidden={decorative ? "true" : undefined}
    >
      <ManentMark className="size-10 text-fg" decorative />
      <span className="text-heading font-semibold tracking-tight text-fg">
        {BRAND_WORDS.name}
      </span>
    </span>
  );
}
