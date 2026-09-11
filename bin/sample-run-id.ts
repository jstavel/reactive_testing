// The committed sample fixture's fixed runId (spec-report-gherkin-corpus-links
// story 2) — a small shared constant so the generator (which owns the
// `example` subtrees) and the operator CLIs (which must never let the fixture
// win an implicit newest-run default over a real recorded run — its fixed
// future timestamp would otherwise always win) name it from one source.

/** The fixture's fixed runId — the committed sample run. */
export const SAMPLE_RUN_ID = "example";

/** The failure demo's reserved runId (spec-report-gherkin-corpus-links
 * story 3): the generator's `--fail` mode mints a throwaway red fixture +
 * report under this runId only — those subtrees stay gitignored, so no
 * failing evidence is ever committed. Like SAMPLE_RUN_ID it never wins an
 * implicit newest-run default over a real recorded run (and, being a red
 * run, never defaults implicitly at all); an explicit `fail-demo`
 * positional still resolves. */
export const FAIL_DEMO_RUN_ID = "fail-demo";
