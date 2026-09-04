import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateAmounts,
  calculateGoldMetrics,
  determineSalesCategory,
  extractGoogleDriveFileId,
  parseDateDdMmYyyy,
  parsePercent,
  round
} from "./gold.mjs";

const DEMO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) {
    throw new Error("CSV contains an unterminated quoted value");
  }

  cells.push(cell.trim());
  return cells;
}

function parseCsv(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) {
    throw new Error("CSV must contain a header and at least one data row");
  }

  const headers = readCsvLine(lines[0]);
  const rows = lines.slice(1).map((line, index) => {
    const cells = readCsvLine(line);
    if (cells.length !== headers.length) {
      throw new Error(`CSV row ${index + 2} has ${cells.length} columns; expected ${headers.length}`);
    }
    return Object.fromEntries(headers.map((header, columnIndex) => [header, cells[columnIndex]]));
  });

  return { headers, rows };
}

function createError({ runId, dataSourceId, layer, recordId, errorType, errorMessage, rawValue }) {
  return {
    errorId: `ERR-${hash(`${runId}|${layer}|${recordId}|${errorType}|${errorMessage}`).slice(0, 12)}`,
    runId,
    dataSourceId,
    layer,
    recordId: recordId ?? null,
    errorType,
    errorMessage,
    rawValue: rawValue ?? null,
    createdOn: new Date().toISOString()
  };
}

function resolveCustomer(code, masterData) {
  return masterData.customers.find((row) => row.customerCode === code && row.isActive) ?? null;
}

function resolveProduct(code, masterData) {
  return masterData.products.find((row) => row.productCode === code && row.isActive) ?? null;
}

/**
 * Validate Google Drive URL and file metadata (plan §5 Steps 1–3).
 */
export function validateIntake({ fileUrl, fileName, fileSize, content }) {
  const errors = [];

  if (!fileUrl || !String(fileUrl).includes("drive.google.com")) {
    errors.push({
      errorType: "INVALID_URL",
      errorMessage: "Invalid Google Drive URL",
      layer: "Intake"
    });
    return {
      status: "Rejected",
      googleDriveFileId: null,
      errors
    };
  }

  const googleDriveFileId = extractGoogleDriveFileId(fileUrl);
  if (!googleDriveFileId) {
    errors.push({
      errorType: "INVALID_FILE_ID",
      errorMessage: "Could not extract Google Drive file ID from URL",
      layer: "Intake"
    });
    return { status: "Rejected", googleDriveFileId: null, errors };
  }

  const extension = path.extname(fileName).toLowerCase();
  if (extension !== ".csv") {
    errors.push({
      errorType: "WRONG_EXTENSION",
      errorMessage: `Extension ${extension || "<none>"} is not .csv`,
      layer: "Intake"
    });
  }

  if (!/^Sales_/i.test(fileName)) {
    errors.push({
      errorType: "INVALID_FILENAME",
      errorMessage: "File name must start with Sales_",
      layer: "Intake"
    });
  }

  if (fileSize > 1048576) {
    errors.push({
      errorType: "FILE_TOO_LARGE",
      errorMessage: `File size ${fileSize} exceeds configured maximum`,
      layer: "Intake"
    });
  }

  if (!content || String(content).trim() === "") {
    errors.push({
      errorType: "EMPTY_FILE",
      errorMessage: "File is empty",
      layer: "Intake"
    });
  }

  if (errors.length > 0) {
    return { status: "Rejected", googleDriveFileId, errors };
  }

  return { status: "Validated", googleDriveFileId, errors: [] };
}

function loadBronzeRows({ dataSourceId, rows, fields, existingKeys }) {
  const bronze = [];
  const errors = [];
  const keys = new Set(existingKeys ?? []);

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1;
    const orderId = String(row[fields.orderId] ?? "").trim();
    // Bronze idempotency key: DataSourceId + RowNumber (plan §12)
    const alternateKey = `${dataSourceId}|${rowNumber}`;

    if (keys.has(alternateKey)) {
      continue;
    }
    keys.add(alternateKey);

    bronze.push({
      salesBronzeId: `BR-${hash(`${dataSourceId}|${rowNumber}|${orderId}`).slice(0, 12)}`,
      dataSourceId,
      rowNumber,
      orderId: orderId || null,
      orderDateRaw: row[fields.orderDate] ?? null,
      customerCodeRaw: row[fields.customerCode] ?? null,
      customerRaw: row[fields.customerName] ?? null,
      productCodeRaw: row[fields.productCode] ?? null,
      productRaw: row[fields.productName] ?? null,
      qtyRaw: row[fields.quantity] ?? null,
      unitPriceRaw: row[fields.unitPrice] ?? null,
      discountRaw: row[fields.discount] ?? null,
      currencyRaw: row[fields.currency] ?? null,
      rawJson: JSON.stringify(row),
      loadStatus: "Loaded",
      loadError: null,
      createdOn: new Date().toISOString()
    });
  }

  return { bronze, errors, keys };
}

function transformToSilver({ bronze, dataSourceId, runId, mappings, masterData }) {
  const silver = [];
  const errors = [];
  const seenOrderIds = new Map();
  const supportedCurrencies = new Set(mappings.supportedCurrencies);

  for (const raw of bronze) {
    const messages = [];
    const orderId = String(raw.orderId ?? "").trim();
    const orderDate = parseDateDdMmYyyy(raw.orderDateRaw);
    const customerCode = String(raw.customerCodeRaw ?? "").trim();
    const customerName = String(raw.customerRaw ?? "").trim();
    const productCode = String(raw.productCodeRaw ?? "").trim();
    const productName = String(raw.productRaw ?? "").trim();
    const quantity = Number(String(raw.qtyRaw ?? "").trim());
    const unitPrice = Number(String(raw.unitPriceRaw ?? "").trim());
    const discountPct = parsePercent(raw.discountRaw);
    const currency = String(raw.currencyRaw ?? "").trim().toUpperCase();

    if (!orderId) {
      messages.push("OrderId is required");
    }
    if (!orderDate) {
      messages.push("OrderDate is invalid; expected DD/MM/YYYY");
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      messages.push("Quantity must be greater than 0");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      messages.push("UnitPrice must be >= 0");
    }
    if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 1) {
      messages.push("DiscountPct must be between 0 and 1");
    }
    if (!supportedCurrencies.has(currency)) {
      messages.push(`Currency ${currency || "<blank>"} is not supported`);
    }

    const customer = resolveCustomer(customerCode, masterData);
    const product = resolveProduct(productCode, masterData);
    if (!customer) {
      messages.push(`CustomerCode ${customerCode || "<blank>"} could not be resolved`);
    }
    if (!product) {
      messages.push(`ProductCode ${productCode || "<blank>"} could not be resolved`);
    }

    if (orderId) {
      if (seenOrderIds.has(orderId)) {
        messages.push(`Duplicate OrderId ${orderId} within source`);
      } else {
        seenOrderIds.set(orderId, raw.rowNumber);
      }
    }

    const amounts = Number.isFinite(quantity) && Number.isFinite(unitPrice) && Number.isFinite(discountPct)
      ? calculateAmounts(quantity, unitPrice, discountPct)
      : { grossAmount: null, discountAmount: null, netAmount: null };

    const dataQualityStatus = messages.length > 0 ? "Error" : "Valid";
    const silverRow = {
      salesSilverId: `SL-${hash(`${dataSourceId}|${orderId}|${raw.rowNumber}`).slice(0, 12)}`,
      dataSourceId,
      orderId: orderId || null,
      orderDate,
      customerCode: (customer?.customerCode ?? customerCode) || null,
      customerName: (customer?.customerName ?? customerName) || null,
      productCode: (product?.productCode ?? productCode) || null,
      productName: (product?.productName ?? productName) || null,
      quantity: Number.isFinite(quantity) ? quantity : null,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
      discountPct: Number.isFinite(discountPct) ? round(discountPct, 6) : null,
      currency: currency || null,
      grossAmount: amounts.grossAmount,
      discountAmount: amounts.discountAmount,
      netAmount: amounts.netAmount,
      dataQualityStatus,
      dataQualityMessage: messages.length > 0 ? messages.join("; ") : null,
      createdOn: new Date().toISOString(),
      _costPerUnit: product?.costPerUnit ?? null
    };

    silver.push(silverRow);

    if (dataQualityStatus === "Error") {
      errors.push(createError({
        runId,
        dataSourceId,
        layer: "Silver",
        recordId: orderId || `ROW-${raw.rowNumber}`,
        errorType: "DATA_QUALITY",
        errorMessage: silverRow.dataQualityMessage,
        rawValue: raw.rawJson
      }));
    }
  }

  return { silver, errors };
}

/**
 * Custom API CalculateSalesGold — plan §8–10.
 */
export function calculateSalesGold({ silverRecord, dataSourceId, mappings, masterData, existingGoldKeys }) {
  if (!silverRecord) {
    throw new Error("SilverRecordId not found");
  }

  if (silverRecord.dataQualityStatus !== "Valid") {
    throw new Error(`Silver record ${silverRecord.salesSilverId} is not Valid`);
  }

  const product = resolveProduct(silverRecord.productCode, masterData);
  if (!product) {
    throw new Error(`Product ${silverRecord.productCode} could not be resolved for cost`);
  }

  const metrics = calculateGoldMetrics({
    quantity: silverRecord.quantity,
    unitPrice: silverRecord.unitPrice,
    discountPct: silverRecord.discountPct,
    costPerUnit: product.costPerUnit
  });

  const orderDate = silverRecord.orderDate;
  const year = Number(orderDate.slice(0, 4));
  const month = Number(orderDate.slice(5, 7));
  const businessKey = `${mappings.sourceSystem}|${silverRecord.orderId}`;

  const gold = {
    salesGoldId: `GD-${hash(businessKey).slice(0, 12)}`,
    dataSourceId,
    orderId: silverRecord.orderId,
    orderDate,
    year,
    month,
    customerCode: silverRecord.customerCode,
    customerName: silverRecord.customerName,
    productCode: silverRecord.productCode,
    productName: silverRecord.productName,
    currency: silverRecord.currency,
    grossSales: metrics.grossSales,
    discountAmount: metrics.discountAmount,
    netSales: metrics.netSales,
    cost: metrics.cost,
    grossProfit: metrics.grossProfit,
    grossMarginPct: metrics.grossMarginPct,
    salesCategory: determineSalesCategory(metrics.netSales, mappings.salesCategoryThresholds),
    reportStatus: "Ready",
    createdOn: new Date().toISOString(),
    processedOn: new Date().toISOString(),
    businessKey
  };

  const isUpdate = existingGoldKeys?.has(businessKey) ?? false;
  return { gold, isUpdate, businessKey };
}

export function processSalesPipeline({
  fileUrl,
  fileName,
  content,
  mappings,
  masterData,
  now = new Date(),
  existingBronzeKeys = new Set(),
  existingGoldKeys = new Set()
}) {
  const pipelineErrors = [];
  const fileSize = Buffer.byteLength(content ?? "", "utf8");
  const dataSourceId = `DS-${hash(`${fileName}|${hash(content ?? "")}`).slice(0, 12)}`;

  const dataSource = {
    dataSourceId,
    fileName,
    fileUrl,
    googleDriveFileId: null,
    folderPath: "/mock/google-drive-inbox",
    fileType: path.extname(fileName).toLowerCase().replace(".", "") || null,
    fileSize,
    lastModified: now.toISOString(),
    fileHash: hash(content ?? ""),
    status: "New",
    errorMessage: null,
    createdOn: now.toISOString(),
    processedOn: null
  };

  const intake = validateIntake({ fileUrl, fileName, fileSize, content });
  dataSource.googleDriveFileId = intake.googleDriveFileId;

  if (intake.status === "Rejected") {
    dataSource.status = "Rejected";
    dataSource.errorMessage = intake.errors.map((error) => error.errorMessage).join("; ");
    for (const error of intake.errors) {
      pipelineErrors.push(createError({
        runId: null,
        dataSourceId,
        layer: error.layer,
        recordId: fileName,
        errorType: error.errorType,
        errorMessage: error.errorMessage,
        rawValue: fileUrl
      }));
    }

    return {
      dataSource,
      pipelineRun: null,
      bronze: [],
      silver: [],
      gold: [],
      pipelineErrors,
      dataMappings: mappings.dataMappings.filter((row) => row.isActive),
      reconciliation: {
        bronzeCount: 0,
        silverValidCount: 0,
        silverErrorCount: 0,
        goldCount: 0
      }
    };
  }

  dataSource.status = "Validated";

  const runId = `RUN-${hash(`${dataSourceId}|${now.toISOString()}`).slice(0, 12)}`;
  const pipelineRun = {
    runId,
    dataSourceId,
    pipelineName: mappings.pipelineName,
    startTime: now.toISOString(),
    endTime: null,
    bronzeCount: 0,
    silverCount: 0,
    goldCount: 0,
    successCount: 0,
    errorCount: 0,
    status: "Running",
    errorMessage: null
  };

  let parsed;
  try {
    parsed = parseCsv(content);
    const required = Object.values(mappings.fields);
    const missing = required.filter((header) => !parsed.headers.includes(header));
    if (missing.length > 0) {
      throw new Error(`Missing required columns: ${missing.join(", ")}`);
    }
  } catch (error) {
    dataSource.status = "Failed";
    dataSource.errorMessage = error.message;
    pipelineRun.status = "Failed";
    pipelineRun.endTime = now.toISOString();
    pipelineRun.errorMessage = error.message;
    pipelineErrors.push(createError({
      runId,
      dataSourceId,
      layer: "Bronze",
      recordId: fileName,
      errorType: "PARSE_ERROR",
      errorMessage: error.message,
      rawValue: null
    }));

    return {
      dataSource,
      pipelineRun,
      bronze: [],
      silver: [],
      gold: [],
      pipelineErrors,
      dataMappings: mappings.dataMappings.filter((row) => row.isActive),
      reconciliation: {
        bronzeCount: 0,
        silverValidCount: 0,
        silverErrorCount: 0,
        goldCount: 0
      }
    };
  }

  const { bronze } = loadBronzeRows({
    dataSourceId,
    rows: parsed.rows,
    fields: mappings.fields,
    existingKeys: existingBronzeKeys
  });

  dataSource.status = "Loaded";
  dataSource.processedOn = now.toISOString();
  pipelineRun.bronzeCount = bronze.length;

  const { silver, errors: silverErrors } = transformToSilver({
    bronze,
    dataSourceId,
    runId,
    mappings,
    masterData
  });
  pipelineErrors.push(...silverErrors);
  pipelineRun.silverCount = silver.length;

  const gold = [];
  const goldKeys = new Set(existingGoldKeys);
  let successCount = 0;
  let goldErrorCount = 0;

  for (const silverRecord of silver.filter((row) => row.dataQualityStatus === "Valid")) {
    try {
      const result = calculateSalesGold({
        silverRecord,
        dataSourceId,
        mappings,
        masterData,
        existingGoldKeys: goldKeys
      });
      gold.push(result.gold);
      goldKeys.add(result.businessKey);
      successCount += 1;
    } catch (error) {
      goldErrorCount += 1;
      pipelineErrors.push(createError({
        runId,
        dataSourceId,
        layer: "Gold",
        recordId: silverRecord.orderId,
        errorType: "GOLD_CALCULATION",
        errorMessage: error.message,
        rawValue: JSON.stringify(silverRecord)
      }));
    }
  }

  const silverErrorCount = silver.filter((row) => row.dataQualityStatus === "Error").length;
  pipelineRun.goldCount = gold.length;
  pipelineRun.successCount = successCount;
  pipelineRun.errorCount = silverErrorCount + goldErrorCount;
  pipelineRun.endTime = now.toISOString();
  pipelineRun.status = pipelineRun.errorCount > 0 ? "CompletedWithErrors" : "Completed";

  if (pipelineRun.errorCount > 0 && gold.length === 0 && silverErrorCount === silver.length) {
    dataSource.status = "Failed";
    dataSource.errorMessage = "All Silver rows failed data quality checks";
  } else {
    dataSource.status = "Completed";
  }

  return {
    dataSource,
    pipelineRun,
    bronze,
    silver,
    gold,
    pipelineErrors,
    dataMappings: mappings.dataMappings.filter((row) => row.isActive),
    reconciliation: {
      bronzeCount: bronze.length,
      silverValidCount: silver.length - silverErrorCount,
      silverErrorCount,
      goldCount: gold.length
    }
  };
}

export async function loadDemoInputs(root = DEMO_ROOT, fileName = "Sales_2026_08.csv") {
  const [mappingText, masterText, content] = await Promise.all([
    readFile(path.join(root, "config", "mappings.json"), "utf8"),
    readFile(path.join(root, "config", "master-data.json"), "utf8"),
    readFile(path.join(root, "mock-data", "google-drive-inbox", fileName), "utf8")
  ]);

  return {
    fileUrl: `https://drive.google.com/file/d/demo-${fileName.replace(/\W+/g, "-")}/view`,
    fileName,
    content,
    mappings: JSON.parse(mappingText),
    masterData: JSON.parse(masterText)
  };
}

export async function listInboxFiles(root = DEMO_ROOT) {
  const names = await readdir(path.join(root, "mock-data", "google-drive-inbox"));
  return names.filter((name) => name.endsWith(".csv")).sort();
}

export async function runDemo(options = {}) {
  const inputs = await loadDemoInputs(options.root ?? DEMO_ROOT, options.fileName ?? "Sales_2026_08.csv");
  return processSalesPipeline({
    ...inputs,
    now: options.now ?? new Date(),
    existingBronzeKeys: options.existingBronzeKeys,
    existingGoldKeys: options.existingGoldKeys
  });
}
