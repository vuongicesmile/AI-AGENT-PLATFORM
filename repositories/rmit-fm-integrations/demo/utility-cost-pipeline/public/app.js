const state = { data: null, activeTab: "bronze" };

const byId = (id) => document.getElementById(id);
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

function escapeHtml(value) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortHash(value) {
  return value ? `${value.slice(0, 10)}…` : "—";
}

function renderTable(rows, columns, caption) {
  if (!rows.length) {
    return `<div class="empty-state">No rows in this view.</div>`;
  }

  const header = columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("");
  const body = rows.map((row) => `<tr>${columns.map((column) => {
    const raw = typeof column.value === "function" ? column.value(row) : row[column.value];
    return `<td title="${escapeHtml(raw)}">${escapeHtml(raw)}</td>`;
  }).join("")}</tr>`).join("");

  return `
    <div class="table-caption"><span>${escapeHtml(caption)}</span><span>${rows.length} row${rows.length === 1 ? "" : "s"}</span></div>
    <div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>
  `;
}

function renderFiles(data) {
  const successful = data.files.filter((file) => file.status.startsWith("SUCCEEDED")).length;
  byId("file-success-rate").textContent = `${successful}/${data.files.length} landed`;
  byId("file-list").innerHTML = data.files.map((file) => {
    const statusClass = file.status === "SUCCEEDED" ? "" : file.status === "REJECTED" ? "rejected" : "issue";
    return `
      <article class="file-row">
        <div class="file-name">
          <strong title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</strong>
          <small>${escapeHtml(file.mappingId)} · ${number.format(file.byteCount)} bytes</small>
        </div>
        <span class="file-counts">${file.bronzeInsertedCount}/${file.parsedRowCount} Bronze</span>
        <span class="status-pill ${statusClass}">${escapeHtml(file.status)}</span>
      </article>
    `;
  }).join("");
}

function renderCosts(data) {
  const utilityTotals = ["ELECTRICITY", "WATER"].map((utilityType) => ({
    utilityType,
    value: data.gold.dailyUtilityCosts
      .filter((row) => row.utilityType === utilityType)
      .reduce((total, row) => total + row.cost, 0)
  }));
  const max = Math.max(...utilityTotals.map((item) => item.value), 1);
  byId("cost-bars").innerHTML = utilityTotals.map((item) => `
    <div>
      <div class="cost-bar-label"><strong>${escapeHtml(item.utilityType)}</strong><span>${currency.format(item.value)}</span></div>
      <div class="bar-track" aria-label="${escapeHtml(item.utilityType)} cost ${currency.format(item.value)}">
        <div class="bar-fill ${item.utilityType === "WATER" ? "water" : ""}" style="width:${(item.value / max) * 100}%"></div>
      </div>
    </div>
  `).join("");

  byId("cost-table").innerHTML = renderTable(data.gold.dailyUtilityCosts, [
    { label: "Date", value: "date" },
    { label: "Meter", value: "meterCode" },
    { label: "Usage", value: (row) => `${number.format(row.consumption)} ${row.unit}` },
    { label: "Cost", value: (row) => currency.format(row.cost) }
  ], "Gold daily utility cost");
}

function renderActiveTab() {
  const data = state.data;
  if (!data) return;
  const table = byId("records-table");
  const views = {
    bronze: () => renderTable(data.bronze.utilityReadingRaw, [
      { label: "File", value: "sourceFileName" },
      { label: "Row", value: "sourceRowNumber" },
      { label: "Source", value: "sourceSystem" },
      { label: "Meter raw", value: (row) => row.sourceFields.meterCode },
      { label: "Timestamp raw", value: (row) => row.sourceFields.sourceTimestamp },
      { label: "Value raw", value: (row) => row.sourceFields.sourceValue },
      { label: "Unit raw", value: (row) => row.sourceFields.sourceUnit },
      { label: "Record hash", value: (row) => shortHash(row.recordHash) }
    ], "Immutable source-shaped reading rows"),
    silver: () => renderTable(data.silver.utilityReadings, [
      { label: "Meter", value: "meterCode" },
      { label: "Building", value: "buildingCode" },
      { label: "Campus", value: "campusCode" },
      { label: "Event UTC", value: "eventAtUtc" },
      { label: "Consumption", value: (row) => row.intervalConsumption === null ? "warmup" : `${number.format(row.intervalConsumption)} ${row.normalizedUnit}` },
      { label: "Quality", value: "qualityState" },
      { label: "Flags", value: (row) => row.flags.join(", ") || "—" },
      { label: "Source", value: "source" }
    ], "Canonical readings after lookup, type and interval validation"),
    gold: () => renderTable(data.gold.dailyUtilityCosts, [
      { label: "Date", value: "date" },
      { label: "Campus", value: "campusCode" },
      { label: "Building", value: "buildingCode" },
      { label: "Meter", value: "meterCode" },
      { label: "Utility", value: "utilityType" },
      { label: "Consumption", value: (row) => `${number.format(row.consumption)} ${row.unit}` },
      { label: "Rate", value: (row) => `${number.format(row.rate)} ${row.currency}/${row.unit}` },
      { label: "Cost", value: (row) => currency.format(row.cost) },
      { label: "Formula", value: "formulaStatus" }
    ], "Reporting grain: meter × utility × local date"),
    dq: () => renderTable(data.dataQualityIssues, [
      { label: "Layer", value: "layer" },
      { label: "Rule", value: "ruleCode" },
      { label: "Severity", value: "severity" },
      { label: "Status", value: "status" },
      { label: "Record hash", value: (row) => shortHash(row.recordHash) },
      { label: "Detail", value: "detail" }
    ], "Open duplicate, reject and suspect observations"),
    mapping: () => renderTable(data.mappings.flatMap((mapping) => Object.entries(mapping.fields).map(([target, source]) => ({
      mappingId: mapping.id,
      sourceSystem: mapping.sourceSystem,
      source,
      target,
      bronze: mapping.targetBronzeTable,
      silver: mapping.targetSilverTable
    }))), [
      { label: "Mapping", value: "mappingId" },
      { label: "Source", value: "sourceSystem" },
      { label: "Raw field", value: "source" },
      { label: "Canonical field", value: "target" },
      { label: "Bronze table", value: "bronze" },
      { label: "Silver table", value: "silver" }
    ], "Configuration-driven source-to-target mapping")
  };

  table.innerHTML = views[state.activeTab]();
  table.setAttribute("aria-labelledby", `tab-${state.activeTab}`);
}

function render(data) {
  state.data = data;
  byId("run-id").textContent = data.run.ingestionRunId;
  byId("stage-files").textContent = number.format(data.run.fileCount);
  byId("stage-input").textContent = number.format(data.run.totalInputRows);
  byId("stage-bronze").textContent = number.format(data.run.totalBronzeRows);
  byId("stage-silver").textContent = number.format(data.run.silverReadingRows);
  byId("stage-gold").textContent = number.format(data.run.goldRows);
  byId("total-cost").textContent = currency.format(data.summary.totalCostVnd);
  byId("total-electricity").textContent = `${number.format(data.summary.totalElectricityKwh)} kWh`;
  byId("total-water").textContent = `${number.format(data.summary.totalWaterM3)} m³`;
  byId("total-dq").textContent = number.format(data.summary.openDataQualityIssues);
  byId("reconciliation-note").textContent = `${data.reconciliation.inputRows} parsed rows → ${data.reconciliation.bronzeRows} unique Bronze rows + ${data.reconciliation.duplicateRows} duplicate observations → ${data.reconciliation.silverRows} Silver readings → ${data.reconciliation.goldSourceRows} accepted source intervals in Gold. ${data.reconciliation.balanceNote}`;
  renderFiles(data);
  renderCosts(data);
  renderActiveTab();
}

async function load(method = "GET", endpoint = "/api/demo") {
  const button = byId("replay-button");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  byId("run-status").textContent = method === "POST" ? "Replaying the same files with idempotency checks…" : "Loading the synthetic SharePoint inbox…";

  try {
    const response = await fetch(endpoint, { method });
    if (!response.ok) throw new Error(`Pipeline API returned ${response.status}`);
    const data = await response.json();
    render(data);
    byId("run-status").textContent = `${data.run.status} · completed ${new Date(data.run.completedAtUtc).toLocaleString()} · no external writes`;
  } catch (error) {
    byId("run-status").textContent = `${error.message}. Start the demo with npm start; opening index.html directly is not supported.`;
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

document.querySelectorAll("[role=tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.activeTab = tab.dataset.tab;
    document.querySelectorAll("[role=tab]").forEach((candidate) => candidate.setAttribute("aria-selected", String(candidate === tab)));
    renderActiveTab();
  });

  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[role=tab]")];
    const direction = event.key === "ArrowRight" ? 1 : -1;
    tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length].focus();
  });
});

byId("replay-button").addEventListener("click", () => load("POST", "/api/replay"));
load();
