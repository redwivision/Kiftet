/**
 * Ethiopian phone normalisation for the waitlist.
 *
 * The phone number is the waitlist's identity — there is no email address on a
 * signup — so this is the one piece of the launch path where being *nearly*
 * right is being wrong. A student who types `0911234567` on the form and
 * `+251 911 234 567` to a friend is one person, and if normalisation misses a
 * spelling they become two rows, two waves, and a referral that credits nobody.
 * Conversely, two students behind one shared family phone must be able to
 * register separately, which is why this normalises *format* only and never
 * tries to be clever about who a number belongs to.
 *
 * Ethiopian mobile numbers are nine digits after the country code (+251), with
 * the national trunk prefix `0` used for domestic dialling. The prefixes in
 * active use are 9 (Ethio Telecom) and 7 (Safaricom M-PESA); the NBE has
 * allocated others over time.
 *
 * Deliberate asymmetry — **strict about length and country code, permissive
 * about prefix**:
 *
 *  - Rejecting a number that is nine digits but starts with a prefix we have
 *    not heard of costs a real student a signup, permanently and invisibly.
 *    They see an error, assume the form is broken, and leave.
 *  - Accepting a landline (five digits) or an unallocated prefix costs us
 *    nothing: their row still counts, and Telegram activation — the channel the
 *    reward actually depends on — does not depend on the number being a
 *    reachable mobile at all.
 *
 * So the prefix set is intentionally *not* enforced. Length is.
 */

export const ETHIOPIA_COUNTRY_CODE = "+251";

/** Nine digits: everything from `09XX XXX XXX` down to the bare national form. */
const NATIONAL_LENGTH = 9;

/**
 * The single-digit mobile area codes in use: 9 (Ethio Telecom), 7 (Safaricom
 * M-PESA) and 5 (Amole). Numbers outside this set are refused.
 *
 * This is an allowlist, which contradicts the rule above, so here is why it
 * changed. The failure it prevents is concrete and common: Addis Ababa
 * landlines are `011 XXX XXXX`, which after the trunk strip is a nine-digit
 * `11…` that is indistinguishable from a mobile by length alone. Accepting it
 * creates a signup whose number can never receive anything — and because the
 * error is silent, it looks like a working signup.
 *
 * One digit, not two: the national form is `9` followed by eight, so `911…` is
 * a `9` mobile, whereas a landline is a two-digit area code (`11…` for Addis)
 * followed by seven. Checking two characters would reject every valid mobile
 * and would not be a stricter check in any useful sense — it would just be
 * broken.
 *
 * The cost of the allowlist is the failure mode it introduces: the NBE
 * allocates area codes over time, and a newly allocated prefix would be
 * refused. So a refusal is **never silent** — `onRejected` reports the digit the
 * caller logged, and an unexpected cluster there means a prefix needs adding to
 * this set. That turns "we might reject a real student" into something detected
 * in hours rather than discovered in a launch-day list review.
 *
 * Adding an allocation is a one-line change here. This set should be read
 * against the current NBE list, not against a guess.
 */
const MOBILE_AREA_CODES = new Set(["5", "7", "9"]);

export type PhoneProblem = "empty" | "too-short" | "too-long" | "not-mobile";

export type NormalizeResult =
  | { ok: true; phone: string }
  | { ok: false; problem: PhoneProblem };

export type NormalizeOptions = {
  /**
   * Called with the first two national digits when a well-formed nine-digit
   * number is refused for not being a mobile area code. This is the signal
   * that a new allocation exists, so wire it to a counter or a log line —
   * never leave it undefined in production.
   */
  onRejected?: (prefix: string) => void;
};

/**
 * Reduce any reasonable way of writing an Ethiopian mobile number to E.164.
 *
 * The prefix stripping is a bounded loop rather than three sequential checks,
 * because people legitimately write a trunk `0` in front of a country code
 * (`0251911234567`) and no single ordering catches both `00251…` and that in
 * one pass. Two passes is the most that is meaningful: every combination of
 * access code, country code and trunk that a person actually types collapses
 * within it, and stopping there keeps a Kenyan number from being peeled into
 * something Ethiopian by repetition.
 *
 *   1. digits only  — kills spaces, dashes, brackets, a leading `+`
 *   2. `00251` / `251` / `0`, twice
 *   3. exactly nine digits
 *   4. a known mobile area code
 */
export function normalizeEthiopianPhone(
  input: string,
  options: NormalizeOptions = {},
): NormalizeResult {
  const digits = input.replace(/\D/g, "");

  if (digits.length === 0) return { ok: false, problem: "empty" };

  let national = digits;
  for (let pass = 0; pass < 2; pass += 1) {
    if (national.startsWith("00251")) national = national.slice(5);
    else if (national.startsWith("251")) national = national.slice(3);
    else if (national.startsWith("0")) national = national.slice(1);
    else break;
  }

  if (national.length < NATIONAL_LENGTH) {
    return { ok: false, problem: "too-short" };
  }
  if (national.length > NATIONAL_LENGTH) {
    // An international number that is not Ethiopia's. Rejected rather than
    // truncated: truncating would silently collapse two different people onto
    // one row, which is the exact failure mode this module exists to prevent.
    return { ok: false, problem: "too-long" };
  }

  const areaCode = national.slice(0, 1);
  if (!MOBILE_AREA_CODES.has(areaCode)) {
    options.onRejected?.(areaCode);
    return { ok: false, problem: "not-mobile" };
  }

  return { ok: true, phone: `${ETHIOPIA_COUNTRY_CODE}${national}` };
}

/**
 * A coarse mask for logs and telemetry: enough to tell two numbers apart when
 * debugging a dedupe miss, not enough to reconstruct either. Ethiopian PDPL
 * treats the number as personal data, and a waitlist endpoint is precisely the
 * kind of place where a full number ends up in a log line nobody meant to put
 * it in.
 */
export function maskPhone(phone: string): string {
  if (phone.length <= 6) return "***";
  return `${phone.slice(0, 6)}…${phone.slice(-2)}`;
}

/** The digits a human reads back, for confirmation messages: `0911 234 567`.
 *  The nine national digits group as 3-3-3 after the trunk prefix, which is
 *  how every Ethiopian carrier formats them. */
export function toDisplayPhone(phone: string): string {
  const national = phone.startsWith(ETHIOPIA_COUNTRY_CODE)
    ? phone.slice(ETHIOPIA_COUNTRY_CODE.length)
    : phone;
  if (national.length !== NATIONAL_LENGTH) return national;
  return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}
