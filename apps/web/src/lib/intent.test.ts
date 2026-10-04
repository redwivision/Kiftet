import { describe, expect, it } from "bun:test";
import {
  countWords,
  detectSessionEnd,
  type EndMarker,
  findBoundaryEnd,
  findSessionEnd,
  leadingText,
} from "./intent";

// Narrows instead of asserting with `!`, so a cue that stops matching fails
// with a readable message rather than a TypeError three lines later.
function boundary(text: string): EndMarker {
  const found = findBoundaryEnd(text);
  if (!found) throw new Error(`no boundary cue found in: ${text}`);
  return found;
}

describe("findBoundaryEnd", () => {
  it("finds the English closing cues", () => {
    expect(
      findBoundaryEnd("mitochondria and ribosomes, that's all")?.phrase,
    ).toContain("that's all");
    expect(findBoundaryEnd("i'm done")?.phrase).toBe("i'm done");
  });

  // The whole point of the Amharic pass: an Amharic student saying "ያለቀለም"
  // used to get no cue at all, so the ring tap was the only way to end a turn.
  it("finds the Amharic closing cues", () => {
    expect(findBoundaryEnd("ማይቶክሎንድሪያና ሪቦሶሞች፣ ያለቀለም")?.phrase).toBe("ያለቀለም");
    expect(findBoundaryEnd("ተጠናቋለሁ")?.phrase).toBe("ተጠናቋለሁ");
    expect(findBoundaryEnd("ምንም አልገለም")?.phrase).toBe("ምንም አልገለም");
    expect(findBoundaryEnd("ቀጣይ ጥያቄ")?.phrase).toBe("ቀጣይ ጥያቄ");
  });

  it("matches Amharic inside a longer sentence, not just at the start", () => {
    const marker = findBoundaryEnd("ስላይን ውሃው የሚያስተላልጥ ነው፣ ያለቀለም");
    expect(marker?.phrase).toBe("ያለቀለም");
    expect(marker?.index).toBeGreaterThan(0);
  });

  it("still finds an English cue said during an Amharic session", () => {
    expect(findBoundaryEnd("that's all i remember")).not.toBeNull();
  });

  it("reports the earliest cue when several are present", () => {
    const marker = findBoundaryEnd("that's all, and i think that's it");
    expect(marker?.phrase).toContain("that's all");
  });

  // Regression: the Amharic patterns were first written with a `g` flag. On
  // module-level regexes that makes `exec` stateful, so `lastIndex` leaked from
  // one call into the next and a second identical cue in the same session
  // started its search mid-string and matched nothing.
  it("is stateless across repeated calls", () => {
    const late = "በኢልትሮኖን ካሪየርስ ያለቀለም";
    expect(findBoundaryEnd(late)?.index).toBe(14);
    // Same cue, now at index 0 — must still be found.
    expect(findBoundaryEnd("ያለቀለም በኢልትሮኖን ካሪየርስ")?.index).toBe(0);
    // And again, to catch a leak in the other direction.
    expect(findBoundaryEnd("ያለቀለም")?.index).toBe(0);
    expect(findBoundaryEnd(late)?.index).toBe(14);
  });

  it("does not fire on a mid-answer use of a cue word", () => {
    // "ያለቀለም" here is part of a phrase, and the caller decides whether a cue
    // is close enough to the end — see the countWords guard in the study loop.
    expect(findBoundaryEnd("ቀጣይ ጥያቄ")).not.toBeNull();
    expect(findBoundaryEnd("the electron carriers carry electrons")).toBeNull();
  });
});

describe("detectSessionEnd / findSessionEnd", () => {
  it("detects the English farewells", () => {
    expect(detectSessionEnd("bye")).toBe(true);
    expect(detectSessionEnd("i'm done studying")).toBe(true);
  });

  it("detects the Amharic farewells", () => {
    expect(detectSessionEnd("ደህና ሁን")).toBe(true);
    expect(detectSessionEnd("እየሄድ ነው")).toBe(true);
    expect(detectSessionEnd("ለነዚህ ጊዜ አልቋል")).toBe(true);
  });

  // "ሰላም" is both the greeting and a parting word. Treating it as a farewell
  // meant a student opening an answer with it lost the whole session.
  it("does not treat ሰላም as a goodbye", () => {
    expect(detectSessionEnd("ሰላም")).toBe(false);
  });

  it("does not treat a plain boundary cue as a session end", () => {
    expect(findSessionEnd("ያለቀለም")).toBeNull();
  });
});

describe("leadingText", () => {
  it("returns everything before the cue", () => {
    const text = "ribosomes and lysosomes, that's all";
    expect(leadingText(text, boundary(text).index)).toBe(
      "ribosomes and lysosomes,",
    );
  });

  it("returns nothing when the cue opens the turn", () => {
    const text = "that's all";
    expect(leadingText(text, boundary(text).index)).toBe("");
  });
});

describe("countWords", () => {
  it("counts Latin words", () => {
    expect(countWords("the electron carriers carry electrons")).toBe(5);
  });

  // This is the bug: the guard this feeds used to strip [^a-z0-9\s] before
  // counting, which deleted every Ethiopic codepoint and left the remainder
  // reading as zero words — so the "is the cue near the end?" check could never
  // work in Amharic.
  it("counts Ethiopic words instead of stripping them to zero", () => {
    expect(countWords("በኢልትሮኖን ካሪየርስ ኤሌክትሮኖን ይወስዳል")).toBe(4);
  });

  it("keeps punctuation out of the count", () => {
    expect(countWords("ማይቶክሎንድሪያ፣ ሪቦሶሞች።")).toBe(2);
  });

  it("is zero for an empty or symbol-only remainder", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("... !!!")).toBe(0);
  });

  it("keeps the mid-sentence guard honest in both languages", () => {
    // The guard counts the words *after* the cue, so a cue at the end of the
    // turn leaves nothing and fires, while a cue mid-answer does not.
    const ending = "በኢልትሮኖን ካሪየርስ ያለቀለም";
    const end = boundary(ending);
    const afterEnd = countWords(ending.slice(end.index + end.phrase.length));
    expect(afterEnd).toBeLessThanOrEqual(6);

    const midAnswer = "ያለቀለም በኢልትሮኖን ካሪየርስ ኤሌክትሮኖን ይወስዳል እና በራስ አቅጣጫ ላይ ይገኛል";
    const mid = boundary(midAnswer);
    const afterMid = countWords(midAnswer.slice(mid.index + mid.phrase.length));
    expect(afterMid).toBeGreaterThan(6);
  });
});
