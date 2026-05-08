import { getDb } from "@/lib/db";
import { filtersFromSearchParams, makeWhere, getMetadataLists } from "@/lib/reporting";
import { calculatePendingDays } from "@/lib/normalize";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { format, isValid } from "date-fns";

function safeFormat(date: Date | null | undefined): string {
  if (!date || !isValid(date)) return "-";
  try {
    return format(date, "dd/MM/yyyy");
  } catch {
    return "-";
  }
}

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = filtersFromSearchParams(params);
  const where = makeWhere(filters);
  const db = getDb();

  const pageParam = params.page ? Number(params.page) : 1;
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const pageSize = 50;

  const [complaints, totalCount, metadata] = await Promise.all([
    db.complaint.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { regDate: "desc" },
    }),
    db.complaint.count({ where }),
    getMetadataLists(),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const stationLookup = new Map(
    metadata.policeStations.map((ps) => [ps.id, ps.name]),
  );

  // Reconstruct query parameters for pagination links
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (k !== "page" && v !== undefined) {
      if (Array.isArray(v)) {
        v.forEach(val => queryParams.append(k, val));
      } else {
        queryParams.append(k, v);
      }
    }
  });
  const queryString = queryParams.toString();

  return (
    <div className="flex min-h-screen flex-col bg-background p-4 sm:p-6 md:p-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href={`/?${queryString}`}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-gradient text-2xl font-bold tracking-tight sm:text-3xl">
              Complaint Data View
            </h1>
            <p className="text-sm text-muted-foreground">
              Showing filtered database records ({totalCount.toLocaleString()} total found)
            </p>
          </div>
        </div>

        <Card className="glass-card flex-1 overflow-hidden">
          <CardHeader className="border-b bg-card/40 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Data Records</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Page {page} of {Math.max(1, totalPages)}
                <div className="ml-4 flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page <= 1}
                    asChild={page > 1}
                  >
                    {page > 1 ? (
                      <Link href={`/data?${queryString}&page=${page - 1}`}>
                        <ChevronLeft className="size-4" />
                      </Link>
                    ) : (
                      <ChevronLeft className="size-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page >= totalPages}
                    asChild={page < totalPages}
                  >
                    {page < totalPages ? (
                      <Link href={`/data?${queryString}&page=${page + 1}`}>
                        <ChevronRight className="size-4" />
                      </Link>
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Reg No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead>Police Station</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Disposal Date</TableHead>
                    <TableHead>Days Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complaints.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-40 text-center text-muted-foreground">
                        No complaints found for these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    complaints.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.regNum || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {safeFormat(c.regDate)}
                        </TableCell>
                        <TableCell>{c.districtName || "-"}</TableCell>
                        <TableCell>
                          {c.responsiblePsCode
                            ? stationLookup.get(c.responsiblePsCode) || c.responsiblePsCode
                            : "-"}
                        </TableCell>
                        <TableCell>{c.classOfIncident || "-"}</TableCell>
                        <TableCell>{c.typeOfComplaint || "-"}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              c.statusGroup === "disposed"
                                ? "bg-emerald-500/10 text-emerald-500"
                                : c.statusGroup === "pending"
                                  ? "bg-red-500/10 text-red-500"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {c.statusGroup.toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {safeFormat(c.disposalDate)}
                        </TableCell>
                        <TableCell>
                          {c.statusGroup === "pending" && c.regDate
                            ? calculatePendingDays(c.regDate) ?? "-"
                            : c.disposalDays ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
