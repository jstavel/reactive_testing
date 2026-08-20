// Dialog-contract type declaration. Story 1.2 seeds the read-only critical-path
// contracts; this file declares only the shape the seed fills in. No Playwright
// dependency — the action is an abstract signature the Orchestrator supplies in Epic 2.

/** Abstract action signature. The Orchestrator supplies the concrete implementation (via Playwright) in Epic 2. */
export type ContractAction = (context: unknown) => Promise<void>;

/** A dialog/screen's behavioral declaration: preconditions, action, postconditions, invariants. */
export interface DialogContract {
  /** Stable camelCase verb-phrase id (e.g. "filterByType"). */
  contractId: string;
  /** Conditions that must hold before the action may run. */
  preconditions: string[];
  /** The action the contract describes; the concrete implementation is supplied by the Orchestrator. */
  action: ContractAction;
  /** Conditions that must hold after the action succeeds. */
  postconditions: string[];
  /** Conditions that must hold at all times within the contract's scope. */
  invariants: string[];
}
