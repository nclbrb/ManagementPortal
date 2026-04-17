/**
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   documentTitle?: string,
 *   logoUrl?: string,
 *   filterItems?: { label: string, value: string }[],
 *   rows: { dateRange: string, task: string, assigned: string, status: string, notes: string }[],
 * }} opts documentTitle defaults the HTML &lt;title&gt; (browser tab) to subtitle when omitted.
 */
export function buildTaskListPrintHtml({
  title,
  subtitle = "Commission on Elections",
  documentTitle,
  logoUrl,
  filterItems = [],
  rows,
}) {
  const tabTitle = documentTitle ?? subtitle;
  const safe = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const rowHtml =
    rows.length === 0
      ? `<tr><td colspan="5" class="empty-row">No tasks match the selected date range and filters.</td></tr>`
      : rows
          .map(
            (r) => `
    <tr>
      <td class="col-date">${safe(r.dateRange)}</td>
      <td>${safe(r.task)}</td>
      <td>${safe(r.assigned)}</td>
      <td class="col-status">${safe(r.status)}</td>
      <td class="col-notes">${safe(r.notes)}</td>
    </tr>`
          )
          .join("");
  const filtersHtml = (filterItems || [])
    .map(
      (f) => `
    <div class="filter-chip">
      <span class="filter-chip-label">${safe(f.label)}</span>
      <span class="filter-chip-value">${safe(f.value)}</span>
    </div>`
    )
    .join("");
  const logoBlock = logoUrl
    ? `<div class="print-logo"><img src="${safe(logoUrl)}" alt="COMELEC" crossorigin="anonymous" /></div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safe(tabTitle)}</title>
  <style>
    /* Reference: navy + light sky-blue header row + grey filter chips + zebra body */
    @page { size: landscape; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: #0f2744;
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-header-inner {
      display: flex;
      align-items: flex-start;
      gap: 14px;
    }
    .print-logo {
      flex-shrink: 0;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .print-logo img {
      max-width: 56px;
      max-height: 56px;
      object-fit: contain;
    }
    .print-head-text { flex: 1; min-width: 0; }
    .print-header-inner h1 {
      margin: 0 0 4px;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #1e3a5f;
      line-height: 1.2;
    }
    .print-header-inner .subtitle {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #2c5282;
    }
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
      margin: 0;
    }
    @media print {
      .filters { break-inside: avoid; page-break-inside: avoid; }
    }
    .filter-chip {
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid #d1dae5;
      background: #f4f6f9;
    }
    .filter-chip-label {
      display: block;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #1e3a5f;
      margin-bottom: 5px;
    }
    .filter-chip-value {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: #0f172a;
      line-height: 1.4;
      word-break: break-word;
    }
    table.print-sheet {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      table-layout: fixed;
    }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
    thead tr.thead-print-brand th,
    thead tr.thead-print-filters th {
      font-weight: normal;
      text-align: left;
      vertical-align: top;
    }
    thead tr.thead-print-brand th {
      padding: 12px 14px;
      border: 1px solid #d1dae5;
      border-bottom: 2px solid #1e3a5f;
      background: #fff;
    }
    thead tr.thead-print-filters th {
      padding: 8px 14px 12px;
      border: 1px solid #d1dae5;
      border-top: none;
      background: #fff;
    }
    /* Solid light blue header row (column titles) */
    thead tr.thead-print-cols th {
      background: #d6e8f8;
      border: 1px solid #9ebfe0;
      color: #1e3a5f;
      font-weight: 800;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      padding: 9px 10px;
    }
    th, td {
      border: 1px solid #d1dae5;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    tbody td {
      color: #0f2744;
      font-weight: 500;
    }
    tbody tr:nth-child(odd) td {
      background: #ffffff;
    }
    tbody tr:nth-child(even) td {
      background: #eef4fb;
    }
    tbody tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .col-date { white-space: nowrap; width: 17%; }
    .col-status { white-space: nowrap; width: 11%; }
    .col-notes { word-break: break-word; }
    .empty-row {
      text-align: center;
      padding: 16px !important;
      color: #64748b;
      font-style: italic;
      background: #f8fafc !important;
    }
    @media print {
      body { padding: 0; }
      thead { display: table-header-group; }
      thead tr.thead-print-cols th {
        page-break-after: avoid;
        break-after: avoid;
      }
      tbody tr { page-break-inside: avoid; break-inside: avoid; }
      td, thead tr.thead-print-cols th { page-break-inside: avoid; break-inside: avoid; }
      table.print-sheet { page-break-inside: auto; }
    }
  </style>
</head>
<body>
  <table class="print-sheet" role="table" aria-label="Employee task list">
    <thead>
      <tr class="thead-print-brand">
        <th colspan="5" scope="colgroup">
          <div class="print-header-inner">
            ${logoBlock}
            <div class="print-head-text">
              <h1>${safe(title)}</h1>
              <p class="subtitle">${safe(subtitle)}</p>
            </div>
          </div>
        </th>
      </tr>
      <tr class="thead-print-filters">
        <th colspan="5" scope="colgroup">
          <div class="filters">${filtersHtml}</div>
        </th>
      </tr>
      <tr class="thead-print-cols">
        <th scope="col">Date range</th>
        <th scope="col">Task</th>
        <th scope="col">Assigned to</th>
        <th scope="col">Status</th>
        <th scope="col">Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rowHtml}
    </tbody>
  </table>
</body>
</html>`;
}
