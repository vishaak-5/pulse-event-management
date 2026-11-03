import type { SpringConfig } from '@react-spring/web'

/** Shared spring physics - the only motion "durations" in the app. */
export const springs = {
  entrance: { tension: 170, friction: 26 } satisfies SpringConfig,
  gentle: { tension: 120, friction: 22 } satisfies SpringConfig,
  snappy: { tension: 380, friction: 30 } satisfies SpringConfig,
  slow: { tension: 60, friction: 20 } satisfies SpringConfig,
}

/** Stagger step between siblings, in ms. */
export const STAGGER = 70
