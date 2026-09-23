import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { migrateDb } from "@kiftet/db";
import { ensureDefaultSyllabus } from "@kiftet/db/seed";
import { createRequestListener } from "@react-router/node";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import { sql } from "drizzle-orm";
import express from "express";
import { requireAuth } from "./auth-middleware";
import { env } from "./env.server";
import { logEnvProbe } from "./env-probe";
import {
	drainDatabase,
	errorMiddleware,
	installProcessGuards,
} from "./error-handler";
import demoRouter from "./routes/demo";
import studyRouter from "./routes/study";
import syllabusRouter from "./routes/syllabus";
import { auth, getDb } from "./services";

logEnvProbe();
installProcessGuards();
try {
	await migrateDb(env);
	// Bet 1 (STRATEGY.md): the verified Biology Grade 12 syllabus (unit list
	// compiled from the MoE New-Curriculum textbook; provenance in sourceNote)
	// so browse-by-syllabus works end-to-end. Idempotent — no-op once present.
	await ensureDefaultSyllabus(getDb());
} catch (error) {
	console.error(
		`[boot] database migration FAILED: ${error instanceof Error ? error.message : String(error)}`,
	);
	console.error(error);
	process.exit(1);
}

const app = express();
const IS_PROD = env.NODE_ENV === "production";

// Request log: every hit (method, path, status, ms) goes to stderr so the
// platform's health-check probe is visible in the boot log — if the platform
// pings a path and gets anything but 200, the log shows exactly which one and
// the code that answered it. This is how we see what the paas is probing.
// Mounted first so it also wraps the health handlers below.
app.use((req, res, next) => {
	const start = performance.now();
	res.on("finish", () => {
		console.error(
			`[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(performance.now() - start)}ms`,
		);
	});
	next();
});

// Health-check tolerance: platforms ping different readiness paths, and a 404
// on an unknown probe path reads as a failed check even when the app is fine.
// Answer 200 OK on the common ones (and "/" below), plus the deeper /health
// DB probe.
for (const path of ["/healthz", "/ready", "/live", "/ping", "/status"]) {
	app.get(path, (_req, res) => {
		res.status(200).send("OK");
	});
}

// Normalize the configured origin(s): trim whitespace, strip trailing slashes,
// and accept a comma-separated list. Browsers send a slash-less origin, so a
// config value like "https://app.example.com/" would otherwise echo a header
// the browser rejects — cookies never attach and every authenticated call fails.
const allowedOrigins = String(env.CORS_ORIGIN ?? "")
	.split(",")
	.map((origin) => origin.trim().replace(/\/+$/, ""))
	.filter(Boolean);

app.use(
	cors({
		origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
		methods: ["GET", "POST", "PATCH", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "X-Demo-User-Id"],
		credentials: true,
	}),
);

app.all("/api/auth{/*path}", toNodeHandler(auth));

app.use(express.json({ limit: "256kb" }));

// Demo mode: anonymous visitors get a throwaway study room. Mounted before the
// auth gate because /demo/start is the one endpoint a stranger may call.
app.use("/api/demo", demoRouter);

app.use("/api", requireAuth, studyRouter);
app.use("/api", requireAuth, syllabusRouter);

// Unknown /api paths should answer JSON, not an HTML page.
app.use("/api", (_req, res) => {
	res.status(404).json({ error: "not_found" });
});

// ── Health ────────────────────────────────────────────────────────────
// In development "/" returns "OK" so the API-only server is quick to
// probe. In production "/" belongs to the web app, so monitoring uses
// `/health` instead. The probe does a real `SELECT 1` against the pool so a
// dead database (a platform pause, a revoked URL, a network break) shows up
// as a failing health check instead of a 200 while the app is quietly
// broken. A POOL-less boot already exits before the listener is up, and a
// pool that can't reach the DB answers 503 within the 5s connect timeout.
app.get("/health", async (_req, res) => {
	try {
		await getDb().execute(sql`select 1`);
		res.status(200).send("OK");
	} catch (error) {
		console.error(
			`[health] database ping failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		res.status(503).json({ error: "database_unreachable" });
	}
});

if (!IS_PROD) {
	app.get("/", (_req, res) => {
		res.status(200).send("OK");
	});
}

// ── Production: serve the web app from the same process ───────────────
// When building for a single-service host (e.g. EthioDeploy), the web
// build sits next to the server build inside the repo. The catch-all at
// the very bottom forwards every non-API request to React Router's SSR
// request handler, and express.static serves the built client assets
// (JS/CSS, icons, offline.html, manifest, service worker).
if (IS_PROD) {
	const webClientDir = resolve(import.meta.dirname, "../../web/build/client");
	const webServerEntry = resolve(
		import.meta.dirname,
		"../../web/build/server/index.js",
	);

	app.use(express.static(webClientDir));

	const webBuild = await import(pathToFileURL(webServerEntry).href);
	app.use(createRequestListener({ build: webBuild, mode: env.NODE_ENV }));
}

// ── Errors ──────────────────────────────────────────────────────
// Last middleware: every rejection and throw from the API *and* the SSR
// handler lands here as friendly JSON, never an HTML stack page (see
// error-handler.ts).
app.use(errorMiddleware);

// EthioDeploy (and most PaaS) expose a PORT env; use it as the canonical
// listen address. Falls back to 3000 for local development.
const PORT = Number(process.env.PORT ?? 3000);
const server = app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});
// A request that can't finish in a minute is stuck (or hostile) — cap it so a
// wedged client can't pin a worker forever. The Gemini guard (20s) and DB
// query timeouts fire well inside this.
server.requestTimeout = 60_000;

// The platform sends SIGTERM before killing the instance. Let in-flight
// requests finish, hang up the DB pool, then exit cleanly. If connections
// won't drain in 10 seconds, force-quit so the redeploy isn't stuck.
function shutdown(signal: string, code: 0 | 1) {
	console.log(`[boot] ${signal} received — draining connections…`);
	server.close(() => {
		void drainDatabase().finally(() => process.exit(code));
	});
	setTimeout(() => process.exit(code), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM", 0));
process.on("SIGINT", () => shutdown("SIGINT", 0));
