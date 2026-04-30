import "dotenv/config";

import { currentFinancialYearRange, toInputDate } from "@/lib/dates";
import { syncAll } from "@/lib/ingest";

const intervalMinutes = Number(process.env.SYNC_INTERVAL_MINUTES ?? "60");
const intervalMs = Math.max(5, intervalMinutes) * 60 * 1000;

async function runOnce() {
  const range = currentFinancialYearRange();
  console.log(
    `Starting scheduled sync ${toInputDate(range.from)} to ${toInputDate(range.to)}`,
  );
  const result = await syncAll(range);
  console.log(JSON.stringify(result, null, 2));
}

runOnce().catch((error) => console.error(error));

setInterval(() => {
  runOnce().catch((error) => console.error(error));
}, intervalMs);

