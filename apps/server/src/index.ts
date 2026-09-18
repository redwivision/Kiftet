import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import { requireAuth } from "./auth-middleware";
import { env } from "./env.server";
import studyRouter from "./routes/study";
import { auth } from "./services";

const app = express();

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

app.use("/api", requireAuth, studyRouter);

app.get("/", (_req, res) => {
	res.status(200).send("OK");
});

app.listen(3000, () => {
	console.log("Server is running on http://localhost:3000");
});
