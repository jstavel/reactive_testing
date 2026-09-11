// Print-only resolver for the corpus handoff links. Prints the canonical
// corpus path for `@last-run` / `@last-fail` and exits — it never `cd`s,
// opens an editor, or mutates the filesystem. The operator composes, e.g.
// `cd $(npm run --silent corpus:last-run)`. `CORPUS_DIR` overrides the corpus
// directory (default `corpus`, relative to the cwd).

import { LAST_FAIL, LAST_RUN, resolveFan } from "../orchestrator/handlinks.js";

const corpusDir = process.env.CORPUS_DIR ?? "corpus";
const [mode] = process.argv.slice(2);

if (mode !== "last-run" && mode !== "last-fail" && mode !== "list") {
  console.error("Usage: npm run corpus:last-run | npm run corpus:last-fail | npm run corpus:list");
  process.exit(1);
}

if (mode === "list") {
  const lastRun = resolveFan(corpusDir, LAST_RUN);
  const lastFail = resolveFan(corpusDir, LAST_FAIL);
  console.log(`${LAST_RUN}: ${lastRun ?? "absent"}`);
  console.log(`${LAST_FAIL}: ${lastFail ?? "absent"}`);
} else {
  const linkName = mode === "last-run" ? LAST_RUN : LAST_FAIL;
  const resolved = resolveFan(corpusDir, linkName);
  if (resolved === null) {
    console.error(
      `No ${linkName} handoff under ${corpusDir} — ` +
        (linkName === LAST_FAIL
          ? "the latest completed run passed (or no run has completed yet)."
          : "no smoke run has completed yet."),
    );
    process.exit(1);
  }
  console.log(resolved);
}
