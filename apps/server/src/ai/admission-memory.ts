import {
  type AdmissionConfig,
  type AdmissionDecision,
  type AdmissionState,
  applyOutcome,
  decideAdmission,
  initialAdmissionState,
} from "./admission-state";

/**
 * An in-memory `admission-store` backend.
 *
 * It exists so unit tests that drive the AI seam (`ask` → `admitAiCall`) do not
 * need a live Postgres, and it runs the *same* pure arithmetic the database
 * store runs — only the storage differs, so a test exercises the real decision
 * logic. It is not wired into production: the shared bucket and breaker must be
 * cross-instance, which is exactly what this cannot provide.
 */
const state = new Map<string, AdmissionState>();

export async function consumeInMemory(
  provider: string,
  config: AdmissionConfig,
  now: number = Date.now(),
): Promise<AdmissionDecision> {
  const current =
    state.get(provider) ?? initialAdmissionState(config.perMinute, now);
  const decision = decideAdmission(current, now, config);
  state.set(provider, decision.state);
  return decision;
}

export async function settleInMemory(
  provider: string,
  outcome: "success" | "provider-failure" | "caller-error",
  config: AdmissionConfig,
  now: number = Date.now(),
): Promise<AdmissionState | null> {
  const current = state.get(provider);
  if (!current) return null;
  const next = applyOutcome(current, outcome, now, config);
  state.set(provider, next);
  return next;
}

export function __resetInMemoryAdmission(): void {
  state.clear();
}
