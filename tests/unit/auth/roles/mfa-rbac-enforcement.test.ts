/**
 * @file tests/unit/auth/roles/mfa-rbac-enforcement.test.ts
 * @description Unit test suite for P0 Role-Based MFA Enforcement (MFA-RBAC):
 * - Role schema validation & mfaRequired flag
 * - Session manager AMR tracking & mfaVerifiedAt persistence
 * - AMR helper logic (isSessionMfaActive, deriveSessionAmr)
 * - Endpoint gate (_checkEndpointPermission) MFA enforcement & exempt paths
 * - Admin role MFA requirement gating
 */

import { describe, it, expect } from "vitest";
import { safeParse } from "valibot";
import { roleSchema } from "@src/databases/schemas";
import type { Role, User } from "@src/databases/auth/types";
import type { DatabaseId, ISODateString } from "@src/content/types";
import { isSessionMfaActive, deriveSessionAmr } from "@src/databases/auth/session-user";
import { InMemorySessionManager } from "@src/databases/auth/session-manager";
import {
  isMfaRequiredForUser,
  validateSessionMfaRequirement,
} from "@src/databases/auth/permissions";
import { _checkEndpointPermission } from "@src/routes/api/[...path]/+server";
import { AppError } from "@utils/error-handling";

describe("P0 MFA-RBAC: Per-Role Multi-Factor Authentication", () => {
  describe("Pillar 1: Data Model & Schema Validation", () => {
    it("validates role with mfaRequired: true via Valibot schema", () => {
      const input = {
        _id: "role_finance",
        name: "Financial Controller",
        permissions: ["finance:read", "finance:write"],
        mfaRequired: true,
      };
      const result = safeParse(roleSchema, input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.mfaRequired).toBe(true);
        expect(result.output.isAdmin).toBe(false);
      }
    });

    it("defaults mfaRequired to false when omitted in role schema", () => {
      const input = {
        _id: "role_author",
        name: "Standard Author",
        permissions: ["posts:write"],
      };
      const result = safeParse(roleSchema, input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.mfaRequired).toBe(false);
      }
    });
  });

  describe("Pillar 2: Session Management & AMR Lifecycle", () => {
    it("InMemorySessionManager stores and retrieves AMR and mfaVerifiedAt metadata", async () => {
      const manager = new InMemorySessionManager();
      const mockUser: User = {
        _id: "user_mfa_1" as DatabaseId,
        email: "secops@example.com",
        role: "role_secops",
        permissions: [],
        createdAt: "2026-01-01T00:00:00Z" as ISODateString,
        updatedAt: "2026-01-01T00:00:00Z" as ISODateString,
      };

      const expiration = new Date(Date.now() + 3600_000).toISOString() as ISODateString;
      const verifiedTimestamp = new Date().toISOString() as ISODateString;

      await manager.set("sess_test_1", mockUser, expiration, {
        amr: ["pwd", "mfa"],
        mfaVerifiedAt: verifiedTimestamp,
      });

      const sessionData = await manager.getSessionData("sess_test_1");
      expect(sessionData).not.toBeNull();
      expect(sessionData?.user.email).toBe("secops@example.com");
      expect(sessionData?.amr).toEqual(["pwd", "mfa"]);
      expect(sessionData?.mfaVerifiedAt).toBe(verifiedTimestamp);

      // Backward compatibility: get() returns the user directly
      const userDirect = await manager.get("sess_test_1");
      expect(userDirect?.email).toBe("secops@example.com");
    });

    it("InMemorySessionManager elevates session AMR via updateSessionAmr", async () => {
      const manager = new InMemorySessionManager();
      const mockUser: User = {
        _id: "user_mfa_2" as DatabaseId,
        email: "editor@example.com",
        role: "role_editor",
        permissions: [],
        createdAt: "2026-01-01T00:00:00Z" as ISODateString,
        updatedAt: "2026-01-01T00:00:00Z" as ISODateString,
      };

      const expiration = new Date(Date.now() + 3600_000).toISOString() as ISODateString;
      await manager.set("sess_test_2", mockUser, expiration, { amr: ["pwd"] });

      let initial = await manager.getSessionData("sess_test_2");
      expect(initial?.amr).toEqual(["pwd"]);
      expect(initial?.mfaVerifiedAt).toBeUndefined();

      // Elevate session with MFA
      await manager.updateSessionAmr("sess_test_2", ["pwd", "mfa"]);

      let elevated = await manager.getSessionData("sess_test_2");
      expect(elevated?.amr).toEqual(["pwd", "mfa"]);
      expect(elevated?.mfaVerifiedAt).toBeDefined();
    });

    it("evaluates session MFA status correctly via isSessionMfaActive", () => {
      // Password only -> false
      expect(isSessionMfaActive(["pwd"])).toBe(false);
      // Trusted device only -> false (not interactive MFA)
      expect(isSessionMfaActive(["pwd", "trusted_device"])).toBe(false);
      // TOTP / interactive MFA -> true
      expect(isSessionMfaActive(["pwd", "mfa"])).toBe(true);
      // Hardware passkey / FIDO2 -> true
      expect(isSessionMfaActive(["webauthn"])).toBe(true);
      // Null/undefined -> false
      expect(isSessionMfaActive(null)).toBe(false);
    });

    it("enforces maxAge freshness in isSessionMfaActive when specified", () => {
      const staleTimestamp = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago
      const freshTimestamp = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago

      // 5-minute maxAge budget
      const budgetMs = 5 * 60 * 1000;

      const staleContext = { amr: ["pwd", "mfa"], mfaVerifiedAt: staleTimestamp };
      const freshContext = { amr: ["pwd", "mfa"], mfaVerifiedAt: freshTimestamp };

      expect(isSessionMfaActive(staleContext, budgetMs)).toBe(false);
      expect(isSessionMfaActive(freshContext, budgetMs)).toBe(true);
    });

    it("derives proper AMR sets via deriveSessionAmr", () => {
      expect(deriveSessionAmr({ isMfaVerified: false })).toEqual(["pwd"]);
      expect(deriveSessionAmr({ isMfaVerified: true })).toEqual(["pwd", "mfa"]);
      expect(deriveSessionAmr({ isMfaVerified: false, usedTrustedDevice: true })).toEqual([
        "pwd",
        "trusted_device",
      ]);
    });
  });

  describe("Pillar 3: Enforcement Logic & Endpoint Gating", () => {
    const regularRole: Role = {
      _id: "role_regular" as DatabaseId,
      name: "Regular",
      permissions: ["collections:read", "collections:write"],
      mfaRequired: false,
    };

    const strictRole: Role = {
      _id: "role_strict" as DatabaseId,
      name: "Strict Officer",
      permissions: ["collections:read", "collections:write"],
      mfaRequired: true,
    };

    const adminMfaRole: Role = {
      _id: "role_admin_mfa" as DatabaseId,
      name: "Admin MFA",
      permissions: ["admin"],
      isAdmin: true,
      mfaRequired: true,
    };

    const regularUser: User = {
      _id: "user_regular" as DatabaseId,
      email: "regular@example.com",
      role: "role_regular",
      permissions: [],
      createdAt: "2026-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2026-01-01T00:00:00Z" as ISODateString,
    };

    const strictUser: User = {
      _id: "user_strict" as DatabaseId,
      email: "strict@example.com",
      role: "role_strict",
      permissions: [],
      createdAt: "2026-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2026-01-01T00:00:00Z" as ISODateString,
    };

    const adminMfaUser: User = {
      _id: "user_admin_mfa" as DatabaseId,
      email: "admin-mfa@example.com",
      role: "role_admin_mfa",
      isAdmin: true,
      permissions: [],
      createdAt: "2026-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2026-01-01T00:00:00Z" as ISODateString,
    };

    it("correctly identifies if user role mandates MFA", () => {
      expect(isMfaRequiredForUser(regularUser, [regularRole])).toBe(false);
      expect(isMfaRequiredForUser(strictUser, [strictRole])).toBe(true);
      expect(isMfaRequiredForUser(adminMfaUser, [adminMfaRole])).toBe(true);
      expect(isMfaRequiredForUser(strictUser, [regularRole, strictRole])).toBe(true);
    });

    it("validates session AMR requirement against user roles", () => {
      expect(validateSessionMfaRequirement(regularUser, [regularRole], ["pwd"])).toBe(true);
      expect(validateSessionMfaRequirement(strictUser, [strictRole], ["pwd"])).toBe(false);
      expect(
        validateSessionMfaRequirement(strictUser, [strictRole], ["pwd", "trusted_device"]),
      ).toBe(false);
      expect(validateSessionMfaRequirement(strictUser, [strictRole], ["pwd", "mfa"])).toBe(true);
    });

    it("allows non-MFA role to access API endpoints with standard password AMR", () => {
      const allowed = _checkEndpointPermission(
        regularUser,
        [regularRole],
        "GET",
        "collections",
        ["collections", "posts"],
        ["pwd"],
      );
      expect(allowed).toBe(true);
    });

    it("blocks strict role without MFA AMR from accessing API endpoints with 403 MFA_REQUIRED", () => {
      try {
        _checkEndpointPermission(
          strictUser,
          [strictRole],
          "GET",
          "collections",
          ["collections", "posts"],
          ["pwd"],
        );
        expect.unreachable("Should have thrown 403 MFA_REQUIRED");
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.status).toBe(403);
        expect(err.code).toBe("MFA_REQUIRED");
      }
    });

    it("blocks strict role with trusted_device AMR (non-interactive) with 403 MFA_REQUIRED", () => {
      try {
        _checkEndpointPermission(
          strictUser,
          [strictRole],
          "POST",
          "collections",
          ["collections", "posts"],
          ["pwd", "trusted_device"],
        );
        expect.unreachable("Should have thrown 403 MFA_REQUIRED");
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.status).toBe(403);
        expect(err.code).toBe("MFA_REQUIRED");
      }
    });

    it("allows strict role when session carries interactive MFA AMR", () => {
      const allowed = _checkEndpointPermission(
        strictUser,
        [strictRole],
        "GET",
        "collections",
        ["collections", "posts"],
        ["pwd", "mfa"],
      );
      expect(allowed).toBe(true);
    });

    it("exempts 2FA verification and logout endpoints from MFA check so user can authenticate or leave", () => {
      // 2FA verification endpoint
      const canVerify2fa = _checkEndpointPermission(
        strictUser,
        [strictRole],
        "POST",
        "auth",
        ["auth", "2fa"],
        ["pwd"],
      );
      expect(canVerify2fa).toBe(true);

      // Logout endpoint
      const canLogout = _checkEndpointPermission(
        strictUser,
        [strictRole],
        "POST",
        "auth",
        ["auth", "logout"],
        ["pwd"],
      );
      expect(canLogout).toBe(true);
    });

    it("enforces MFA on admin users when admin role specifies mfaRequired: true", () => {
      // Without MFA -> blocked with 403 MFA_REQUIRED (no admin bypass)
      expect(() => {
        _checkEndpointPermission(
          adminMfaUser,
          [adminMfaRole],
          "GET",
          "system",
          ["system", "settings"],
          ["pwd"],
        );
      }).toThrowError(AppError);

      try {
        _checkEndpointPermission(
          adminMfaUser,
          [adminMfaRole],
          "GET",
          "system",
          ["system", "settings"],
          ["pwd"],
        );
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe("MFA_REQUIRED");
      }

      // With MFA -> allowed via admin fast-path
      const allowed = _checkEndpointPermission(
        adminMfaUser,
        [adminMfaRole],
        "GET",
        "system",
        ["system", "settings"],
        ["pwd", "mfa"],
      );
      expect(allowed).toBe(true);
    });
  });
});
