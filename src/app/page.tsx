import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { filtersFromSearchParams, getDashboardData } from "@/lib/reporting";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const filters = filtersFromSearchParams(await searchParams);
  const data = await getDashboardData(filters);
  return <DashboardShell data={data} />;
}
