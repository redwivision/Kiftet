export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailConfig = {
  AUTH_EMAIL_TRANSPORT: string;
  BREVO_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  AUTH_EMAIL_FROM_NAME?: string;
};

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/**
 * Confirmation and password-reset mail goes through one of two transports:
 * "console" prints the message to the server log for local work, and "brevo"
 * sends it through Brevo's HTTPS API. Brevo is used instead of SMTP because
 * hosting platforms routinely block outbound SMTP ports, and a free Gmail
 * sender can be verified without owning a domain.
 *
 * Adding another provider means adding a case here and a member to the
 * AUTH_EMAIL_TRANSPORT enum in apps/server/.env.schema. The enum only lists
 * transports this file can actually deliver, so changing the setting without
 * shipping the transport fails validation at boot instead of silently
 * dropping every mail.
 */
export function assertEmailTransportConfigured(env: EmailConfig): void {
  if (env.AUTH_EMAIL_TRANSPORT !== "brevo") return;

  if (!env.BREVO_API_KEY?.trim()) {
    throw new Error(
      "AUTH_EMAIL_TRANSPORT=brevo requires BREVO_API_KEY in the server environment",
    );
  }
  if (!env.AUTH_EMAIL_FROM?.trim()) {
    throw new Error(
      "AUTH_EMAIL_TRANSPORT=brevo requires AUTH_EMAIL_FROM in the server environment",
    );
  }
}

export async function sendEmail(
  env: EmailConfig,
  message: EmailMessage,
): Promise<void> {
  assertEmailTransportConfigured(env);

  switch (env.AUTH_EMAIL_TRANSPORT) {
    case "console":
      // The link goes on its own line so it is a terminal-clickable URL rather
      // than something to retype by hand.
      console.info(
        `[auth] email via console transport — to: ${message.to}\n[auth] subject: ${message.subject}\n${message.text}`,
      );
      return;
    case "brevo":
      await sendBrevoEmail(env, message);
      return;
    default:
      throw new Error(
        `AUTH_EMAIL_TRANSPORT=${env.AUTH_EMAIL_TRANSPORT} has no transport: add one in packages/auth/src/email.ts`,
      );
  }
}

async function sendBrevoEmail(
  env: EmailConfig,
  message: EmailMessage,
): Promise<void> {
  const apiKey = env.BREVO_API_KEY?.trim();
  const from = env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("Brevo email is not configured");

  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: env.AUTH_EMAIL_FROM_NAME?.trim() || "Kiftet",
        email: from,
      },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Brevo rejected mail to ${message.to}: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
    );
  }
}
