import { describe, expect, it } from "vitest";

import type { SummaryRow, TimeMatrixRow } from "@/lib/dashboard-types";
import { detailPath } from "@/lib/detail";
import { sortSummaryRows, sortTimeMatrixRows } from "@/lib/sort";

const rows: SummaryRow[] = [
  {
    value: "a",
    label: "A",
    total: 10,
    disposed: 3,
    pending: 7,
    unknown: 0,
    totalSharePercent: 10,
    disposedPercent: 30,
    pendingPercent: 70,
    avgDisposalDays: 2,
  },
  {
    value: "b",
    label: "B",
    total: 20,
    disposed: 18,
    pending: 2,
    unknown: 0,
    totalSharePercent: 20,
    disposedPercent: 90,
    pendingPercent: 10,
    avgDisposalDays: 1,
  },
];

describe("dashboard sorting and drilldown links", () => {
  it.each([
    ["total", "B"],
    ["pending", "A"],
    ["disposed", "B"],
    ["totalSharePercent", "B"],
    ["pendingPercent", "A"],
    ["disposedPercent", "B"],
  ] as const)("sorts summary rows by %s", (key, expectedFirst) => {
    expect(sortSummaryRows(rows, key, "desc")[0].label).toBe(expectedFirst);
  });

  it("builds encoded detail paths with active filters", () => {
    const path = detailPath("class", "Cyber Crimes (other than financial fraud)", {
      from: "2026-04-01",
      to: "2026-04-29",
      district: "GURUGRAM",
      policeStation: "all",
      type: "all",
      classOfIncident: "all",
      source: "all",
      status: "all",
    });

    expect(path).toContain("/details/class/Cyber%20Crimes%20");
    expect(path).toContain("district=GURUGRAM");
  });

  it("sorts time matrix rows by label, total, and bucket count", () => {
    const matrixRows: TimeMatrixRow[] = [
      {
        value: "a",
        label: "A",
        total: 5,
        buckets: [
          { label: "0-7 days", count: 4, percent: 80 },
          { label: ">30 days", count: 1, percent: 20 },
        ],
      },
      {
        value: "b",
        label: "B",
        total: 10,
        buckets: [
          { label: "0-7 days", count: 3, percent: 30 },
          { label: ">30 days", count: 7, percent: 70 },
        ],
      },
    ];

    expect(sortTimeMatrixRows(matrixRows, "total", "desc")[0].label).toBe("B");
    expect(sortTimeMatrixRows(matrixRows, "label", "asc")[0].label).toBe("A");
    expect(sortTimeMatrixRows(matrixRows, "bucket:0-7 days", "desc")[0].label).toBe("A");
  });
});
