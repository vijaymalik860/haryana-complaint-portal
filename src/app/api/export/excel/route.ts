import { buildExcelReport } from "@/lib/export";
import { filtersFromSearchParams, getDashboardData, makeWhere, getMetadataLists } from "@/lib/reporting";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = filtersFromSearchParams(
    Object.fromEntries(url.searchParams.entries()),
  );
  
  const db = getDb();
  const where = makeWhere(filters);
  
  const [data, rawComplaints, metadata] = await Promise.all([
    getDashboardData(filters),
    db.complaint.findMany({
      where,
      orderBy: { regDate: "desc" },
    }),
    getMetadataLists(),
  ]);
  
  const stationLookup = new Map(
    metadata.policeStations.map((ps) => [ps.id, ps.name]),
  );

  const workbook = await buildExcelReport(data, rawComplaints, stationLookup);

  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="complaint-dashboard-${filters.from}-to-${filters.to}.xlsx"`,
    },
  });
}
