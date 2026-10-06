/**
 * Verifying that a student actually joined the channel.
 *
 * `/start` proves a bot button was pressed. It does not prove membership, and
 * treating it as proof made the launch reward claimable by tapping a link —
 * which is a promise the business then has to honour, to someone who never did
 * the thing they were asked to do.
 *
 * Telegram only answers this question reliably when the bot is an admin of the
 * channel. It may work without, and it may fail; either way this module fails
 * CLOSED and says so, because the two failure modes must not be confused:
 *
 *  - "not a member"  → the student has not joined yet. Retryable, and true.
 *  - "could not tell" → misconfigured bot, network, API change. Never
 *    interpreted as membership, because that would silently open the reward to
 *    everyone.
 *
 * A "could not tell" that blocks a real student is a visible, fixable outage.
 * A "could not tell" treated as a yes is an invisible one.
 */

/** The statuses `getChatMember` can return. */
export const MEMBER_STATUSES = [
  "creator",
  "administrator",
  "member",
  "restricted",
  "left",
  "kicked",
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * Statuses that count as "in the channel".
 *
 * `restricted` is included deliberately: in a channel it means a member with
 * posting limits, not someone who left. Excluding it would fail a student who
 * muted notifications, which is a thing a real person does.
 *
 * `left` and `kicked` are the only genuine negatives.
 */
const QUALIFYING: ReadonlySet<string> = new Set([
  "creator",
  "administrator",
  "member",
  "restricted",
]);

export function isMember(status: string | undefined | null): boolean {
  if (!status) return false;
  return QUALIFYING.has(status);
}

/**
 * Extract the channel handle from a public channel URL.
 *
 * Only `t.me/<name>` form works. Two common shapes are deliberately rejected:
 *
 *  - `t.me/+abcd` invite links carry no username, and our checks need either a
 *    `@username` or a numeric `-100…` id to know which chat is ours. Silently
 *    "handling" one and then always answering "not our group" would look
 *    exactly like "nobody has joined" — forever, and to nobody in particular.
 *  - Any other host is not Telegram at all.
 *
 * Returns null for anything unsupported so the caller can log the real reason.
 */
export function channelHandleFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "t.me" && host !== "telegram.me") return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (first === undefined) return null;
  // `+` prefix means a private invite link — no username to check against.
  if (first.startsWith("+")) return null;
  // `joinchat/<hash>` is the other private-invite form.
  if (first.toLowerCase() === "joinchat") return null;
  // Telegram usernames are 5–32 chars of [A-Za-z0-9_] and must start with a
  // letter. Anything else is a malformed URL, not a channel.
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(first)) return null;
  return `@${first}`;
}

/**
 * Decide whether a chat object from an update is *our* group.
 *
 * Two independent identifiers, either of which is enough:
 *
 *  - The numeric id (`-100…`) is stable forever and keeps working if the group
 *    is ever switched to private, at which point the username stops resolving
 *    for anyone who is not already inside it.
 *  - The public username rides along on every message object, so it costs
 *    nothing and works even before the id is configured.
 *
 * Accepting either means a rename, or forgetting to set the id, cannot silently
 * point membership verification at the wrong chat. That matters because a wrong
 * chat is indistinguishable from an empty one: no matches, no errors, and a
 * funnel that looks merely quiet.
 */
export function isSameChat(
  chat: { id?: number; username?: string } | null | undefined,
  opts: { channelId?: number | null; handle?: string | null },
): boolean {
  if (!chat || typeof chat.id !== "number") return false;
  if (opts.channelId != null && chat.id === opts.channelId) return true;
  if (opts.handle && chat.username) {
    return `@${chat.username.toLowerCase()}` === opts.handle.toLowerCase();
  }
  return false;
}
