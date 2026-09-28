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
