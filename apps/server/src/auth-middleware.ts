import type { NextFunction, Request, Response } from "express";
import { env } from "./env.server";
import { demoUserFor } from "./routes/demo";
import { auth } from "./services";

// Origins allowed to make state-changing requests. CORS_ORIGIN may list
// several (comma-separated), and trailing slashes are normalized so a config
// value like "https://app.example.com/" matches the browser's slash-less
// origin instead of rejecting every POST with 403.
const ALLOWED_ORIGINS = new Set(
	String(env.CORS_ORIGIN ?? "")
		.split(",")
		.map((origin) => origin.trim().replace(/\/+$/, ""))
		.filter(Boolean),
);

function originAllowed(origin: string): boolean {
	return ALLOWED_ORIGINS.has(origin.replace(/\/+$/, ""));
}

declare global {
	namespace Express {
		interface Request {
			authSession?: {
				user: { id: string };
				session: { id: string };
			};
		}
	}
}

function requestHeaders(req: Request): Headers {
	const headers = new Headers();
	for (const [name, value] of Object.entries(req.headers)) {
		if (typeof value === "string") headers.set(name, value);
		else if (Array.isArray(value)) headers.set(name, value.join(", "));
	}
	return headers;
}

export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		if (
			req.method !== "GET" &&
			req.method !== "HEAD" &&
			req.method !== "OPTIONS"
		) {
			const origin = req.get("origin");
			if (origin && !originAllowed(origin)) {
				res.status(403).json({ error: "Request origin is not allowed." });
				return;
			}
		}
		const demoId = await demoUserFor(req);
		if (demoId) {
			req.authSession = { user: { id: demoId }, session: { id: "demo" } };
			next();
			return;
		}
		const session = await auth.api.getSession({ headers: requestHeaders(req) });
		if (!session) {
			res.status(401).json({ error: "You must be signed in." });
			return;
		}
		req.authSession = session;
		next();
	} catch (error) {
		console.error("[auth] session lookup failed", error);
		res.status(401).json({ error: "Unable to verify your session." });
	}
}
