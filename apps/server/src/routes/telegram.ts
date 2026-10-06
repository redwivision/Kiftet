import { waitlistSignup } from "@kiftet/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { Router } from "express";

import { env } from "../env.server";
import {
  channelHandleFromUrl,
  isMember,
  isSameChat,
} from "../lib/telegram-membership";
import { getWaitlistDb } from "../services";

/**
 * Telegram webhook — how a waitlist signup becomes a *verified* channel
 * member, which is one of the two conditions that earn the launch reward.
 *
 * Mounted ahead of the auth gate and ahead of every limiter, because of three
 * properties of the Telegram Bot API that no other caller shares:
 *
 *  - It **retries** a non-2xx response for roughly 24 hours, so a 500 here does
 *    not fail an activation — it spams it, and the retries are load on an
 *    endpoint we believe is trivial.
 *  - It expects a response in **about ten seconds**. Anything slower is a
 *    failure by its definition, so this handler must never queue behind the
 *    study loop.
 *  - It sends a `secret_token` we chose, echoed on every delivery as
 *    `X-Telegram-Bot-Api-Secret-Token`. That header is the entire
 *    authentication — no signature scheme, no shared library, and nothing to
 *    get wrong, since a mismatch is simply a 403.
 *
 * The webhook is deliberately NOT registered at boot. Calling `setWebhook` from
 * the boot sequence would make an outbound network call on the critical path of
 * starting the process, which converts a Telegram outage into a failed deploy.
 * Registering it is an ops step; see RUNBOOK.md.
 */

/**
 * Only the fields actually read. Every one is optional because Telegram decides
 * what a given update contains — an update that arrives without a field we
 * happen to require must be ignored, not crash the handler, and a crash here
 * means Telegram retries the same update for ~24 hours.
 */
type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: { id?: number; username?: string; type?: string };
    from?: { id?: number; first_name?: string };
    text?: string;
  };
  /**
   * Emitted to admins when someone joins or leaves. This is how membership is
   * established, because `getChatMember` does not answer for this group.
   */
  chat_member?: {
    chat?: { id?: number; username?: string; type?: string };
    from?: { id?: number };
    date?: number;
    old_chat_member?: { status?: string; user?: { id?: number } };
    new_chat_member?: { status?: string; user?: { id?: number } };
  };
};

const router = Router();

/**
 * Telegram's own copy, in the language the student signed up in. Bilingual by
 * construction: a launch message is the one piece of copy that reaches someone
 * who has never seen the site, and a launch announcement half-translated is a
 * worse first impression than no announcement.
 */
const COPY = {
  en: {
    start: [
      "You're on the Kiftet waitlist. Welcome.",
      "",
      "To unlock your month of premium at launch, two things:",
      "1. Join our channel for the launch announcement — tap the pinned link.",
      "2. Send us a short line about what Kiftet showed you.",
      "",
      "Reply to this message with your line whenever you're ready.",
      "Sending it means we can keep it and read it internally. We will never publish it, or use your name, without asking you first.",
    ].join("\n"),
    startAlreadyJoined: [
      "You're already on the list — nothing to redo here.",
      "",
      "Send us a short line about what Kiftet showed you and you're done.",
    ].join("\n"),
    startNoToken:
      "Open your waitlist confirmation on kiftet.ethiodeploy.com and use the Telegram button there to connect your account.",
    received: [
      "Got it — thank you. That genuinely helps other students decide.",
      "",
      "We'll read it before anything is published, and we'll ask before using your name.",
      "Your month of premium is unlocked for launch day.",
    ].join("\n"),
    receivedNotVerified: [
      "Got it — thank you. That genuinely helps other students decide.",
      "",
      "We'll read it before anything is published, and we'll ask before using your name.",
      "",
      "One thing left: join the channel, then send /joined there so we can confirm it.",
      "Once we have that, your month of premium is unlocked for launch day.",
    ].join("\n"),
    alreadyReceived:
      "We already have your line — thank you. Nothing else to send.",
    verified: [
      "Confirmed — you're in the channel, and that's one of your two steps done.",
      "",
      "Go back to your waitlist confirmation and send us your one line about Kiftet.",
    ].join("\n"),
    verifiedAlready:
      "You're already confirmed in the channel — nothing to redo here.",
    startVerifiedAlready: [
      "You're on the list and already confirmed in the channel — good.",
      "",
      "Last step: reply to this message with one line about what Kiftet showed you.",
    ].join("\n"),
    verifiedNoRow:
      "I can't find a waitlist signup on this Telegram account. Open your confirmation on kiftet.ethiodeploy.com and use the Telegram button there first.",
    unknown: "Send /start using the button on your waitlist confirmation.",
  },
  am: {
    start: [
      "በክፍተት መጠበቅ ወረላጋ ላይ አለህ። እንኳን በደህና መጡ።",
      "",
      "በመንረጃ ደረጃ የሚከፈልህበት የአንድ ወር ክፍያ ለማሳየት ሁለት ነገሮች አለህ፦",
      "1. የመንረጃ ዝርዝርን ለመቀረፍ ያንን ወደ ቻናላችን ተመለስ።",
      "2. ክፍተት ምን እንዳሳየህልን ስለዚህ አንድ ወረፍ መልእክት ላክልን።",
      "",
      "ሲዘጋጅት ምላሽ መልእክትህን ወደ ዚህ መልስ ልክ።",
      "ላክተኝ ብለን ያስቀምጥና ውስጥ እንነብ እንችላለን። ከመጠየቅህ በፊት ምንም አንትም፤ ስምህንም አንጠቀም።",
    ].join("\n"),
    startAlreadyJoined: [
      "አስቀድሞ በዝርዝር ላይ አለህ — እንደገና ምንም ማድረግ አያስፈልግም።",
      "",
      "ክፍተት ምን እንዳሳየህልን ስለዚህ አንድ ወረፍ መልእክት ላክ፣ ጨርህ።",
    ].join("\n"),
    startNoToken:
      "በ kiftet.ethiodeploy.com ላይ ያለውን የመጠበቅ ማረጋገጫዎን ክፈት፤ ከዚያ ያለውን የቴሌግራም አዝራር ጠቅም።",
    received: [
      "ደርሷል — አመሰግናለሁ። ይህ ሌሎች ተማሪዎች ስለ Kiftet ምን እንደመገለጹ የሚደረግ ይመስራል።",
      "",
      "ማንኛውንም ነገር ከመውጣትህ በፊት እንነባለን፤ ስምህን ለመጠቀም ግን ከመጠየቅህ ጀምሮ እንጠይቅሃለን።",
      "የአንድ ወር ክፍያዎ ለመንረጃ ቀን ተዘጋጅቷል።",
    ].join("\n"),
    alreadyReceived: "ወረፍህን አስቀድሞም አለን — አመሰግናለን። ሌላ ምንም ላክት አያስፈልግም።",
    verified: [
      "ተረጋግጧል — በቻናላችን ውስጥ ነህ። ከሁለቱ እርምጃዎች አንዱ ተጠናቅቋል።",
      "",
      "ወደ የመጠበቅ ማረጋገጫህ ተመለስ፤ ከKiftet ጋር ስለምታወቅህ አንድ ሰረዝ መልእክትህን ላክ።",
    ].join("\n"),
    verifiedAlready: "በቻናላችን ውስጥ አስቀድሞም ተረጋግጠህ። እንደገና ምንም ማድረግ አያስፈልግም።",
    receivedNotVerified: [
      "ደርሷል — አመሰግናለኁ። ይህ ሌሎች ተማሪዎች ስለ Kiftet ምን እንደመገለጹ የሚደረግ ይመስራል።",
      "",
      "ማንኛውንም ነገር ከመውጣትህ በፊት እንነባለን፤ ስምህን ለመጠቀም ግን ከመጠየቅህ ጀምሮ እንጠይቅሃለን።",
      "",
      "አንድ ነገር ቀርቷል፦ ቻናላችን ተቀላቅል፤ ልክ በዚያ /joined ብለህ ላክ፤ ስለዚያ ማረጋገጥ ይችላለን።",
      "ከዚያ በኋላ የአንድ ወር ክፍያህ ለመንረጃ ቀን ተዘጋጅቷል።",
    ].join("\n"),
    verifiedNoRow:
      "በዚህ የቴሌግራም መለያ ላይ የመጠበቅ ምዝገባ አላገኘኝም። በ kiftet.ethiodeploy.com ላይ ያለውን ማረጋገጫህ ክፈት፤ ከዚያ ያለውን አዝራር በመጠቀም አስጀምር።",
    startVerifiedAlready: [
      "በዝርዝር ላይ አለህ፤ በቻናላችን ውስጥም ተረጋግጠህ — ጥሩ።",
      "",
      "የመጨረሻ እርምጃ፦ ለማሳወጃ ስለ Kiftet ምን እንደመገለጹ አንድ ሰረዝ መልእክትህን ለዚህ መልስ ላክ።",
    ].join("\n"),
    unknown: "በመጠበቅ ማረጋገጫዎ ላይ ያለውን አዝራር በመጠቀም /start ላክ።",
  },
} as const;

type Language = keyof typeof COPY;

function copyFor(row: { language: string } | undefined): Language {
  return row?.language === "am" ? "am" : "en";
}

/**
 * How long an outbound Telegram call may take.
 *
 * Telegram gives a webhook about ten seconds and then treats the delivery as
 * failed and retries it for roughly 24 hours. An `await fetch` with no timeout
 * therefore converts a Telegram-side hang into 24 hours of repeated database
 * writes and repeated send attempts — one undeliverable message becoming a
 * load generator pointed at ourselves.
 */
const TELEGRAM_TIMEOUT_MS = 6_000;

/** A testimonial is a sentence, not an essay. Long enough for a real answer. */
const MAX_TESTIMONIAL_CHARS = 2_000;

/**
 * Reply to a student. Failures are logged and swallowed on purpose: a message
 * that cannot be delivered must not turn the webhook response into a non-2xx,
 * because Telegram would then redeliver the update and we'd attempt it again —
 * turning one undeliverable message into a retry loop against our own database.
 *
 * Bounded by `AbortSignal.timeout` for the reason above.
 */
async function reply(chatId: number, text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[telegram] sendMessage failed:", error);
  }
}

/**
 * The channel, as two independently usable identifiers.
 *
 * `TELEGRAM_CHANNEL_ID` is the numeric `-100…` id and is the one that keeps
 * working if the group is ever switched to private, at which point the username
 * stops resolving for anyone who is not already inside. It is optional: when
 * absent, matching falls back to the public username, which is free because the
 * username rides along on every message object.
 */
const CHANNEL_ID = (() => {
  const raw = env.TELEGRAM_CHANNEL_ID;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
})();

const CHANNEL_HANDLE = channelHandleFromUrl(env.TELEGRAM_CHANNEL_URL);

/**
 * Thin binding of the config to `isSameChat`, so the matching rule itself stays
 * pure and testable and the env reads happen once at module load instead of on
 * every update — which matters here because a flood of updates is exactly the
 * load this endpoint must not turn into work.
 */
function isChannelChat(
  chat: { id?: number; username?: string } | undefined | null,
): boolean {
  return isSameChat(chat, { channelId: CHANNEL_ID, handle: CHANNEL_HANDLE });
}

router.post("/hook", async (req, res) => {
  // 503, not 404: an unset secret is a deployment problem we want visible in
  // logs and telemetry, not a request that looks like a typo'd URL.
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    console.error(
      "[telegram] webhook called with TELEGRAM_WEBHOOK_SECRET unset",
    );
    res.status(503).json({ error: "telegram_not_configured" });
    return;
  }

  const provided = req.get("x-telegram-bot-api-secret-token");
  if (provided !== expected) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const update = req.body as TelegramUpdate;

  // ── Join events ────────────────────────────────────────────────────────────
  // Membership is taken from Telegram's own join/leave notifications rather than
  // `getChatMember`, which was the obvious first choice and returns
  // `invalid user_id specified` for *every* member of this supergroup —
  // including its creator — while `getChatMemberCount` works fine. Whatever the
  // cause, it is not fixable from here, and a check that always answers "no"
  // would leave nobody eligible while looking perfectly healthy. The bot is an
  // admin, so it receives these events directly.
  const memberEvent = update?.chat_member;
  if (memberEvent?.chat && isChannelChat(memberEvent.chat)) {
    const status = memberEvent.new_chat_member?.status;
    const userId = memberEvent.new_chat_member?.user?.id;
    if (userId !== undefined && isMember(status)) {
      // Never revoked on `left`. Proof that someone joined is not proof that they
      // are still there, but treating an accidental exit as fraud would punish
      // a real student for misclicking. `left` is logged instead, so a
      // join-then-leave pattern is visible to an operator.
      const updated = await getWaitlistDb()
        .update(waitlistSignup)
        .set({ channelVerifiedAt: new Date() })
        .where(
          and(
            eq(waitlistSignup.telegramChatId, userId),
            isNull(waitlistSignup.channelVerifiedAt),
          ),
        )
        .returning({ id: waitlistSignup.id });
      console.error(
        `[telegram] channel join chat=${memberEvent.chat.id} user=${userId} status=${status} matched=${updated.length}`,
      );
    } else {
      console.error(
        `[telegram] channel status chat=${memberEvent.chat.id} user=${userId} status=${status}`,
      );
    }
    res.status(200).json({ ok: true, handled: "channel_member" });
    return;
  }

  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();

  // ── Commands inside the channel ────────────────────────────────────────────
  // The escape hatch for the one ordering the join event cannot cover: someone
  // who joined *before* pressing Start, so their join arrived while we had no
  // row to attach it to and it was discarded. A command addressed to the bot is
  // delivered even with privacy mode on, so this works in both orders and needs
  // no `getChatMember`. The join event alone would strand them with no way to
  // prove something they actually did.
  if (isChannelChat(message?.chat) && text) {
    const from = message?.from?.id;
    const command = text.split(/[\s@]+/)[0]?.toLowerCase() ?? "";
    if (
      from !== undefined &&
      (command === "/joined" || command === "/verified")
    ) {
      const known = await getWaitlistDb()
        .select({ id: waitlistSignup.id, language: waitlistSignup.language })
        .from(waitlistSignup)
        .where(eq(waitlistSignup.telegramChatId, from))
        .limit(1);
      const row = known[0];
      const copy = COPY[copyFor(row)];
      if (row === undefined) {
        // Pressed Start in a different account, or never pressed it. Say so
        // privately and precisely instead of confirming something we did not
        // check.
        await reply(from, copy.verifiedNoRow);
      } else {
        const updated = await getWaitlistDb()
          .update(waitlistSignup)
          .set({ channelVerifiedAt: new Date() })
          .where(
            and(
              eq(waitlistSignup.id, row.id),
              isNull(waitlistSignup.channelVerifiedAt),
            ),
          )
          .returning({ id: waitlistSignup.id });
        await reply(
          from,
          updated.length > 0 ? copy.verified : copy.verifiedAlready,
        );
      }
      console.error(
        `[telegram] /joined in channel from=${from} known=${known.length}`,
      );
      res.status(200).json({ ok: true, handled: "channel_joined_command" });
      return;
    }
    // Any other message in the channel. Privacy mode means we should only be
    // receiving commands addressed to us, so this is a misdirected Start or
    // someone talking to the group. Answering in-channel would be noise.
    const sender = message?.from?.id;
    if (command === "/start" && sender !== undefined) {
      // Answered privately, never in the group: a bot replying "use your
      // confirmation link" to the channel is noise everyone has to scroll past.
      await reply(sender, COPY.en.startNoToken);
    }
    res.status(200).json({ ok: true, handled: "channel_message" });
    return;
  }

  if (chatId === undefined || !text) {
    // A non-text update (a sticker, a join event). Nothing to do, and answering
    // 200 is what stops Telegram retrying it.
    res.status(200).json({ ok: true, handled: "non-text" });
    return;
  }

  if (!text.startsWith("/start")) {
    // Not a command: this is the testimonial. The bot asks for a line in both
    // its messages, so anything else from a connected student is being offered
    // to us as that line — and the premium reward depends on it being stored.
    const [row] = await getWaitlistDb()
      .select()
      .from(waitlistSignup)
      .where(eq(waitlistSignup.telegramChatId, chatId))
      .limit(1);

    if (!row) {
      await reply(chatId, COPY[copyFor(row)].unknown);
      res.status(200).json({ ok: true, handled: "unknown-chat" });
      return;
    }

    const copy = COPY[copyFor(row)];

    // Idempotent: Telegram redelivers updates, and a student who sends two
    // lines should keep the first rather than have it silently replaced.
    if (row.testimonialAt !== null) {
      await reply(chatId, copy.alreadyReceived);
      res.status(200).json({ ok: true, handled: "testimonial-already" });
      return;
    }

    const body = text.slice(0, MAX_TESTIMONIAL_CHARS);
    const verified = row.channelVerifiedAt !== null;

    // The testimonial is stored either way. It is evidence the student took the
    // time, and it is the input to the launch-day review, so withholding it
    // would punish them for a join event that simply had not arrived yet.
    // Eligibility is a separate column and stays honest.
    await getWaitlistDb()
      .update(waitlistSignup)
      .set({ testimonialText: body, testimonialAt: new Date() })
      .where(eq(waitlistSignup.id, row.id));

    // Distinct copy, because these are genuinely different situations: one is
    // done, the other has a concrete next step. Telling someone their month of
    // premium is unlocked when the second condition is unmet would be a promise
    // the launch-day query would then contradict.
    await reply(chatId, verified ? copy.received : copy.receivedNotVerified);
    console.error(
      `[telegram] testimonial seq=${row.seq} chat=${chatId} channelVerified=${verified}`,
    );
    res.status(200).json({
      ok: true,
      handled: "testimonial",
      channelVerified: verified,
    });
    return;
  }

  const token = text.slice("/start".length).trim();

  if (!token) {
    await reply(chatId, COPY.en.startNoToken);
    res.status(200).json({ ok: true, handled: "no-token" });
    return;
  }

  const [row] = await getWaitlistDb()
    .select()
    .from(waitlistSignup)
    .where(eq(waitlistSignup.activationToken, token))
    .limit(1);

  if (!row) {
    await reply(chatId, COPY.en.startNoToken);
    res.status(200).json({ ok: true, handled: "unknown-token" });
    return;
  }

  const copy = COPY[copyFor(row)];
  const alreadyActivated = row.activatedAt !== null;

  // The activation token is a capability that travels in a URL, and URLs get
  // copied, pasted into group chats, and screenshotted. So a token that has
  // already been redeemed is not re-bindable: the first account to use it owns
  // the reward, and a second one is told to go through the site. Without this,
  // leaking a link hands the premium month to whoever opens it.
  const boundElsewhere =
    row.telegramChatId !== null && row.telegramChatId !== chatId;

  if (boundElsewhere) {
    console.error(
      `[telegram] refused re-activation seq=${row.seq} token already bound to chat=${row.telegramChatId}, offered by chat=${chatId}`,
    );
    await reply(chatId, COPY.en.startNoToken);
    res.status(200).json({ ok: true, handled: "already-bound" });
    return;
  }

  // Idempotent by construction: re-tapping the deep link from the *same* account
  // rewrites the same values, so a student who presses it twice — or a webhook
  // Telegram redelivers — lands in exactly the same state. No "already done"
  // branch that could race.
  //
  // `channelVerifiedAt` is NOT set here. Whether they are in the channel is a
  // fact only Telegram can answer, and it arrives as a join event whenever it
  // becomes true — before or after this message. Guessing at this point would
  // mean either awarding the reward to someone who never joined, or telling a
  // student who already joined that they had not.
  //
  // The one case a join event cannot cover is joining *before* pressing Start,
  // because the event landed while we had no row to attach it to. That is what
  // `/joined@KiftetBot` in the channel is for, and the welcome message says so.
  await getWaitlistDb()
    .update(waitlistSignup)
    .set({ telegramChatId: chatId, activatedAt: row.activatedAt ?? new Date() })
    .where(eq(waitlistSignup.id, row.id));

  const verified = row.channelVerifiedAt !== null;
  await reply(
    chatId,
    alreadyActivated
      ? copy.startAlreadyJoined
      : verified
        ? copy.startVerifiedAlready
        : copy.start,
  );

  console.error(
    `[telegram] activation seq=${row.seq} chat=${chatId} channelVerified=${verified}${alreadyActivated ? " (repeat)" : ""}`,
  );
  res
    .status(200)
    .json({ ok: true, handled: "activated", channelVerified: verified });
});

export default router;
