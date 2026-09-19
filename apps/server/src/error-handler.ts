import type { NextFunction, Request, Response } from "express";

import { env } from "./env.server";
import { getDb } from "./services";

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

// Hang up the app's Postgres pool ahead of process exit so in-flight rows are
// flushed instead of the platform killing a socket mid-write.
export function drainDatabase(): Promise<void> {
  const db = getDb() as { $client?: { end(): Promise<void> } };
  return db?.$client?.end?.() ?? Promise.resolve();
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