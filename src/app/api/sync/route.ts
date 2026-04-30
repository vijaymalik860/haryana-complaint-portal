import { currentFinancialYearRange, parseInputDate } from "@/lib/dates";
import { syncAll } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const fallback = currentFinancialYearRange();
  const from = parseInputDate(body.from) ?? fallback.from;
  const to = parseInputDate(body.to) ?? fallback.to;
  const result = await syncAll({ from, to });
  return Response.json(result);
}

