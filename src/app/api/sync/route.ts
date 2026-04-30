import { currentFinancialYearRange, parseInputDate, toInputDate } from "@/lib/dates";
import { syncComplaintRange, syncMasterData } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const fallback = currentFinancialYearRange();
  const requestedFrom = parseInputDate(body.from) ?? fallback.from;
  const requestedTo = parseInputDate(body.to) ?? fallback.to;
  const from =
    requestedFrom.getTime() <= requestedTo.getTime() ? requestedFrom : requestedTo;
  const to =
    requestedFrom.getTime() <= requestedTo.getTime() ? requestedTo : requestedFrom;

  const cursorFrom = parseInputDate(body.cursorFrom) ?? from;
  if (cursorFrom.getTime() > to.getTime()) {
    return Response.json({
      done: true,
      nextCursor: null,
      processedFrom: null,
      processedTo: null,
      complaints: null,
      master: null,
    });
  }

  const chunkFrom = cursorFrom;
  const chunkTo = new Date(
    Math.min(
      cursorFrom.getTime(),
      to.getTime(),
    ),
  );

  let master: Awaited<ReturnType<typeof syncMasterData>> | null = null;
  if (body.includeMaster !== false) {
    master = await syncMasterData();
  }

  const complaints = await syncComplaintRange({ from: chunkFrom, to: chunkTo });
  const nextDate = new Date(chunkTo);
  nextDate.setDate(nextDate.getDate() + 1);
  const done = nextDate.getTime() > to.getTime();

  return Response.json({
    done,
    nextCursor: done ? null : toInputDate(nextDate),
    processedFrom: toInputDate(chunkFrom),
    processedTo: toInputDate(chunkTo),
    complaints,
    master,
  });
}
