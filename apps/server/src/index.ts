import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequestListener } from "@react-router/node";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import { migrateDb } from "@kiftet/db";
import { logEnvProbe } from "./env-probe";
import { requireAuth } from "./auth-middleware";
import { env } from "./env.server";
import studyRouter from "./routes/study";
import demoRouter from "./routes/demo";
import { auth } from "./services";

logEnvProbe();
try {
	await migrateDb(env);
} catch (error) {
	console.error(`[boot] database migration FAILED: ${error instanceof Error ? error.message : String(error)}`);
	console.error(error);
	process.exit(1);
}

const app = express();
const IS_PROD = env.NODE_ENV === "production";

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
		methods: ["GET", "POST", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

app.all("/api/auth{/*path}", toNodeHandler(auth));

app.use(express.json({ limit: "256kb" }));

// Demo mode: anonymous visitors get a throwaway study room. Mounted before the
// auth gate because /demo/start is the one endpoint a stranger may call.
app.use("/api/demo", demoRouter);

app.use("/api", requireAuth, studyRouter);

// Unknown /api paths should answer JSON, not an HTML page.
app.use("/api", (_req, res) => {
	res.status(404).json({ error: "not_found" });
});

// ── Health ────────────────────────────────────────────────────────────
// In development "/" returns "OK" so the API-only server is quick to
// probe. In production "/" belongs to the web app, so monitoring uses
// `/health` instead.
app.get("/health", (_req, res) => {
	res.status(200).send("OK");
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
	app.use(
		createRequestListener({ build: webBuild, mode: env.NODE_ENV }),
	);
}

// EthioDeploy (and most PaaS) expose a PORT env; use it as the canonical
// listen address. Falls back to 3000 for local development.
const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});
