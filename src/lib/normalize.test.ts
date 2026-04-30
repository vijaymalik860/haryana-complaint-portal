import { describe, expect, it } from "vitest";

import { parseCctnsDate } from "@/lib/dates";
import {
  calculateDisposalDays,
  calculatePendingDays,
  chooseResponsibleCode,
  normalizeComplaint,
  statusGroupFromRaw,
} from "@/lib/normalize";

describe("complaint normalization", () => {
  it("groups CCTNS status prefixes", () => {
    expect(statusGroupFromRaw("Disposed- FIR Registered")).toBe("disposed");
    expect(statusGroupFromRaw("Pending-EO Assigned but Report not submitted")).toBe(
      "pending",
    );
    expect(statusGroupFromRaw("")).toBe("unknown");
  });

  it("uses transfer PS when available and submit PS as fallback", () => {
    expect(chooseResponsibleCode("13221005", "13221004")).toBe("13221005");
    expect(chooseResponsibleCode("0", "13221004")).toBe("13221004");
    expect(chooseResponsibleCode(null, "13221004")).toBe("13221004");
  });

  it("parses CCTNS date strings", () => {
    const parsed = parseCctnsDate("01-04-2026 14:51:23");
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(3);
    expect(parsed?.getDate()).toBe(1);
  });

  it("calculates disposal and pending day buckets from registration date", () => {
    const regDate = parseCctnsDate("01-04-2026 00:00:00");
    const disposalDate = parseCctnsDate("09-04-2026 00:00:00");
    const today = new Date(2026, 3, 29);

    expect(calculateDisposalDays(regDate, disposalDate)).toBe(8);
    expect(calculatePendingDays(regDate, today)).toBe(28);
  });

  it("does not store complainant PII fields in normalized complaints", () => {
    const normalized = normalizeComplaint({
      COMPL_REG_NUM: "ABC",
      COMPL_REG_DT: "01-04-2026 00:00:00",
      FIRST_NAME: "Private",
      MOBILE: "9999999999",
      COMPL_DESC: "Sensitive details",
      Status_of_Complaint: "Pending-EO Not Assigned",
      SUBMIT_PS_CD: "13221004",
    });

    expect(normalized.id).toBe("reg:ABC");
    expect(Object.prototype.hasOwnProperty.call(normalized, "FIRST_NAME")).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(normalized, "MOBILE")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(normalized, "COMPL_DESC")).toBe(
      false,
    );
  });
});

