# Troubleshooting

Common errors you may hit when recording, verifying, or developing with this
testware, and how to fix them.

## Recording (`npm run run:smoke`)

### CDP connection refused

```
Error: connect ECONNREFUSED 127.0.0.1:9222
```

**Cause:** the orchestrator cannot reach the Chromium debugging endpoint. You
forgot to start Chromium with a debugging port, or started it on a different
port.

**Fix:**

```bash
# Start Chromium with remote debugging on port 9222:
chromium --remote-debugging-port=9222 --user-data-dir=/tmp/kraken-profile

# Verify the endpoint is listening:
curl http://127.0.0.1:9222/json/version
# → returns JSON with "Browser" and "webSocketDebuggerUrl"
```

If port 9222 is already in use (another Chrome instance), either kill it or
start on a different port and update `bin/run-smoke.ts`.

### Playwright browsers not installed

```
Error: browserType.connectOverCDP: Looks like Playwright Test or Playwright was just installed...
```

**Cause:** you ran `npm ci` but did not install Playwright browsers.

**Fix:**

```bash
npx playwright install chromium
```

### Multiple browser windows or tabs open

```
Error: Expected exactly one browser context on CDP endpoint, found 2
```

**Cause:** the orchestrator attaches to your browser and expects exactly one
authenticated context. More than one window or incognito window confuses it.

**Fix:** close all but one browser window. Keep only the window where you are
logged in to https://pro.kraken.com.

### Scenarios time out (especially late ones)

```
[FAIL] clicking-earn-navigates-to-the-standalone-earn-page … Step timed out after 10000ms
[FAIL] clicking-opening-portfolio-summary-dialog … Step timed out after 10000ms
```

This is a known intermittent issue — see the
[Roadmap](../README.md#now--ready-to-pick-up). The earn action occasionally
fails; because the orchestrator runs all scenarios on a shared page, a late
failure leaves the page off-home and the dialog scenarios that follow cascade
and time out too.

**Workaround:** run the failing scenario in isolation (set the plan to a single
scenario) or re-run `npm run run:smoke`.

### All scenarios fail

```
Run complete: 0/10 scenarios passed
```

If **every** scenario fails immediately without visible action, the model
version is probably stale:

```
Error: Model-version mismatch: plan expects <hash>, model is <hash>
```

**Cause:** you edited a model file (`model/fsm.ts`, `model/contracts.ts`, or
`model/schemas.ts`) but did not regenerate the smoke plan.

**Fix:** run the authoring workflow — a BMad agent re-derives the smoke plan
from the `@plan:smoke` tags. See [authoring-example.md](authoring-example.md).

The model-version guard test also catches this in CI:

```bash
npx vitest run model/model-version.test.ts
```

## Verification (offline validators)

### "missing snapshot evidence"

```
Step 0: missing snapshot evidence for contract <id>
```

**Cause:** the corpus was recorded with an older version of the orchestrator
that did not write per-step pre-snapshots (`{i}.pre.json`). The offline loader
expects both `pre` and `post` snapshots.

**Fix:** record a fresh corpus with the current orchestrator:

```bash
npm run run:smoke
```

Then re-run verification against the new run.

### "not yet evaluatable"

```
contract "<id>" (dialog-open/dialog-closed): not yet evaluatable
```

**Cause:** the dialog predicates `dialog-open` and `dialog-closed` are declared
in the model but no evaluator exists yet. This is **expected behaviour** — see
the [Roadmap](../README.md#short-term).

**Fix:** none needed. The check is honest: it fails with a clear message
instead of silently passing.

### cross-view invariant reports "missing evidence"

```
[current-portfolio-value-agrees-across-surfaces] FAIL — <surface>: missing probe result for "portfolio-value"
```

**Cause:** the `portfolio-value` probe is not wired into any runner's probe
config. The cross-view mechanism works, but no runner records the probe it
reads.

**Fix:** not yet available — tracked as a ready-to-pick-up Roadmap item.

## Development

### Type check fails after model edit

```bash
npm run typecheck   # → tsc --noEmit errors
```

**Cause:** you changed a Zod schema or an interface in `model/` and the
consumers (collectors, validators, orchestrator) have not been updated to match.

**Fix:** follow the compiler errors — each one points at exactly the file and
line that needs updating. Types are the contract.

### Model-version test fails in CI

```bash
npm test
# → FAIL model/model-version.test.ts
```

**Cause:** `model/smoke.test-plan.ts` embeds a SHA-256 hash of the three model
files. Editing any of those files changes the hash; the plan is stale until
regenerated.

**Fix:** regenerate the plan (AI-assisted authoring step — see
[authoring-example.md](authoring-example.md)), commit the updated plan along
with the model edit.

## Still stuck?

Open an issue on the repository with:

- The **exact command** you ran
- The **full error output**
- The output of `npm run typecheck` (if applicable)
- Whether you have a `corpus/` directory and what runs it contains
  (`ls corpus/`)
