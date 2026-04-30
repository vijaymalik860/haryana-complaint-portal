import ExcelJS from "exceljs";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

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

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function addSummarySheet(workbook: ExcelJS.Workbook, data: DashboardData) {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 18 },
  ];

  const rows: Array<[string, string | number]> = [
    ["Generated at", new Date(data.generatedAt).toLocaleString("en-IN")],
    ["Date from", data.filters.from],
    ["Date to", data.filters.to],
    ["District", data.filters.district],
    ["Complaint type", data.filters.type],
    ["Class of incident", data.filters.classOfIncident],
    ["Complaint source", data.filters.source],
    ["Status", data.filters.status],
    ["Total complaints", data.summary.total],
    ["Disposed", data.summary.disposed],
    ["Pending", data.summary.pending],
    ["Unknown", data.summary.unknown],
    ["Disposed percent", formatPercent(data.summary.disposedPercent)],
    ["Pending percent", formatPercent(data.summary.pendingPercent)],
    ["Pending over 30 days", data.summary.overThirtyPending],
    ["Average disposal days", data.summary.avgDisposalDays ?? "-"],
    ["Disposed with missing disposal date", data.summary.missingDisposalDates],
  ];
  if (data.filters.policeStation !== "all") {
    rows.splice(4, 0, ["Police station", data.filters.policeStation]);
  }

  rows.forEach(([metric, value]) => sheet.addRow({ metric, value }));
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
  rows.forEach((row) => sheet.addRow(row));
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
  rows.forEach((row) => {
    const data: Record<string, string | number | null> = {
      label: row.label,
      total: row.total,
    };
    row.buckets.forEach((bucket) => {
      data[`${bucket.label}:count`] = bucket.count;
      data[`${bucket.label}:percent`] = formatPercent(bucket.percent);
    });
    sheet.addRow(data);
  });
  sheet.getRow(1).font = { bold: true };
}

export async function buildExcelReport(data: DashboardData): Promise<Buffer> {
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

function addPdfRows(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: Array<[string, string]>,
) {
  doc.moveDown();
  doc.fontSize(13).font("Helvetica-Bold").text(title);
  doc.moveDown(0.4);
  doc.fontSize(9).font("Helvetica");
  rows.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`);
  });
}

function addPdfSummaryTable(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: SummaryRow[],
  limit = 12,
) {
  doc.addPage();
  doc.fontSize(13).font("Helvetica-Bold").text(title);
  doc.moveDown(0.4).fontSize(8).font("Helvetica");
  rows.slice(0, limit).forEach((row) => {
    doc.text(
      `${row.label} | Total ${formatNumber(row.total)} | Disposed ${formatNumber(
        row.disposed,
      )} (${formatPercent(row.disposedPercent)}) | Pending ${formatNumber(
        row.pending,
      )} (${formatPercent(row.pendingPercent)})`,
    );
  });
}

function addPdfMatrixTable(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: TimeMatrixRow[],
  limit = 12,
) {
  doc.addPage();
  doc.fontSize(13).font("Helvetica-Bold").text(title);
  doc.moveDown(0.4).fontSize(8).font("Helvetica");
  rows.slice(0, limit).forEach((row) => {
    const buckets = row.buckets
      .map(
        (bucket) =>
          `${bucket.label} ${formatNumber(bucket.count)} (${formatPercent(bucket.percent)})`,
      )
      .join(" | ");
    doc.text(`${row.label} | Total ${formatNumber(row.total)} | ${buckets}`);
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
    ["District", data.filters.district],
    ["Complaint type", data.filters.type],
    ["Class of incident", data.filters.classOfIncident],
    ["Complaint source", data.filters.source],
    ["Status", data.filters.status],
  ];
  if (data.filters.policeStation !== "all") {
    filterRows.splice(2, 0, ["Police station", data.filters.policeStation]);
  }
  addPdfRows(doc, "Filters", filterRows);

  addPdfRows(doc, "Summary", [
    ["Total complaints", formatNumber(data.summary.total)],
    ["Disposed", `${formatNumber(data.summary.disposed)} (${formatPercent(data.summary.disposedPercent)})`],
    ["Pending", `${formatNumber(data.summary.pending)} (${formatPercent(data.summary.pendingPercent)})`],
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
