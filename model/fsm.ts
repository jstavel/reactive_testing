// FSM model type declarations. Story 1.2 seeds the read-only critical-path data;
// this file declares only the shape the seed fills in.

/** Abstract guard predicate. The Orchestrator supplies the runtime context in Epic 2. */
export type FsmGuard = (context: unknown) => boolean;

/** A screen/dialog in a concrete condition, classified per state-granularity.md. */
export interface FsmState {
  /** Stable camelCase id matching the screen/dialog name (e.g. "orderBook"). */
  stateId: string;
  /** Human-readable label. */
  label: string;
  /** Id of the parent state for a nested dialog, if any. */
  parentStateId?: string;
}

/** A directed edge between two states, driven by a contract. */
export interface FsmTransition {
  /** Source state id. */
  from: string;
  /** Target state id. */
  to: string;
  /** Id of the contract that drives this transition. */
  contractId: string;
  /** Optional guard that must hold for the transition to be available. */
  guard?: FsmGuard;
}

/** The finite-state model: states, transitions, and the initial state. */
export interface FsmModel {
  states: FsmState[];
  transitions: FsmTransition[];
  /** Id of the initial state. */
  initialStateId: string;
}
