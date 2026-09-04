import assert from "node:assert/strict";
import test from "node:test";
import { loadDemoInputs, processFiles, runDemo } from "../src/pipeline.mjs";

const fixedNow = new Date("2026-09-03T06:00:00.000Z");

test("lands every unique source row in Bronze and reconciles duplicates", async () => {
  const result = await runDemo({ now: fixedNow });

  assert.equal(result.run.fileCount, 6);
  assert.equal(result.run.totalInputRows, 21);
  assert.equal(result.run.totalBronzeRows, 19);
  assert.equal(result.run.duplicateRows, 2);
  assert.equal(result.bronze.utilityReadingRaw.length, 17);
  assert.equal(result.bronze.utilityTariffRaw.length, 2);
  assert.match(result.reconciliation.balanceNote, /Bronze unique \+ duplicate/);
});

test("preserves invalid raw fields before Silver quarantine", async () => {
  const result = await runDemo({ now: fixedNow });
  const invalidUnit = result.bronze.utilityReadingRaw.find((row) => row.sourceFields.sourceUnit === "kW");
  const invalidTimestamp = result.bronze.utilityReadingRaw.find((row) => row.sourceFields.sourceTimestamp === "not-a-timestamp");

  assert.ok(invalidUnit, "invalid unit row must remain in Bronze");
  assert.ok(invalidTimestamp, "invalid timestamp row must remain in Bronze");
  assert.ok(result.silver.quarantine.some((row) => row.recordHash === invalidUnit.recordHash && row.ruleCode === "INVALID_UNIT"));
  assert.ok(result.silver.quarantine.some((row) => row.recordHash === invalidTimestamp.recordHash && row.ruleCode === "INVALID_TIMESTAMP"));
});

test("resolves meter, building and campus relationships in Silver", async () => {
  const result = await runDemo({ now: fixedNow });
  const electricity = result.silver.utilityReadings.find((row) => row.meterCode === "EL-AB2-MAIN");
  const manualWater = result.silver.utilityReadings.find((row) => row.meterCode === "WA-D1-MANUAL-01");

  assert.deepEqual(
    { meter: electricity.meterId, building: electricity.buildingCode, campus: electricity.campusCode },
    { meter: "METER-EL-AB2-01", building: "AB2", campus: "SGS" }
  );
  assert.equal(manualWater.source, "manual");
  assert.equal(manualWater.buildingCode, "D1");
});

test("excludes rejected and suspect readings from illustrative Gold cost", async () => {
  const result = await runDemo({ now: fixedNow });

  assert.equal(result.summary.totalElectricityKwh, 54);
  assert.equal(result.summary.totalWaterM3, 3);
  assert.equal(result.summary.totalCostVnd, 169200);
  assert.equal(result.summary.openDataQualityIssues, 7);
  assert.equal(result.summary.costFormulaStatus, "MOCK_NOT_APPROVED");
  assert.ok(result.gold.dailyUtilityCosts.every((row) => row.formulaStatus === "MOCK_NOT_APPROVED"));
  assert.deepEqual(
    [...new Set(result.dataQualityIssues.map((issue) => issue.ruleCode))].sort(),
    ["DUPLICATE_SOURCE_RECORD", "INVALID_TIMESTAMP", "INVALID_UNIT", "MISSING_INTERVAL", "NEGATIVE_DELTA"].sort()
  );
});

test("does not reprocess a file whose content hash already landed", async () => {
  const inputs = await loadDemoInputs();
  const repeated = processFiles({
    ...inputs,
    files: [...inputs.files, { ...inputs.files[0], name: `COPY_${inputs.files[0].name}` }],
    now: fixedNow
  });

  assert.equal(repeated.run.totalBronzeRows, 19);
  assert.ok(repeated.files.some((file) => file.status === "DUPLICATE_FILE"));
  assert.ok(repeated.dataQualityIssues.some((issue) => issue.ruleCode === "DUPLICATE_FILE"));
});

test("rejects an unmapped file without creating Bronze rows", async () => {
  const inputs = await loadDemoInputs();
  const result = processFiles({
    ...inputs,
    files: [{ name: "UNKNOWN_SOURCE.csv", content: "a,b\n1,2\n" }],
    now: fixedNow
  });

  assert.equal(result.run.totalBronzeRows, 0);
  assert.equal(result.files[0].status, "REJECTED");
  assert.equal(result.dataQualityIssues[0].ruleCode, "MAPPING_NOT_FOUND");
});
