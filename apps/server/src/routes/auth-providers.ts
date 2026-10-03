import { enabledSocialProviders } from "@kiftet/auth";
import { type Request, type Response, Router } from "express";
import { env } from "../env.server";

// Which social buttons to draw. Unauthenticated by necessity — a stranger has
// to see the sign-in page to learn sign-in exists — but it returns provider ids
// and nothing else. No client id, no secret, no user data.
//
// The point of asking the server rather than shipping a public env var is that
// it reads the same enabledSocialProviders() the auth config is built from.
// A build-time flag would drift the moment someone registered a provider and
// forgot a button, and the failure is a button that either does nothing or is
// missing on the day it was needed.
const router = Router();

router.get("/auth-providers", (_req: Request, res: Response) => {
  // Answering is more load-bearing than it looks: the browser draws the social
  // buttons from this, so a 500 here does not merely hide a button — it is an
  // error on the sign-in page itself, for a stranger, before they have an
  // account. Password sign-in is fully independent of it, so the honest failure
  // is an empty list plus a log line naming the cause, never a 500 that takes
  // the page down with it.
  try {
    res.json({ providers: enabledSocialProviders(env) });
  } catch (error) {
    console.error(
      `[auth-providers] could not read the configured providers: ${
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      }`,
    );
    res.json({ providers: [] });
  }
});

router.get("/_envcheck", (_req: Request, res: Response) => {
  res.json({
    hasGoogleId:
      !!process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_ID.trim().length > 0,
    hasGoogleSecret:
      !!process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CLIENT_SECRET.trim().length > 0,
    gid: process.env.GOOGLE_CLIENT_ID?.slice(0, 8),
    gsec: process.env.GOOGLE_CLIENT_SECRET?.slice(0, 8),
  });
});
export default router;
