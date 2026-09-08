import type { TestPlan } from "../model/schemas.js";

export class UnknownScenarioIdError extends Error {
  readonly unknownIds: readonly string[];
  readonly validIds: readonly string[];

  constructor(unknownIds: readonly string[], validIds: readonly string[]) {
    super(
      `Unknown scenario id(s): ${unknownIds.join(", ")}. ` +
        `Valid scenario ids: ${validIds.join(", ")}`,
    );
    this.name = "UnknownScenarioIdError";
    this.unknownIds = unknownIds;
    this.validIds = validIds;
  }
}

export function selectScenarios(plan: TestPlan, selectedIds: readonly string[]): TestPlan {
  if (selectedIds.length === 0) return plan;

  const validIds = plan.scenarios.map(({ id }) => id);
  const validIdSet = new Set(validIds);
  const unknownIds = [...new Set(selectedIds.filter((id) => !validIdSet.has(id)))];

  if (unknownIds.length > 0) {
    throw new UnknownScenarioIdError(unknownIds, validIds);
  }

  const selectedIdSet = new Set(selectedIds);
  return {
    ...plan,
    scenarios: plan.scenarios.filter(({ id }) => selectedIdSet.has(id)),
  };
}
