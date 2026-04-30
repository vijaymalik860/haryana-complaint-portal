import type {
  ComplaintAggDaily,
  ComplaintAggDisposalBucketDaily,
  Prisma,
} from "@prisma/client";
import type {
  BucketRow,
  DashboardData,
  DashboardFilters,
  DatabaseOverview,
  OptionItem,
  SummaryRow,
  TimeMatrixRow,
  TrendRow,
} from "@/lib/dashboard-types";
import {
  AGE_BUCKETS,
  bucketLabelForDays,
  calculatePendingDays,
} from "@/lib/normalize";
import {
  currentFinancialYearRange,
  endOfInputDay,
  indiaTodayDate,
  parseInputDate,
  toInputDate,
} from "@/lib/dates";
import { getDb } from "@/lib/db";

export type ComplaintRow = {
  districtName: string | null;
  typeOfComplaint: string | null;
  classOfIncident: string | null;
  complaintSource: string | null;
  statusGroup: string;
  regDate: Date | null;
  disposalDays: number | null;
  disposalDate: Date | null;
  responsiblePsCode: string | null;
};

const DEFAULT_FILTER_VALUE = "all";
const NULL_KEY = "__null__";
const AGGREGATE_STATE_ID = 1;
const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;

type MetadataLists = {
  districts: OptionItem[];
  policeStations: OptionItem[];
  complaintTypes: string[];
  incidentClasses: string[];
  complaintSources: string[];
};

let metadataCache:
  | {
      expiresAt: number;
      data: MetadataLists;
    }
  | null = null;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeAggKey(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : NULL_KEY;
}

function readAggKey(value: string): string | null {
  return value === NULL_KEY ? null : value;
}

function filterFromDate(filters: DashboardFilters): Date | null {
  return parseInputDate(filters.from);
}

function filterToDate(filters: DashboardFilters): Date | null {
  return parseInputDate(filters.to);
}

export function filtersFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): DashboardFilters {
  const currentFy = currentFinancialYearRange();
  const from = firstParam(searchParams.from) ?? toInputDate(currentFy.from);
  const to = firstParam(searchParams.to) ?? toInputDate(currentFy.to);
  const status = firstParam(searchParams.status);

  return {
    from,
    to,
    district: firstParam(searchParams.district) ?? DEFAULT_FILTER_VALUE,
    policeStation:
      firstParam(searchParams.policeStation) ?? DEFAULT_FILTER_VALUE,
    type: firstParam(searchParams.type) ?? DEFAULT_FILTER_VALUE,
    classOfIncident:
      firstParam(searchParams.classOfIncident) ?? DEFAULT_FILTER_VALUE,
    source: firstParam(searchParams.source) ?? DEFAULT_FILTER_VALUE,
    status:
      status === "disposed" || status === "pending" || status === "unknown"
        ? status
        : DEFAULT_FILTER_VALUE,
  };
}

export function filtersToQuery(filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== DEFAULT_FILTER_VALUE) {
      params.set(key, value);
    }
  });
  params.set("from", filters.from);
  params.set("to", filters.to);
  return params;
}

export function percent(part: number, total: number): number {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1),
  );
}

export function summarizeRows(
  label: string,
  rows: ComplaintRow[],
  activeTotal = rows.length,
  value: string | null = label,
): SummaryRow {
  const total = rows.length;
  const disposed = rows.filter((row) => row.statusGroup === "disposed").length;
  const pending = rows.filter((row) => row.statusGroup === "pending").length;
  const unknown = total - disposed - pending;
  const disposalValues = rows
    .map((row) => row.disposalDays)
    .filter((dayValue): dayValue is number => typeof dayValue === "number");

  return {
    value,
    label,
    total,
    disposed,
    pending,
    unknown,
    totalSharePercent: percent(total, activeTotal),
    disposedPercent: percent(disposed, total),
    pendingPercent: percent(pending, total),
    avgDisposalDays: average(disposalValues),
  };
}

function groupSummary(
  rows: ComplaintRow[],
  labelForRow: (row: ComplaintRow) => string | null,
  valueForRow: (row: ComplaintRow) => string | null,
  activeTotal = rows.length,
  labelFallback = "Not available",
): SummaryRow[] {
  const groups = new Map<
    string,
    { label: string; value: string | null; rows: ComplaintRow[] }
  >();
  rows.forEach((row) => {
    const value = valueForRow(row)?.trim() || null;
    const label = labelForRow(row)?.trim() || labelFallback;
    const key = value ?? `missing:${label}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(key, { label, value, rows: [row] });
    }
  });

  return [...groups.values()]
    .map((group) =>
      summarizeRows(group.label, group.rows, activeTotal, group.value),
    )
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function summarizeAggregateRows(
  label: string,
  rows: ComplaintAggDaily[],
  activeTotal: number,
  value: string | null = label,
): SummaryRow {
  let total = 0;
  let disposed = 0;
  let pending = 0;
  let unknown = 0;
  let disposedDaysSum = 0;
  let disposedDaysCount = 0;

  rows.forEach((row) => {
    total += row.totalCount;
    if (row.statusGroup === "disposed") {
      disposed += row.totalCount;
      disposedDaysSum += row.disposedDaysSum;
      disposedDaysCount += row.disposedDaysCount;
    } else if (row.statusGroup === "pending") {
      pending += row.totalCount;
    } else {
      unknown += row.totalCount;
    }
  });

  return {
    value,
    label,
    total,
    disposed,
    pending,
    unknown,
    totalSharePercent: percent(total, activeTotal),
    disposedPercent: percent(disposed, total),
    pendingPercent: percent(pending, total),
    avgDisposalDays:
      disposedDaysCount > 0
        ? Number((disposedDaysSum / disposedDaysCount).toFixed(1))
        : null,
  };
}

export function groupAggregateSummary(
  rows: ComplaintAggDaily[],
  labelForRow: (row: ComplaintAggDaily) => string | null,
  valueForRow: (row: ComplaintAggDaily) => string | null,
  activeTotal: number,
  labelFallback = "Not available",
): SummaryRow[] {
  const groups = new Map<
    string,
    { label: string; value: string | null; rows: ComplaintAggDaily[] }
  >();

  rows.forEach((row) => {
    const value = valueForRow(row)?.trim() || null;
    const label = labelForRow(row)?.trim() || labelFallback;
    const key = value ?? `missing:${label}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, { label, value, rows: [row] });
    }
  });

  return [...groups.values()]
    .map((group) =>
      summarizeAggregateRows(group.label, group.rows, activeTotal, group.value),
    )
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function trendKey(date: Date | null, type: "month" | "year"): string | null {
  if (!date) return null;
  const year = date.getFullYear();
  if (type === "year") return String(year);
  return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildTrends(rows: ComplaintRow[], type: "month" | "year"): TrendRow[] {
  const groups = new Map<string, ComplaintRow[]>();
  rows.forEach((row) => {
    const key = trendKey(row.regDate, type);
    if (!key) return;
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, groupRows]) => ({
      label,
      total: groupRows.length,
      disposed: groupRows.filter((row) => row.statusGroup === "disposed").length,
      pending: groupRows.filter((row) => row.statusGroup === "pending").length,
    }));
}

export function buildAggregateTrends(
  rows: ComplaintAggDaily[],
  type: "month" | "year",
): TrendRow[] {
  const groups = new Map<
    string,
    { total: number; disposed: number; pending: number }
  >();

  rows.forEach((row) => {
    const key = trendKey(row.regDate, type);
    if (!key) return;

    const group = groups.get(key) ?? { total: 0, disposed: 0, pending: 0 };
    group.total += row.totalCount;
    if (row.statusGroup === "disposed") {
      group.disposed += row.totalCount;
    } else if (row.statusGroup === "pending") {
      group.pending += row.totalCount;
    }
    groups.set(key, group);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, values]) => ({ label, ...values }));
}

function bucketRows(
  labels: string[],
  counts: Map<string, number>,
  total: number,
): BucketRow[] {
  return labels.map((label) => ({
    label,
    count: counts.get(label) ?? 0,
    percent: percent(counts.get(label) ?? 0, total),
  }));
}

function buildPendencyBuckets(rows: ComplaintRow[]): BucketRow[] {
  const today = indiaTodayDate();
  const pendingRows = rows.filter((row) => row.statusGroup === "pending");
  const counts = new Map<string, number>();

  pendingRows.forEach((row) => {
    const days = calculatePendingDays(row.regDate, today);
    if (days === null) return;
    const label = bucketLabelForDays(days);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return bucketRows(AGE_BUCKETS, counts, pendingRows.length);
}

export function buildAggregatePendencyBuckets(
  rows: ComplaintAggDaily[],
): BucketRow[] {
  const today = indiaTodayDate();
  const counts = new Map<string, number>();
  let total = 0;

  rows.forEach((row) => {
    if (row.statusGroup !== "pending") return;
    const days = calculatePendingDays(row.regDate, today);
    if (days === null) return;
    const label = bucketLabelForDays(days);
    counts.set(label, (counts.get(label) ?? 0) + row.totalCount);
    total += row.totalCount;
  });

  return bucketRows(AGE_BUCKETS, counts, total);
}

function buildDisposalBuckets(rows: ComplaintRow[]): BucketRow[] {
  const disposedRows = rows.filter((row) => row.statusGroup === "disposed");
  const labels = [...AGE_BUCKETS, "Missing date"];
  const counts = new Map<string, number>();

  disposedRows.forEach((row) => {
    const label = bucketLabelForDays(row.disposalDays);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return bucketRows(labels, counts, disposedRows.length);
}

export function buildAggregateDisposalBuckets(
  rows: ComplaintAggDisposalBucketDaily[],
): BucketRow[] {
  const labels = [...AGE_BUCKETS, "Missing date"];
  const counts = new Map<string, number>();
  let total = 0;

  rows.forEach((row) => {
    counts.set(row.disposalBucket, (counts.get(row.disposalBucket) ?? 0) + row.count);
    total += row.count;
  });

  return bucketRows(labels, counts, total);
}

function buildTimeMatrix(
  rows: ComplaintRow[],
  labels: string[],
  labelForRow: (row: ComplaintRow) => string | null,
  valueForRow: (row: ComplaintRow) => string | null,
  bucketForRow: (row: ComplaintRow) => string | null,
  labelFallback = "Not available",
): TimeMatrixRow[] {
  const groups = new Map<
    string,
    { label: string; value: string | null; rows: ComplaintRow[] }
  >();

  rows.forEach((row) => {
    const value = valueForRow(row)?.trim() || null;
    const label = labelForRow(row)?.trim() || labelFallback;
    const key = value ?? `missing:${label}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(key, { label, value, rows: [row] });
    }
  });

  return [...groups.values()]
    .map((group) => {
      const counts = new Map(labels.map((label) => [label, 0]));
      group.rows.forEach((row) => {
        const bucket = bucketForRow(row);
        if (!bucket || !counts.has(bucket)) return;
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      });

      return {
        value: group.value,
        label: group.label,
        total: group.rows.length,
        buckets: labels.map((label) => {
          const count = counts.get(label) ?? 0;
          return {
            label,
            count,
            percent: percent(count, group.rows.length),
          };
        }),
      };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function buildAggregateTimeMatrix(
  rows: ComplaintAggDaily[],
  labels: string[],
  labelForRow: (row: ComplaintAggDaily) => string | null,
  valueForRow: (row: ComplaintAggDaily) => string | null,
  bucketForRow: (row: ComplaintAggDaily) => string | null,
  labelFallback = "Not available",
): TimeMatrixRow[] {
  const groups = new Map<
    string,
    {
      label: string;
      value: string | null;
      total: number;
      buckets: Map<string, number>;
    }
  >();

  rows.forEach((row) => {
    const value = valueForRow(row)?.trim() || null;
    const label = labelForRow(row)?.trim() || labelFallback;
    const key = value ?? `missing:${label}`;
    const bucket = bucketForRow(row);
    if (!bucket) return;

    const group =
      groups.get(key) ??
      {
        label,
        value,
        total: 0,
        buckets: new Map(labels.map((item) => [item, 0])),
      };

    group.total += row.totalCount;
    if (group.buckets.has(bucket)) {
      group.buckets.set(bucket, (group.buckets.get(bucket) ?? 0) + row.totalCount);
    }
    groups.set(key, group);
  });

  return [...groups.values()]
    .map((group) => ({
      value: group.value,
      label: group.label,
      total: group.total,
      buckets: labels.map((label) => {
        const count = group.buckets.get(label) ?? 0;
        return {
          label,
          count,
          percent: percent(count, group.total),
        };
      }),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function buildAggregateDisposalMatrix(
  rows: ComplaintAggDisposalBucketDaily[],
  labels: string[],
  labelForRow: (row: ComplaintAggDisposalBucketDaily) => string | null,
  valueForRow: (row: ComplaintAggDisposalBucketDaily) => string | null,
  labelFallback = "Not available",
): TimeMatrixRow[] {
  const groups = new Map<
    string,
    {
      label: string;
      value: string | null;
      total: number;
      buckets: Map<string, number>;
    }
  >();

  rows.forEach((row) => {
    const value = valueForRow(row)?.trim() || null;
    const label = labelForRow(row)?.trim() || labelFallback;
    const key = value ?? `missing:${label}`;
    const group =
      groups.get(key) ??
      {
        label,
        value,
        total: 0,
        buckets: new Map(labels.map((item) => [item, 0])),
      };

    group.total += row.count;
    if (group.buckets.has(row.disposalBucket)) {
      group.buckets.set(
        row.disposalBucket,
        (group.buckets.get(row.disposalBucket) ?? 0) + row.count,
      );
    }
    groups.set(key, group);
  });

  return [...groups.values()]
    .map((group) => ({
      value: group.value,
      label: group.label,
      total: group.total,
      buckets: labels.map((label) => {
        const count = group.buckets.get(label) ?? 0;
        return {
          label,
          count,
          percent: percent(count, group.total),
        };
      }),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function buildPendencyMatrix(
  rows: ComplaintRow[],
  labelForRow: (row: ComplaintRow) => string | null,
  valueForRow: (row: ComplaintRow) => string | null,
  labelFallback = "Not available",
  today = indiaTodayDate(),
): TimeMatrixRow[] {
  return buildTimeMatrix(
    rows.filter((row) => row.statusGroup === "pending"),
    AGE_BUCKETS,
    labelForRow,
    valueForRow,
    (row) => {
      const days = calculatePendingDays(row.regDate, today);
      return days === null ? null : bucketLabelForDays(days);
    },
    labelFallback,
  );
}

export function buildDisposalMatrix(
  rows: ComplaintRow[],
  labelForRow: (row: ComplaintRow) => string | null,
  valueForRow: (row: ComplaintRow) => string | null,
  labelFallback = "Not available",
): TimeMatrixRow[] {
  return buildTimeMatrix(
    rows.filter((row) => row.statusGroup === "disposed"),
    [...AGE_BUCKETS, "Missing date"],
    labelForRow,
    valueForRow,
    (row) => bucketLabelForDays(row.disposalDays),
    labelFallback,
  );
}

export function makeWhere(filters: DashboardFilters): Prisma.ComplaintWhereInput {
  const fromDate = parseInputDate(filters.from);
  const toDate = parseInputDate(filters.to);
  const where: Prisma.ComplaintWhereInput = {};

  if (fromDate || toDate) {
    where.regDate = {};
    if (fromDate) where.regDate.gte = fromDate;
    if (toDate) where.regDate.lte = endOfInputDay(toDate);
  }

  if (filters.district !== DEFAULT_FILTER_VALUE) {
    where.districtName = filters.district;
  }
  if (filters.policeStation !== DEFAULT_FILTER_VALUE) {
    where.responsiblePsCode = filters.policeStation;
  }
  if (filters.type !== DEFAULT_FILTER_VALUE) {
    where.typeOfComplaint = filters.type;
  }
  if (filters.classOfIncident !== DEFAULT_FILTER_VALUE) {
    where.classOfIncident = filters.classOfIncident;
  }
  if (filters.source !== DEFAULT_FILTER_VALUE) {
    where.complaintSource = filters.source;
  }
  if (filters.status !== DEFAULT_FILTER_VALUE) {
    where.statusGroup = filters.status;
  }

  return where;
}

function makeAggregateWhere(
  filters: DashboardFilters,
): Prisma.ComplaintAggDailyWhereInput {
  const where: Prisma.ComplaintAggDailyWhereInput = {};
  const fromDate = filterFromDate(filters);
  const toDate = filterToDate(filters);

  if (fromDate || toDate) {
    where.regDate = {};
    if (fromDate) where.regDate.gte = fromDate;
    if (toDate) where.regDate.lte = toDate;
  }

  if (filters.district !== DEFAULT_FILTER_VALUE) {
    where.districtKey = normalizeAggKey(filters.district);
  }
  if (filters.policeStation !== DEFAULT_FILTER_VALUE) {
    where.psKey = normalizeAggKey(filters.policeStation);
  }
  if (filters.type !== DEFAULT_FILTER_VALUE) {
    where.typeKey = normalizeAggKey(filters.type);
  }
  if (filters.classOfIncident !== DEFAULT_FILTER_VALUE) {
    where.classKey = normalizeAggKey(filters.classOfIncident);
  }
  if (filters.source !== DEFAULT_FILTER_VALUE) {
    where.sourceKey = normalizeAggKey(filters.source);
  }
  if (filters.status !== DEFAULT_FILTER_VALUE) {
    where.statusGroup = filters.status;
  }

  return where;
}

function makeAggregateDisposalWhere(
  filters: DashboardFilters,
): Prisma.ComplaintAggDisposalBucketDailyWhereInput {
  const where: Prisma.ComplaintAggDisposalBucketDailyWhereInput = {};
  const fromDate = filterFromDate(filters);
  const toDate = filterToDate(filters);

  if (fromDate || toDate) {
    where.regDate = {};
    if (fromDate) where.regDate.gte = fromDate;
    if (toDate) where.regDate.lte = toDate;
  }

  if (filters.district !== DEFAULT_FILTER_VALUE) {
    where.districtKey = normalizeAggKey(filters.district);
  }
  if (filters.policeStation !== DEFAULT_FILTER_VALUE) {
    where.psKey = normalizeAggKey(filters.policeStation);
  }
  if (filters.type !== DEFAULT_FILTER_VALUE) {
    where.typeKey = normalizeAggKey(filters.type);
  }
  if (filters.classOfIncident !== DEFAULT_FILTER_VALUE) {
    where.classKey = normalizeAggKey(filters.classOfIncident);
  }
  if (filters.source !== DEFAULT_FILTER_VALUE) {
    where.sourceKey = normalizeAggKey(filters.source);
  }
  if (filters.status !== DEFAULT_FILTER_VALUE) {
    where.statusGroup = filters.status;
  }

  return where;
}

async function getMetadataLists(): Promise<MetadataLists> {
  const cached = metadataCache;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const db = getDb();
  const [districts, policeStations, complaintTypes, incidentClasses, complaintSources] =
    await Promise.all([
      db.district.findMany({ orderBy: { name: "asc" } }),
      db.policeStation.findMany({
        orderBy: [{ districtName: "asc" }, { name: "asc" }],
      }),
      db.complaint.findMany({
        distinct: ["typeOfComplaint"],
        select: { typeOfComplaint: true },
        where: { typeOfComplaint: { not: null } },
        orderBy: { typeOfComplaint: "asc" },
      }),
      db.complaint.findMany({
        distinct: ["classOfIncident"],
        select: { classOfIncident: true },
        where: { classOfIncident: { not: null } },
        orderBy: { classOfIncident: "asc" },
      }),
      db.complaint.findMany({
        distinct: ["complaintSource"],
        select: { complaintSource: true },
        where: { complaintSource: { not: null } },
        orderBy: { complaintSource: "asc" },
      }),
    ]);

  const data: MetadataLists = {
    districts: districts.map((district) => ({
      id: district.name,
      name: district.name,
    })),
    policeStations: policeStations.map((station) => ({
      id: station.id,
      name: station.name,
      districtName: station.districtName,
    })),
    complaintTypes: complaintTypes
      .map((row) => row.typeOfComplaint)
      .filter((value): value is string => Boolean(value)),
    incidentClasses: incidentClasses
      .map((row) => row.classOfIncident)
      .filter((value): value is string => Boolean(value)),
    complaintSources: complaintSources
      .map((row) => row.complaintSource)
      .filter((value): value is string => Boolean(value)),
  };

  metadataCache = {
    data,
    expiresAt: Date.now() + METADATA_CACHE_TTL_MS,
  };

  return data;
}

async function getDatabaseOverview(
  stationLookup: Map<string, string>,
): Promise<DatabaseOverview> {
  const db = getDb();
  const [aggregate, lastSuccessfulSync, latestSamples] = await Promise.all([
    db.complaint.aggregate({
      _count: { _all: true },
      _min: { regDate: true },
      _max: { regDate: true },
    }),
    db.syncRun.findFirst({
      where: { kind: "complaints", status: "success" },
      orderBy: { finishedAt: "desc" },
      select: {
        finishedAt: true,
        timeFrom: true,
        timeTo: true,
        fetchedCount: true,
        upsertedCount: true,
      },
    }),
    db.complaint.findMany({
      orderBy: { syncedAt: "desc" },
      take: 25,
      select: {
        id: true,
        regNum: true,
        districtName: true,
        responsiblePsCode: true,
        typeOfComplaint: true,
        classOfIncident: true,
        complaintPurpose: true,
        statusRaw: true,
        regDate: true,
        disposalDate: true,
        syncedAt: true,
      },
    }),
  ]);

  return {
    totalComplaints: aggregate._count._all,
    minRegDate: aggregate._min.regDate?.toISOString() ?? null,
    maxRegDate: aggregate._max.regDate?.toISOString() ?? null,
    lastSuccessfulSync: lastSuccessfulSync
      ? {
          finishedAt: lastSuccessfulSync.finishedAt?.toISOString() ?? null,
          timeFrom: lastSuccessfulSync.timeFrom?.toISOString() ?? null,
          timeTo: lastSuccessfulSync.timeTo?.toISOString() ?? null,
          fetchedCount: lastSuccessfulSync.fetchedCount,
          upsertedCount: lastSuccessfulSync.upsertedCount,
        }
      : null,
    latestSamples: latestSamples.map((sample) => ({
      id: sample.id,
      regNum: sample.regNum,
      districtName: sample.districtName,
      responsiblePsCode: sample.responsiblePsCode,
      policeStationName: sample.responsiblePsCode
        ? stationLookup.get(sample.responsiblePsCode) ?? null
        : null,
      typeOfComplaint: sample.typeOfComplaint,
      classOfIncident: sample.classOfIncident,
      complaintPurpose: sample.complaintPurpose,
      statusRaw: sample.statusRaw,
      regDate: sample.regDate?.toISOString() ?? null,
      disposalDate: sample.disposalDate?.toISOString() ?? null,
      syncedAt: sample.syncedAt.toISOString(),
    })),
  };
}

function buildCommonMetadata(
  filters: DashboardFilters,
  metadata: MetadataLists,
  lastSync: {
    status: string;
    finishedAt: Date | null;
    fetchedCount: number;
    upsertedCount: number;
    message: string | null;
  } | null,
) {
  const policeStations =
    filters.district === DEFAULT_FILTER_VALUE
      ? metadata.policeStations
      : metadata.policeStations.filter(
          (station) => station.districtName === filters.district,
        );

  return {
    districts: metadata.districts,
    policeStations,
    complaintTypes: metadata.complaintTypes,
    incidentClasses: metadata.incidentClasses,
    complaintSources: metadata.complaintSources,
    lastSync: lastSync
      ? {
          status: lastSync.status,
          finishedAt: lastSync.finishedAt?.toISOString() ?? null,
          fetchedCount: lastSync.fetchedCount,
          upsertedCount: lastSync.upsertedCount,
          message: lastSync.message,
        }
      : null,
  };
}

export async function getDashboardDataLive(
  filters: DashboardFilters,
): Promise<DashboardData> {
  const db = getDb();
  const where = makeWhere(filters);
  const metadata = await getMetadataLists();
  const stationLabels = new Map(
    metadata.policeStations.map((station) => [station.id, station.name]),
  );

  const [complaints, lastSync, database] = await Promise.all([
    db.complaint.findMany({
      where,
      select: {
        districtName: true,
        typeOfComplaint: true,
        classOfIncident: true,
        complaintSource: true,
        statusGroup: true,
        regDate: true,
        disposalDays: true,
        disposalDate: true,
        responsiblePsCode: true,
      },
    }),
    db.syncRun.findFirst({
      where: { kind: "complaints" },
      orderBy: { startedAt: "desc" },
      select: {
        status: true,
        finishedAt: true,
        fetchedCount: true,
        upsertedCount: true,
        message: true,
      },
    }),
    getDatabaseOverview(stationLabels),
  ]);

  const rows = complaints as ComplaintRow[];
  const summary = summarizeRows("All complaints", rows, rows.length, null);
  const pendingRows = rows.filter((row) => row.statusGroup === "pending");
  const missingDisposalDates = rows.filter(
    (row) => row.statusGroup === "disposed" && row.disposalDays === null,
  ).length;
  const overThirtyPending = pendingRows.filter((row) => {
    const pendingDays = calculatePendingDays(row.regDate);
    return pendingDays !== null && pendingDays > 30;
  }).length;

  const policeStationRows =
    filters.district === DEFAULT_FILTER_VALUE
      ? []
      : groupSummary(
          rows,
          (row) =>
            row.responsiblePsCode
              ? stationLabels.get(row.responsiblePsCode) ??
                `PS ${row.responsiblePsCode}`
              : null,
          (row) => row.responsiblePsCode,
          rows.length,
          "No station code",
        );

  return {
    filters,
    generatedAt: new Date().toISOString(),
    summary: {
      total: summary.total,
      disposed: summary.disposed,
      pending: summary.pending,
      unknown: summary.unknown,
      disposedPercent: summary.disposedPercent,
      pendingPercent: summary.pendingPercent,
      overThirtyPending,
      avgDisposalDays: summary.avgDisposalDays,
      missingDisposalDates,
    },
    districtRows: groupSummary(
      rows,
      (row) => row.districtName,
      (row) => row.districtName,
      rows.length,
    ),
    complaintTypeRows: groupSummary(
      rows,
      (row) => row.typeOfComplaint,
      (row) => row.typeOfComplaint,
      rows.length,
    ),
    classOfIncidentRows: groupSummary(
      rows,
      (row) => row.classOfIncident,
      (row) => row.classOfIncident,
      rows.length,
    ),
    monthlyTrends: buildTrends(rows, "month"),
    yearlyTrends: buildTrends(rows, "year"),
    pendencyBuckets: buildPendencyBuckets(rows),
    disposalBuckets: buildDisposalBuckets(rows),
    pendencyByDistrict: buildPendencyMatrix(
      rows,
      (row) => row.districtName,
      (row) => row.districtName,
    ),
    pendencyByClass: buildPendencyMatrix(
      rows,
      (row) => row.classOfIncident,
      (row) => row.classOfIncident,
    ),
    disposalByDistrict: buildDisposalMatrix(
      rows,
      (row) => row.districtName,
      (row) => row.districtName,
    ),
    disposalByClass: buildDisposalMatrix(
      rows,
      (row) => row.classOfIncident,
      (row) => row.classOfIncident,
    ),
    policeStationRows,
    database,
    metadata: buildCommonMetadata(filters, metadata, lastSync),
  };
}

export async function getDashboardDataFromAggregates(
  filters: DashboardFilters,
): Promise<DashboardData> {
  const db = getDb();
  const metadata = await getMetadataLists();
  const stationLabels = new Map(
    metadata.policeStations.map((station) => [station.id, station.name]),
  );
  const aggWhere = makeAggregateWhere(filters);
  const disposalWhere = makeAggregateDisposalWhere(filters);
  const sumValue = (value: number | null | undefined) => value ?? 0;

  type StatusGroupedRow = {
    statusGroup: string;
    _sum: {
      totalCount: number | null;
      disposedDaysSum: number | null;
      disposedDaysCount: number | null;
      disposedMissingDateCount: number | null;
    };
    [key: string]: unknown;
  };

  const summarizeStatusRows = (rows: StatusGroupedRow[]) => {
    let total = 0;
    let disposed = 0;
    let pending = 0;
    let unknown = 0;
    let disposedDaysSum = 0;
    let disposedDaysCount = 0;
    let missingDisposalDates = 0;

    rows.forEach((row) => {
      const count = sumValue(row._sum.totalCount);
      total += count;
      if (row.statusGroup === "disposed") {
        disposed += count;
        disposedDaysSum += sumValue(row._sum.disposedDaysSum);
        disposedDaysCount += sumValue(row._sum.disposedDaysCount);
        missingDisposalDates += sumValue(row._sum.disposedMissingDateCount);
      } else if (row.statusGroup === "pending") {
        pending += count;
      } else {
        unknown += count;
      }
    });

    return {
      total,
      disposed,
      pending,
      unknown,
      missingDisposalDates,
      avgDisposalDays:
        disposedDaysCount > 0
          ? Number((disposedDaysSum / disposedDaysCount).toFixed(1))
          : null,
    };
  };

  const buildSummaryRowsFromGrouped = (
    rows: StatusGroupedRow[],
    keyName: string,
    labelForKey: (key: string | null) => string,
    activeTotal: number,
  ): SummaryRow[] => {
    const grouped = new Map<string, StatusGroupedRow[]>();
    rows.forEach((row) => {
      const keyValue = String(row[keyName] ?? NULL_KEY);
      const groupKey = keyValue || NULL_KEY;
      const list = grouped.get(groupKey);
      if (list) {
        list.push(row);
      } else {
        grouped.set(groupKey, [row]);
      }
    });

    return [...grouped.entries()]
      .map(([groupKey, groupRows]) => {
        const summary = summarizeStatusRows(groupRows);
        const value = readAggKey(groupKey);
        return {
          value,
          label: labelForKey(value),
          total: summary.total,
          disposed: summary.disposed,
          pending: summary.pending,
          unknown: summary.unknown,
          totalSharePercent: percent(summary.total, activeTotal),
          disposedPercent: percent(summary.disposed, summary.total),
          pendingPercent: percent(summary.pending, summary.total),
          avgDisposalDays: summary.avgDisposalDays,
        };
      })
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  };

  type DateGroupedRow = {
    regDate: Date;
    _sum: { totalCount: number | null };
    [key: string]: unknown;
  };

  const buildPendencyMatrixFromGrouped = (
    rows: DateGroupedRow[],
    keyName: string,
    labelForKey: (key: string | null) => string,
  ): TimeMatrixRow[] => {
    const grouped = new Map<
      string,
      { label: string; value: string | null; total: number; buckets: Map<string, number> }
    >();

    rows.forEach((row) => {
      const days = calculatePendingDays(row.regDate);
      if (days === null) return;
      const bucket = bucketLabelForDays(days);
      const count = sumValue(row._sum.totalCount);
      if (count <= 0) return;

      const rawKey = String(row[keyName] ?? NULL_KEY);
      const value = readAggKey(rawKey);
      const group =
        grouped.get(rawKey) ??
        {
          label: labelForKey(value),
          value,
          total: 0,
          buckets: new Map(AGE_BUCKETS.map((label) => [label, 0])),
        };
      group.total += count;
      group.buckets.set(bucket, (group.buckets.get(bucket) ?? 0) + count);
      grouped.set(rawKey, group);
    });

    return [...grouped.values()]
      .map((group) => ({
        value: group.value,
        label: group.label,
        total: group.total,
        buckets: AGE_BUCKETS.map((label) => {
          const count = group.buckets.get(label) ?? 0;
          return { label, count, percent: percent(count, group.total) };
        }),
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  };

  type DisposalGroupedRow = {
    disposalBucket: string;
    _sum: { count: number | null };
    [key: string]: unknown;
  };

  const buildDisposalMatrixFromGrouped = (
    rows: DisposalGroupedRow[],
    keyName: string,
    labelForKey: (key: string | null) => string,
  ): TimeMatrixRow[] => {
    const labels = [...AGE_BUCKETS, "Missing date"];
    const grouped = new Map<
      string,
      { label: string; value: string | null; total: number; buckets: Map<string, number> }
    >();

    rows.forEach((row) => {
      const count = sumValue(row._sum.count);
      if (count <= 0) return;
      const rawKey = String(row[keyName] ?? NULL_KEY);
      const value = readAggKey(rawKey);
      const group =
        grouped.get(rawKey) ??
        {
          label: labelForKey(value),
          value,
          total: 0,
          buckets: new Map(labels.map((label) => [label, 0])),
        };
      group.total += count;
      group.buckets.set(
        row.disposalBucket,
        (group.buckets.get(row.disposalBucket) ?? 0) + count,
      );
      grouped.set(rawKey, group);
    });

    return [...grouped.values()]
      .map((group) => ({
        value: group.value,
        label: group.label,
        total: group.total,
        buckets: labels.map((label) => {
          const count = group.buckets.get(label) ?? 0;
          return { label, count, percent: percent(count, group.total) };
        }),
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  };

  const [
    summaryByStatus,
    districtByStatus,
    typeByStatus,
    classByStatus,
    trendByDateStatus,
    pendingByDate,
    pendingByDistrictDate,
    pendingByClassDate,
    disposalBucketSums,
    disposalByDistrictBucket,
    disposalByClassBucket,
    policeStationByStatus,
    lastSync,
    database,
  ] = await Promise.all([
    db.complaintAggDaily.groupBy({
      by: ["statusGroup"],
      where: aggWhere,
      _sum: {
        totalCount: true,
        disposedDaysSum: true,
        disposedDaysCount: true,
        disposedMissingDateCount: true,
      },
    }),
    db.complaintAggDaily.groupBy({
      by: ["districtKey", "statusGroup"],
      where: aggWhere,
      _sum: {
        totalCount: true,
        disposedDaysSum: true,
        disposedDaysCount: true,
        disposedMissingDateCount: true,
      },
    }),
    db.complaintAggDaily.groupBy({
      by: ["typeKey", "statusGroup"],
      where: aggWhere,
      _sum: {
        totalCount: true,
        disposedDaysSum: true,
        disposedDaysCount: true,
        disposedMissingDateCount: true,
      },
    }),
    db.complaintAggDaily.groupBy({
      by: ["classKey", "statusGroup"],
      where: aggWhere,
      _sum: {
        totalCount: true,
        disposedDaysSum: true,
        disposedDaysCount: true,
        disposedMissingDateCount: true,
      },
    }),
    db.complaintAggDaily.groupBy({
      by: ["regDate", "statusGroup"],
      where: aggWhere,
      _sum: { totalCount: true },
    }),
    db.complaintAggDaily.groupBy({
      by: ["regDate"],
      where: { ...aggWhere, statusGroup: "pending" },
      _sum: { totalCount: true },
    }),
    db.complaintAggDaily.groupBy({
      by: ["districtKey", "regDate"],
      where: { ...aggWhere, statusGroup: "pending" },
      _sum: { totalCount: true },
    }),
    db.complaintAggDaily.groupBy({
      by: ["classKey", "regDate"],
      where: { ...aggWhere, statusGroup: "pending" },
      _sum: { totalCount: true },
    }),
    db.complaintAggDisposalBucketDaily.groupBy({
      by: ["disposalBucket"],
      where: disposalWhere,
      _sum: { count: true },
    }),
    db.complaintAggDisposalBucketDaily.groupBy({
      by: ["districtKey", "disposalBucket"],
      where: disposalWhere,
      _sum: { count: true },
    }),
    db.complaintAggDisposalBucketDaily.groupBy({
      by: ["classKey", "disposalBucket"],
      where: disposalWhere,
      _sum: { count: true },
    }),
    filters.district === DEFAULT_FILTER_VALUE
      ? Promise.resolve([])
      : db.complaintAggDaily.groupBy({
          by: ["psKey", "statusGroup"],
          where: aggWhere,
          _sum: {
            totalCount: true,
            disposedDaysSum: true,
            disposedDaysCount: true,
            disposedMissingDateCount: true,
          },
        }),
    db.syncRun.findFirst({
      where: { kind: "complaints" },
      orderBy: { startedAt: "desc" },
      select: {
        status: true,
        finishedAt: true,
        fetchedCount: true,
        upsertedCount: true,
        message: true,
      },
    }),
    getDatabaseOverview(stationLabels),
  ]);

  const totalSummary = summarizeStatusRows(summaryByStatus as StatusGroupedRow[]);
  const total = totalSummary.total;
  const overThirtyPending = (pendingByDate as DateGroupedRow[]).reduce(
    (sum, row) => {
      const days = calculatePendingDays(row.regDate);
      if (days === null || days <= 30) return sum;
      return sum + sumValue(row._sum.totalCount);
    },
    0,
  );

  const trendMap = new Map<string, { total: number; disposed: number; pending: number }>();
  (trendByDateStatus as Array<{ regDate: Date; statusGroup: string; _sum: { totalCount: number | null } }>).forEach(
    (row) => {
      const count = sumValue(row._sum.totalCount);
      const monthKey = trendKey(row.regDate, "month");
      const yearKey = trendKey(row.regDate, "year");
      if (monthKey) {
        const existing = trendMap.get(`m:${monthKey}`) ?? { total: 0, disposed: 0, pending: 0 };
        existing.total += count;
        if (row.statusGroup === "disposed") existing.disposed += count;
        if (row.statusGroup === "pending") existing.pending += count;
        trendMap.set(`m:${monthKey}`, existing);
      }
      if (yearKey) {
        const existing = trendMap.get(`y:${yearKey}`) ?? { total: 0, disposed: 0, pending: 0 };
        existing.total += count;
        if (row.statusGroup === "disposed") existing.disposed += count;
        if (row.statusGroup === "pending") existing.pending += count;
        trendMap.set(`y:${yearKey}`, existing);
      }
    },
  );

  const monthlyTrends = [...trendMap.entries()]
    .filter(([key]) => key.startsWith("m:"))
    .map(([key, values]) => ({ label: key.slice(2), ...values }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const yearlyTrends = [...trendMap.entries()]
    .filter(([key]) => key.startsWith("y:"))
    .map(([key, values]) => ({ label: key.slice(2), ...values }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const pendencyBucketCounts = new Map<string, number>();
  let pendencyTotal = 0;
  (pendingByDate as DateGroupedRow[]).forEach((row) => {
    const days = calculatePendingDays(row.regDate);
    if (days === null) return;
    const bucket = bucketLabelForDays(days);
    const count = sumValue(row._sum.totalCount);
    pendencyBucketCounts.set(bucket, (pendencyBucketCounts.get(bucket) ?? 0) + count);
    pendencyTotal += count;
  });

  const disposalBucketCounts = new Map<string, number>();
  let disposalTotal = 0;
  (disposalBucketSums as DisposalGroupedRow[]).forEach((row) => {
    const count = sumValue(row._sum.count);
    disposalBucketCounts.set(
      row.disposalBucket,
      (disposalBucketCounts.get(row.disposalBucket) ?? 0) + count,
    );
    disposalTotal += count;
  });

  const policeStationRows =
    filters.district === DEFAULT_FILTER_VALUE
      ? []
      : buildSummaryRowsFromGrouped(
          policeStationByStatus as StatusGroupedRow[],
          "psKey",
          (key) => {
            if (!key) return "No station code";
            return stationLabels.get(key) ?? `PS ${key}`;
          },
          total,
        );

  return {
    filters,
    generatedAt: new Date().toISOString(),
    summary: {
      total: totalSummary.total,
      disposed: totalSummary.disposed,
      pending: totalSummary.pending,
      unknown: totalSummary.unknown,
      disposedPercent: percent(totalSummary.disposed, totalSummary.total),
      pendingPercent: percent(totalSummary.pending, totalSummary.total),
      overThirtyPending,
      avgDisposalDays: totalSummary.avgDisposalDays,
      missingDisposalDates: totalSummary.missingDisposalDates,
    },
    districtRows: buildSummaryRowsFromGrouped(
      districtByStatus as StatusGroupedRow[],
      "districtKey",
      (key) => key ?? "Not available",
      total,
    ),
    complaintTypeRows: buildSummaryRowsFromGrouped(
      typeByStatus as StatusGroupedRow[],
      "typeKey",
      (key) => key ?? "Not available",
      total,
    ),
    classOfIncidentRows: buildSummaryRowsFromGrouped(
      classByStatus as StatusGroupedRow[],
      "classKey",
      (key) => key ?? "Not available",
      total,
    ),
    monthlyTrends,
    yearlyTrends,
    pendencyBuckets: AGE_BUCKETS.map((label) => {
      const count = pendencyBucketCounts.get(label) ?? 0;
      return { label, count, percent: percent(count, pendencyTotal) };
    }),
    disposalBuckets: [...AGE_BUCKETS, "Missing date"].map((label) => {
      const count = disposalBucketCounts.get(label) ?? 0;
      return { label, count, percent: percent(count, disposalTotal) };
    }),
    pendencyByDistrict: buildPendencyMatrixFromGrouped(
      pendingByDistrictDate as DateGroupedRow[],
      "districtKey",
      (key) => key ?? "Not available",
    ),
    pendencyByClass: buildPendencyMatrixFromGrouped(
      pendingByClassDate as DateGroupedRow[],
      "classKey",
      (key) => key ?? "Not available",
    ),
    disposalByDistrict: buildDisposalMatrixFromGrouped(
      disposalByDistrictBucket as DisposalGroupedRow[],
      "districtKey",
      (key) => key ?? "Not available",
    ),
    disposalByClass: buildDisposalMatrixFromGrouped(
      disposalByClassBucket as DisposalGroupedRow[],
      "classKey",
      (key) => key ?? "Not available",
    ),
    policeStationRows,
    database,
    metadata: buildCommonMetadata(filters, metadata, lastSync),
  };
}

async function canUseAggregatePath(): Promise<boolean> {
  const db = getDb();
  try {
    const state = await db.aggregateRefreshState.findUnique({
      where: { id: AGGREGATE_STATE_ID },
      select: { status: true },
    });
    return state?.status === "success";
  } catch {
    return false;
  }
}

export async function getDashboardData(
  filters: DashboardFilters,
): Promise<DashboardData> {
  if (await canUseAggregatePath()) {
    try {
      return await getDashboardDataFromAggregates(filters);
    } catch {
      return getDashboardDataLive(filters);
    }
  }
  return getDashboardDataLive(filters);
}
