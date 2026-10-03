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

router.get("/auth-debug", (_req: Request, res: Response) => {
  try {
    res.json({
      hasGoogleId: Boolean(env.GOOGLE_CLIENT_ID),
      hasGoogleSecret: Boolean(env.GOOGLE_CLIENT_SECRET),
      googleIdLen: env.GOOGLE_CLIENT_ID?.length ?? 0,
      googleSecretLen: env.GOOGLE_CLIENT_SECRET?.length ?? 0,
      hasGithubId: Boolean(env.GITHUB_CLIENT_ID),
      hasGithubSecret: Boolean(env.GITHUB_CLIENT_SECRET),
      githubIdLen: env.GITHUB_CLIENT_ID?.length ?? 0,
      githubSecretLen: env.GITHUB_CLIENT_SECRET?.length ?? 0,
      cors: env.CORS_ORIGIN,
      baseUrl: env.BETTER_AUTH_URL,
    });
  } catch (e) {
    console.error('[auth-debug] error', e);
    res.status(500).json({ error: String(e) });
  }
});
router.get("/auth-debug2", (_req: Request, res: Response) => {
  try {
    res.json({
      hasGoogleId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasGoogleSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      googleIdLen: process.env.GOOGLE_CLIENT_ID?.length ?? 0,
      googleSecretLen: process.env.GOOGLE_CLIENT_SECRET?.length ?? 0,
    });
  } catch (e) {
    res.json({ err: String(e) });
  }
});
export default router;
