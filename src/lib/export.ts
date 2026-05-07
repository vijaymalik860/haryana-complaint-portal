import ExcelJS from "exceljs";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { format } from "date-fns";
import { calculatePendingDays } from "@/lib/normalize";

import type {
  DashboardData,
  SummaryRow,
  TimeMatrixRow,
  TrendRow,
} from "@/lib/dashboard-types";

function formatNumber(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatPercentStr(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatPercentDec(value: number): number {
  return Number((value / 100).toFixed(3));
}

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getStatusLabel(status: string): string {
  return status === "pending-over-30" ? "Pending over 30 days" : capitalizeFirst(status);
}

function addSummarySheet(workbook: ExcelJS.Workbook, data: DashboardData) {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: "Metric", key: "metric", width: 35 },
    { header: "Value", key: "value", width: 25 },
  ];

  const rows: Array<[string, string | number]> = [
    ["Generated at", new Date(data.generatedAt).toLocaleString("en-IN")],
    ["Date from", data.filters.from],
    ["Date to", data.filters.to],
    ["District", capitalizeFirst(data.filters.district)],
    ["Complaint type", capitalizeFirst(data.filters.type)],
    ["Class of incident", capitalizeFirst(data.filters.classOfIncident)],
    ["Complaint source", capitalizeFirst(data.filters.source)],
    ["Status", getStatusLabel(data.filters.status)],
    ["Total complaints", data.summary.total],
    ["Disposed", data.summary.disposed],
    ["Pending", data.summary.pending],
    ["Unknown", data.summary.unknown],
    ["Disposed percent", formatPercentDec(data.summary.disposedPercent)],
    ["Pending percent", formatPercentDec(data.summary.pendingPercent)],
    ["Pending over 30 days", data.summary.overThirtyPending],
    ["Average disposal days", data.summary.avgDisposalDays ?? "-"],
    ["Disposed with missing disposal date", data.summary.missingDisposalDates],
  ];
  if (data.filters.policeStation !== "all") {
    rows.splice(4, 0, ["Police station", data.filters.policeStation]);
  }

  rows.forEach(([metric, value]) => {
    const row = sheet.addRow({ metric, value });
    if (typeof value === "number" && metric.toLowerCase().includes("percent")) {
      row.getCell(2).numFmt = "0.0%";
    }
  });
  sheet.getRow(1).font = { bold: true };
}

function addSummaryRowsSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: SummaryRow[],
) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = [
    { header: "Label", key: "label", width: 34 },
    { header: "Total", key: "total", width: 12 },
    { header: "Disposed", key: "disposed", width: 12 },
    { header: "Pending", key: "pending", width: 12 },
    { header: "Unknown", key: "unknown", width: 12 },
    { header: "Total %", key: "totalSharePercent", width: 12 },
    { header: "Disposed %", key: "disposedPercent", width: 14 },
    { header: "Pending %", key: "pendingPercent", width: 14 },
    { header: "Avg disposal days", key: "avgDisposalDays", width: 18 },
  ];
  rows.forEach((r) => {
    const row = sheet.addRow({
      label: r.label,
      total: r.total,
      disposed: r.disposed,
      pending: r.pending,
      unknown: r.unknown,
      totalSharePercent: formatPercentDec(r.totalSharePercent),
      disposedPercent: formatPercentDec(r.disposedPercent),
      pendingPercent: formatPercentDec(r.pendingPercent),
      avgDisposalDays: r.avgDisposalDays ?? "-",
    });
    row.getCell("totalSharePercent").numFmt = "0.0%";
    row.getCell("disposedPercent").numFmt = "0.0%";
    row.getCell("pendingPercent").numFmt = "0.0%";
  });
  sheet.getRow(1).font = { bold: true };
}

function addTrendSheet(workbook: ExcelJS.Workbook, name: string, rows: TrendRow[]) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = [
    { header: "Period", key: "label", width: 18 },
    { header: "Total", key: "total", width: 12 },
    { header: "Disposed", key: "disposed", width: 12 },
    { header: "Pending", key: "pending", width: 12 },
  ];
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
}

function addMatrixSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: TimeMatrixRow[],
) {
  const sheet = workbook.addWorksheet(name);
  const bucketLabels = rows[0]?.buckets.map((bucket) => bucket.label) ?? [];
  sheet.columns = [
    { header: "Label", key: "label", width: 34 },
    { header: "Total", key: "total", width: 12 },
    ...bucketLabels.flatMap((label) => [
      { header: `${label} count`, key: `${label}:count`, width: 14 },
      { header: `${label} %`, key: `${label}:percent`, width: 12 },
    ]),
  ];
  rows.forEach((r) => {
    const data: Record<string, string | number | null> = {
      label: r.label,
      total: r.total,
    };
    r.buckets.forEach((bucket) => {
      data[`${bucket.label}:count`] = bucket.count;
      data[`${bucket.label}:percent`] = formatPercentDec(bucket.percent);
    });
    const row = sheet.addRow(data);
    r.buckets.forEach((bucket) => {
      row.getCell(`${bucket.label}:percent`).numFmt = "0.0%";
    });
  });
  sheet.getRow(1).font = { bold: true };
}

function addRawDataSheet(
  workbook: ExcelJS.Workbook,
  complaints: any[],
  stationLookup: Map<string, string>
) {
  const sheet = workbook.addWorksheet("Data Records");
  sheet.columns = [
    { header: "Reg No.", key: "regNum", width: 18 },
    { header: "Date", key: "regDate", width: 15 },
    { header: "District", key: "district", width: 15 },
    { header: "Police Station", key: "ps", width: 25 },
    { header: "Category", key: "category", width: 25 },
    { header: "Type", key: "type", width: 25 },
    { header: "Status", key: "status", width: 15 },
    { header: "Disposal Date", key: "disposalDate", width: 15 },
    { header: "Days Pending", key: "pendingDays", width: 15 },
  ];

  complaints.forEach((c) => {
    sheet.addRow({
      regNum: c.regNum || "-",
      regDate: c.regDate ? format(c.regDate, "dd/MM/yyyy") : "-",
      district: c.districtName || "-",
      ps: c.responsiblePsCode ? (stationLookup.get(c.responsiblePsCode) || c.responsiblePsCode) : "-",
      category: c.classOfIncident || "-",
      type: c.typeOfComplaint || "-",
      status: c.statusGroup.toUpperCase(),
      disposalDate: c.disposalDate ? format(c.disposalDate, "dd/MM/yyyy") : "-",
      pendingDays: c.statusGroup === "pending" && c.regDate 
        ? (calculatePendingDays(c.regDate) ?? "-")
        : (c.disposalDays ?? "-"),
    });
  });
  sheet.getRow(1).font = { bold: true };
}

export async function buildExcelReport(
  data: DashboardData,
  rawComplaints?: any[],
  stationLookup?: Map<string, string>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Haryana Police PHQ Complaint Portal";
  workbook.created = new Date();

  addSummarySheet(workbook, data);
  addSummaryRowsSheet(workbook, "Districts", data.districtRows);
  addSummaryRowsSheet(workbook, "Complaint Types", data.complaintTypeRows);
  addSummaryRowsSheet(workbook, "Crime Categories", data.classOfIncidentRows);
  addTrendSheet(workbook, "Monthly Trends", data.monthlyTrends);
  addTrendSheet(workbook, "Yearly Trends", data.yearlyTrends);
  addMatrixSheet(workbook, "Pendency Districts", data.pendencyByDistrict);
  addMatrixSheet(workbook, "Pendency Categories", data.pendencyByClass);
  addMatrixSheet(workbook, "Disposal Districts", data.disposalByDistrict);
  addMatrixSheet(workbook, "Disposal Categories", data.disposalByClass);
  addSummaryRowsSheet(workbook, "Police Stations", data.policeStationRows);
  
  if (rawComplaints && stationLookup) {
    addRawDataSheet(workbook, rawComplaints, stationLookup);
  }

  workbook.worksheets.forEach((sheet) => {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle" };
      });
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  y: number,
  height: number,
  columns: { text: string; x: number; w: number; align: string }[]
) {
  doc.rect(doc.page.margins.left, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, height).stroke();
  columns.forEach((col, i) => {
    if (i > 0) {
      doc.moveTo(col.x - 2, y).lineTo(col.x - 2, y + height).stroke();
    }
    doc.text(col.text, col.x, y + 4, { width: col.w, align: col.align as any, lineBreak: false });
  });
}

function addPdfRows(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: Array<[string, string]>,
) {
  doc.moveDown();
  doc.fontSize(13).font("Helvetica-Bold").text(title);
  doc.moveDown(0.4);
  doc.fontSize(9).font("Helvetica");
  
  const startX = doc.page.margins.left;
  rows.forEach(([label, value]) => {
    doc.font("Helvetica-Bold").text(`${label}:`, startX, doc.y, { continued: true });
    doc.font("Helvetica").text(` ${value}`);
  });
}

function addPdfSummaryTable(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: SummaryRow[],
  limit = 15,
) {
  doc.addPage();
  doc.fontSize(13).font("Helvetica-Bold").text(title);
  doc.moveDown(0.4).fontSize(8).font("Helvetica");
  
  const startX = doc.page.margins.left;
  const colW = [140, 50, 90, 90];
  const colX = [startX, startX + colW[0], startX + colW[0] + colW[1], startX + colW[0] + colW[1] + colW[2]];
  
  const rowHeight = 16;
  
  // Header
  doc.font("Helvetica-Bold");
  drawTableRow(doc, doc.y, rowHeight, [
    { text: "Label", x: colX[0], w: colW[0] - 5, align: "left" },
    { text: "Total", x: colX[1], w: colW[1] - 5, align: "right" },
    { text: "Disposed", x: colX[2], w: colW[2] - 5, align: "right" },
    { text: "Pending", x: colX[3], w: colW[3] - 5, align: "right" },
  ]);
  doc.y += rowHeight;

  // Rows
  doc.font("Helvetica");
  rows.slice(0, limit).forEach((row) => {
    drawTableRow(doc, doc.y, rowHeight, [
      { text: row.label.substring(0, 30), x: colX[0], w: colW[0] - 5, align: "left" },
      { text: formatNumber(row.total), x: colX[1], w: colW[1] - 5, align: "right" },
      { text: `${formatNumber(row.disposed)} (${formatPercentStr(row.disposedPercent)})`, x: colX[2], w: colW[2] - 5, align: "right" },
      { text: `${formatNumber(row.pending)} (${formatPercentStr(row.pendingPercent)})`, x: colX[3], w: colW[3] - 5, align: "right" },
    ]);
    doc.y += rowHeight;
  });
}

function addPdfMatrixTable(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: TimeMatrixRow[],
  limit = 15,
) {
  doc.addPage();
  doc.fontSize(13).font("Helvetica-Bold").text(title);
  doc.moveDown(0.4).fontSize(7).font("Helvetica");
  
  const startX = doc.page.margins.left;
  const colW = [120, 40, ...Array(5).fill(70)];
  let x = startX;
  const colX = colW.map((w) => {
    const current = x;
    x += w;
    return current;
  });
  
  const rowHeight = 16;
  const bucketLabels = rows[0]?.buckets.map((b) => b.label) ?? [];
  
  // Header
  doc.font("Helvetica-Bold");
  const headerCols = [
    { text: "Label", x: colX[0], w: colW[0] - 4, align: "left" },
    { text: "Total", x: colX[1], w: colW[1] - 4, align: "right" },
    ...bucketLabels.map((lbl, i) => ({ text: lbl, x: colX[2+i], w: colW[2+i] - 4, align: "right" }))
  ];
  drawTableRow(doc, doc.y, rowHeight, headerCols);
  doc.y += rowHeight;

  // Rows
  doc.font("Helvetica");
  rows.slice(0, limit).forEach((row) => {
    const rowCols = [
      { text: row.label.substring(0, 25), x: colX[0], w: colW[0] - 4, align: "left" },
      { text: formatNumber(row.total), x: colX[1], w: colW[1] - 4, align: "right" },
      ...row.buckets.map((b, i) => ({
        text: `${formatNumber(b.count)} (${formatPercentStr(b.percent)})`,
        x: colX[2+i], w: colW[2+i] - 4, align: "right"
      }))
    ];
    drawTableRow(doc, doc.y, rowHeight, rowCols);
    doc.y += rowHeight;
  });
}

export async function buildPdfReport(data: DashboardData): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 36, size: "A4" });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(18).font("Helvetica-Bold").text("Haryana Police PHQ");
  doc.fontSize(14).text("Complaint Supervision Dashboard");
  doc
    .moveDown(0.5)
    .fontSize(9)
    .font("Helvetica")
    .text(`Generated: ${new Date(data.generatedAt).toLocaleString("en-IN")}`);

  const filterRows: Array<[string, string]> = [
    ["Date range", `${data.filters.from} to ${data.filters.to}`],
    ["District", capitalizeFirst(data.filters.district)],
    ["Complaint type", capitalizeFirst(data.filters.type)],
    ["Class of incident", capitalizeFirst(data.filters.classOfIncident)],
    ["Complaint source", capitalizeFirst(data.filters.source)],
    ["Status", getStatusLabel(data.filters.status)],
  ];
  if (data.filters.policeStation !== "all") {
    filterRows.splice(2, 0, ["Police station", data.filters.policeStation]);
  }
  addPdfRows(doc, "Filters", filterRows);

  addPdfRows(doc, "Summary", [
    ["Total complaints", formatNumber(data.summary.total)],
    ["Disposed", `${formatNumber(data.summary.disposed)} (${formatPercentStr(data.summary.disposedPercent)})`],
    ["Pending", `${formatNumber(data.summary.pending)} (${formatPercentStr(data.summary.pendingPercent)})`],
    ["Unknown", formatNumber(data.summary.unknown)],
    ["Pending over 30 days", formatNumber(data.summary.overThirtyPending)],
    ["Average disposal days", formatNumber(data.summary.avgDisposalDays)],
    ["Disposed missing disposal date", formatNumber(data.summary.missingDisposalDates)],
  ]);

  addPdfSummaryTable(doc, "District-wise Analysis", data.districtRows);
  addPdfSummaryTable(doc, "Complaint Type Analysis", data.complaintTypeRows);
  addPdfSummaryTable(doc, "Crime Category Analysis", data.classOfIncidentRows);
  addPdfMatrixTable(doc, "Pendency by District", data.pendencyByDistrict);
  addPdfMatrixTable(doc, "Pendency by Crime Category", data.pendencyByClass);
  addPdfMatrixTable(doc, "Disposal by District", data.disposalByDistrict);
  addPdfMatrixTable(doc, "Disposal by Crime Category", data.disposalByClass);
  if (data.policeStationRows.length) {
    addPdfSummaryTable(doc, "Police Station Analysis", data.policeStationRows);
  }

  doc.end();
  return finished;
}
