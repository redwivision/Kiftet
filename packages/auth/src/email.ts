export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailConfig = {
  AUTH_EMAIL_TRANSPORT: string;
};

/**
 * Confirmation and password-reset mail has exactly one transport, and it is not
 * a real one: it prints the message to the server log. That is deliberate.
 *
 * These two mails are the only reason a signup needs to be a real address, and
 * the only reason a locked-out student needs a way back in, so the flow around
 * them is built and tested now rather than later — but a provider is a
 * decision with a bill, a sending domain and SPF/DKIM attached to it, and that
 * decision is not ours to make on the user's behalf. Until it is made, nobody
 * receives anything, which is exactly why REQUIRE_EMAIL_VERIFICATION ships
 * false: the two settings are meant to be turned on together.
 *
 * Adding a provider means adding a case here and a member to the
 * AUTH_EMAIL_TRANSPORT enum in apps/server/.env.schema. The enum has no other
 * member on purpose, so flipping the setting without shipping the transport
 * fails validation at boot instead of silently dropping every mail.
 */
export async function sendEmail(
  env: EmailConfig,
  message: EmailMessage,
): Promise<void> {
  switch (env.AUTH_EMAIL_TRANSPORT) {
    case "console":
      // The link goes on its own line so it is a terminal-clickable URL rather
      // than something to retype by hand.
      console.info(
        `[auth] email via console transport — to: ${message.to}\n[auth] subject: ${message.subject}\n${message.text}`,
      );
      return;
    default:
      throw new Error(
        `AUTH_EMAIL_TRANSPORT=${env.AUTH_EMAIL_TRANSPORT} has no transport: add one in packages/auth/src/email.ts`,
      );
  }
}
