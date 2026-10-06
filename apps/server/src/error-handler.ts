import type { NextFunction, Request, Response } from "express";

import { isAiBusy } from "./ai/admission";
import { env } from "./env.server";
import { getDb, getWaitlistDb } from "./services";

type BodyParserError = {
  type?: string;
  status?: number;
  message?: string;
  expose?: boolean;
};

// Express 5 forwards both async-route rejections and sync throws through one
// place, so nothing in the API path ever reaches Express's default error page
// (an HTML stack trace in dev, bare text in prod). The shape stays consistent
// with the rest of the API: `{ error: string }`, and the copy is written for
// the student, not the developer.
export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // A shed AI call is not a fault, and it must not read as one. 503 + a real
  // Retry-After says "the shared model quota is full, come back shortly" —
  // which is true, actionable, and recoverable. Left to fall through to the
  // generic 500 below, a student who was merely unlucky sees "Something went
  // wrong on our side", and an operator sees a spike of 500s during what is
  // really a capacity signal. Handled here rather than at each call site
  // because Express 5 already funnels every rejection through this one place,
  // and a per-call-site mapping is six chances to forget one.
  if (isAiBusy(error)) {
    res.setHeader("Retry-After", String(Math.max(1, error.retryAfterSeconds)));
    res.status(503).json({
      error:
        "Our AI is busy right now — too many students are studying at once. Try again in a few seconds.",
      reason: error.reason,
      retryAfterSeconds: error.retryAfterSeconds,
    });
    return;
  }

  if (isBodyParserError(error)) {
    if (error.type === "entity.too.large") {
      res.status(413).json({
        error:
          "That request is too large. Keep answers and chunks under the limit.",
      });
      return;
    }
    res
      .status(error.status && error.status < 500 ? error.status : 400)
      .json({ error: "We couldn't read that request. Please try again." });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error("[error] unhandled request error:", error);
  res.status(500).json({
    error:
      env.NODE_ENV === "development"
        ? `Server error: ${message}`
        : "Something went wrong on our side. Please try again.",
  });
}

function isBodyParserError(error: unknown): error is BodyParserError {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as BodyParserError;
  return typeof candidate.type === "string" && "expose" in candidate;
}

// Hang up the app's Postgres pools ahead of process exit so in-flight rows are
// flushed instead of the platform killing a socket mid-write. Both pools: the
// waitlist's is separate on purpose (see services.ts), so draining only the
// main one would leave a socket open on the same endpoint.
export function drainDatabase(): Promise<void> {
  const handles = [getDb(), getWaitlistDb()].map(
    (db) => (db as { $client?: { end(): Promise<void> } }).$client,
  );
  return Promise.all(
    handles.map((client) => client?.end?.() ?? Promise.resolve()),
  ).then(() => undefined);
}

// Log anything async that escapes a try/catch so the operator can see it
// without killing the room (a single stray rejection shouldn't take the app
// down). An uncaught synchronous error is fatal by contract: log it and exit
// so the platform restarts a clean instance instead of serving a broken one.
export function installProcessGuards(): void {
  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandledRejection:", reason);
  });
  process.on("uncaughtException", (error) => {
    console.error("[process] uncaughtException:", error);
    setTimeout(() => process.exit(1), 100).unref();
  });
}
