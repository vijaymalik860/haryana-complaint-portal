import { describe, expect, it } from "vitest";

import type { DashboardFilters } from "@/lib/dashboard-types";
import {
  buildDisposalMatrix,
  buildPendencyMatrix,
  filtersFromSearchParams,
  makeWhere,
  summarizeRows,
  type ComplaintRow,
} from "@/lib/reporting";

const baseFilters: DashboardFilters = {
  from: "2026-04-01",
  to: "2026-04-29",
  district: "all",
  policeStation: "all",
  type: "all",
  classOfIncident: "all",
  source: "all",
  status: "all",
};

describe("dashboard reporting", () => {
  it("parses class of incident from search params", () => {
    const filters = filtersFromSearchParams({
      from: "2026-04-01",
      to: "2026-04-29",
      classOfIncident: "Crime Against Women",
    });

    expect(filters.classOfIncident).toBe("Crime Against Women");
  });

  it("adds class of incident to Prisma where filters", () => {
    const where = makeWhere({
      ...baseFilters,
      classOfIncident: "Cyber Financial Fraud",
    });

    expect(where.classOfIncident).toBe("Cyber Financial Fraud");
  });

  it("calculates row percentages against row and active totals", () => {
    const rows: ComplaintRow[] = [
      {
        districtName: "A",
        typeOfComplaint: "Fresh complaint",
        classOfIncident: "Miscellaneous",
        complaintSource: "Citizen",
        statusGroup: "disposed",
        regDate: null,
        disposalDays: 2,
        disposalDate: null,
        responsiblePsCode: null,
      },
      {
        districtName: "A",
        typeOfComplaint: "Fresh complaint",
        classOfIncident: "Miscellaneous",
        complaintSource: "Citizen",
        statusGroup: "pending",
        regDate: null,
        disposalDays: null,
        disposalDate: null,
        responsiblePsCode: null,
      },
    ];

    const summary = summarizeRows("A", rows, 10, "A");
    expect(summary.totalSharePercent).toBe(20);
    expect(summary.disposedPercent).toBe(50);
    expect(summary.pendingPercent).toBe(50);
  });

  it("builds district pendency matrix percentages against each row total", () => {
    const rows: ComplaintRow[] = [
      {
        districtName: "A",
        typeOfComplaint: null,
        classOfIncident: "Misc",
        complaintSource: null,
        statusGroup: "pending",
        regDate: new Date("2026-04-28T00:00:00.000Z"),
        disposalDays: null,
        disposalDate: null,
        responsiblePsCode: null,
      },
      {
        districtName: "A",
        typeOfComplaint: null,
        classOfIncident: "Misc",
        complaintSource: null,
        statusGroup: "pending",
        regDate: new Date("2026-04-10T00:00:00.000Z"),
        disposalDays: null,
        disposalDate: null,
        responsiblePsCode: null,
      },
      {
        districtName: "B",
        typeOfComplaint: null,
        classOfIncident: "Misc",
        complaintSource: null,
        statusGroup: "disposed",
        regDate: null,
        disposalDays: 2,
        disposalDate: null,
        responsiblePsCode: null,
      },
    ];

    const [district] = buildPendencyMatrix(
      rows,
      (row) => row.districtName,
      (row) => row.districtName,
      "Not available",
      new Date("2026-04-29T00:00:00.000Z"),
    );

    expect(district.label).toBe("A");
    expect(district.total).toBe(2);
    expect(district.buckets.find((bucket) => bucket.label === "0-7 days")).toMatchObject({
      count: 1,
      percent: 50,
    });
    expect(district.buckets.find((bucket) => bucket.label === "16-30 days")).toMatchObject({
      count: 1,
      percent: 50,
    });
  });

  it("builds disposal matrix with missing disposal date bucket", () => {
    const rows: ComplaintRow[] = [
      {
        districtName: "A",
        typeOfComplaint: null,
        classOfIncident: "Misc",
        complaintSource: null,
        statusGroup: "disposed",
        regDate: null,
        disposalDays: 5,
        disposalDate: null,
        responsiblePsCode: null,
      },
      {
        districtName: "A",
        typeOfComplaint: null,
        classOfIncident: "Misc",
        complaintSource: null,
        statusGroup: "disposed",
        regDate: null,
        disposalDays: null,
        disposalDate: null,
        responsiblePsCode: null,
      },
    ];

    const [district] = buildDisposalMatrix(
      rows,
      (row) => row.districtName,
      (row) => row.districtName,
    );

    expect(district.total).toBe(2);
    expect(district.buckets.find((bucket) => bucket.label === "Missing date")).toMatchObject({
      count: 1,
      percent: 50,
    });
  });
});
