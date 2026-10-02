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
  res.json({ providers: enabledSocialProviders(env) });
});

export default router;
