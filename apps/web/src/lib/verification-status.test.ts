import { describe, expect, test } from "bun:test";

import { verificationOutcome } from "./verification-status";

describe("verificationOutcome", () => {
  test("says nothing when this is not a verification callback", () => {
    expect(verificationOutcome(new URLSearchParams())).toBeNull();
    expect(verificationOutcome(new URLSearchParams("verified=0"))).toBeNull();
  });

  test("a clean callback is a success", () => {
    expect(verificationOutcome(new URLSearchParams("verified=1"))).toBe(
      "success",
    );
  });

  test("an expired token is an error, not a success", () => {
    expect(
      verificationOutcome(
        new URLSearchParams("verified=1&error=TOKEN_EXPIRED"),
      ),
    ).toBe("error");
  });

  test("an invalid token is an error, not a success", () => {
    expect(
      verificationOutcome(
        new URLSearchParams("verified=1&error=INVALID_TOKEN"),
      ),
    ).toBe("error");
  });

  test("an error parameter is still an error without a code", () => {
    expect(verificationOutcome(new URLSearchParams("verified=1&error="))).toBe(
      "error",
    );
  });
});
