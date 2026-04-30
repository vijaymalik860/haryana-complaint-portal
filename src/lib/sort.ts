import type {
  BucketRow,
  DatabaseSample,
  SummaryRow,
  TimeMatrixRow,
} from "@/lib/dashboard-types";

export type SortDirection = "asc" | "desc";

export type SummarySortKey =
  | "total"
  | "pending"
  | "disposed"
  | "totalSharePercent"
  | "pendingPercent"
  | "disposedPercent";

export type SummaryTableSortKey =
  | SummarySortKey
  | "label"
  | "unknown"
  | "avgDisposalDays";

export type BucketSortKey = "label" | "count" | "percent";

export type TimeMatrixSortKey = "label" | "total" | `bucket:${string}`;

export type SampleSortKey =
  | "regNum"
  | "districtName"
  | "policeStationName"
  | "typeOfComplaint"
  | "classOfIncident"
  | "complaintPurpose"
  | "statusRaw"
  | "regDate"
  | "disposalDate"
  | "syncedAt";

export const SUMMARY_SORT_LABELS: Record<SummarySortKey, string> = {
  total: "Total registered",
  pending: "Pending",
  disposed: "Disposed",
  totalSharePercent: "Total %",
  pendingPercent: "Pending %",
  disposedPercent: "Disposed %",
};

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").localeCompare(b ?? "");
}

function compareNumber(a: number | null | undefined, b: number | null | undefined) {
  return (a ?? -1) - (b ?? -1);
}

function directionMultiplier(direction: SortDirection) {
  return direction === "asc" ? 1 : -1;
}

export function toggleSortDirection(
  currentKey: string,
  nextKey: string,
  currentDirection: SortDirection,
): SortDirection {
  if (currentKey !== nextKey) return "desc";
  return currentDirection === "asc" ? "desc" : "asc";
}

export function sortSummaryRows<T extends SummaryRow>(
  rows: T[],
  key: SummaryTableSortKey,
  direction: SortDirection = "desc",
): T[] {
  const multiplier = directionMultiplier(direction);
  return [...rows].sort((a, b) => {
    const value =
      key === "label"
        ? compareText(a.label, b.label)
        : compareNumber(a[key], b[key]);
    return value * multiplier || a.label.localeCompare(b.label);
  });
}

export function sortBucketRows(
  rows: BucketRow[],
  key: BucketSortKey,
  direction: SortDirection = "desc",
): BucketRow[] {
  const multiplier = directionMultiplier(direction);
  return [...rows].sort((a, b) => {
    const value =
      key === "label"
        ? compareText(a.label, b.label)
        : compareNumber(a[key], b[key]);
    return value * multiplier || a.label.localeCompare(b.label);
  });
}

function bucketCount(row: TimeMatrixRow, label: string) {
  return row.buckets.find((bucket) => bucket.label === label)?.count ?? 0;
}

export function sortTimeMatrixRows(
  rows: TimeMatrixRow[],
  key: TimeMatrixSortKey,
  direction: SortDirection = "desc",
): TimeMatrixRow[] {
  const multiplier = directionMultiplier(direction);
  return [...rows].sort((a, b) => {
    const value =
      key === "label"
        ? compareText(a.label, b.label)
        : key === "total"
          ? compareNumber(a.total, b.total)
          : compareNumber(
              bucketCount(a, key.replace("bucket:", "")),
              bucketCount(b, key.replace("bucket:", "")),
            );
    return value * multiplier || a.label.localeCompare(b.label);
  });
}

export function sortSamples(
  rows: DatabaseSample[],
  key: SampleSortKey,
  direction: SortDirection = "desc",
): DatabaseSample[] {
  const multiplier = directionMultiplier(direction);
  return [...rows].sort((a, b) => {
    const value = compareText(a[key], b[key]);
    return value * multiplier || compareText(a.regNum, b.regNum);
  });
}
