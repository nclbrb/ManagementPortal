import comelecLogo from "../assets/comelec.png";
import { escapeHtml } from "../lib/strings.js";

export function buildObSlipPrintHtml(input) {
  const logoSrc = escapeHtml(comelecLogo);
  const slips = (Array.isArray(input) ? input : [input]).filter(Boolean);
  const makeSlipMarkup = (slip) => {
    const date = escapeHtml(slip.date);
    const name = escapeHtml(slip.name);
    const position = escapeHtml(slip.position);
    const department = escapeHtml(slip.department || "COMELEC");
    const purpose = escapeHtml(slip.purpose);
    const timeIn = escapeHtml(slip.timeIn);
    const timeOut = escapeHtml(slip.timeOut);
    return `
      <section class="ob-slip">
        <header class="ob-head">
          <div class="ob-seal-wrap" aria-hidden="true"><img src="${logoSrc}" alt="COMELEC" /></div>
          <div class="ob-head-text">
            <p class="ob-line">Republic of the Philippines</p>
            <p class="ob-line ob-city">CITY OF CABUYAO</p>
            <p class="ob-line">Province of Laguna</p>
            <h1>Official Business Slip</h1>
          </div>
        </header>

        <div class="ob-body">
          <div class="ob-row"><span class="label">Date :</span><span class="line">${date}</span></div>
          <div class="ob-row"><span class="label">Name :</span><span class="line">${name}</span></div>
          <div class="ob-row"><span class="label">Position :</span><span class="line">${position}</span></div>
          <div class="ob-row"><span class="label">Department :</span><span class="line">${department}</span></div>
          <div class="ob-row ob-purpose"><span class="label">Purpose :</span><span class="line">${purpose}</span></div>
          <div class="ob-row ob-time">
            <span class="label">Time in :</span><span class="line">${timeIn}</span>
            <span class="label label-right">Time Out :</span><span class="line">${timeOut}</span>
          </div>

          <div class="ob-return">
            <span class="label">Will be back?</span>
            <span class="check-wrap">YES <span class="check"></span></span>
            <span class="check-wrap">NO <span class="check"></span></span>
          </div>

          <div class="ob-row"><span class="label">Received by :</span><span class="line">&nbsp;</span></div>
          <div class="ob-row"><span class="label">Approved by :</span><span class="line">&nbsp;</span></div>
          <div class="ob-row"><span class="label">Encoded by :</span><span class="line">&nbsp;</span></div>
        </div>

        <footer class="ob-foot">
          <div class="sig-name">ATTY. RALPH JIREH A. BARTOLOME</div>
          <div class="sig-role">Dept. Head's Signature</div>
        </footer>
      </section>`;
  };
  const pages = [];
  for (let i = 0; i < slips.length; i += 4) pages.push(slips.slice(i, i + 4));
  const printTitle = slips.length ? escapeHtml(slips[0].name) : "OB Slip";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OB Slip - ${printTitle}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: Letter portrait; margin: 8mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      background: #fff;
      line-height: 1.25;
    }
    .print-page {
      width: 100%;
      min-height: calc(100vh - 1px);
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 7mm;
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-child { page-break-after: auto; break-after: auto; }
    .ob-slip {
      border: 1.4px solid #000;
      padding: 7mm 6mm 5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 0;
    }
    .ob-head {
      display: grid;
      grid-template-columns: 20mm 1fr;
      gap: 3mm;
      align-items: start;
      margin-bottom: 3mm;
    }
    .ob-seal-wrap {
      width: 18mm;
      height: 18mm;
      display: grid;
      place-items: center;
    }
    .ob-seal-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .ob-head-text { text-align: center; }
    .ob-line { margin: 0; font-size: 10px; font-weight: 700; }
    .ob-city { font-size: 12px; letter-spacing: 0.03em; }
    .ob-head h1 {
      margin: 3mm 0 0;
      font-size: 12px;
      font-weight: 700;
    }
    .ob-body { display: grid; gap: 2.2mm; margin-top: 1mm; }
    .ob-row {
      display: grid;
      grid-template-columns: 22mm 1fr;
      align-items: end;
      gap: 2mm;
      font-size: 10px;
    }
    .ob-row .label { font-weight: 700; }
    .line {
      border-bottom: 1px solid #000;
      min-height: 3.6mm;
      padding: 0 1mm 0.2mm;
      font-size: 10px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .ob-purpose .line {
      white-space: normal;
      min-height: 8mm;
      line-height: 1.2;
      display: flex;
      align-items: flex-end;
      padding-top: 0;
      padding-bottom: 0.6mm;
    }
    .ob-time {
      grid-template-columns: 16mm 1fr 20mm 1fr;
      gap: 2mm;
    }
    .label-right { text-align: right; }
    .ob-return {
      display: flex;
      align-items: center;
      gap: 4mm;
      font-size: 10px;
      margin-top: 0.6mm;
    }
    .check-wrap { display: inline-flex; align-items: center; gap: 1.5mm; font-weight: 700; }
    .check {
      display: inline-block;
      width: 6mm;
      height: 6mm;
      border: 1px solid #000;
    }
    .ob-foot {
      margin-top: 4.5mm;
      text-align: center;
      border-top: 1px solid transparent;
    }
    .sig-name {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.01em;
      border-bottom: 1px solid #000;
      padding-bottom: 1.2mm;
      margin-top: 5.5mm;
    }
    .sig-role {
      margin-top: 1.2mm;
      font-size: 10px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  ${pages
    .map(
      (chunk) => `
  <div class="print-page">
    ${chunk.map((s) => makeSlipMarkup(s)).join("\n")}
  </div>`
    )
    .join("\n")}
</body>
</html>`;
}
