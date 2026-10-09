/**
 * The text a testimonial is delivered as.
 *
 * Shared by the webhook (which forwards a line the moment it arrives) and
 * `scripts/send-testimonials.ts` (which backfills whatever a failed or
 * unconfigured send left behind). One formatter, so the two paths cannot drift
 * and the operator cannot tell which one sent a given message.
 */
export type TestimonialLike = {
  name: string;
  phone: string;
  language: string;
  testimonialAt: Date | null;
  testimonialText: string | null;
};

export function formatTestimonial(row: TestimonialLike): string {
  const when = row.testimonialAt
    ? row.testimonialAt.toISOString().slice(0, 10)
    : "unknown date";
  const who = [row.name, row.phone].filter(Boolean).join(" · ");
  const language = row.language === "am" ? "Amharic" : "English";
  return [
    "New Kiftet testimonial",
    `${who} (${language})`,
    when,
    "",
    row.testimonialText ?? "(empty)",
  ].join("\n");
}
