/**
 * @file src/routes/setup/constants.ts
 * @description Constants used across the setup wizard and initialization process.
 *
 * ⚠️ DO NOT IMPORT THIS FILE
 * This file exists only for documentation. The actual values are:
 * - Read from project.inlang/settings.json by seed.ts at build/startup time
 * - Seeded into the database
 * - Accessed via publicEnv.LOCALES at runtime
 *
 * To add a new system language:
 * 1. Add the ISO 639-1 code in Setup (or System Settings → LOCALES) — EN/DE ship by default
 * 2. Setup writes project.inlang/settings.json and runs `bun translate` + `bun run paraglide`
 *    Manual path: edit project.inlang/settings.json, then `bun translate` and `bun run paraglide`
 * 3. Review/PR src/messages/{locale}.json (Fink / GitHub community translations)
 * 4. Restart or let Vite HMR pick up the compiled Paraglide catalogs
 */

/**
 * Fallback system/interface languages (DOCUMENTATION ONLY - see seed.ts)
 * Actual source: project.inlang/settings.json → seed.ts → database → publicEnv.LOCALES
 */
export const DEFAULT_SYSTEM_LANGUAGES = ["en", "de"] as const;

/**
 * Fallback base locale (DOCUMENTATION ONLY - see seed.ts)
 * Actual source: project.inlang/settings.json → seed.ts → database → publicEnv.BASE_LOCALE
 */
export const DEFAULT_BASE_LOCALE = "en" as const;

/**
 * Fallback content languages (DOCUMENTATION ONLY - see seed.ts)
 * Actual source: project.inlang/settings.json → seed.ts → database
 */
export const DEFAULT_CONTENT_LANGUAGES = ["en", "de"] as const;

/**
 * Fallback content language (DOCUMENTATION ONLY - see seed.ts)
 * Actual source: project.inlang/settings.json → seed.ts → database
 */
export const DEFAULT_CONTENT_LANGUAGE = "en" as const;
