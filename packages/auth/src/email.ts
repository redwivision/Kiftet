import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailConfig = {
  AUTH_EMAIL_TRANSPORT: string;
  AUTH_SMTP_HOST?: string;
  AUTH_SMTP_PORT?: number | string;
  AUTH_SMTP_USER?: string;
  AUTH_SMTP_PASS?: string;
  BREVO_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  AUTH_EMAIL_FROM_NAME?: string;
};

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = 587;

export type SmtpTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth: {
    user: string;
    pass: string;
  };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
};

export type SmtpTransport = {
  sendMail: (mail: {
    from: { name: string; address: string };
    to: string;
    subject: string;
    text: string;
  }) => Promise<unknown>;
  close: () => void;
};

export type SmtpTransportFactory = (
  options: SmtpTransportOptions,
) => SmtpTransport;

const defaultSmtpTransportFactory: SmtpTransportFactory = (options) =>
  nodemailer.createTransport(options) as SmtpTransport;

/**
 * Confirmation and password-reset mail goes through one of three transports:
 * "console" prints the message to the server log for local work, "smtp" sends
 * it through an SMTP server (Gmail by default), and "brevo" sends it through
 * Brevo's HTTPS API as an optional fallback.
 *
 * SMTP is the simplest path when the sender has no domain: a Gmail app
 * password needs no provider signup. The trade-off is that some hosts block
 * outbound SMTP ports, so the operator must prove delivery before enabling the
 * verification gate. Brevo remains available because its HTTPS API avoids that
 * port block entirely.
 *
 * Adding another provider means adding a case here and a member to the
 * AUTH_EMAIL_TRANSPORT enum in apps/server/.env.schema. The enum only lists
 * transports this file can actually deliver, so changing the setting without
 * shipping the transport fails validation at boot instead of silently
 * dropping every mail.
 */
export function assertEmailTransportConfigured(env: EmailConfig): void {
  switch (env.AUTH_EMAIL_TRANSPORT) {
    case "brevo":
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
      return;
    case "smtp":
      // Validates the port and the credential pair before the server starts.
      // A misconfigured SMTP transport must fail at boot, not when a student
      // asks for a password reset.
      smtpConfig(env);
      return;
    default:
      return;
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
    case "smtp":
      await sendSmtpEmail(env, message);
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

function smtpConfig(env: EmailConfig): {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  name: string;
} {
  const host = env.AUTH_SMTP_HOST?.trim() || DEFAULT_SMTP_HOST;
  const rawPort = env.AUTH_SMTP_PORT;
  const port =
    rawPort === undefined || rawPort === ""
      ? DEFAULT_SMTP_PORT
      : Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `AUTH_SMTP_PORT must be a whole number between 1 and 65535 (got ${String(rawPort)})`,
    );
  }

  const user = env.AUTH_SMTP_USER?.trim();
  if (!user) {
    throw new Error(
      "AUTH_EMAIL_TRANSPORT=smtp requires AUTH_SMTP_USER in the server environment",
    );
  }

  // Google displays app passwords in four groups of four; the spaces are not
  // part of the secret. Strip them so a copy-paste works without a support
  // round-trip.
  const pass = env.AUTH_SMTP_PASS?.replace(/\s+/g, "");
  if (!pass) {
    throw new Error(
      "AUTH_EMAIL_TRANSPORT=smtp requires AUTH_SMTP_PASS in the server environment",
    );
  }

  return {
    host,
    port,
    user,
    pass,
    // Gmail rejects a From address that is not the authenticated account (or
    // an alias configured on it). Defaulting to the login address keeps the
    // minimal setup to two values: user and app password.
    from: env.AUTH_EMAIL_FROM?.trim() || user,
    name: env.AUTH_EMAIL_FROM_NAME?.trim() || "Kiftet",
  };
}

/**
 * Exported for the transport test, which injects a fake Nodemailer transport
 * instead of opening a socket. The default factory is the real one.
 */
export async function sendSmtpEmail(
  env: EmailConfig,
  message: EmailMessage,
  createTransport: SmtpTransportFactory = defaultSmtpTransportFactory,
): Promise<void> {
  const config = smtpConfig(env);
  const transport = createTransport({
    host: config.host,
    port: config.port,
    // 465 is implicit TLS; 587 starts plaintext and upgrades via STARTTLS.
    // requireTLS on 587 refuses to fall back to an unencrypted session.
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    await transport.sendMail({
      from: { name: config.name, address: config.from },
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`SMTP rejected mail to ${message.to}: ${detail}`);
  } finally {
    transport.close();
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
