import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeDb = Record<string, unknown>;

let fakeDb: FakeDb;

vi.mock("@/lib/db", () => ({
  getDb: () => fakeDb,
}));

function dayStartUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

describe("aggregate reporting path", () => {
  beforeEach(() => {
    const complaints = [
      {
        id: "r1",
        regNum: "1",
        districtName: "A",
        typeOfComplaint: "Fresh",
        classOfIncident: "Cyber",
        complaintSource: "Citizen",
        complaintPurpose: "Purpose",
        statusRaw: "Disposed-Closed",
        statusGroup: "disposed",
        regDate: new Date("2026-04-01T10:00:00.000Z"),
        disposalDate: new Date("2026-04-03T10:00:00.000Z"),
        disposalDays: 2,
        responsiblePsCode: "PS1",
        syncedAt: new Date("2026-04-29T00:00:00.000Z"),
      },
      {
        id: "r2",
        regNum: "2",
        districtName: "A",
        typeOfComplaint: "Fresh",
        classOfIncident: "Cyber",
        complaintSource: "Citizen",
        complaintPurpose: "Purpose",
        statusRaw: "Pending-EO Assigned but Report not submitted",
        statusGroup: "pending",
        regDate: new Date("2026-04-02T10:00:00.000Z"),
        disposalDate: null,
        disposalDays: null,
        responsiblePsCode: "PS1",
        syncedAt: new Date("2026-04-29T00:00:00.000Z"),
      },
      {
        id: "r3",
        regNum: "3",
        districtName: "B",
        typeOfComplaint: "Fresh",
        classOfIncident: "Financial",
        complaintSource: "Portal",
        complaintPurpose: "Purpose",
        statusRaw: null,
        statusGroup: "unknown",
        regDate: new Date("2026-04-03T10:00:00.000Z"),
        disposalDate: null,
        disposalDays: null,
        responsiblePsCode: "PS2",
        syncedAt: new Date("2026-04-29T00:00:00.000Z"),
      },
    ];

    const daily = [
      {
        regDate: dayStartUtc(complaints[0].regDate),
        districtKey: "A",
        psKey: "PS1",
        typeKey: "Fresh",
        classKey: "Cyber",
        sourceKey: "Citizen",
        statusGroup: "disposed",
        totalCount: 1,
        disposedDaysSum: 2,
        disposedDaysCount: 1,
        disposedMissingDateCount: 0,
      },
      {
        regDate: dayStartUtc(complaints[1].regDate),
        districtKey: "A",
        psKey: "PS1",
        typeKey: "Fresh",
        classKey: "Cyber",
        sourceKey: "Citizen",
        statusGroup: "pending",
        totalCount: 1,
        disposedDaysSum: 0,
        disposedDaysCount: 0,
        disposedMissingDateCount: 0,
      },
      {
        regDate: dayStartUtc(complaints[2].regDate),
        districtKey: "B",
        psKey: "PS2",
        typeKey: "Fresh",
        classKey: "Financial",
        sourceKey: "Portal",
        statusGroup: "unknown",
        totalCount: 1,
        disposedDaysSum: 0,
        disposedDaysCount: 0,
        disposedMissingDateCount: 0,
      },
    ];

    const disposal = [
      {
        regDate: dayStartUtc(complaints[0].regDate),
        districtKey: "A",
        psKey: "PS1",
        typeKey: "Fresh",
        classKey: "Cyber",
        sourceKey: "Citizen",
        statusGroup: "disposed",
        disposalBucket: "0-7 days",
        count: 1,
      },
    ];

    const groupDaily = (by: string[]) => {
      const map = new Map<string, Record<string, unknown>>();
      for (const row of daily) {
        const key = by.map((field) => String((row as Record<string, unknown>)[field])).join("|");
        const existing = map.get(key);
        if (existing) {
          const sum = existing._sum as Record<string, number>;
          sum.totalCount = (sum.totalCount ?? 0) + row.totalCount;
          sum.disposedDaysSum = (sum.disposedDaysSum ?? 0) + row.disposedDaysSum;
          sum.disposedDaysCount = (sum.disposedDaysCount ?? 0) + row.disposedDaysCount;
          sum.disposedMissingDateCount =
            (sum.disposedMissingDateCount ?? 0) + row.disposedMissingDateCount;
        } else {
          const base: Record<string, unknown> = { _sum: {} };
          by.forEach((field) => {
            base[field] = (row as Record<string, unknown>)[field];
          });
          base._sum = {
            totalCount: row.totalCount,
            disposedDaysSum: row.disposedDaysSum,
            disposedDaysCount: row.disposedDaysCount,
            disposedMissingDateCount: row.disposedMissingDateCount,
          };
          map.set(key, base);
        }
      }
      return [...map.values()];
    };

    const groupDisposal = (by: string[]) => {
      const map = new Map<string, Record<string, unknown>>();
      for (const row of disposal) {
        const key = by.map((field) => String((row as Record<string, unknown>)[field])).join("|");
        const existing = map.get(key);
        if (existing) {
          const sum = existing._sum as Record<string, number>;
          sum.count = (sum.count ?? 0) + row.count;
        } else {
          const base: Record<string, unknown> = { _sum: {} };
          by.forEach((field) => {
            base[field] = (row as Record<string, unknown>)[field];
          });
          base._sum = { count: row.count };
          map.set(key, base);
        }
      }
      return [...map.values()];
    };

    fakeDb = {
      aggregateRefreshState: {
        findUnique: async () => ({ status: "success" }),
      },
      district: {
        findMany: async () => [{ name: "A" }, { name: "B" }],
      },
      policeStation: {
        findMany: async () => [
          { id: "PS1", name: "Station 1", districtName: "A" },
          { id: "PS2", name: "Station 2", districtName: "B" },
        ],
      },
      syncRun: {
        findFirst: async () => ({
          status: "success",
          finishedAt: new Date("2026-04-29T00:00:00.000Z"),
          fetchedCount: 3,
          upsertedCount: 3,
          message: null,
          timeFrom: new Date("2026-04-01T00:00:00.000Z"),
          timeTo: new Date("2026-04-29T00:00:00.000Z"),
        }),
      },
      complaint: {
        aggregate: async () => ({
          _count: { _all: complaints.length },
          _min: { regDate: complaints[0].regDate },
          _max: { regDate: complaints[2].regDate },
        }),
        findMany: async (args: Record<string, unknown>) => {
          const select = args.select as Record<string, unknown> | undefined;
          if (args.distinct && select?.typeOfComplaint) {
            return [{ typeOfComplaint: "Fresh" }];
          }
          if (args.distinct && select?.classOfIncident) {
            return [{ classOfIncident: "Cyber" }, { classOfIncident: "Financial" }];
          }
          if (args.distinct && select?.complaintSource) {
            return [{ complaintSource: "Citizen" }, { complaintSource: "Portal" }];
          }
          if ((args.orderBy as Record<string, unknown>)?.syncedAt) {
            return complaints;
          }
          return complaints;
        },
      },
      complaintAggDaily: {
        groupBy: async ({ by }: { by: string[] }) => groupDaily(by),
      },
      complaintAggDisposalBucketDaily: {
        groupBy: async ({ by }: { by: string[] }) => groupDisposal(by),
      },
    };
  });

  it("matches key dashboard totals between live and aggregate paths", async () => {
    const reporting = await import("@/lib/reporting");
    const filters = reporting.filtersFromSearchParams({
      from: "2026-04-01",
      to: "2026-04-29",
    });

    const live = await reporting.getDashboardDataLive(filters);
    const aggregated = await reporting.getDashboardDataFromAggregates(filters);

    expect(aggregated.summary).toEqual(live.summary);
    expect(aggregated.districtRows).toEqual(live.districtRows);
    expect(aggregated.complaintTypeRows).toEqual(live.complaintTypeRows);
    expect(aggregated.classOfIncidentRows).toEqual(live.classOfIncidentRows);
    expect(aggregated.disposalBuckets).toEqual(live.disposalBuckets);
  });
});
