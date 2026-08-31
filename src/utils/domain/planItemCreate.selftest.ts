/**
 * P2 PlanItem create validation self-check.
 * Run: npx tsx src/utils/domain/planItemCreate.selftest.ts
 */

import {
  PLAN_ITEM_CREATE_TYPES,
  buildPlanItem,
  createLocalPlanItemId,
  defaultUnitForPlanItemType,
  isCurrentlyMeasurablePlanItemType,
  isPlanItemTypeValue,
  resolvePlanItemCreateFormNumerics,
  validatePlanItemCreateInput,
} from "./planItemCreate";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const validBase = {
  projectId: "project-001",
  type: "length" as const,
  label: "North corridor conduit",
  plannedValue: 75,
  unit: "ft",
  unitCost: 8,
  productionRatePerDay: 30,
  laborHoursPerUnit: 0.2,
};

const valid = validatePlanItemCreateInput(validBase);
assert(valid.ok, "valid create accepted");
if (valid.ok) {
  assert(valid.value.label === "North corridor conduit", "label preserved");
  assert(valid.value.plannedValue === 75, "plannedValue preserved");
  assert(valid.value.unit === "ft", "unit preserved");
}

const emptyLabel = validatePlanItemCreateInput({
  ...validBase,
  label: "   ",
});
assert(!emptyLabel.ok, "empty label rejected");

const invalidPlanned = validatePlanItemCreateInput({
  ...validBase,
  plannedValue: 0,
});
assert(!invalidPlanned.ok, "plannedValue <= 0 rejected");

const invalidPlannedNaN = validatePlanItemCreateInput({
  ...validBase,
  plannedValue: Number.NaN,
});
assert(!invalidPlannedNaN.ok, "non-finite plannedValue rejected");

const invalidType = validatePlanItemCreateInput({
  ...validBase,
  // @ts-expect-error intentional invalid type
  type: "weight",
});
assert(!invalidType.ok, "invalid type rejected");

const emptyUnit = validatePlanItemCreateInput({
  ...validBase,
  unit: "",
});
assert(!emptyUnit.ok, "empty unit rejected");

const wrongUnit = validatePlanItemCreateInput({
  ...validBase,
  type: "area",
  unit: "ft",
});
assert(!wrongUnit.ok, "wrong unit for type rejected");

const negativeOptional = validatePlanItemCreateInput({
  ...validBase,
  unitCost: -1,
});
assert(!negativeOptional.ok, "negative unitCost rejected");

const negativeLabor = validatePlanItemCreateInput({
  ...validBase,
  laborHoursPerUnit: -0.1,
});
assert(!negativeLabor.ok, "negative laborHoursPerUnit rejected");

const nonPositiveRate = validatePlanItemCreateInput({
  ...validBase,
  productionRatePerDay: 0,
});
assert(!nonPositiveRate.ok, "non-positive productionRatePerDay rejected");

// Blank optional costs → 0 is allowed (zero means no configured impact).
const blankOptionalCosts = resolvePlanItemCreateFormNumerics({
  unitCostText: "",
  productionRateText: "30",
  laborHoursText: "",
});
assert(blankOptionalCosts.ok, "blank unitCost/labor resolved with required rate");
if (blankOptionalCosts.ok) {
  assert(blankOptionalCosts.unitCost === 0, "blank unitCost resolves to 0");
  assert(
    blankOptionalCosts.laborHoursPerUnit === 0,
    "blank laborHoursPerUnit resolves to 0",
  );
  assert(
    blankOptionalCosts.productionRatePerDay === 30,
    "explicit production rate preserved",
  );
}

// Blank production rate must NOT silently become 1 (not a pre-P2 domain invariant).
const blankProductionRate = resolvePlanItemCreateFormNumerics({
  unitCostText: "",
  productionRateText: "   ",
  laborHoursText: "",
});
assert(!blankProductionRate.ok, "blank production rate rejected");
assert(
  !("productionRatePerDay" in blankProductionRate),
  "blank production rate does not invent productionRatePerDay=1",
);

const emptyProductionRate = resolvePlanItemCreateFormNumerics({
  unitCostText: "0",
  productionRateText: "",
  laborHoursText: "0",
});
assert(!emptyProductionRate.ok, "empty production rate string rejected");
assert(
  !("productionRatePerDay" in emptyProductionRate),
  "empty production rate does not invent productionRatePerDay=1",
);

assert(isPlanItemTypeValue("length"), "length is valid type");
assert(!isPlanItemTypeValue("weight"), "weight is invalid type");
assert(PLAN_ITEM_CREATE_TYPES.length === 4, "four create types");

assert(defaultUnitForPlanItemType("length") === "ft", "length unit");
assert(defaultUnitForPlanItemType("area") === "sq ft", "area unit");
assert(defaultUnitForPlanItemType("count") === "ea", "count unit");
assert(defaultUnitForPlanItemType("volume") === "cu ft", "volume unit");

assert(
  isCurrentlyMeasurablePlanItemType("length", "ft"),
  "length/ft measurable",
);
assert(
  !isCurrentlyMeasurablePlanItemType("area", "sq ft"),
  "area not measurable yet",
);

const id = createLocalPlanItemId();
assert(id.startsWith("plan-"), "local id prefix");
assert(!id.includes("/"), "local id has no slash");

if (valid.ok) {
  const item = buildPlanItem(id, valid.value);
  assert(item.id === id, "built item id");
  assert(item.projectId === "project-001", "built item project");
  assert(item.type === "length", "built item type");
  assert(item.label === "North corridor conduit", "built item label");
}

console.log("planItemCreate.selftest: PASS");
