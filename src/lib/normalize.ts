import { createHash } from "node:crypto";

import type { StatusGroup } from "@/lib/dashboard-types";
import {
  calendarDaysBetween,
  indiaTodayDate,
  parseCctnsDate,
} from "@/lib/dates";

export type RawComplaint = Record<string, unknown>;

export type NormalizedComplaint = {
  id: string;
  regNum: string | null;
  srNo: string | null;
  districtName: string | null;
  typeOfComplaint: string | null;
  complaintSource: string | null;
  receptionMode: string | null;
  incidentType: string | null;
  classOfIncident: string | null;
  respondentCategories: string | null;
  complainantType: string | null;
  complaintPurpose: string | null;
  statusRaw: string | null;
  statusGroup: StatusGroup;
  regDate: Date | null;
  disposalDate: Date | null;
  disposalDays: number | null;
  submitPsCode: string | null;
  transferPsCode: string | null;
  responsiblePsCode: string | null;
  submitOfficeCode: string | null;
  transferOfficeCode: string | null;
  responsibleOfficeCode: string | null;
  syncedAt: Date;
};

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\u00a0/g, " ").trim();
  return normalized && normalized !== "0" ? normalized : null;
}

export function normalizeCode(value: unknown): string | null {
  const text = cleanText(value);
  return text && text !== "0" ? text : null;
}

export function statusGroupFromRaw(status: unknown): StatusGroup {
  const text = cleanText(status)?.toLowerCase() ?? "";
  if (text.startsWith("disposed-") || text === "disposed") return "disposed";
  if (text.startsWith("pending-") || text === "pending") return "pending";
  return "unknown";
}

export function chooseResponsibleCode(
  transferCode: unknown,
  submitCode: unknown,
): string | null {
  return normalizeCode(transferCode) ?? normalizeCode(submitCode);
}

export function calculateDisposalDays(
  regDate: Date | null,
  disposalDate: Date | null,
): number | null {
  if (!regDate || !disposalDate) return null;
  return Math.max(0, calendarDaysBetween(disposalDate, regDate));
}

export function calculatePendingDays(
  regDate: Date | null,
  today = indiaTodayDate(),
): number | null {
  if (!regDate) return null;
  return Math.max(0, calendarDaysBetween(today, regDate));
}

export function stableComplaintId(row: RawComplaint): string {
  const regNum = cleanText(row.COMPL_REG_NUM);
  if (regNum) return `reg:${regNum}`;

  const srNo = cleanText(row.COMPL_SRNO);
  if (srNo) return `sr:${srNo}`;

  const fallback = [
    row.DISTRICT,
    row.COMPL_REG_DT,
    row.SUBMIT_PS_CD,
    row.TRANSFER_PS_CD,
    row.Type_of_Complaint,
    row.Status_of_Complaint,
  ]
    .map((value) => cleanText(value) ?? "")
    .join("|");

  return `hash:${createHash("sha256").update(fallback).digest("hex")}`;
}

export function normalizeComplaint(
  row: RawComplaint,
  syncedAt = new Date(),
): NormalizedComplaint {
  const regDate = parseCctnsDate(row.COMPL_REG_DT);
  const statusRaw = cleanText(row.Status_of_Complaint);
  const statusGroup = statusGroupFromRaw(statusRaw);
  const disposalDate = parseCctnsDate(row.Disposal_Date);
  const submitPsCode = normalizeCode(row.SUBMIT_PS_CD);
  const transferPsCode = normalizeCode(row.TRANSFER_PS_CD);
  const submitOfficeCode = normalizeCode(row.SUBMIT_OFFICE_CD);
  const transferOfficeCode = normalizeCode(row.TRANSFER_OFFICE_CD);

  return {
    id: stableComplaintId(row),
    regNum: cleanText(row.COMPL_REG_NUM),
    srNo: cleanText(row.COMPL_SRNO),
    districtName: cleanText(row.DISTRICT),
    typeOfComplaint: cleanText(row.Type_of_Complaint),
    complaintSource: cleanText(row.Complaint_Source),
    receptionMode: cleanText(row.RECEPTION_MODE),
    incidentType: cleanText(row.INCIDENT_TYPE),
    classOfIncident: cleanText(row.Class_of_Incident),
    respondentCategories: cleanText(row.Respondent_Categories),
    complainantType: cleanText(row.COMPLAINANT_TYPE),
    complaintPurpose: cleanText(row.COMPLAINT_PURPOSE),
    statusRaw,
    statusGroup,
    regDate,
    disposalDate,
    disposalDays:
      statusGroup === "disposed"
        ? calculateDisposalDays(regDate, disposalDate)
        : null,
    submitPsCode,
    transferPsCode,
    responsiblePsCode: chooseResponsibleCode(transferPsCode, submitPsCode),
    submitOfficeCode,
    transferOfficeCode,
    responsibleOfficeCode: chooseResponsibleCode(
      transferOfficeCode,
      submitOfficeCode,
    ),
    syncedAt,
  };
}

export function bucketLabelForDays(days: number | null): string {
  if (days === null) return "Missing date";
  if (days <= 7) return "0-7 days";
  if (days <= 15) return "8-15 days";
  if (days <= 30) return "16-30 days";
  return ">30 days";
}

export const AGE_BUCKETS = ["0-7 days", "8-15 days", "16-30 days", ">30 days"];

