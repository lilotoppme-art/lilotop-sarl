function neutralizeFormula(value) {
  if (typeof value !== "string") return value;
  return /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
}

function csvCell(value) {
  const safe = neutralizeFormula(value);
  return `"${String(safe ?? "").replace(/"/g, '""')}"`;
}

function exportRow(row) {
  return {
    title: neutralizeFormula(row.title),
    organization: neutralizeFormula(row.organization),
    country: neutralizeFormula(row.country),
    sector: neutralizeFormula(row.sector),
    opportunity_type: neutralizeFormula(row.opportunity_type),
    deadline_at: row.deadline_at,
    estimated_value: row.estimated_value,
    currency: neutralizeFormula(row.currency),
    score: row.score,
    status: neutralizeFormula(row.status),
    source_url: neutralizeFormula(row.source_url),
    is_favorite: Boolean(row.is_favorite),
    is_demo: Boolean(row.is_demo),
  };
}

module.exports = { neutralizeFormula, csvCell, exportRow };
