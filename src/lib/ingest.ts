import type { PrismaClient } from "@prisma/client";
import {
  fetchComplaintRows,
  fetchDistrictRows,
  fetchOfficeRows,
  fetchPoliceStationRows,
} from "@/lib/cctns";
import { chunkDateRange, currentFinancialYearRange } from "@/lib/dates";
import {
  bucketLabelForDays,
  cleanText,
  normalizeCode,
  normalizeComplaint,
  type NormalizedComplaint,
  type RawComplaint,
} from "@/lib/normalize";
import { getDb } from "@/lib/db";

type SyncRange = {
  from: Date;
  to: Date;
};

export type SyncResult = {
  master: {
    districts: number;
    policeStations: number;
    offices: number;
  };
  complaints: {
    fetched: number;
    upserted: number;
    chunks: number;
  };
};

type UpsertCapableDb = Pick<PrismaClient, "$transaction" | "complaint">;
const NULL_KEY = "__null__";
const AGGREGATE_STATE_ID = 1;

export async function upsertComplaintRecords(
  db: UpsertCapableDb,
  records: NormalizedComplaint[],
  batchSize = 250,
): Promise<number> {
  let upserted = 0;

  for (let index = 0; index < records.length; index += batchSize) {
    const batch = records.slice(index, index + batchSize);
    const operations = batch.map((record) => {
      const { id, ...data } = record;
      return db.complaint.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    });

    await db.$transaction(operations);
    upserted += batch.length;
  }

  return upserted;
}

function normalizeAggKey(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : NULL_KEY;
}

function dayStartLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayEndLocal(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

function dayRange(range: SyncRange): { from: Date; to: Date } {
  return {
    from: dayStartLocal(range.from),
    to: dayStartLocal(range.to),
  };
}

export async function refreshComplaintAggregatesForRange(
  range: SyncRange,
  db = getDb(),
) {
  const scopedRange = dayRange(range);
  const rows = await db.complaint.findMany({
    where: {
      regDate: {
        gte: scopedRange.from,
        lte: dayEndLocal(range.to),
      },
    },
    select: {
      regDate: true,
      districtName: true,
      responsiblePsCode: true,
      typeOfComplaint: true,
      classOfIncident: true,
      complaintSource: true,
      statusGroup: true,
      disposalDays: true,
    },
  });

  const now = new Date();
  const dailyMap = new Map<
    string,
    {
      regDate: Date;
      districtKey: string;
      psKey: string;
      typeKey: string;
      classKey: string;
      sourceKey: string;
      statusGroup: string;
      totalCount: number;
      disposedDaysSum: number;
      disposedDaysCount: number;
      disposedMissingDateCount: number;
      createdAt: Date;
      updatedAt: Date;
    }
  >();
  const disposalBucketMap = new Map<
    string,
    {
      regDate: Date;
      districtKey: string;
      psKey: string;
      typeKey: string;
      classKey: string;
      sourceKey: string;
      statusGroup: string;
      disposalBucket: string;
      count: number;
      createdAt: Date;
      updatedAt: Date;
    }
  >();

  rows.forEach((row) => {
    if (!row.regDate) return;

    const regDate = dayStartLocal(row.regDate);
    const districtKey = normalizeAggKey(row.districtName);
    const psKey = normalizeAggKey(row.responsiblePsCode);
    const typeKey = normalizeAggKey(row.typeOfComplaint);
    const classKey = normalizeAggKey(row.classOfIncident);
    const sourceKey = normalizeAggKey(row.complaintSource);
    const statusGroup = row.statusGroup;
    const dailyKey = [
      regDate.toISOString(),
      districtKey,
      psKey,
      typeKey,
      classKey,
      sourceKey,
      statusGroup,
    ].join("|");

    const existingDaily = dailyMap.get(dailyKey);
    if (existingDaily) {
      existingDaily.totalCount += 1;
      if (statusGroup === "disposed") {
        if (typeof row.disposalDays === "number") {
          existingDaily.disposedDaysSum += row.disposalDays;
          existingDaily.disposedDaysCount += 1;
        } else {
          existingDaily.disposedMissingDateCount += 1;
        }
      }
    } else {
      dailyMap.set(dailyKey, {
        regDate,
        districtKey,
        psKey,
        typeKey,
        classKey,
        sourceKey,
        statusGroup,
        totalCount: 1,
        disposedDaysSum:
          statusGroup === "disposed" && typeof row.disposalDays === "number"
            ? row.disposalDays
            : 0,
        disposedDaysCount:
          statusGroup === "disposed" && typeof row.disposalDays === "number"
            ? 1
            : 0,
        disposedMissingDateCount:
          statusGroup === "disposed" && row.disposalDays === null ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (statusGroup !== "disposed") return;
    const disposalBucket = bucketLabelForDays(row.disposalDays);
    const bucketKey = [
      regDate.toISOString(),
      districtKey,
      psKey,
      typeKey,
      classKey,
      sourceKey,
      statusGroup,
      disposalBucket,
    ].join("|");
    const existingBucket = disposalBucketMap.get(bucketKey);
    if (existingBucket) {
      existingBucket.count += 1;
      return;
    }

    disposalBucketMap.set(bucketKey, {
      regDate,
      districtKey,
      psKey,
      typeKey,
      classKey,
      sourceKey,
      statusGroup,
      disposalBucket,
      count: 1,
      createdAt: now,
      updatedAt: now,
    });
  });

  await db.$transaction(
    async (tx) => {
      await tx.complaintAggDisposalBucketDaily.deleteMany({
        where: {
          regDate: {
            gte: scopedRange.from,
            lte: scopedRange.to,
          },
        },
      });
      await tx.complaintAggDaily.deleteMany({
        where: {
          regDate: {
            gte: scopedRange.from,
            lte: scopedRange.to,
          },
        },
      });

      const dailyRows = [...dailyMap.values()];
      if (dailyRows.length) {
        await tx.complaintAggDaily.createMany({ data: dailyRows });
      }

      const disposalRows = [...disposalBucketMap.values()];
      if (disposalRows.length) {
        await tx.complaintAggDisposalBucketDaily.createMany({
          data: disposalRows,
        });
      }

      await tx.aggregateRefreshState.upsert({
        where: { id: AGGREGATE_STATE_ID },
        create: {
          id: AGGREGATE_STATE_ID,
          lastRefreshedAt: now,
          lastRangeFrom: scopedRange.from,
          lastRangeTo: scopedRange.to,
          status: "success",
          message: null,
        },
        update: {
          lastRefreshedAt: now,
          lastRangeFrom: scopedRange.from,
          lastRangeTo: scopedRange.to,
          status: "success",
          message: null,
        },
      });
    },
    {
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}

async function markAggregateRefreshFailed(
  range: SyncRange,
  error: unknown,
  db = getDb(),
) {
  const scopedRange = dayRange(range);
  await db.aggregateRefreshState.upsert({
    where: { id: AGGREGATE_STATE_ID },
    create: {
      id: AGGREGATE_STATE_ID,
      lastRefreshedAt: new Date(),
      lastRangeFrom: scopedRange.from,
      lastRangeTo: scopedRange.to,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    },
    update: {
      lastRefreshedAt: new Date(),
      lastRangeFrom: scopedRange.from,
      lastRangeTo: scopedRange.to,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    },
  });
}

export async function syncMasterData(db = getDb()) {
  const districtsRaw = await fetchDistrictRows();
  const districts = districtsRaw
    .map((row) => ({
      id: normalizeCode(row.ID),
      name: cleanText(row.Name),
    }))
    .filter(
      (district): district is { id: string; name: string } =>
        Boolean(district.id && district.name),
    );

  await db.$transaction(
    districts.map((district) =>
      db.district.upsert({
        where: { id: district.id },
        create: district,
        update: { name: district.name },
      }),
    ),
  );

  let policeStations = 0;
  for (const district of districts) {
    const rows = await fetchPoliceStationRows(district.id);
    const stations = rows
      .map((row) => ({
        id: normalizeCode(row.ID),
        name: cleanText(row.Name),
        districtId: district.id,
        districtName: district.name,
      }))
      .filter(
        (
          station,
        ): station is {
          id: string;
          name: string;
          districtId: string;
          districtName: string;
        } => Boolean(station.id && station.name),
      );

    if (stations.length) {
      await db.$transaction(
        stations.map((station) =>
          db.policeStation.upsert({
            where: { id: station.id },
            create: station,
            update: {
              name: station.name,
              districtId: station.districtId,
              districtName: station.districtName,
            },
          }),
        ),
      );
      policeStations += stations.length;
    }
  }

  const officesRaw = await fetchOfficeRows();
  const offices = officesRaw
    .map((row) => ({
      id: normalizeCode(row.ID),
      name: cleanText(row.Name),
    }))
    .filter(
      (office): office is { id: string; name: string } =>
        Boolean(office.id && office.name),
    );

  if (offices.length) {
    await db.$transaction(
      offices.map((office) =>
        db.office.upsert({
          where: { id: office.id },
          create: office,
          update: { name: office.name },
        }),
      ),
    );
  }

  return {
    districts: districts.length,
    policeStations,
    offices: offices.length,
  };
}

export async function syncComplaintRange(range: SyncRange, db = getDb()) {
  const run = await db.syncRun.create({
    data: {
      kind: "complaints",
      status: "running",
      timeFrom: range.from,
      timeTo: range.to,
    },
  });

  try {
    const rows = (await fetchComplaintRows(range.from, range.to)) as RawComplaint[];
    const syncedAt = new Date();
    const records = rows.map((row) => normalizeComplaint(row, syncedAt));
    const upserted = await upsertComplaintRecords(db, records);
    let aggregateMessage: string | null = null;
    try {
      await refreshComplaintAggregatesForRange(range, db);
    } catch (aggregateError) {
      aggregateMessage = `Aggregate refresh failed: ${
        aggregateError instanceof Error
          ? aggregateError.message
          : String(aggregateError)
      }`;
      await markAggregateRefreshFailed(range, aggregateError, db);
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        fetchedCount: rows.length,
        upsertedCount: upserted,
        finishedAt: new Date(),
        message: aggregateMessage,
      },
    });

    return {
      fetched: rows.length,
      upserted,
    };
  } catch (error) {
    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function syncAll(
  range: SyncRange = currentFinancialYearRange(),
  db = getDb(),
): Promise<SyncResult> {
  const masterRun = await db.syncRun.create({
    data: {
      kind: "master",
      status: "running",
      timeFrom: range.from,
      timeTo: range.to,
    },
  });

  let master = {
    districts: 0,
    policeStations: 0,
    offices: 0,
  };

  try {
    master = await syncMasterData(db);
    await db.syncRun.update({
      where: { id: masterRun.id },
      data: {
        status: "success",
        fetchedCount: master.districts + master.policeStations + master.offices,
        upsertedCount: master.districts + master.policeStations + master.offices,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    await db.syncRun.update({
      where: { id: masterRun.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }

  let fetched = 0;
  let upserted = 0;
  const chunks = chunkDateRange(range.from, range.to, 7);

  for (const chunk of chunks) {
    const result = await syncComplaintRange(chunk, db);
    fetched += result.fetched;
    upserted += result.upserted;
  }

  return {
    master,
    complaints: {
      fetched,
      upserted,
      chunks: chunks.length,
    },
  };
}
