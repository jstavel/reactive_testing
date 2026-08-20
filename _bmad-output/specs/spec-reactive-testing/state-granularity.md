# State Granularity — decision rules for discover-and-record

Rules for classifying what an agent observes in the live app, harvested from the discovered domain (see adopted companion `constitution.md`). CAP-1's discover-and-record applies these to judge whether a new observation is a state, a contract, a parameter, or ignorable.

## Core rule

- URL change → new state.
- URL unchanged → parameter (a data value within a state).

## Is it a state?

| Observation                                                                  | Classification | Why                                              |
|------------------------------------------------------------------------------|----------------|--------------------------------------------------|
| URL change or main content panel changes to another screen                   | STATE          | A different view                                 |
| Modal dialog that blocks the main page, with its own contracts (Close, Copy) | STATE (nested) | Hierarchical, avoids state product-combinatorics |
| Action within a screen (filter, row click, pagination)                       | CONTRACT       | Changes data, not location                       |
| Data value within a state (selected type, page number)                       | PARAMETER      | Not a location                                   |
| Tooltip, hover menu, focus                                                   | IGNORE         | No test value                                    |

## The four concepts — never conflate

- STATE = where you are (screen/view) → few (~12)
- CONTRACT = what you can do (action) → more (~30)
- SCENARIO = a path through states via contracts → many (~20+)
- PARAMETER = data within a state (filter, page) → many

A scenario is not a state: one state hosts many scenarios. A scenario is a sequence of contracts, not a new screen.

## Granularity example (from the discovered Kraken Pro corpus)

```
STAV/state: History/Main/Ledger (one state)
  ├─ scenario: filter Withdrawal   (contract: filter-by-type)
  ├─ scenario: filter + pagination (contracts: filter-by-type → paginate)
  └─ scenario: clear filters       (contract: clear-filters)

→ 20 scenarios, but only 2–3 states. States are scarce; scenarios are abundant.
```

## Dialog = nested state

A modal dialog that blocks the main page is a nested state — never a sibling in the state product. This avoids combinatorial explosion: states are a hierarchy, not a product of (main × dialog).
