const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type DateRange = {
  from: Date;
  to: Date;
};

export function parseInputDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  // Construct UTC time for year-month-day 00:00:00
  const utcMillis = Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  // Subtract 5.5 hours to get the exact point in time when it is 00:00:00 IST
  return new Date(utcMillis - IST_OFFSET_MS);
}

export function toInputDate(date: Date): string {
  // Convert point-in-time into what it means in IST
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatApiDate(date: Date): string {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const year = istDate.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export function parseCctnsDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();
  if (!text || text === "0") return null;

  const match = text.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (match) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] =
      match;
    // CCTNS dates are in IST
    const utcMillis = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    const parsed = new Date(utcMillis - IST_OFFSET_MS);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function endOfInputDay(date: Date): Date {
  // date is already the correct exact point in time for midnight IST.
  // Add 24 hours - 1ms to get 23:59:59.999 IST.
  return new Date(date.getTime() + (DAY_MS) - 1);
}

export function indiaTodayDate(now = new Date()): Date {
  const istMillis = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMillis);
  // Construct midnight UTC on the IST date
  const utcMidnight = Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate());
  // Back to exact point in time for midnight IST
  return new Date(utcMidnight - IST_OFFSET_MS);
}

export function calendarDayNumber(date: Date): number {
  const istMillis = date.getTime() + IST_OFFSET_MS;
  return Math.floor(istMillis / DAY_MS);
}

export function calendarDaysBetween(later: Date, earlier: Date): number {
  return calendarDayNumber(later) - calendarDayNumber(earlier);
}

export function currentFinancialYearRange(today = indiaTodayDate()): DateRange {
  // `today` is the point-in-time representing midnight IST.
  const istToday = new Date(today.getTime() + IST_OFFSET_MS);
  const year = istToday.getUTCMonth() >= 3 ? istToday.getUTCFullYear() : istToday.getUTCFullYear() - 1;
  const utcMillis = Date.UTC(year, 3, 1, 0, 0, 0, 0);
  return {
    from: new Date(utcMillis - IST_OFFSET_MS),
    to: today,
  };
}

export function clampRange(from: Date, to: Date): DateRange {
  if (from.getTime() <= to.getTime()) return { from, to };
  return { from: to, to: from };
}

export function chunkDateRange(
  from: Date,
  to: Date,
  chunkDays: number
): DateRange[] {
  const chunks: DateRange[] = [];
  
  let cursorTime = from.getTime();
  const endTime = to.getTime();

  while (cursorTime <= endTime) {
    const chunkStart = new Date(cursorTime);
    const chunkEnd = new Date(cursorTime + (chunkDays - 1) * DAY_MS);
    
    if (chunkEnd.getTime() > endTime) {
      chunkEnd.setTime(endTime);
    }
    chunks.push({ from: chunkStart, to: chunkEnd });
    cursorTime = chunkEnd.getTime() + DAY_MS;
  }

  return chunks;
}
