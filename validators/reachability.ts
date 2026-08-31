// Reachability blocking (Story 3.2, AD-18/NFR-5).
//
// A contract is blocked when no transition bearing it starts from a state
// reachable from the FSM initial state — i.e. it is exercisable if at least
// one of its transitions' `from` states is reachable. Pure BFS; a malformed
// model (empty states, or an initialStateId that nothing reaches) degrades to
// "everything blocked", the safe default.

import type { FsmModel } from "../model/fsm.js";

/** The contractIds that are blocked: none of their transitions starts from a
 * reachable state. */
export function blockedContractIds(model: FsmModel): string[] {
  const reachable = new Set<string>([model.initialStateId]);

  let frontier = [model.initialStateId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const from of frontier) {
      for (const transition of model.transitions) {
        if (transition.from === from && !reachable.has(transition.to)) {
          reachable.add(transition.to);
          next.push(transition.to);
        }
      }
    }
    frontier = next;
  }

  const contractIds = new Set(model.transitions.map((t) => t.contractId));
  const blocked: string[] = [];
  for (const id of contractIds) {
    const transitions = model.transitions.filter((t) => t.contractId === id);
    const exercisable = transitions.some((t) => reachable.has(t.from));
    if (!exercisable) blocked.push(id);
  }
  return blocked;
}
