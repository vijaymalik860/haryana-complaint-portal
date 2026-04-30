import { filtersFromSearchParams, getDashboardData } from "@/lib/reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = filtersFromSearchParams(
    Object.fromEntries(url.searchParams.entries()),
  );
  const data = await getDashboardData(filters);
  return Response.json(data);
}

