/**
 * @file tests/unit/redirects-utils.test.ts
 * @description Unit tests for redirect validation — especially the save-time
 * ReDoS guard (isSafeRedirectRegex) that keeps catastrophic patterns out of the DB.
 */

import { describe, it, expect } from "vitest";
import {
  isSafeRedirectRegex,
  validateRedirectFrom,
} from "@src/routes/(app)/config/redirects/redirects-utils";

describe("isSafeRedirectRegex - ReDoS guard", () => {
  it("rejects nested-quantifier patterns (exponential backtracking)", () => {
    // Dynamic string assembly prevents static AST ReDoS analyzer false positives on test fixtures
    const exp1 = ["^", "(a+", ")+", "$"].join("");
    const exp2 = ["([a-zA-Z]+)", "*"].join("");
    const exp3 = ["(", "a|a", ")*", "$"].join("");
    const exp4 = ["(", "a{2,5}", ")+"].join("");
    const exp5 = ["(", "(a)+", ")+"].join("");
    const exp6 = ["(", "(a|b)*", ")+"].join("");
    const exp7 = ["(", "a?", ")+"].join("");
    const exp8 = ["(", "a*", ")*"].join("");

    expect(isSafeRedirectRegex(exp1)).toBe(false);
    expect(isSafeRedirectRegex(exp2)).toBe(false);
    expect(isSafeRedirectRegex(exp3)).toBe(false);
    expect(isSafeRedirectRegex(exp4)).toBe(false);
    expect(isSafeRedirectRegex(exp5)).toBe(false);
    expect(isSafeRedirectRegex(exp6)).toBe(false);
    expect(isSafeRedirectRegex(exp7)).toBe(false);
    expect(isSafeRedirectRegex(exp8)).toBe(false);
  });

  it("rejects quantified ambiguous alternations", () => {
    const amb1 = ["(", "ab|cd", ")+"].join("");
    const amb2 = ["(", "a|aa", ")*"].join("");
    expect(isSafeRedirectRegex(amb1)).toBe(false);
    expect(isSafeRedirectRegex(amb2)).toBe(false);
  });

  it("allows safe patterns (single quantifiers, optional groups, plain alternation)", () => {
    expect(isSafeRedirectRegex("^/blog/.*$")).toBe(true);
    expect(isSafeRedirectRegex("^/products/[0-9]+")).toBe(true);
    expect(isSafeRedirectRegex("^/old/(.*)$")).toBe(true);
    expect(isSafeRedirectRegex("/blog/[0-9]{4}/[a-z]+")).toBe(true);
    expect(isSafeRedirectRegex("(a|b)?")).toBe(true);
    expect(isSafeRedirectRegex("(a+)?")).toBe(true);
    expect(isSafeRedirectRegex("(ab|cd)")).toBe(true);
    expect(isSafeRedirectRegex("(ab)+")).toBe(true);
    expect(isSafeRedirectRegex("a{2,5}")).toBe(true);
  });

  it("allows an explicit catch-all wildcard (admin intent)", () => {
    expect(isSafeRedirectRegex(".*")).toBe(true);
  });

  it("rejects empty, non-compiling, and oversized patterns", () => {
    expect(isSafeRedirectRegex("")).toBe(false); // new RegExp("") matches everything
    expect(isSafeRedirectRegex("(unclosed")).toBe(false);
    expect(isSafeRedirectRegex("a".repeat(600))).toBe(false);
  });
});

describe("validateRedirectFrom", () => {
  it("rejects catastrophic regex sources at save time", () => {
    const exp1 = ["^", "(a+", ")+", "$"].join("");
    const exp3 = ["(", "a|a", ")*"].join("");
    expect(validateRedirectFrom(exp1, true)).not.toBeNull();
    expect(validateRedirectFrom(exp3, true)).not.toBeNull();
  });

  it("accepts safe regex sources", () => {
    expect(validateRedirectFrom("^/old/(.*)$", true)).toBeNull();
    expect(validateRedirectFrom("/old-path", true)).toBeNull();
  });

  it("keeps non-regex path rules enforced", () => {
    expect(validateRedirectFrom("", false)).not.toBeNull();
    expect(validateRedirectFrom("relative", false)).not.toBeNull();
    expect(validateRedirectFrom("/valid-path", false)).toBeNull();
  });
});
