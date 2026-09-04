const state = { data: null, activeTab: "bronze" };

const byId = (id) => document.getElementById(id);
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function escapeHtml(value) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function renderActiveTab() {
  const data = state.data;
  if (!data) return;

  const views = {
    bronze: () => renderTable(data.bronze, [
      { label: "Row", value: "rowNumber" },
      { label: "OrderId", value: "orderId" },
      { label: "Date raw", value: "orderDateRaw" },
      { label: "Customer raw", value: "customerRaw" },
      { label: "Product raw", value: "productRaw" },
      { label: "Qty raw", value: "qtyRaw" },
      { label: "Price raw", value: "unitPriceRaw" },
      { label: "Discount raw", value: "discountRaw" },
      { label: "Status", value: "loadStatus" }
    ], "Sales_Bronze raw rows"),
    silver: () => renderTable(data.silver, [
      { label: "OrderId", value: "orderId" },
      { label: "OrderDate", value: "orderDate" },
      { label: "Customer", value: "customerName" },
      { label: "Product", value: "productName" },
      { label: "Qty", value: "quantity" },
      { label: "NetAmount", value: (row) => row.netAmount == null ? "—" : number.format(row.netAmount) },
      { label: "DQ", value: "dataQualityStatus" },
      { label: "Message", value: "dataQualityMessage" }
    ], "Sales_Silver typed rows"),
    gold: () => renderTable(data.gold, [
      { label: "OrderId", value: "orderId" },
      { label: "Year/Month", value: (row) => `${row.year}-${String(row.month).padStart(2, "0")}` },
      { label: "Customer", value: "customerName" },
      { label: "Product", value: "productName" },
      { label: "NetSales", value: (row) => number.format(row.netSales) },
      { label: "GrossProfit", value: (row) => number.format(row.grossProfit) },
      { label: "Margin %", value: (row) => number.format(row.grossMarginPct * 100) },
      { label: "Category", value: "salesCategory" }
    ], "Sales_Gold reporting rows")
  };

  byId("records-table").innerHTML = views[state.activeTab]();
}

function render(data) {
  state.data = data;
  const errors = data.pipelineErrors ?? [];

  byId("run-status").textContent = data.pipelineRun
    ? `${data.pipelineRun.pipelineName} · ${data.pipelineRun.status} · DataSource ${data.dataSource.status}`
    : `Intake rejected · ${data.dataSource.errorMessage}`;
  byId("run-id").textContent = data.pipelineRun?.runId ?? "NO-RUN";
  byId("kpi-bronze").textContent = String(data.reconciliation.bronzeCount);
  byId("kpi-silver").textContent = String(data.reconciliation.silverValidCount);
  byId("kpi-gold").textContent = String(data.reconciliation.goldCount);
  byId("kpi-errors").textContent = String(errors.length);

  byId("stage-file").textContent = data.dataSource.fileName;
  byId("stage-ds").textContent = data.dataSource.status;
  byId("stage-bronze").textContent = `${data.reconciliation.bronzeCount} rows`;
  byId("stage-silver").textContent = `${data.reconciliation.silverValidCount} valid / ${data.reconciliation.silverErrorCount} error`;
  byId("stage-gold").textContent = `${data.reconciliation.goldCount} rows`;

  byId("errors-table").innerHTML = renderTable(errors, [
    { label: "Layer", value: "layer" },
    { label: "Type", value: "errorType" },
    { label: "Record", value: "recordId" },
    { label: "Message", value: "errorMessage" }
  ], "PipelineError audit");

  renderActiveTab();
}

async function loadDemo() {
  byId("run-status").textContent = "Running Sales Pipeline…";
  const response = await fetch("/api/demo");
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Demo run failed");
  }
  render(payload);
}

byId("replay-button").addEventListener("click", () => {
  loadDemo().catch((error) => {
    byId("run-status").textContent = error.message;
  });
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeTab = button.dataset.tab;
    document.querySelectorAll(".tab").forEach((candidate) => {
      candidate.classList.toggle("active", candidate === button);
    });
    renderActiveTab();
  });
});

loadDemo().catch((error) => {
  byId("run-status").textContent = error.message;
});
