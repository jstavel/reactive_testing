// The committed sample fixture's fixed runId (spec-report-gherkin-corpus-links
// story 2) — a small shared constant so the generator (which owns the
// `example` subtrees) and the operator CLIs (which must never let the fixture
// win an implicit newest-run default over a real recorded run — its fixed
// future timestamp would otherwise always win) name it from one source.

/** The fixture's fixed runId — the committed sample run. */
export const SAMPLE_RUN_ID = "example";
