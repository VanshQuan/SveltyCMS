/**
 * @file tests/unit/utils/system-locale.test.ts
 * @description Tests for ISO system-language helpers and RTL html attrs.
 */
import { describe, expect, it } from "vitest";
import { getTextDirection } from "@utils/string";
import {
  compiledUiLocale,
  isCompiledSystemLocale,
  isIso6391LanguageCode,
  languageBase,
  mergeSystemLanguages,
  systemHtmlAttrs,
} from "@utils/system-locale";

describe("system-locale", () => {
  it("accepts ISO 639-1 codes and rejects junk", () => {
    expect(isIso6391LanguageCode("en")).toBe(true);
    expect(isIso6391LanguageCode("ar")).toBe(true);
    expect(isIso6391LanguageCode("AR")).toBe(true);
    expect(isIso6391LanguageCode("en-US")).toBe(true);
    expect(isIso6391LanguageCode("")).toBe(false);
    expect(isIso6391LanguageCode("english")).toBe(false);
    expect(isIso6391LanguageCode("../x")).toBe(false);
  });

  it("normalizes regional tags to the base language", () => {
    expect(languageBase("ar-SA")).toBe("ar");
    expect(languageBase("EN_US")).toBe("en");
  });

  it("treats bundled en/de as compiled and others as English UI fallback", () => {
    expect(isCompiledSystemLocale("en")).toBe(true);
    expect(isCompiledSystemLocale("de")).toBe(true);
    expect(isCompiledSystemLocale("ar")).toBe(false);
    expect(compiledUiLocale("ar")).toBe("en");
    expect(compiledUiLocale("de")).toBe("de");
  });

  it("merges configured locales with bundled catalogs and dedupes", () => {
    expect(mergeSystemLanguages(["fr", "en", "de", "fr"])).toEqual(["en", "de", "fr"]);
  });

  it("sets RTL html attrs via getTextDirection", () => {
    expect(systemHtmlAttrs("ar")).toEqual({ lang: "ar", dir: "rtl" });
    expect(systemHtmlAttrs("he-IL")).toEqual({ lang: "he", dir: "rtl" });
    expect(systemHtmlAttrs("de")).toEqual({ lang: "de", dir: "ltr" });
  });
});

describe("getTextDirection (utils/string)", () => {
  it("returns rtl for Arabic, Hebrew, Persian, Urdu", () => {
    expect(getTextDirection("ar")).toBe("rtl");
    expect(getTextDirection("he")).toBe("rtl");
    expect(getTextDirection("fa")).toBe("rtl");
    expect(getTextDirection("ur")).toBe("rtl");
    expect(getTextDirection("ar-SA")).toBe("rtl");
  });

  it("returns ltr for English and German", () => {
    expect(getTextDirection("en")).toBe("ltr");
    expect(getTextDirection("de")).toBe("ltr");
  });
});
