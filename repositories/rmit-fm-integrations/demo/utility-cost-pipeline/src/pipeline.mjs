import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function parseContent(content, mapping) {
  if (mapping.format === "csv") {
    return parseCsv(content);
  }

  if (mapping.format === "json") {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("JSON must contain a non-empty array");
    }
    return { headers: Object.keys(parsed[0]), rows: parsed };
  }

  throw new Error(`Unsupported format: ${mapping.format}`);
}

function sourceOffset(rawTimestamp) {
  const match = String(rawTimestamp).match(/(Z|[+-]\d{2}:\d{2})$/);
  return match ? match[1] : null;
}

function sourceLocalDate(rawTimestamp) {
  const match = String(rawTimestamp).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function round(value, precision = 4) {
  const multiplier = 10 ** precision;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function issueFactory(issues) {
  return ({ layer, ruleCode, severity, recordHash = null, fileId = null, detail }) => {
    const issue = {
      issueId: `DQ-${hash(`${layer}|${ruleCode}|${recordHash ?? fileId}|${detail}`).slice(0, 12)}`,
      layer,
      ruleCode,
      severity,
      recordHash,
      fileId,
      status: "OPEN",
      detail
    };
    issues.push(issue);
    return issue;
  };
}

function resolveRelationships(meterCode, masterData) {
  const meter = masterData.meters.find((candidate) => candidate.meterCode === meterCode);
  if (!meter) {
    return null;
  }

  const building = masterData.buildings.find((candidate) => candidate.buildingId === meter.buildingId);
  const campus = building
    ? masterData.campuses.find((candidate) => candidate.campusId === building.campusId)
    : null;

  return meter && building && campus ? { meter, building, campus } : null;
}

function transformTariffs(bronzeTariffs, addIssue) {
  const silverTariffs = [];

  for (const raw of bronzeTariffs) {
    const rate = Number(raw.sourceFields.rate);
    const start = Date.parse(`${raw.sourceFields.effectiveFrom}T00:00:00Z`);
    const end = Date.parse(`${raw.sourceFields.effectiveTo}T23:59:59Z`);
    const reasons = [];

    if (!Number.isFinite(rate) || rate <= 0) reasons.push("rate must be a positive number");
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) reasons.push("effective date range is invalid");
    if (!raw.sourceFields.currency || !raw.sourceFields.rateUnit) reasons.push("currency and rate unit are required");

    if (reasons.length > 0) {
      addIssue({
        layer: "SILVER",
        ruleCode: "INVALID_TARIFF",
        severity: "ERROR",
        recordHash: raw.recordHash,
        detail: reasons.join("; ")
      });
      continue;
    }

    silverTariffs.push({
      tariffId: `TAR-${raw.recordHash.slice(0, 12)}`,
      utilityType: raw.sourceFields.utilityType,
      rate,
      currency: raw.sourceFields.currency,
      rateUnit: raw.sourceFields.rateUnit,
      effectiveFrom: raw.sourceFields.effectiveFrom,
      effectiveTo: raw.sourceFields.effectiveTo,
      approvalStatus: raw.sourceFields.approvalStatus,
      recordHash: raw.recordHash,
      ingestionRunId: raw.ingestionRunId
    });
  }

  return silverTariffs;
}

function transformReadings(bronzeReadings, masterData, mappings, addIssue) {
  const mappingById = new Map(mappings.fileMappings.map((mapping) => [mapping.id, mapping]));
  const candidatesByMeter = new Map();
  const quarantine = [];

  const reject = (raw, ruleCode, detail) => {
    addIssue({
      layer: "SILVER",
      ruleCode,
      severity: "ERROR",
      recordHash: raw.recordHash,
      detail
    });
    quarantine.push({
      quarantineId: `QR-${hash(`${raw.recordHash}|${ruleCode}`).slice(0, 12)}`,
      recordHash: raw.recordHash,
      ruleCode,
      sourceFileName: raw.sourceFileName,
      sourceRowNumber: raw.sourceRowNumber,
      rawPayload: raw.rawPayload
    });
  };

  for (const raw of bronzeReadings) {
    const mapping = mappingById.get(raw.mappingId);
    const relationships = resolveRelationships(raw.sourceFields.meterCode, masterData);
    if (!relationships || !relationships.meter.isActive) {
      reject(raw, "METER_NOT_RESOLVED", `Meter ${raw.sourceFields.meterCode || "<blank>"} is not active or mapped`);
      continue;
    }

    const timestampMillis = Date.parse(raw.sourceFields.sourceTimestamp);
    if (!Number.isFinite(timestampMillis) || !sourceOffset(raw.sourceFields.sourceTimestamp)) {
      reject(raw, "INVALID_TIMESTAMP", "Timestamp must be ISO 8601 and retain Z or the original UTC offset");
      continue;
    }

    const numericValue = Number(raw.sourceFields.sourceValue);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      reject(raw, "INVALID_VALUE", "Reading must be a non-negative decimal");
      continue;
    }

    if (raw.sourceFields.sourceUnit !== relationships.meter.canonicalUnit) {
      reject(
        raw,
        "INVALID_UNIT",
        `Unit ${raw.sourceFields.sourceUnit || "<blank>"} does not match ${relationships.meter.canonicalUnit}`
      );
      continue;
    }

    if (!new Set(["GOOD", "OK"]).has(String(raw.sourceFields.sourceQuality).toUpperCase())) {
      reject(raw, "SOURCE_QUALITY_REJECTED", `Source quality ${raw.sourceFields.sourceQuality || "<blank>"} is not accepted`);
      continue;
    }

    const candidate = {
      raw,
      mapping,
      relationships,
      timestampMillis,
      numericValue
    };
    const key = relationships.meter.meterId;
    candidatesByMeter.set(key, [...(candidatesByMeter.get(key) ?? []), candidate]);
  }

  const silverReadings = [];
  for (const candidates of candidatesByMeter.values()) {
    candidates.sort((left, right) => left.timestampMillis - right.timestampMillis);
    let previousAccepted = null;

    for (const candidate of candidates) {
      const { raw, mapping, relationships, timestampMillis, numericValue } = candidate;
      let intervalConsumption = null;
      let intervalMinutes = null;
      let qualityState = "VALID";
      const flags = [];

      if (previousAccepted) {
        intervalMinutes = (timestampMillis - previousAccepted.timestampMillis) / 60000;
        intervalConsumption = mapping.measurementKind === "cumulative"
          ? round(numericValue - previousAccepted.numericValue)
          : numericValue;

        if (intervalConsumption < 0) {
          reject(raw, "NEGATIVE_DELTA", "Cumulative reading decreased; possible reset or source correction requires review");
          continue;
        }

        if (intervalMinutes > mapping.expectedIntervalMinutes * 1.5) {
          qualityState = "SUSPECT";
          flags.push("MISSING_INTERVAL");
          addIssue({
            layer: "SILVER",
            ruleCode: "MISSING_INTERVAL",
            severity: "WARNING",
            recordHash: raw.recordHash,
            detail: `${round(intervalMinutes, 2)} minutes since the previous accepted reading; expected ${mapping.expectedIntervalMinutes}`
          });
        }

        if (intervalConsumption > relationships.meter.maxIntervalConsumption) {
          qualityState = "SUSPECT";
          flags.push("OUTLIER");
          addIssue({
            layer: "SILVER",
            ruleCode: "OUTLIER",
            severity: "WARNING",
            recordHash: raw.recordHash,
            detail: `${intervalConsumption} exceeds configured demo maximum ${relationships.meter.maxIntervalConsumption}`
          });
        }
      } else {
        flags.push("WARMUP_READING");
      }

      silverReadings.push({
        readingId: `SR-${raw.recordHash.slice(0, 12)}`,
        meterId: relationships.meter.meterId,
        meterCode: relationships.meter.meterCode,
        buildingId: relationships.building.buildingId,
        buildingCode: relationships.building.buildingCode,
        campusId: relationships.campus.campusId,
        campusCode: relationships.campus.campusCode,
        utilityType: relationships.meter.utilityType,
        metricCode: relationships.meter.metricCode,
        eventAtUtc: new Date(timestampMillis).toISOString(),
        sourceTimestamp: raw.sourceFields.sourceTimestamp,
        sourceTimezone: sourceOffset(raw.sourceFields.sourceTimestamp),
        sourceLocalDate: sourceLocalDate(raw.sourceFields.sourceTimestamp),
        cumulativeValue: numericValue,
        intervalConsumption,
        intervalMinutes,
        normalizedUnit: relationships.meter.canonicalUnit,
        qualityState,
        flags,
        source: raw.source,
        submittedBy: raw.sourceFields.submittedBy ?? null,
        recordHash: raw.recordHash,
        ingestionRunId: raw.ingestionRunId
      });

      previousAccepted = candidate;
    }
  }

  silverReadings.sort((left, right) => left.eventAtUtc.localeCompare(right.eventAtUtc));
  return { silverReadings, quarantine };
}

function matchTariff(reading, tariffs) {
  return tariffs.find((tariff) =>
    tariff.utilityType === reading.utilityType
    && tariff.rateUnit === reading.normalizedUnit
    && reading.sourceLocalDate >= tariff.effectiveFrom
    && reading.sourceLocalDate <= tariff.effectiveTo
  );
}

function aggregateGold(silverReadings, silverTariffs, addIssue, now) {
  const groups = new Map();

  for (const reading of silverReadings) {
    if (reading.qualityState !== "VALID" || reading.intervalConsumption === null) {
      continue;
    }

    const tariff = matchTariff(reading, silverTariffs);
    if (!tariff) {
      addIssue({
        layer: "GOLD",
        ruleCode: "TARIFF_NOT_RESOLVED",
        severity: "ERROR",
        recordHash: reading.recordHash,
        detail: `No tariff matches ${reading.utilityType}, ${reading.normalizedUnit}, ${reading.sourceLocalDate}`
      });
      continue;
    }

    const groupKey = [reading.campusId, reading.buildingId, reading.meterId, reading.sourceLocalDate].join("|");
    const current = groups.get(groupKey) ?? {
      goldId: `GD-${hash(groupKey).slice(0, 12)}`,
      date: reading.sourceLocalDate,
      campusId: reading.campusId,
      campusCode: reading.campusCode,
      buildingId: reading.buildingId,
      buildingCode: reading.buildingCode,
      meterId: reading.meterId,
      meterCode: reading.meterCode,
      utilityType: reading.utilityType,
      unit: reading.normalizedUnit,
      consumption: 0,
      rate: tariff.rate,
      currency: tariff.currency,
      cost: 0,
      validIntervalCount: 0,
      sourceRowCount: 0,
      tariffApprovalStatus: tariff.approvalStatus,
      formulaStatus: "MOCK_NOT_APPROVED",
      asOfUtc: now.toISOString()
    };

    current.consumption = round(current.consumption + reading.intervalConsumption);
    current.cost = round(current.consumption * current.rate, 2);
    current.validIntervalCount += 1;
    current.sourceRowCount += 1;
    groups.set(groupKey, current);
  }

  return [...groups.values()].sort((left, right) =>
    `${left.date}|${left.utilityType}|${left.meterCode}`.localeCompare(`${right.date}|${right.utilityType}|${right.meterCode}`)
  );
}

export function processFiles({ files, mappings, masterData, now = new Date() }) {
  const issues = [];
  const addIssue = issueFactory(issues);
  const fileRuns = [];
  const bronzeReadings = [];
  const bronzeTariffs = [];
  const seenFileHashes = new Set();
  const seenRecordHashes = new Set();
  const runSeed = files.map((file) => `${file.name}:${hash(file.content)}`).sort().join("|");
  const ingestionRunId = `RUN-${hash(`${runSeed}|${now.toISOString()}`).slice(0, 12)}`;

  for (const file of [...files].sort((left, right) => left.name.localeCompare(right.name))) {
    const extension = path.extname(file.name).toLowerCase();
    const fileHash = hash(file.content);
    const fileId = `FILE-${hash(`${file.name}|${fileHash}`).slice(0, 12)}`;
    const fileRun = {
      fileId,
      fileName: file.name,
      sharePointItemId: `spo-demo-${fileId.toLowerCase()}`,
      contentReference: `/sites/FMData/Shared Documents/Utility Inbox/${file.name}`,
      fileHash,
      byteCount: Buffer.byteLength(file.content),
      mappingId: null,
      status: "CHECKING",
      parsedRowCount: 0,
      bronzeInsertedCount: 0,
      duplicateRowCount: 0,
      rejectedRowCount: 0,
      ingestionRunId
    };
    fileRuns.push(fileRun);

    if (!mappings.allowedExtensions.includes(extension)) {
      fileRun.status = "REJECTED";
      addIssue({ layer: "FILE", ruleCode: "EXTENSION_NOT_ALLOWED", severity: "ERROR", fileId, detail: extension });
      continue;
    }

    if (fileRun.byteCount > mappings.maxFileBytes) {
      fileRun.status = "REJECTED";
      addIssue({ layer: "FILE", ruleCode: "FILE_TOO_LARGE", severity: "ERROR", fileId, detail: `${fileRun.byteCount} bytes` });
      continue;
    }

    if (seenFileHashes.has(fileHash)) {
      fileRun.status = "DUPLICATE_FILE";
      addIssue({ layer: "FILE", ruleCode: "DUPLICATE_FILE", severity: "INFO", fileId, detail: "File content already processed in this run" });
      continue;
    }
    seenFileHashes.add(fileHash);

    const mapping = mappings.fileMappings.find((candidate) => new RegExp(candidate.fileNamePattern).test(file.name));
    if (!mapping) {
      fileRun.status = "REJECTED";
      addIssue({ layer: "FILE", ruleCode: "MAPPING_NOT_FOUND", severity: "ERROR", fileId, detail: file.name });
      continue;
    }
    fileRun.mappingId = mapping.id;

    let parsed;
    try {
      parsed = parseContent(file.content, mapping);
      const missingColumns = Object.values(mapping.fields).filter((field) => !parsed.headers.includes(field));
      if (missingColumns.length > 0) {
        throw new Error(`Missing required fields: ${missingColumns.join(", ")}`);
      }
    } catch (error) {
      fileRun.status = "REJECTED";
      addIssue({ layer: "FILE", ruleCode: "CONTENT_INVALID", severity: "ERROR", fileId, detail: error.message });
      continue;
    }

    fileRun.parsedRowCount = parsed.rows.length;
    for (const [rowIndex, row] of parsed.rows.entries()) {
      const sourceFields = Object.fromEntries(
        Object.entries(mapping.fields).map(([canonicalName, sourceName]) => [canonicalName, row[sourceName] ?? null])
      );
      const identity = mapping.recordType === "utility_reading"
        ? [mapping.sourceSystem, sourceFields.meterCode, mapping.metricCode, sourceFields.sourceTimestamp, sourceFields.sourceValue, sourceFields.sourceUnit].join("|")
        : [mapping.sourceSystem, sourceFields.utilityType, sourceFields.effectiveFrom, sourceFields.rate, sourceFields.currency].join("|");
      const recordHash = hash(identity);

      if (seenRecordHashes.has(recordHash)) {
        fileRun.duplicateRowCount += 1;
        addIssue({
          layer: "BRONZE",
          ruleCode: "DUPLICATE_SOURCE_RECORD",
          severity: "WARNING",
          recordHash,
          fileId,
          detail: `${file.name} row ${rowIndex + 2} matched an existing source record hash`
        });
        continue;
      }
      seenRecordHashes.add(recordHash);

      const rawRecord = {
        bronzeId: `BR-${hash(`${fileHash}|${rowIndex + 2}`).slice(0, 12)}`,
        recordHash,
        sourceSystem: mapping.sourceSystem,
        source: mapping.source ?? "automated",
        sourceFileName: file.name,
        sourceFileHash: fileHash,
        sourceRowNumber: rowIndex + 2,
        sourceFields,
        rawPayload: JSON.stringify(row),
        mappingId: mapping.id,
        ingestionRunId,
        ingestedAtUtc: now.toISOString()
      };

      if (mapping.recordType === "utility_reading") {
        bronzeReadings.push(rawRecord);
      } else {
        bronzeTariffs.push(rawRecord);
      }
      fileRun.bronzeInsertedCount += 1;
    }

    fileRun.status = fileRun.duplicateRowCount > 0 ? "SUCCEEDED_WITH_ISSUES" : "SUCCEEDED";
  }

  const silverTariffs = transformTariffs(bronzeTariffs, addIssue);
  const { silverReadings, quarantine } = transformReadings(bronzeReadings, masterData, mappings, addIssue);
  const goldDailyCosts = aggregateGold(silverReadings, silverTariffs, addIssue, now);

  for (const fileRun of fileRuns) {
    fileRun.rejectedRowCount = issues.filter((issue) =>
      issue.fileId === fileRun.fileId && ["ERROR", "WARNING"].includes(issue.severity)
    ).length;
  }

  const acceptedGoldSourceRows = goldDailyCosts.reduce((total, row) => total + row.sourceRowCount, 0);
  const totalInputRows = fileRuns.reduce((total, fileRun) => total + fileRun.parsedRowCount, 0);
  const totalBronzeRows = bronzeReadings.length + bronzeTariffs.length;
  const totalCost = goldDailyCosts.reduce((total, row) => total + row.cost, 0);
  const totalElectricity = goldDailyCosts
    .filter((row) => row.utilityType === "ELECTRICITY")
    .reduce((total, row) => total + row.consumption, 0);
  const totalWater = goldDailyCosts
    .filter((row) => row.utilityType === "WATER")
    .reduce((total, row) => total + row.consumption, 0);

  return {
    run: {
      ingestionRunId,
      status: issues.some((issue) => issue.severity === "ERROR") ? "SUCCEEDED_WITH_DQ_ISSUES" : "SUCCEEDED",
      startedAtUtc: now.toISOString(),
      completedAtUtc: now.toISOString(),
      fileCount: fileRuns.length,
      totalInputRows,
      totalBronzeRows,
      duplicateRows: issues.filter((issue) => issue.ruleCode === "DUPLICATE_SOURCE_RECORD").length,
      silverReadingRows: silverReadings.length,
      quarantinedRows: quarantine.length,
      goldRows: goldDailyCosts.length,
      acceptedGoldSourceRows
    },
    summary: {
      totalCostVnd: round(totalCost, 2),
      totalElectricityKwh: round(totalElectricity),
      totalWaterM3: round(totalWater),
      openDataQualityIssues: issues.length,
      tariffStatus: "MOCK_NOT_APPROVED",
      costFormulaStatus: "MOCK_NOT_APPROVED"
    },
    files: fileRuns,
    mappings: mappings.fileMappings.map((mapping) => ({
      id: mapping.id,
      sourceSystem: mapping.sourceSystem,
      recordType: mapping.recordType,
      targetBronzeTable: mapping.targetBronzeTable,
      targetSilverTable: mapping.targetSilverTable,
      fields: mapping.fields
    })),
    bronze: {
      utilityReadingRaw: bronzeReadings,
      utilityTariffRaw: bronzeTariffs
    },
    silver: {
      utilityReadings: silverReadings,
      utilityTariffs: silverTariffs,
      quarantine
    },
    gold: {
      dailyUtilityCosts: goldDailyCosts
    },
    dataQualityIssues: issues,
    masterData,
    reconciliation: {
      inputRows: totalInputRows,
      bronzeRows: totalBronzeRows,
      duplicateRows: issues.filter((issue) => issue.ruleCode === "DUPLICATE_SOURCE_RECORD").length,
      fileRejectedRows: fileRuns.reduce((total, fileRun) => total + fileRun.rejectedRowCount, 0),
      quarantinedRows: quarantine.length,
      silverRows: silverReadings.length,
      goldSourceRows: acceptedGoldSourceRows,
      balanceNote: "Input = Bronze unique + duplicate; Silver = structurally accepted Bronze minus quarantine; Gold excludes warmup and SUSPECT rows. Tariff rows are reconciled separately."
    }
  };
}

export async function loadDemoInputs(root = DEMO_ROOT) {
  const [mappingText, masterText, names] = await Promise.all([
    readFile(path.join(root, "config", "mappings.json"), "utf8"),
    readFile(path.join(root, "config", "master-data.json"), "utf8"),
    readdir(path.join(root, "mock-data", "sharepoint-inbox"))
  ]);
  const files = await Promise.all(
    names.sort().map(async (name) => ({
      name,
      content: await readFile(path.join(root, "mock-data", "sharepoint-inbox", name), "utf8")
    }))
  );

  return {
    files,
    mappings: JSON.parse(mappingText),
    masterData: JSON.parse(masterText)
  };
}

export async function runDemo(options = {}) {
  const inputs = await loadDemoInputs(options.root ?? DEMO_ROOT);
  return processFiles({ ...inputs, now: options.now ?? new Date() });
}
