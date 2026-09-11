// Durable repo-hygiene pins (spec-repo-hygiene-biome-contributing, review
// loop): the license triangle and the CONTRIBUTING command table must stay in
// agreement with the tree. Pure fs reads — offline, no fixtures, no browser.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname ?? ".", "..");

const readRepoFile = (relativePath: string): string =>
  readFileSync(join(repoRoot, relativePath), "utf8");

const readJson = <T>(relativePath: string): T =>
  JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;

interface PkgJson {
  license?: string;
  scripts?: Record<string, string>;
}

const docsMarkdownFiles = (): string[] =>
  readdirSync(join(repoRoot, "docs"))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => join("docs", name));

describe("license pins (CAP-3)", () => {
  it("LICENSE, package.json, and README.md all agree on MIT", () => {
    const license = readRepoFile("LICENSE");
    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) 2026 Jan Stavel");

    const pkg = readJson<PkgJson>("package.json");
    expect(pkg.license).toBe("MIT");

    const readme = readRepoFile("README.md");
    expect(readme).toContain("License-MIT");
    expect(readme).toContain("MIT licensed");
  });

  it("no live UNLICENSED / 'does not yet carry a license' remnants remain", () => {
    // The user-facing surface only: README, CONTRIBUTING, and docs/. The
    // archival planning docs under _bmad-output/ are exempt by design — the
    // frozen story spec itself quotes the pre-fix state ("the badge claims
    // UNLICENSED") as the problem statement and acceptance wording.
    for (const relativePath of ["README.md", "CONTRIBUTING.md", ...docsMarkdownFiles()]) {
      const text = readRepoFile(relativePath);
      expect(text, relativePath).not.toContain("UNLICENSED");
      expect(text, relativePath).not.toContain("does not yet carry");
    }
  });
});

describe("CONTRIBUTING command pins (CAP-2)", () => {
  it("every `npm run <x>` documented in CONTRIBUTING.md exists in package.json", () => {
    const contributing = readRepoFile("CONTRIBUTING.md");
    const scripts = Object.keys(readJson<PkgJson>("package.json").scripts ?? {});
    const documented = [
      ...new Set([...contributing.matchAll(/\bnpm run ([a-z][a-z0-9:-]*)/g)].map((m) => m[1])),
    ];
    expect(documented.length).toBeGreaterThan(0);
    for (const name of documented) {
      expect(scripts, `CONTRIBUTING documents \`npm run ${name}\``).toContain(name);
    }
  });
});
