import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { migrateDb } from "@kiftet/db";
import { ensureDefaultSyllabus } from "@kiftet/db/seed";
import { createRequestListener } from "@react-router/node";
import { toNodeHandler } from "better-auth/node";
import compression from "compression";
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
import { startAiUsageSweep } from "./lib/ai-quota-store";
import { startDemoCleanup } from "./lib/demo-cleanup";
import { requestLogger } from "./lib/http-log";
import { requestIdMiddleware } from "./lib/request-id";
import { resolveTrustProxy } from "./lib/trust-proxy";
import authProvidersRouter from "./routes/auth-providers";
import demoRouter from "./routes/demo";
import placementRouter from "./routes/placement";
import planRouter from "./routes/plan";
import studyRouter from "./routes/study";
import syllabusRouter from "./routes/syllabus";
import telegramRouter from "./routes/telegram";
import waitlistRouter from "./routes/waitlist";
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

// Only reached once the schema has migrated, so the `kind` column the sweep
// filters on is guaranteed to exist.
startDemoCleanup();
// Expired AI-quota buckets are scratch; this collects the ones an owner left
// behind after spending their last request.
startAiUsageSweep(getDb());

const app = express();
const IS_PROD = env.NODE_ENV === "production";
// Set the moment SIGTERM arrives: `/ready` flips to 503 so the load balancer
// stops routing new requests here while the in-flight ones finish. Declared
// here because the readiness handler reads it at request time.
let draining = false;

// Where the real client IP comes from. Express only replaces `req.ip` with the
// left-most `X-Forwarded-For` value once it is told how many proxies to trust;
// without this every per-IP limiter (demo starts, waitlist signups) keys on the
// edge's address and the entire internet shares one bucket. That is invisible
// locally — there is no proxy, so `req.ip` is already correct — and it only
// appears in production, which is the worst place to discover it.
//
// `TRUST_PROXY` accepts a hop count ("1") or an Express trust expression
// ("loopback", a CIDR). Single-proxy PaaS ⇒ "1"; production defaults to "1"
// because a PaaS always fronts the container, and development defaults to
// "loopback" (trust only a local proxy, so a spoofed header from a direct client
// is ignored). `false` disables trust entirely for a directly-exposed server.
const trustProxy = resolveTrustProxy(env.TRUST_PROXY, IS_PROD);
app.set("trust proxy", trustProxy);

// Request id first, so the access line below — and anything an error handler
// later logs — can be joined by a single id. See lib/request-id.ts.
app.use(requestIdMiddleware());

// Request log: interesting hits (slow, or 4xx/5xx) always go to stderr, and
// ordinary successful ones are sampled under a hard lines-per-second ceiling.
// Mounted first so it also wraps the health handlers below — if the platform
// pings a path and gets anything but 200, the log shows exactly which one and
// the code that answered it. The ceiling exists because a waitlist link shared
// into a Telegram channel is enough traffic to make the logging the outage; see
// lib/http-log.ts.
app.use(requestLogger());

// Compress JSON and SSR HTML on the way out. On a weak mobile link this is the
// cheapest large win: the study payloads are text, and gzip typically removes
// 70–80% of their bytes. Mounted before static so hashed JS/CSS get it too.
app.use(compression());

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

// Before the auth gate: this is what an anonymous stranger needs in order to
// see the sign-in page at all.
app.use("/api", authProvidersRouter);

// The launch waitlist. Before the auth gate — an anonymous stranger is the
// entire audience — and mounted ahead of the study routes so a Gemini retry
// storm in the study loop cannot delay a signup.
//
// Mounted *before* the global json() parser deliberately. body-parser marks a
// body as parsed and skips any later parser for the same request, so a 4kb cap
// registered after a 256kb one is a comment rather than a limit, and the
// endpoint an anonymous stranger can hammer is the one that ends up with the
// generous bound. A name and a phone number do not need 256kb.
app.use("/api/waitlist", express.json({ limit: "4kb" }), waitlistRouter);

// The Telegram webhook. Ahead of the auth gate and of every limiter, because it
// is authenticated by its own secret header, Telegram retries a slow response
// for hours, and nothing in front of it should be able to make it answer
// non-200. Same reasoning as the waitlist about parser order; a Telegram update
// carries a chat id and some text, so 16kb is already generous.
app.use("/api/telegram", express.json({ limit: "16kb" }), telegramRouter);

app.use(express.json({ limit: "256kb" }));

// Demo mode: anonymous visitors get a throwaway study room. Mounted before the
// auth gate because /demo/start is the one endpoint a stranger may call.
app.use("/api/demo", demoRouter);

app.use("/api", requireAuth, studyRouter);
app.use("/api", requireAuth, syllabusRouter);
app.use("/api", requireAuth, placementRouter);
app.use("/api", requireAuth, planRouter);

// Unknown /api paths should answer JSON, not an HTML page.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// ── Health ────────────────────────────────────────────────────────────
// Two different questions, answered by two different endpoints, because a
// platform acts on them very differently:
//
//   /health — "is this process alive?" A cheap, dependency-free 200. It must
//     NOT touch the database: a transient DB blip is not a reason to have the
//     platform kill and restart a perfectly healthy process (restarting cannot
//     fix a paused database, and a restart loop just makes the outage louder).
//
//   /ready — "should this instance receive traffic right now?" 503 while the
//     process is draining after SIGTERM (so the load balancer stops sending new
//     requests during a rolling deploy) and 503 when the database is
//     unreachable (so traffic shifts to an instance that can actually serve).
//
// In development "/" also returns "OK" so the API-only server is quick to probe.
app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

app.get("/ready", async (_req, res) => {
  if (draining) {
    res.status(503).json({ error: "draining" });
    return;
  }
  try {
    await getDb().execute(sql`select 1`);
    res.status(200).send("OK");
  } catch (error) {
    console.error(
      `[ready] database ping failed: ${error instanceof Error ? error.message : String(error)}`,
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

  app.use(
    express.static(webClientDir, {
      setHeaders(res, filePath) {
        // Vite hashes every asset filename, so a year-long immutable cache is
        // safe and is what makes a repeat visit load from disk instead of the
        // network. The service worker, manifest and offline page keep their
        // old names and must be revalidated or a deploy can never reach them.
        const path = filePath.slice(webClientDir.length).replaceAll("\\", "/");
        if (path.startsWith("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (
          /^\/(sw\.js|registerSW\.js|manifest\.webmanifest|offline\.html)$/.test(
            path,
          )
        ) {
          res.setHeader("Cache-Control", "no-cache");
        } else {
          res.setHeader("Cache-Control", "public, max-age=3600");
        }
      },
    }),
  );

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
  // Prove the proxy setting out loud. If this is wrong, every visitor shares one
  // rate-limit bucket — a failure that is otherwise invisible until the funnel
  // 429s under load. Seeing the setting and how many forwarded hops arrive at
  // boot is how a deploy gets diagnosed in seconds instead of hours.
  console.log(
    `[boot] trust proxy = ${JSON.stringify(trustProxy)} (TRUST_PROXY=${env.TRUST_PROXY ? "set" : "default"})`,
  );
});
// A request that can't finish in a minute is stuck (or hostile) — cap it so a
// wedged client can't pin a worker forever. Every AI fan-out is deliberately
// bounded *below* this, so a slow model degrades to a fallback answer instead
// of a dropped socket: the guide loop holds itself to 45s across all concepts
// and 24s per provider call, the study plan to 18s, and DB queries to 5s on
// connect. If this cap ever fires, a route's own deadline was wrong — not the
// model being slow.
server.requestTimeout = 60_000;

// The platform sends SIGTERM before killing the instance. Let in-flight
// requests finish, hang up the DB pool, then exit cleanly. If connections
// won't drain in 10 seconds, force-quit so the redeploy isn't stuck.
function shutdown(signal: string, code: 0 | 1) {
  draining = true;
  console.log(`[boot] ${signal} received — draining connections…`);
  server.close(() => {
    void drainDatabase().finally(() => process.exit(code));
  });
  setTimeout(() => process.exit(code), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM", 0));
process.on("SIGINT", () => shutdown("SIGINT", 0));
