import { describe, expect, test } from "bun:test";

import {
  channelHandleFromUrl,
  isMember,
  isSameChat,
} from "./telegram-membership";

describe("isMember", () => {
  test("accepts the statuses that mean someone is in the channel", () => {
    for (const status of ["creator", "administrator", "member"]) {
      expect(isMember(status)).toBe(true);
    }
  });

  test("accepts `restricted`, which is a member with posting limits", () => {
    // A student who muted notifications is still in the channel. Failing them
    // for that would be failing them for something Telegram reports and they
    // never did.
    expect(isMember("restricted")).toBe(true);
  });

  test("rejects the two genuine negatives", () => {
    expect(isMember("left")).toBe(false);
    expect(isMember("kicked")).toBe(false);
  });

  test("fails closed on anything unknown or missing", () => {
    // The whole point: an unrecognised answer must never read as membership,
    // or a Telegram API change silently opens the reward to everyone.
    expect(isMember(undefined)).toBe(false);
    expect(isMember(null)).toBe(false);
    expect(isMember("")).toBe(false);
    expect(isMember("MEMBER")).toBe(false);
    expect(isMember("member ")).toBe(false);
    expect(isMember("unknown_status")).toBe(false);
  });
});

describe("channelHandleFromUrl", () => {
  test("reads a public channel link", () => {
    expect(channelHandleFromUrl("https://t.me/KiftetChannel")).toBe(
      "@KiftetChannel",
    );
  });

  test("tolerates trailing slashes, www, query strings and fragments", () => {
    expect(channelHandleFromUrl("https://t.me/KiftetChannel/")).toBe(
      "@KiftetChannel",
    );
    expect(channelHandleFromUrl("https://www.t.me/KiftetChannel")).toBe(
      "@KiftetChannel",
    );
    expect(channelHandleFromUrl("https://t.me/KiftetChannel?start=abc")).toBe(
      "@KiftetChannel",
    );
    expect(channelHandleFromUrl("https://t.me/KiftetChannel#top")).toBe(
      "@KiftetChannel",
    );
    expect(channelHandleFromUrl("https://telegram.me/KiftetChannel")).toBe(
      "@KiftetChannel",
    );
  });

  test("rejects private invite links, which have no username to check", () => {
    // `getChatMember` needs a @username or a numeric -100… id. An invite link
    // has neither, so accepting one and always returning false would look
    // exactly like "nobody has joined the channel" — and go unnoticed.
    expect(channelHandleFromUrl("https://t.me/+AbCdEfGhIjKl")).toBeNull();
    expect(
      channelHandleFromUrl("https://t.me/joinchat/AAAAAEabcDEF"),
    ).toBeNull();
  });

  test("rejects other hosts entirely", () => {
    expect(
      channelHandleFromUrl("https://example.com/KiftetChannel"),
    ).toBeNull();
    expect(
      channelHandleFromUrl("https://t.me.evil.example/KiftetChannel"),
    ).toBeNull();
  });

  test("rejects malformed and empty input", () => {
    expect(channelHandleFromUrl(null)).toBeNull();
    expect(channelHandleFromUrl(undefined)).toBeNull();
    expect(channelHandleFromUrl("")).toBeNull();
    expect(channelHandleFromUrl("not a url")).toBeNull();
    expect(channelHandleFromUrl("https://t.me/")).toBeNull();
    // Too short to be a Telegram username.
    expect(channelHandleFromUrl("https://t.me/abcd")).toBeNull();
    // Must start with a letter.
    expect(channelHandleFromUrl("https://t.me/1Kiftet")).toBeNull();
    // Illegal characters.
    expect(channelHandleFromUrl("https://t.me/Kiftet-Channel")).toBeNull();
  });

  test("rejects a plausible but non-channel path segment", () => {
    expect(channelHandleFromUrl("https://t.me/s/KiftetChannel")).toBeNull();
  });
});

describe("isSameChat", () => {
  const handle = "@KiftetChannel";
  const channelId = -1004366253026;

  test("matches on the numeric id alone", () => {
    // The identity that survives a switch to private, when the username stops
    // resolving for anyone who is not already inside the group.
    expect(
      isSameChat(
        { id: channelId, username: "KiftetChannel" },
        { channelId, handle },
      ),
    ).toBe(true);
  });

  test("matches on the public username alone when no id is configured", () => {
    expect(isSameChat({ id: 123, username: "KiftetChannel" }, { handle })).toBe(
      true,
    );
  });

  test("matches on the username even when a different id is configured", () => {
    // A rename must not break verification, and a stale id must not quietly
    // win: either identifier being right is enough to identify our own chat.
    expect(
      isSameChat(
        { id: -1009999999999, username: "KiftetChannel" },
        { channelId, handle },
      ),
    ).toBe(true);
  });

  test("rejects a different chat", () => {
    expect(
      isSameChat(
        { id: -1001111111111, username: "SomeOtherGroup" },
        { channelId, handle },
      ),
    ).toBe(false);
  });

  test("rejects the same username with no id match when not configured", () => {
    expect(isSameChat({ id: 1, username: "OtherChannel" }, { handle })).toBe(
      false,
    );
  });

  test("fails closed when neither identifier is usable", () => {
    // Each of these would otherwise look like "nobody joined", which is
    // indistinguishable from a bug and indistinguishable from a quiet funnel.
    expect(isSameChat({ id: 1 }, {})).toBe(false);
    expect(isSameChat({ username: "KiftetChannel" }, { handle })).toBe(false);
    expect(isSameChat({ id: channelId }, { handle: "@Other" })).toBe(false);
    expect(isSameChat(undefined, { channelId, handle })).toBe(false);
    expect(isSameChat(null, { channelId, handle })).toBe(false);
    expect(isSameChat({}, { channelId, handle })).toBe(false);
  });

  test("is case-insensitive on the username", () => {
    // Telegram usernames are case-insensitive; a case mismatch would make
    // verification silently stop working after a harmless edit.
    expect(
      isSameChat(
        { id: 1, username: "kiftetchannel" },
        { handle: "@KiftetChannel" },
      ),
    ).toBe(true);
  });
});
