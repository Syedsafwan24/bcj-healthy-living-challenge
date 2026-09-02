import { describe, expect, it } from "vitest";

import {
  ID_SUFFIX_MODE,
  buildRegistrationId,
  isRegistrationId,
  nameSuffix,
  normaliseRegistrationId,
  randomSuffix,
} from "./registration-id";

describe("registration ID — section 2.2, open item O-13", () => {
  it("pads the sequence to four digits and grows beyond it", () => {
    expect(buildRegistrationId(42, "Syed Safwan").slice(0, 7)).toBe("BCJ0042");
    expect(buildRegistrationId(12345, "Syed Safwan").slice(0, 8)).toBe("BCJ12345");
  });

  it("produces an ID the sign-in field accepts", () => {
    expect(isRegistrationId(buildRegistrationId(1, "Syed Safwan"))).toBe(true);
    expect(isRegistrationId(buildRegistrationId(7, "Ayesha Noor"))).toBe(true);
  });

  it("accepts what a participant types, with or without the hyphen", () => {
    expect(normaliseRegistrationId(" bcj0001-syed ")).toBe("BCJ0001-SYED");
    expect(normaliseRegistrationId("bcj0001syed")).toBe("BCJ0001-SYED");
    expect(normaliseRegistrationId("BCJ0001 SYED")).toBe("BCJ0001-SYED");
  });

  it("rejects an ID with no suffix or the wrong suffix length", () => {
    expect(isRegistrationId("BCJ0001")).toBe(false);
    expect(isRegistrationId("BCJ0001-")).toBe(false);
    expect(isRegistrationId("BCJ0001-SYE")).toBe(false);
    expect(isRegistrationId("BCJ0001-SYEDS")).toBe(false);
  });
});

describe("name suffix", () => {
  it("takes the first four letters of the name", () => {
    expect(nameSuffix("syedsafwan")).toBe("SYED");
    expect(nameSuffix("Syed Safwan")).toBe("SYED");
    expect(nameSuffix("Abdul Rahman Khan")).toBe("ABDU");
    expect(nameSuffix("Fatima Siddiqui")).toBe("FATI");
  });

  it("ignores spaces, punctuation and case", () => {
    expect(nameSuffix("  o'brien  ")).toBe("OBRI");
    expect(nameSuffix("Al-Amin")).toBe("ALAM");
    expect(nameSuffix("J. K. Rahman")).toBe("JKRA");
  });

  it("reads an accented letter as its plain form", () => {
    expect(nameSuffix("Zaïd Ahmed")).toBe("ZAID");
  });

  it("pads a short name to four characters so every ID is the same length", () => {
    expect(nameSuffix("Ali")).toHaveLength(4);
    expect(nameSuffix("Ali").startsWith("ALI")).toBe(true);
    expect(nameSuffix("Bo")).toHaveLength(4);
  });

  it("falls back to a random suffix for a name in a non-Latin script", () => {
    const suffix = nameSuffix("سيد صفوان");
    expect(suffix).toHaveLength(4);
    expect(suffix).toMatch(/^[A-Z0-9]{4}$/);
  });

  it("builds the ID from the name in the configured mode", () => {
    expect(ID_SUFFIX_MODE).toBe("name");
    expect(buildRegistrationId(1, "Syed Safwan")).toBe("BCJ0001-SYED");
    expect(buildRegistrationId(2, "Fatima Siddiqui")).toBe("BCJ0002-FATI");
  });

  it("gives two people with the same first letters different IDs", () => {
    // The sequential part is what keeps the ID unique, and it comes from a
    // database sequence.
    const a = buildRegistrationId(1, "Syed Safwan");
    const b = buildRegistrationId(2, "Syed Sameer");
    expect(a).not.toBe(b);
    expect(a.split("-")[1]).toBe(b.split("-")[1]);
  });

  it("falls back to random when no name is given", () => {
    expect(buildRegistrationId(1)).toMatch(/^BCJ0001-[A-Z0-9]{4}$/);
  });
});

describe("random suffix, used for padding and in random mode", () => {
  it("excludes characters that are ambiguous when read aloud", () => {
    const sample = Array.from({ length: 500 }, () => randomSuffix()).join("");
    expect(sample).not.toMatch(/[0O1IL]/);
  });

  it("spreads across the alphabet rather than repeating a few values", () => {
    const suffixes = new Set(Array.from({ length: 200 }, () => randomSuffix()));
    expect(suffixes.size).toBeGreaterThan(100);
  });

  it("returns the requested length", () => {
    expect(randomSuffix(1)).toHaveLength(1);
    expect(randomSuffix(4)).toHaveLength(4);
  });
});
