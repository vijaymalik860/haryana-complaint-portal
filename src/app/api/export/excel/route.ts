import { buildExcelReport } from "@/lib/export";
import { filtersFromSearchParams, getDashboardData } from "@/lib/reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = filtersFromSearchParams(
    Object.fromEntries(url.searchParams.entries()),
  );
  const data = await getDashboardData(filters);
  const workbook = await buildExcelReport(data);

  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="complaint-dashboard-${filters.from}-to-${filters.to}.xlsx"`,
    },
  });
}
