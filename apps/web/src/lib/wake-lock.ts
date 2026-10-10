import { useEffect } from "react";

// Tier 3: a student speaks a recall for a minute and reads a lesson for more.
// A phone that dims and locks in the middle of that — because nobody touched
// the screen — drops the voice session and breaks the loop's own rhythm. The
// Screen Wake Lock is exactly this job, and it asks for nothing the student
// would not already expect from "I'm studying right now".

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
}

export interface ScreenWakeLockApi {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

type VisibilityDoc = {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

/**
 * Hold the screen on until `stop()`. The OS force-releases the lock whenever
 * the tab is hidden, so this re-acquires it the moment the tab is shown again
 * — otherwise a student who glances at their notes mid-lesson comes back to a
 * dark screen with the lock gone.
 *
 * Exported separately from the hook (and free of `navigator`/`document`) so the
 * re-acquire behaviour can be tested without a browser. Failures are swallowed
 * on purpose: where the API or the permission is missing (older iOS Safari,
 * desktop Firefox, private mode) this is a silent no-op and the loop is
 * unaffected.
 */
export function holdScreenAwake(
  api: ScreenWakeLockApi,
  doc: VisibilityDoc,
): { stop(): void } {
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;

  const acquire = async () => {
    if (stopped || doc.visibilityState !== "visible") return;
    // Still held: the OS only drops it on hide, so nothing to do.
    if (sentinel && !sentinel.released) return;
    try {
      const acquired = await api.request("screen");
      // The route changed or the phase moved on while we were asking: the lock
      // arrived too late, so hand it straight back rather than leaking it.
      if (stopped) {
        void acquired.release().catch(() => {});
        return;
      }
      sentinel = acquired;
    } catch {
      // Denied or unsupported — the loop still works without it.
    }
  };

  const onVisibility = () => {
    void acquire();
  };

  void acquire();
  doc.addEventListener("visibilitychange", onVisibility);

  return {
    stop() {
      stopped = true;
      doc.removeEventListener("visibilitychange", onVisibility);
      const held = sentinel;
      sentinel = null;
      // A released-elsewhere sentinel rejects; that is not our problem.
      void held?.release().catch(() => {});
    },
  };
}

function screenWakeLock(): ScreenWakeLockApi | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { wakeLock?: ScreenWakeLockApi }).wakeLock;
}

/** Keep the screen awake while `active`. Silent no-op where unsupported. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const api = screenWakeLock();
    if (!api) return;
    const held = holdScreenAwake(api, document);
    return () => held.stop();
  }, [active]);
}
