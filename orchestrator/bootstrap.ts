import type { FsmModel, FsmTransition } from "../model/fsm.js";
import type { RouteStep } from "../model/schemas.js";

export interface BootstrapPathInput {
  /** Current FSM state, or `null` when the page state is unknown (a previous
   * step failed after it may have changed the UI). */
  currentStateId: string | null;
  givenStateId: string;
  route?: RouteStep[];
}

export function resolveBootstrapPath(
  model: FsmModel,
  input: BootstrapPathInput,
): FsmTransition[] {
  const stateIds = new Set(model.states.map((state) => state.stateId));
  if (input.currentStateId === null) {
    throw new Error(
      `Bootstrap state is unknown after a previous failure; cannot navigate to "${input.givenStateId}".`,
    );
  }
  if (!stateIds.has(input.currentStateId)) {
    throw new Error(`unknown stateId "${input.currentStateId}" in bootstrap path.`);
  }
  if (!stateIds.has(input.givenStateId)) {
    throw new Error(`unknown stateId "${input.givenStateId}" in bootstrap path.`);
  }
  // A state with two transitions driven by the same contract is ambiguous for a
  // shortest-path search; reject it rather than silently picking one.
  const transitionKeys = model.transitions.map(
    (transition) => `${transition.from}\u0000${transition.contractId}`,
  );
  if (new Set(transitionKeys).size !== transitionKeys.length) {
    throw new Error(
      "Bootstrap model has duplicate (from, contractId) transition keys; routes would be ambiguous.",
    );
  }
  if (input.route) {
    return validateRoute(model, input.currentStateId, input.givenStateId, input.route);
  }
  if (input.currentStateId === input.givenStateId) {
    return [];
  }

  const queue: Array<{ stateId: string; path: FsmTransition[] }> = [
    { stateId: input.currentStateId, path: [] },
  ];
  const shortestPaths: FsmTransition[][] = [];
  let shortestLength: number | undefined;
  const visitedAtDepth = new Map<string, number>([[input.currentStateId, 0]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (shortestLength !== undefined && current.path.length > shortestLength) {
      break;
    }
    if (current.stateId === input.givenStateId) {
      shortestLength = current.path.length;
      shortestPaths.push(current.path);
      continue;
    }
    const transitions = model.transitions
      .filter((transition) => transition.from === current.stateId)
      .sort(
        (a, b) =>
          a.contractId.localeCompare(b.contractId) || a.to.localeCompare(b.to),
      );
    for (const transition of transitions) {
      const depth = current.path.length + 1;
      const previousDepth = visitedAtDepth.get(transition.to);
      if (previousDepth !== undefined && previousDepth < depth) {
        continue;
      }
      visitedAtDepth.set(transition.to, depth);
      queue.push({ stateId: transition.to, path: [...current.path, transition] });
    }
  }

  if (shortestPaths.length === 0) {
    throw new Error(
      `No bootstrap path from "${input.currentStateId}" to "${input.givenStateId}".`,
    );
  }
  if (shortestPaths.length > 1) {
    throw new Error(
      `Multiple shortest bootstrap paths from "${input.currentStateId}" to "${input.givenStateId}"; provide a route override.`,
    );
  }
  return shortestPaths[0]!;
}

function validateRoute(
  model: FsmModel,
  currentStateId: string,
  givenStateId: string,
  route: RouteStep[],
): FsmTransition[] {
  let stateId = currentStateId;
  const transitions: FsmTransition[] = [];
  for (const [index, step] of route.entries()) {
    if (step.stateId !== stateId) {
      throw new Error(
        `Bootstrap route step ${index} starts at "${step.stateId}" but current state is "${stateId}".`,
      );
    }
    const transition = model.transitions.find(
      (candidate) =>
        candidate.from === stateId && candidate.contractId === step.contractId,
    );
    if (!transition) {
      throw new Error(
        `Bootstrap route step ${index} is invalid from "${stateId}" via "${step.contractId}".`,
      );
    }
    transitions.push(transition);
    stateId = transition.to;
  }
  if (stateId !== givenStateId) {
    throw new Error(
      `Bootstrap route ends at "${stateId}" but required state is "${givenStateId}".`,
    );
  }
  return transitions;
}
