import { describe, expect, it } from "vitest";

import {
  refreshComplaintAggregatesForRange,
  upsertComplaintRecords,
} from "@/lib/ingest";
import { normalizeComplaint, type NormalizedComplaint } from "@/lib/normalize";

describe("complaint upserts", () => {
  it("uses stable IDs so re-syncing the same complaint does not duplicate it", async () => {
    const store = new Map<string, NormalizedComplaint>();
    const fakeDb = {
      complaint: {
        upsert: ({
          where,
          create,
          update,
        }: {
          where: { id: string };
          create: NormalizedComplaint;
          update: Omit<NormalizedComplaint, "id">;
        }) =>
          Promise.resolve().then(() => {
            if (store.has(where.id)) {
              store.set(where.id, { id: where.id, ...update });
            } else {
              store.set(where.id, create);
            }
            return store.get(where.id);
          }),
      },
      $transaction: async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
    };

    const row = {
      COMPL_REG_NUM: "ABC",
      COMPL_REG_DT: "01-04-2026 00:00:00",
      Status_of_Complaint: "Pending-EO Not Assigned",
      SUBMIT_PS_CD: "13221004",
    };
    const first = normalizeComplaint(row);
    const second = normalizeComplaint(row);

    await upsertComplaintRecords(fakeDb as never, [first, second], 10);
    expect(store.size).toBe(1);
    expect(store.has("reg:ABC")).toBe(true);
  });

  it("rebuilds aggregate rows for a date window", async () => {
    const now = new Date("2026-04-29T00:00:00.000Z");
    const complaints = [
      {
        regDate: now,
        districtName: "GURUGRAM",
        responsiblePsCode: "13227086",
        typeOfComplaint: "Fresh complaint",
        classOfIncident: "Cyber",
        complaintSource: "Citizen",
        statusGroup: "disposed",
        disposalDays: 5,
      },
      {
        regDate: now,
        districtName: "GURUGRAM",
        responsiblePsCode: "13227086",
        typeOfComplaint: "Fresh complaint",
        classOfIncident: "Cyber",
        complaintSource: "Citizen",
        statusGroup: "pending",
        disposalDays: null,
      },
      {
        regDate: now,
        districtName: "GURUGRAM",
        responsiblePsCode: "13227086",
        typeOfComplaint: "Fresh complaint",
        classOfIncident: "Cyber",
        complaintSource: "Citizen",
        statusGroup: "disposed",
        disposalDays: null,
      },
    ];

    const captures: {
      daily: Array<Record<string, unknown>>;
      buckets: Array<Record<string, unknown>>;
      state: Record<string, unknown> | null;
    } = {
      daily: [],
      buckets: [],
      state: null,
    };

    const fakeTx = {
      complaintAggDisposalBucketDaily: {
        deleteMany: async () => undefined,
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
          captures.buckets = data;
          return { count: data.length };
        },
      },
      complaintAggDaily: {
        deleteMany: async () => undefined,
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
          captures.daily = data;
          return { count: data.length };
        },
      },
      aggregateRefreshState: {
        upsert: async ({ update }: { update: Record<string, unknown> }) => {
          captures.state = update;
          return update;
        },
      },
    };

    const fakeDb = {
      complaint: {
        findMany: async () => complaints,
      },
      $transaction: async (
        callback: (tx: typeof fakeTx) => Promise<unknown>,
      ) => callback(fakeTx),
    };

    await refreshComplaintAggregatesForRange(
      { from: now, to: now },
      fakeDb as never,
    );

    expect(captures.daily).toHaveLength(2);
    expect(
      captures.daily.find((item) => item.statusGroup === "disposed"),
    ).toMatchObject({
      totalCount: 2,
      disposedDaysSum: 5,
      disposedDaysCount: 1,
      disposedMissingDateCount: 1,
    });
    expect(captures.buckets).toHaveLength(2);
    expect(captures.state).toMatchObject({
      status: "success",
    });
  });
});
