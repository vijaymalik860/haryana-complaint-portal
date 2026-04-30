import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  applyDetailFilter,
  detailTitle,
  type DetailKind,
} from "@/lib/detail";
import { filtersFromSearchParams, getDashboardData } from "@/lib/reporting";

export const dynamic = "force-dynamic";

const VALID_KINDS = new Set(["district", "class", "police-station"]);

type DetailPageProps = {
  params: Promise<{ kind: string; value: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DetailPage({
  params,
  searchParams,
}: DetailPageProps) {
  const resolvedParams = await params;
  if (!VALID_KINDS.has(resolvedParams.kind)) notFound();

  const kind = resolvedParams.kind as DetailKind;
  const value = decodeURIComponent(resolvedParams.value);
  const baseFilters = filtersFromSearchParams(await searchParams);
  const filters = applyDetailFilter(baseFilters, kind, value);
  const data = await getDashboardData(filters);
  const station = data.metadata.policeStations.find((item) => item.id === value);
  const label = detailTitle(kind, value, station?.name);

  return (
    <DashboardShell
      data={data}
      detail={{
        kind,
        value,
        label,
      }}
    />
  );
}

