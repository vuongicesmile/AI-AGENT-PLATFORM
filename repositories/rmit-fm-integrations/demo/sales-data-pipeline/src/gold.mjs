/**
 * Gold calculation helpers mirrored by CalculateSalesGold plugin logic.
 * Formulas from plan.md §9–10.
 */

export function round(value, precision = 4) {
  const multiplier = 10 ** precision;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

export function parsePercent(raw) {
  if (raw == null || String(raw).trim() === "") {
    return NaN;
  }
  const text = String(raw).trim().replace(/%$/, "");
  const number = Number(text);
  if (!Number.isFinite(number)) {
    return NaN;
  }
  // "5%" or "5" treated as percent points when source includes % or value > 1
  if (String(raw).includes("%") || number > 1) {
    return number / 100;
  }
  return number;
}

export function parseDateDdMmYyyy(raw) {
  const match = String(raw ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

export function calculateAmounts(quantity, unitPrice, discountPct) {
  const grossAmount = round(quantity * unitPrice, 4);
  const discountAmount = round(grossAmount * discountPct, 4);
  const netAmount = round(grossAmount - discountAmount, 4);
  return { grossAmount, discountAmount, netAmount };
}

export function calculateGoldMetrics({ quantity, unitPrice, discountPct, costPerUnit }) {
  const { grossAmount: grossSales, discountAmount, netAmount: netSales } = calculateAmounts(
    quantity,
    unitPrice,
    discountPct
  );
  const cost = round(quantity * costPerUnit, 4);
  const grossProfit = round(netSales - cost, 4);
  const grossMarginPct = netSales === 0 ? 0 : round(grossProfit / netSales, 6);

  return {
    grossSales,
    discountAmount,
    netSales,
    cost,
    grossProfit,
    grossMarginPct
  };
}

export function determineSalesCategory(netSales, thresholds) {
  if (netSales >= thresholds.high) {
    return "High";
  }
  if (netSales >= thresholds.medium) {
    return "Medium";
  }
  return "Low";
}

export function extractGoogleDriveFileId(fileUrl) {
  if (!fileUrl || !String(fileUrl).includes("drive.google.com")) {
    return null;
  }
  const afterD = String(fileUrl).split("/d/")[1];
  if (!afterD) {
    return null;
  }
  return afterD.split("/")[0] || null;
}
