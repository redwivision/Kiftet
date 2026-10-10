export interface HapticEnv {
  reducedMotion: boolean;
  vibrate?: (pattern: number | number[]) => unknown;
}

/**
 * A short vibration. The loop uses exactly two — a quiet tick when the mic
 * starts listening, and a double tap on a full close — and it offers them only
 * when the device can and the person's settings allow.
 *
 * Reduced motion means the student asked for less movement; a buzz in the hand
 * is still movement, so it goes quiet there too. `env` is injectable so both
 * gates — the setting and the missing hardware — can be tested without a phone.
 */
export function haptic(pattern: number | number[], env = currentEnv()): void {
  if (env.reducedMotion) return;
  try {
    env.vibrate?.(pattern);
  } catch {
    // No vibration hardware; the ring still ripples.
  }
}

export function currentEnv(): HapticEnv {
  const reducedMotion =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  const vibrate =
    typeof navigator !== "undefined"
      ? navigator.vibrate?.bind(navigator)
      : undefined;
  return { reducedMotion, vibrate };
}
