/**
 * Test preload: give the modules a complete, inert environment.
 *
 * Without this, importing the AI module throws at `env.GEMINI_API_KEY.trim()`,
 * because env vars come from the platform in production and from the shell
 * here. The placeholder key is deliberately not a real credential: it makes
 * `isAiAvailable()` false, so unit tests exercise the deterministic fallback
 * path — the one that must be correct on its own, since it is what every
 * student gets when the quota runs out.
 *
 * DATABASE_URL is a localhost placeholder that must never be dialled; any test
 * that actually needs a database has to say so and provision one.
 */
process.env.GEMINI_API_KEY ??= "placeholder-gemini-api-key";
process.env.DATABASE_URL ??= "postgresql://localhost:5432/kiftet_test_absent";
process.env.DATABASE_URL_DIRECT ??= process.env.DATABASE_URL;
process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-in-tests";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.NODE_ENV ??= "test";

// AI admission's bucket and breaker live in Postgres in production (so every
// instance shares one provider allowance). Unit tests have no database, so they
// swap in the in-memory backend, which runs the *same* pure arithmetic against
// a Map. This is the one place it is installed, so every AI test inherits it.
const { __setAdmissionStoreForTests, __resetAdmissionForTests } = await import(
  "./apps/server/src/ai/admission"
);
const { consumeInMemory, settleInMemory, __resetInMemoryAdmission } =
  await import("./apps/server/src/ai/admission-memory");
__setAdmissionStoreForTests({
  consume: consumeInMemory,
  settle: settleInMemory,
});

// State must not leak between tests: a case that empties a bucket or trips a
// breaker would otherwise poison every later test in the same process. Reset the
// semaphore, the telemetry mirrors and the in-memory store before each test.
const { beforeEach } = await import("bun:test");
beforeEach(() => {
  __resetAdmissionForTests();
  __resetInMemoryAdmission();
});
