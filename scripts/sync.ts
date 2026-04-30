import "dotenv/config";

import { currentFinancialYearRange, parseInputDate, toInputDate } from "@/lib/dates";
import { syncAll } from "@/lib/ingest";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const fallback = currentFinancialYearRange();
  const from = parseInputDate(argValue("from")) ?? fallback.from;
  const to = parseInputDate(argValue("to")) ?? fallback.to;

  console.log(`Syncing complaints from ${toInputDate(from)} to ${toInputDate(to)}`);
  const result = await syncAll({ from, to });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

