import { buildPdfReport } from "@/lib/export";
import { filtersFromSearchParams, getDashboardData } from "@/lib/reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = filtersFromSearchParams(
    Object.fromEntries(url.searchParams.entries()),
  );
  const pdf = await buildPdfReport(await getDashboardData(filters));

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="complaint-dashboard-${filters.from}-to-${filters.to}.pdf"`,
    },
  });
}
