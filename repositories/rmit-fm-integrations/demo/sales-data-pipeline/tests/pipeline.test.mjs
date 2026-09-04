import assert from "node:assert/strict";
import test from "node:test";
import { calculateGoldMetrics, determineSalesCategory, extractGoogleDriveFileId } from "../src/gold.mjs";
import {
  calculateSalesGold,
  loadDemoInputs,
  processSalesPipeline,
  runDemo,
  validateIntake
} from "../src/pipeline.mjs";

const fixedNow = new Date("2026-09-04T01:00:00.000Z");

test("Test 1 — happy path loads Bronze 10 / Silver 10 / Gold 10", async () => {
  const result = await runDemo({ now: fixedNow });

  assert.equal(result.reconciliation.bronzeCount, 10);
  assert.equal(result.reconciliation.silverValidCount, 10);
  assert.equal(result.reconciliation.silverErrorCount, 0);
  assert.equal(result.reconciliation.goldCount, 10);
  assert.equal(result.pipelineRun.status, "Completed");
  assert.equal(result.dataSource.status, "Completed");

  const so001 = result.gold.find((row) => row.orderId === "SO001");
  assert.equal(so001.grossSales, 2000);
  assert.equal(so001.discountAmount, 100);
  assert.equal(so001.netSales, 1900);
  assert.equal(so001.cost, 1400);
  assert.equal(so001.grossProfit, 500);
  assert.equal(so001.grossMarginPct, 0.263158);
  assert.equal(so001.salesCategory, "Medium");
});

test("Test 2 — invalid Google Drive URL rejects without Bronze", async () => {
  const inputs = await loadDemoInputs();
  const result = processSalesPipeline({
    ...inputs,
    fileUrl: "https://example.com/not-drive/file.csv",
    now: fixedNow
  });

  assert.equal(result.dataSource.status, "Rejected");
  assert.equal(result.bronze.length, 0);
  assert.equal(result.pipelineRun, null);
  assert.ok(result.pipelineErrors.some((error) => error.errorType === "INVALID_URL"));
  assert.match(result.dataSource.errorMessage, /Invalid Google Drive URL/);
});

test("Test 3 — wrong extension is rejected", () => {
  const intake = validateIntake({
    fileUrl: "https://drive.google.com/file/d/abc123/view",
    fileName: "Sales_2026_08.xlsx",
    fileSize: 100,
    content: "x"
  });

  assert.equal(intake.status, "Rejected");
  assert.ok(intake.errors.some((error) => error.errorType === "WRONG_EXTENSION"));
});

test("Test 4 — invalid quantity marks Silver Error and PipelineError", async () => {
  const result = await runDemo({ now: fixedNow, fileName: "Sales_2026_08_invalid_qty.csv" });

  assert.equal(result.reconciliation.bronzeCount, 1);
  assert.equal(result.silver[0].dataQualityStatus, "Error");
  assert.match(result.silver[0].dataQualityMessage, /Quantity/);
  assert.ok(result.pipelineErrors.some((error) => error.layer === "Silver"));
  assert.equal(result.gold.length, 0);
});

test("Test 5 — invalid discount marks Silver Error", async () => {
  const result = await runDemo({ now: fixedNow, fileName: "Sales_2026_08_invalid_discount.csv" });

  assert.equal(result.silver[0].dataQualityStatus, "Error");
  assert.match(result.silver[0].dataQualityMessage, /DiscountPct/);
});

test("Test 6 — duplicate OrderId is detected and does not create duplicate Gold", async () => {
  const result = await runDemo({ now: fixedNow, fileName: "Sales_2026_08_duplicate_order.csv" });

  assert.equal(result.bronze.length, 2);
  assert.equal(result.silver.filter((row) => row.dataQualityStatus === "Error").length, 1);
  assert.ok(result.silver.some((row) => /Duplicate OrderId/.test(row.dataQualityMessage ?? "")));
  assert.equal(result.gold.length, 1);
  assert.equal(result.gold[0].orderId, "SO201");
});

test("Test 7 — retry with existing keys does not duplicate Bronze/Gold business records", async () => {
  const first = await runDemo({ now: fixedNow });
  const bronzeKeys = new Set(first.bronze.map((row) => `${row.dataSourceId}|${row.rowNumber}`));
  const goldKeys = new Set(first.gold.map((row) => row.businessKey));

  const second = await runDemo({
    now: fixedNow,
    existingBronzeKeys: bronzeKeys,
    existingGoldKeys: goldKeys
  });

  assert.equal(second.bronze.length, 0);
  assert.equal(second.gold.length, 0);
});

test("Test 8 — zero NetSales yields GrossMarginPct 0 without throwing", async () => {
  const result = await runDemo({ now: fixedNow, fileName: "Sales_2026_08_zero_netsales.csv" });

  assert.equal(result.gold.length, 1);
  assert.equal(result.gold[0].netSales, 0);
  assert.equal(result.gold[0].grossMarginPct, 0);
  assert.equal(result.gold[0].salesCategory, "Low");
});

test("Gold metrics match plan example (Qty 2, Price 1000, Disc 5%, Cost 700)", () => {
  const metrics = calculateGoldMetrics({
    quantity: 2,
    unitPrice: 1000,
    discountPct: 0.05,
    costPerUnit: 700
  });

  assert.deepEqual(metrics, {
    grossSales: 2000,
    discountAmount: 100,
    netSales: 1900,
    cost: 1400,
    grossProfit: 500,
    grossMarginPct: 0.263158
  });
  assert.equal(determineSalesCategory(1900, { high: 2000, medium: 1000 }), "Medium");
  assert.equal(determineSalesCategory(2000, { high: 2000, medium: 1000 }), "High");
});

test("extractGoogleDriveFileId parses /file/d/<id>/view", () => {
  assert.equal(
    extractGoogleDriveFileId("https://drive.google.com/file/d/FILE123/view"),
    "FILE123"
  );
  assert.equal(extractGoogleDriveFileId("https://example.com/x"), null);
});

test("CalculateSalesGold upserts by SourceSystem + OrderId", async () => {
  const inputs = await loadDemoInputs();
  const first = processSalesPipeline({ ...inputs, now: fixedNow });
  const silver = first.silver[0];
  const again = calculateSalesGold({
    silverRecord: silver,
    dataSourceId: first.dataSource.dataSourceId,
    mappings: inputs.mappings,
    masterData: inputs.masterData,
    existingGoldKeys: new Set([`${inputs.mappings.sourceSystem}|${silver.orderId}`])
  });

  assert.equal(again.isUpdate, true);
  assert.equal(again.businessKey, `${inputs.mappings.sourceSystem}|${silver.orderId}`);
});
