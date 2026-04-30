import type { DashboardFilters } from "@/lib/dashboard-types";

export type DetailKind = "district" | "class" | "police-station";

export function detailPath(
  kind: DetailKind,
  value: string,
  filters: DashboardFilters,
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, filterValue]) => {
    if (key === "from" || key === "to" || filterValue !== "all") {
      params.set(key, filterValue);
    }
  });

  return `/details/${kind}/${encodeURIComponent(value)}?${params.toString()}`;
}

export function applyDetailFilter(
  filters: DashboardFilters,
  kind: DetailKind,
  value: string,
): DashboardFilters {
  if (kind === "district") {
    return { ...filters, district: value, policeStation: "all" };
  }
  if (kind === "class") {
    return { ...filters, classOfIncident: value };
  }
  return { ...filters, policeStation: value };
}

export function detailTitle(kind: DetailKind, value: string, label?: string) {
  const resolvedLabel = label ?? value;
  if (kind === "district") return `District analysis: ${resolvedLabel}`;
  if (kind === "class") return `Crime category analysis: ${resolvedLabel}`;
  return `Police station analysis: ${resolvedLabel}`;
}

