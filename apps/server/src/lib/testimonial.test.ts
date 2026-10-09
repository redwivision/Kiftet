import { describe, expect, test } from "bun:test";

import { formatTestimonial } from "./testimonial";

describe("formatTestimonial", () => {
  test("names who wrote it, when, and then their words", () => {
    expect(
      formatTestimonial({
        name: "Abebe",
        phone: "+251911000000",
        language: "en",
        testimonialAt: new Date("2026-10-09T12:00:00Z"),
        testimonialText: "Unit 3 was really clear.",
      }),
    ).toBe(
      [
        "New Kiftet testimonial",
        "Abebe · +251911000000 (English)",
        "2026-10-09",
        "",
        "Unit 3 was really clear.",
      ].join("\n"),
    );
  });

  test("marks an Amharic testimonial as such", () => {
    expect(
      formatTestimonial({
        name: "Sara",
        phone: "+251911000001",
        language: "am",
        testimonialAt: new Date("2026-01-02T00:00:00Z"),
        testimonialText: "ጥሩ ነበር",
      }),
    ).toContain("Sara · +251911000001 (Amharic)");
  });

  test("reads nothing rather than 'null' when the text or date is missing", () => {
    const text = formatTestimonial({
      name: "Dawit",
      phone: "+251911000002",
      language: "en",
      testimonialAt: null,
      testimonialText: null,
    });
    expect(text).toContain("unknown date");
    expect(text).toContain("(empty)");
    expect(text).not.toContain("null");
  });
});
