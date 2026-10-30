/**
 * What the confirmation link's callback says happened.
 *
 * Better Auth redirects to the callback URL with `?verified=1` on success and
 * appends `&error=TOKEN_EXPIRED` (or `INVALID_TOKEN`) when the link is stale.
 * Reading only `verified=1` would tell a student their address is confirmed
 * when the token was rejected, so the error is checked first.
 */
export type VerificationOutcome = "success" | "error";

export function verificationOutcome(
  params: URLSearchParams,
): VerificationOutcome | null {
  if (params.get("verified") !== "1") return null;
  return params.has("error") ? "error" : "success";
}
