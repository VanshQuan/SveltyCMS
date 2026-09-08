/**
 * @file tests/unit/setup/sync-inlang-locales.test.ts
 * @description Writes locales into a temp inlang project without running CLI.
 */
import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncInlangSystemLocales } from "@src/routes/setup/sync-inlang-locales.server";

describe("syncInlangSystemLocales", () => {
  it("appends ISO locales to settings.json and clones en.json", async () => {
    const cwd = join(tmpdir(), `svelty-inlang-${Date.now()}`);
    await mkdir(join(cwd, "project.inlang"), { recursive: true });
    await mkdir(join(cwd, "src/messages"), { recursive: true });
    await writeFile(
      join(cwd, "project.inlang/settings.json"),
      JSON.stringify({
        baseLocale: "en",
        locales: ["en", "de"],
        sourceLanguageTag: "en",
        languageTags: ["en", "de"],
      }),
      "utf8",
    );
    await writeFile(
      join(cwd, "src/messages/en.json"),
      JSON.stringify({
        $schema: "https://inlang.com/schema/inlang-message-format",
        hello: "Hello",
      }),
      "utf8",
    );
    await writeFile(
      join(cwd, "src/messages/de.json"),
      JSON.stringify({
        $schema: "https://inlang.com/schema/inlang-message-format",
        hello: "Hallo",
      }),
      "utf8",
    );

    const result = await syncInlangSystemLocales(["en", "de", "ar"], {
      cwd,
      translate: false,
      compile: false,
    });

    expect(result.skipped).toBe(false);
    expect(result.added).toEqual(["ar"]);
    expect(result.locales).toEqual(["en", "de", "ar"]);

    const settings = JSON.parse(await readFile(join(cwd, "project.inlang/settings.json"), "utf8"));
    expect(settings.locales).toEqual(["en", "de", "ar"]);
    expect(settings.languageTags).toEqual(["en", "de", "ar"]);

    const ar = JSON.parse(await readFile(join(cwd, "src/messages/ar.json"), "utf8"));
    expect(ar.hello).toBe("Hello");
  });
});
