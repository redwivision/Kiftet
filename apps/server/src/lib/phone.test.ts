import { describe, expect, test } from "bun:test";

import {
  ETHIOPIA_COUNTRY_CODE,
  maskPhone,
  normalizeEthiopianPhone,
  toDisplayPhone,
} from "./phone";

// Every one of these is a way the same student has written their own number.
// They must all collapse to one value, because the number is the identity and
// a miss here becomes a duplicate row and a referral that credits nobody.
describe("normalizeEthiopianPhone", () => {
  const expected = `${ETHIOPIA_COUNTRY_CODE}911234567`;

  test("accepts every spelling of one Ethiopian mobile number", () => {
    const spellings = [
      "0911234567", // national, the common domestic form
      "911234567", // national, no trunk prefix
      "+251911234567", // E.164
      "251911234567", // country code, no plus
      "00251911234567", // international access code
      "00251 911 234 567", // access code, spaced
      "+251 911 234 567", // E.164, grouped
      "0911 234 567", // grouped
      "0911-234-567",
      "(0911) 234-567",
      "+251-911-234-567",
      "  0911234567  ", // stray whitespace from a phone keyboard
      "09\u201111\u2011234\u2011567", // non-breaking hyphens pasted from a web page
      "\t0911 234 567\n", // pasted out of a spreadsheet cell
    ];
    for (const spelling of spellings) {
      expect(normalizeEthiopianPhone(spelling), spelling).toEqual({
        ok: true,
        phone: expected,
      });
    }
  });

  test("keeps a trunk prefix that arrived with the country code", () => {
    // 00251 written with a leading 0, or 0251…, reach the same place as the
    // bare country code. The country-code branch has to run before the trunk
    // branch or these become an extra digit and get rejected.
    expect(normalizeEthiopianPhone("0251911234567")).toEqual({
      ok: true,
      phone: expected,
    });
  });

  test("accepts every allocated mobile area code", () => {
    // 9 = Ethio Telecom, 7 = Safaricom M-PESA, 5 = Amole. All three must pass,
    // so the allowlist cannot quietly narrow to one carrier — that would be a
    // rejection bug affecting a third of the country.
    expect(normalizeEthiopianPhone("0911234567")).toEqual({
      ok: true,
      phone: `${ETHIOPIA_COUNTRY_CODE}911234567`,
    });
    expect(normalizeEthiopianPhone("0711234567")).toEqual({
      ok: true,
      phone: `${ETHIOPIA_COUNTRY_CODE}711234567`,
    });
    expect(normalizeEthiopianPhone("0511234567")).toEqual({
      ok: true,
      phone: `${ETHIOPIA_COUNTRY_CODE}511234567`,
    });
  });

  test("rejects input that is not a nine-digit Ethiopian number", () => {
    expect(normalizeEthiopianPhone("")).toEqual({
      ok: false,
      problem: "empty",
    });
    expect(normalizeEthiopianPhone("   ")).toEqual({
      ok: false,
      problem: "empty",
    });
    expect(normalizeEthiopianPhone("091123456")).toEqual({
      ok: false,
      problem: "too-short",
    });
    expect(normalizeEthiopianPhone("0911")).toEqual({
      ok: false,
      problem: "too-short",
    });
  });

  test("rejects an Addis landline rather than passing it off as a mobile", () => {
    // `011 XXX XXXX` is an Addis landline: after the trunk strip it is a
    // nine-digit `11…`, which by length alone is a valid mobile. Accepting it
    // produced a signup whose number could never be reached, and it looked
    // like a success — the silent kind of wrong that is found in a launch-day
    // list review rather than at the form.
    expect(normalizeEthiopianPhone("0111234567")).toEqual({
      ok: false,
      problem: "not-mobile",
    });
    expect(normalizeEthiopianPhone("+251112345678")).toEqual({
      ok: false,
      problem: "not-mobile",
    });
  });

  test("reports the prefix it refused, so a new allocation is detectable", () => {
    // If the NBE allocates a new mobile area code, this is the only signal
    // that says so. Without it the prefix list silently rots.
    const refused: string[] = [];
    normalizeEthiopianPhone("0311234567", {
      onRejected: (prefix) => refused.push(prefix),
    });
    // `03` is the trunk `0` plus a national `31…`, so what gets reported is the
    // digit the allowlist actually refused on.
    expect(refused).toEqual(["3"]);
  });

  test("rejects other countries instead of truncating them", () => {
    // Truncating `+12025550143` to nine digits would silently map a US number
    // onto an Ethiopian row that already belongs to someone else.
    expect(normalizeEthiopianPhone("+12025550143")).toEqual({
      ok: false,
      problem: "too-long",
    });
    expect(normalizeEthiopianPhone("+254712345678")).toEqual({
      ok: false,
      problem: "too-long",
    });
    // Written with an access code and a trunk prefix, so it has to survive the
    // two-pass strip before the length check sees it.
    expect(normalizeEthiopianPhone("00254712345678")).toEqual({
      ok: false,
      problem: "too-long",
    });
  });
});

describe("maskPhone", () => {
  test("keeps numbers distinguishable without being reconstructable", () => {
    const masked = maskPhone(`${ETHIOPIA_COUNTRY_CODE}911234567`);
    expect(masked).not.toContain("234567");
    expect(masked.startsWith("+25191")).toBe(true);
    // Two similar numbers must not collapse to the same mask, or a dedupe miss
    // becomes impossible to diagnose.
    expect(maskPhone(`${ETHIOPIA_COUNTRY_CODE}911234568`)).not.toBe(masked);
  });

  test("does not leak a short value verbatim", () => {
    expect(maskPhone("12345")).toBe("***");
  });
});

describe("toDisplayPhone", () => {
  test("renders the familiar domestic grouping", () => {
    expect(toDisplayPhone(`${ETHIOPIA_COUNTRY_CODE}911234567`)).toBe(
      "0911 234 567",
    );
  });

  test("passes through anything it cannot format", () => {
    // A length it does not recognise is returned untouched rather than
    // grouped wrong — this renders in a confirmation message, and a
    // confidently misformatted number is worse than a plain one.
    expect(toDisplayPhone("12345")).toBe("12345");
  });
});
