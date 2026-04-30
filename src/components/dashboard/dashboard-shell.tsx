"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  Expand,
  FileSpreadsheet,
  FileText,
  Filter,
  RefreshCw,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  DashboardData,
  DashboardFilters,
  DatabaseSample,
  SummaryRow,
  TimeMatrixRow,
  TrendRow,
} from "@/lib/dashboard-types";
import { detailPath, type DetailKind } from "@/lib/detail";
import {
  SUMMARY_SORT_LABELS,
  sortSamples,
  sortSummaryRows,
  sortTimeMatrixRows,
  toggleSortDirection,
  type SampleSortKey,
  type SortDirection,
  type SummarySortKey,
  type SummaryTableSortKey,
  type TimeMatrixSortKey,
} from "@/lib/sort";

type DashboardShellProps = {
  data: DashboardData;
  detail?: {
    kind: DetailKind;
    value: string;
    label: string;
  };
};

const ALL = "all";
const disposedColor = "oklch(0.72 0.18 150)";
const pendingColor = "oklch(0.74 0.16 72)";
const unknownColor = "oklch(0.62 0.02 250)";
const totalColor = "oklch(0.68 0.15 245)";
const pendencyColumns = ["0-7 days", "8-15 days", "16-30 days", ">30 days"];
const disposalColumns = [...pendencyColumns, "Missing date"];
const fullScreenDialogClass =
  "top-0 left-0 h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr] overflow-hidden rounded-none p-4 sm:max-w-none";

type SyncChunkResponse = {
  done: boolean;
  nextCursor: string | null;
};

async function syncRangeInChunks(from: string, to: string) {
  let cursor = from;
  let includeMaster = true;

  for (let attempt = 0; attempt < 400; attempt += 1) {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        cursorFrom: cursor,
        includeMaster,
      }),
    });

    if (!response.ok) {
      throw new Error((await response.text()) || "Sync failed");
    }

    const payload = (await response.json()) as SyncChunkResponse;
    if (payload.done) return;
    if (!payload.nextCursor) {
      throw new Error("Sync stopped before completion");
    }

    cursor = payload.nextCursor;
    includeMaster = false;
  }

  throw new Error("Sync exceeded the maximum chunk attempts");
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1)}%`;
}

function formatAxisNumber(value: number | string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value);
  if (Math.abs(numberValue) >= 1000) {
    return `${Math.round(numberValue / 1000)}k`;
  }
  return String(numberValue);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function buildQuery(filters: DashboardFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (key === "from" || key === "to" || value !== ALL) {
      params.set(key, value);
    }
  });
  return params.toString();
}

function SortButton({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  column: string;
  activeColumn: string;
  direction: SortDirection;
  onSort: (column: string) => void;
  align?: "left" | "right";
}) {
  const Icon =
    activeColumn !== column ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={align === "right" ? "ml-auto" : "-ml-2"}
      onClick={() => onSort(column)}
    >
      {label}
      <Icon className="size-3.5" />
    </Button>
  );
}

function ChartSortSelect({
  value,
  onValueChange,
}: {
  value: SummarySortKey;
  onValueChange: (value: SummarySortKey) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as SummarySortKey)}
    >
      <SelectTrigger className="w-56">
        <span className="flex min-w-0 items-center gap-1" data-slot="select-value">
          <span className="text-muted-foreground">Sort By:</span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="z-60 w-(--radix-select-trigger-width)">
        {Object.entries(SUMMARY_SORT_LABELS).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <Card size="sm" className="bg-card/80">
      <CardHeader className="grid-cols-[1fr_auto]">
        <div>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="mt-1 text-2xl text-foreground">{value}</CardTitle>
        </div>
        <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function SummaryTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: SummaryRow }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover p-3 text-xs shadow-md">
      <div className="mb-2 font-medium text-popover-foreground">{label}</div>
      <div className="space-y-1 text-muted-foreground">
        <div className="flex justify-between gap-6">
          <span>Total</span>
          <span className="font-medium text-foreground">
            {formatNumber(row.total)} ({formatPercent(row.totalSharePercent)})
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span>Disposed</span>
          <span className="font-medium text-foreground">
            {formatNumber(row.disposed)} ({formatPercent(row.disposedPercent)})
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span>Pending</span>
          <span className="font-medium text-foreground">
            {formatNumber(row.pending)} ({formatPercent(row.pendingPercent)})
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span>Unknown</span>
          <span className="font-medium text-foreground">
            {formatNumber(row.unknown)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover p-3 text-xs shadow-md">
      <div className="mb-2 font-medium text-popover-foreground">{label}</div>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-medium">{formatNumber(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalSummaryChart({
  rows,
  height,
  onRowClick,
}: {
  rows: SummaryRow[];
  height: number;
  onRowClick?: (row: SummaryRow) => void;
}) {
  if (!rows.length) return <EmptyState message="No matching complaints." />;

  const handleBarClick = (entry: unknown) => {
    const row =
      (entry as { payload?: SummaryRow } | undefined)?.payload ??
      (entry as SummaryRow | undefined);
    if (row?.value) onRowClick?.(row);
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
          onClick={(event) => {
            const row = (
              event as
                | { activePayload?: Array<{ payload?: SummaryRow }> }
                | undefined
            )?.activePayload?.[0]?.payload;
            if (row?.value) onRowClick?.(row);
          }}
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
          <YAxis
            dataKey="label"
            type="category"
            width={132}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <Tooltip content={<SummaryTooltip />} />
          <Legend />
          <Bar
            dataKey="disposed"
            name="Disposed"
            stackId="status"
            fill={disposedColor}
            radius={[4, 0, 0, 4]}
            cursor={onRowClick ? "pointer" : "default"}
            onClick={handleBarClick}
          />
          <Bar
            dataKey="pending"
            name="Pending"
            stackId="status"
            fill={pendingColor}
            cursor={onRowClick ? "pointer" : "default"}
            onClick={handleBarClick}
          />
          <Bar
            dataKey="unknown"
            name="Unknown"
            stackId="status"
            fill={unknownColor}
            radius={[0, 4, 4, 0]}
            cursor={onRowClick ? "pointer" : "default"}
            onClick={handleBarClick}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SummaryBarChartCard({
  title,
  description,
  rows,
  detailKind,
  filters,
  compactLimit = 10,
}: {
  title: string;
  description: string;
  rows: SummaryRow[];
  detailKind?: DetailKind;
  filters: DashboardFilters;
  compactLimit?: number;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SummarySortKey>("total");
  const sortedRows = useMemo(
    () => sortSummaryRows(rows, sortKey, "desc"),
    [rows, sortKey],
  );
  const compactRows = sortedRows.slice(0, compactLimit);

  const onRowClick = detailKind
    ? (row: SummaryRow) => {
        if (row.value) router.push(detailPath(detailKind, row.value, filters));
      }
    : undefined;

  return (
    <Card className="bg-card/80">
      <CardHeader className="gap-3 sm:grid sm:grid-cols-[1fr_auto]">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <ChartSortSelect value={sortKey} onValueChange={setSortKey} />
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="icon">
                <Expand />
              </Button>
            </DialogTrigger>
            <DialogContent className={fullScreenDialogClass}>
              <div className="flex flex-col gap-3 border-b pb-3 pr-10 lg:flex-row lg:items-start lg:justify-between">
                <DialogHeader>
                  <DialogTitle>{title}</DialogTitle>
                  <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <ChartSortSelect value={sortKey} onValueChange={setSortKey} />
              </div>
              <div className="min-h-0 overflow-auto">
                <HorizontalSummaryChart
                  rows={sortedRows}
                  height={Math.max(620, sortedRows.length * 34)}
                  onRowClick={onRowClick}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <HorizontalSummaryChart
          rows={compactRows}
          height={Math.max(280, compactRows.length * 34)}
          onRowClick={onRowClick}
        />
        {rows.length > compactRows.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing top {compactRows.length} of {rows.length}. Expand for all rows.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TrendChart({ rows }: { rows: TrendRow[] }) {
  if (!rows.length) return <EmptyState message="No trend data for this filter." />;

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            stroke="var(--muted-foreground)"
            tickFormatter={formatAxisNumber}
          />
          <Tooltip content={<TrendTooltip />} />
          <Legend />
          <Line type="monotone" dataKey="total" name="Total" stroke={totalColor} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="disposed" name="Disposed" stroke={disposedColor} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="pending" name="Pending" stroke={pendingColor} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ExpandableTableAction({
  title,
  description,
  rowCount,
  visibleCount,
  children,
}: {
  title: string;
  description: string;
  rowCount: number;
  visibleCount: number;
  children: ReactNode;
}) {
  if (rowCount <= visibleCount) return null;

  return (
    <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing top {visibleCount} of {rowCount}. Expand for all rows.
      </p>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Expand />
            Expand table
          </Button>
        </DialogTrigger>
        <DialogContent className={fullScreenDialogClass}>
          <DialogHeader className="border-b pb-3 pr-10">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-auto">{children}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function bucketCell(row: TimeMatrixRow, label: string) {
  return (
    row.buckets.find((bucket) => bucket.label === label) ?? {
      label,
      count: 0,
      percent: 0,
    }
  );
}

function TimeMatrixTable({
  rows,
  columns,
  title,
  description,
  compactLimit = 10,
}: {
  rows: TimeMatrixRow[];
  columns: string[];
  title: string;
  description: string;
  compactLimit?: number;
}) {
  const [sortKey, setSortKey] = useState<TimeMatrixSortKey>("total");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const sortedRows = useMemo(
    () => sortTimeMatrixRows(rows, sortKey, direction),
    [rows, sortKey, direction],
  );
  const onSort = (column: string) => {
    setDirection(toggleSortDirection(sortKey, column, direction));
    setSortKey(column as TimeMatrixSortKey);
  };

  const renderTable = (tableRows: TimeMatrixRow[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">
              <SortButton label="Name" column="label" activeColumn={sortKey} direction={direction} onSort={onSort} />
            </TableHead>
            <TableHead className="text-right">
              <SortButton label="Total" column="total" activeColumn={sortKey} direction={direction} onSort={onSort} align="right" />
            </TableHead>
            {columns.map((column) => (
              <TableHead key={column} className="min-w-28 text-right">
                <SortButton label={column} column={`bucket:${column}`} activeColumn={sortKey} direction={direction} onSort={onSort} align="right" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableRows.map((row) => (
            <TableRow key={`${row.label}-${row.value ?? "missing"}`}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell className="text-right font-medium">{formatNumber(row.total)}</TableCell>
              {columns.map((column) => {
                const cell = bucketCell(row, column);
                return (
                  <TableCell key={column} className="text-right">
                    <span className="font-medium">{formatNumber(cell.count)}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({formatPercent(cell.percent)})
                    </span>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  if (!rows.length) return <EmptyState message="No rows to display." />;

  const compactRows = sortedRows.slice(0, compactLimit);

  return (
    <>
      {renderTable(compactRows)}
      <ExpandableTableAction
        title={title}
        description={description}
        rowCount={rows.length}
        visibleCount={compactRows.length}
      >
        {renderTable(sortedRows)}
      </ExpandableTableAction>
    </>
  );
}

function SummaryTable({
  rows,
  title,
  description,
  compactLimit = 10,
}: {
  rows: SummaryRow[];
  title: string;
  description: string;
  compactLimit?: number;
}) {
  const [sortKey, setSortKey] = useState<SummaryTableSortKey>("total");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const sortedRows = useMemo(
    () => sortSummaryRows(rows, sortKey, direction),
    [rows, sortKey, direction],
  );
  const onSort = (column: string) => {
    setDirection(toggleSortDirection(sortKey, column, direction));
    setSortKey(column as SummaryTableSortKey);
  };

  if (!rows.length) return <EmptyState message="No rows to display." />;

  const renderTable = (tableRows: SummaryRow[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">
              <SortButton label="Name" column="label" activeColumn={sortKey} direction={direction} onSort={onSort} />
            </TableHead>
            <TableHead className="text-right">
              <SortButton label="Total" column="total" activeColumn={sortKey} direction={direction} onSort={onSort} align="right" />
            </TableHead>
            <TableHead className="text-right">
              <SortButton label="Total %" column="totalSharePercent" activeColumn={sortKey} direction={direction} onSort={onSort} align="right" />
            </TableHead>
            <TableHead className="text-right">
              <SortButton label="Disposed" column="disposed" activeColumn={sortKey} direction={direction} onSort={onSort} align="right" />
            </TableHead>
            <TableHead className="text-right">
              <SortButton label="Disposed %" column="disposedPercent" activeColumn={sortKey} direction={direction} onSort={onSort} align="right" />
            </TableHead>
            <TableHead className="text-right">
              <SortButton label="Pending" column="pending" activeColumn={sortKey} direction={direction} onSort={onSort} align="right" />
            </TableHead>
            <TableHead className="text-right">
              <SortButton label="Pending %" column="pendingPercent" activeColumn={sortKey} direction={direction} onSort={onSort} align="right" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableRows.map((row) => (
            <TableRow key={`${row.label}-${row.value ?? "missing"}`}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell className="text-right">{formatNumber(row.total)}</TableCell>
              <TableCell className="text-right">{formatPercent(row.totalSharePercent)}</TableCell>
              <TableCell className="text-right">{formatNumber(row.disposed)}</TableCell>
              <TableCell className="text-right">{formatPercent(row.disposedPercent)}</TableCell>
              <TableCell className="text-right">{formatNumber(row.pending)}</TableCell>
              <TableCell className="text-right">{formatPercent(row.pendingPercent)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const compactRows = sortedRows.slice(0, compactLimit);

  return (
    <>
      {renderTable(compactRows)}
      <ExpandableTableAction
        title={title}
        description={description}
        rowCount={rows.length}
        visibleCount={compactRows.length}
      >
        {renderTable(sortedRows)}
      </ExpandableTableAction>
    </>
  );
}

function SelectField({
  label,
  value,
  onValueChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  disabled?: boolean;
}) {
  const selectedValue = value || ALL;

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={selectedValue}
        onValueChange={(nextValue) => onValueChange(nextValue || ALL)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FilterFields({
  filters,
  data,
  onChange,
}: {
  filters: DashboardFilters;
  data: DashboardData;
  onChange: (filters: DashboardFilters) => void;
}) {
  const typeOptions = data.metadata.complaintTypes.map((type) => ({
    id: type,
    name: type,
  }));
  const classOptions = data.metadata.incidentClasses.map((incidentClass) => ({
    id: incidentClass,
    name: incidentClass,
  }));
  const sourceOptions = data.metadata.complaintSources.map((source) => ({
    id: source,
    name: source,
  }));

  const setValue = (key: keyof DashboardFilters, value: string) => {
    onChange({
      ...filters,
      [key]: value,
      policeStation: key === "district" ? ALL : filters.policeStation,
    });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <div className="grid gap-1.5">
        <Label htmlFor="date-from" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input id="date-from" type="date" value={filters.from} onChange={(event) => setValue("from", event.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="date-to" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input id="date-to" type="date" value={filters.to} onChange={(event) => setValue("to", event.target.value)} />
      </div>
      <SelectField label="District" value={filters.district} onValueChange={(value) => setValue("district", value)} options={data.metadata.districts} />
      <SelectField label="Complaint type" value={filters.type} onValueChange={(value) => setValue("type", value)} options={typeOptions} />
      <SelectField label="Crime category" value={filters.classOfIncident} onValueChange={(value) => setValue("classOfIncident", value)} options={classOptions} />
      <SelectField label="Source" value={filters.source} onValueChange={(value) => setValue("source", value)} options={sourceOptions} />
      <SelectField
        label="Status"
        value={filters.status}
        onValueChange={(value) => setValue("status", value)}
        options={[
          { id: "disposed", name: "Disposed" },
          { id: "pending", name: "Pending" },
          { id: "unknown", name: "Unknown" },
        ]}
      />
    </div>
  );
}

function TimeAnalysisCard({
  title,
  description,
  districtRows,
  classRows,
  columns,
}: {
  title: string;
  description: string;
  districtRows: TimeMatrixRow[];
  classRows: TimeMatrixRow[];
  columns: string[];
}) {
  return (
    <Card className="bg-card/80">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="district">
          <TabsList>
            <TabsTrigger value="district">District</TabsTrigger>
            <TabsTrigger value="class">Crime category</TabsTrigger>
          </TabsList>
          <TabsContent value="district">
            <TimeMatrixTable
              rows={districtRows}
              columns={columns}
              title={`${title} by district`}
              description={description}
            />
          </TabsContent>
          <TabsContent value="class">
            <TimeMatrixTable
              rows={classRows}
              columns={columns}
              title={`${title} by crime category`}
              description={description}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function DashboardView({
  data,
  filters,
}: {
  data: DashboardData;
  filters: DashboardFilters;
}) {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total complaints" value={formatNumber(data.summary.total)} detail={`${data.filters.from} to ${data.filters.to}`} icon={<CalendarDays className="size-4" />} />
        <MetricCard label="Disposed" value={formatNumber(data.summary.disposed)} detail={`${formatPercent(data.summary.disposedPercent)} of total`} icon={<CheckCircle2 className="size-4" />} />
        <MetricCard label="Pending" value={formatNumber(data.summary.pending)} detail={`${formatPercent(data.summary.pendingPercent)} of total`} icon={<Clock3 className="size-4" />} />
        <MetricCard label="Pending over 30 days" value={formatNumber(data.summary.overThirtyPending)} detail={`Avg disposal ${formatNumber(data.summary.avgDisposalDays)} days`} icon={<AlertCircle className="size-4" />} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SummaryBarChartCard title="District-wise analysis" description="Total, disposed, pending, and state share by district." rows={data.districtRows} detailKind="district" filters={filters} />
        <SummaryBarChartCard title="Crime-category analysis" description="Subject/category analysis using class of incident." rows={data.classOfIncidentRows} detailKind="class" filters={filters} />
      </section>

      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle>Yearly and monthly trends</CardTitle>
          <CardDescription>Complaint inflow and status movement for the active filter.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="monthly">
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
            <TabsContent value="monthly">
              <TrendChart rows={data.monthlyTrends} />
            </TabsContent>
            <TabsContent value="yearly">
              <TrendChart rows={data.yearlyTrends} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <TimeAnalysisCard
          title="Pendency time analysis"
          description="Pending days are calculated from registration date to today."
          districtRows={data.pendencyByDistrict}
          classRows={data.pendencyByClass}
          columns={pendencyColumns}
        />
        <TimeAnalysisCard
          title="Disposal time analysis"
          description="Disposed complaints without disposal date are shown in the Missing date column."
          districtRows={data.disposalByDistrict}
          classRows={data.disposalByClass}
          columns={disposalColumns}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle>Complaint type table</CardTitle>
            <CardDescription>Sortable workflow analysis by complaint type.</CardDescription>
          </CardHeader>
          <CardContent>
            <SummaryTable
              rows={data.complaintTypeRows}
              title="Complaint type table"
              description="Sortable workflow analysis by complaint type."
            />
          </CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle>Crime category table</CardTitle>
            <CardDescription>Sortable subject/category analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            <SummaryTable
              rows={data.classOfIncidentRows}
              title="Crime category table"
              description="Sortable subject/category analysis."
            />
          </CardContent>
        </Card>
      </section>

      {data.filters.district !== ALL ? (
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle>Police station-wise analysis</CardTitle>
            <CardDescription>Uses transfer police station when present, otherwise submit police station.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SummaryBarChartCard title="Police station graph" description="Station-level total, disposed, and pending complaints." rows={data.policeStationRows} detailKind="police-station" filters={filters} compactLimit={12} />
            <SummaryTable
              rows={data.policeStationRows}
              title="Police station table"
              description="Station-level total, disposed, and pending complaints."
              compactLimit={12}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function DatabaseSamplesTable({
  rows,
  compactLimit = 10,
}: {
  rows: DatabaseSample[];
  compactLimit?: number;
}) {
  const [sortKey, setSortKey] = useState<SampleSortKey>("syncedAt");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const sortedRows = useMemo(
    () => sortSamples(rows, sortKey, direction),
    [rows, sortKey, direction],
  );
  const onSort = (column: string) => {
    setDirection(toggleSortDirection(sortKey, column, direction));
    setSortKey(column as SampleSortKey);
  };

  const renderTable = (tableRows: DatabaseSample[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortButton label="Reg no." column="regNum" activeColumn={sortKey} direction={direction} onSort={onSort} /></TableHead>
            <TableHead><SortButton label="District" column="districtName" activeColumn={sortKey} direction={direction} onSort={onSort} /></TableHead>
            <TableHead><SortButton label="Police station" column="policeStationName" activeColumn={sortKey} direction={direction} onSort={onSort} /></TableHead>
            <TableHead><SortButton label="Type" column="typeOfComplaint" activeColumn={sortKey} direction={direction} onSort={onSort} /></TableHead>
            <TableHead><SortButton label="Crime category" column="classOfIncident" activeColumn={sortKey} direction={direction} onSort={onSort} /></TableHead>
            <TableHead><SortButton label="Purpose" column="complaintPurpose" activeColumn={sortKey} direction={direction} onSort={onSort} /></TableHead>
            <TableHead><SortButton label="Status" column="statusRaw" activeColumn={sortKey} direction={direction} onSort={onSort} /></TableHead>
            <TableHead><SortButton label="Reg date" column="regDate" activeColumn={sortKey} direction={direction} onSort={onSort} /></TableHead>
            <TableHead><SortButton label="Disposal" column="disposalDate" activeColumn={sortKey} direction={direction} onSort={onSort} /></TableHead>
            <TableHead><SortButton label="Synced" column="syncedAt" activeColumn={sortKey} direction={direction} onSort={onSort} /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableRows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.regNum ?? "-"}</TableCell>
              <TableCell>{row.districtName ?? "-"}</TableCell>
              <TableCell>{row.policeStationName ?? row.responsiblePsCode ?? "-"}</TableCell>
              <TableCell>{row.typeOfComplaint ?? "-"}</TableCell>
              <TableCell>{row.classOfIncident ?? "-"}</TableCell>
              <TableCell>{row.complaintPurpose ?? "-"}</TableCell>
              <TableCell>{row.statusRaw ?? "-"}</TableCell>
              <TableCell>{formatDate(row.regDate)}</TableCell>
              <TableCell>{formatDate(row.disposalDate)}</TableCell>
              <TableCell>{formatDateTime(row.syncedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const compactRows = sortedRows.slice(0, compactLimit);

  return (
    <>
      {renderTable(compactRows)}
      <ExpandableTableAction
        title="Latest database samples"
        description="Only non-PII dashboard fields are shown."
        rowCount={rows.length}
        visibleCount={compactRows.length}
      >
        {renderTable(sortedRows)}
      </ExpandableTableAction>
    </>
  );
}

function DatabaseView({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [from, setFrom] = useState(data.filters.from);
  const [to, setTo] = useState(data.filters.to);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncRange = async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncRangeInChunks(from, to);
      router.refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Sync failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Rows in database" value={formatNumber(data.database.totalComplaints)} detail="Non-PII complaint analytics rows" icon={<Database className="size-4" />} />
        <MetricCard label="Earliest reg date" value={formatDate(data.database.minRegDate)} detail="Minimum COMPL_REG_DT in DB" icon={<CalendarDays className="size-4" />} />
        <MetricCard label="Latest reg date" value={formatDate(data.database.maxRegDate)} detail="Maximum COMPL_REG_DT in DB" icon={<CalendarDays className="size-4" />} />
        <MetricCard label="Last successful sync" value={formatDateTime(data.database.lastSuccessfulSync?.finishedAt)} detail={`${formatNumber(data.database.lastSuccessfulSync?.upsertedCount)} rows upserted`} icon={<RefreshCw className="size-4" />} />
      </section>

      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle>Sync more data</CardTitle>
          <CardDescription>Select a CCTNS registration date range and sync it into SQLite.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[180px_180px_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor="db-sync-from">From</Label>
            <Input id="db-sync-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="db-sync-to">To</Label>
            <Input id="db-sync-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={syncRange} disabled={syncing}>
              <RefreshCw className={syncing ? "animate-spin" : ""} />
              Sync selected range
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle>Latest database samples</CardTitle>
          <CardDescription>Only non-PII dashboard fields are shown.</CardDescription>
        </CardHeader>
        <CardContent>
          <DatabaseSamplesTable rows={data.database.latestSamples} />
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardShell({ data, detail }: DashboardShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const filters = data.filters;

  const exportQuery = useMemo(() => buildQuery(data.filters), [data.filters]);
  const hasData = data.summary.total > 0;
  const lastSyncLabel = data.metadata.lastSync?.finishedAt
    ? new Date(data.metadata.lastSync.finishedAt).toLocaleString("en-IN")
    : "Not synced";

  const applyFilters = (nextFilters: DashboardFilters) => {
    const nextQuery = buildQuery(nextFilters);
    if (nextQuery === buildQuery(data.filters)) return;

    startTransition(() => {
      router.push(`${detail ? window.location.pathname : "/"}?${nextQuery}`);
    });
  };

  const resetFilters = () => {
    startTransition(() => {
      router.push(detail ? window.location.pathname : "/");
    });
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await syncRangeInChunks(data.filters.from, data.filters.to);
      router.refresh();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-3 sm:p-4 lg:p-6">
        <section className="flex flex-col gap-3 rounded-md border bg-card/80 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold sm:text-2xl">
                {detail ? detail.label : "Haryana Police PHQ Complaint Dashboard"}
              </h1>
              <Badge variant={data.metadata.lastSync?.status === "success" ? "secondary" : "outline"}>
                Last sync: {lastSyncLabel}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {detail
                ? "Filtered disposal and pendency analysis for the selected bar."
                : "Disposal and pendency supervision across districts, complaint categories, and police stations."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {detail ? (
              <Button asChild type="button" variant="outline">
                <Link href="/">Dashboard</Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={runSync} disabled={syncing}>
              <RefreshCw className={syncing ? "animate-spin" : ""} />
              Sync now
            </Button>
            <Button asChild type="button" variant="outline">
              <a href={`/api/export/excel?${exportQuery}`}>
                <FileSpreadsheet />
                Excel
              </a>
            </Button>
            <Button asChild type="button" variant="outline">
              <a href={`/api/export/pdf?${exportQuery}`}>
                <FileText />
                PDF
              </a>
            </Button>
          </div>
        </section>

        <section className="rounded-md border bg-card/80 p-4 shadow-sm">
          <div className="hidden xl:block">
            <FilterFields filters={filters} data={data} onChange={applyFilters} />
          </div>
          <div className="flex items-center justify-between gap-2 xl:hidden">
            <div>
              <div className="text-sm font-medium">Filters</div>
              <div className="text-xs text-muted-foreground">{data.filters.from} to {data.filters.to}</div>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline">
                  <Filter />
                  Open
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[86vh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Dashboard filters</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <FilterFields filters={filters} data={data} onChange={applyFilters} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={resetFilters} disabled={isPending}>Reset</Button>
          </div>
        </section>

        {syncError ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Sync failed</AlertTitle>
            <AlertDescription>{syncError}</AlertDescription>
          </Alert>
        ) : null}

        {!hasData ? (
          <Alert>
            <Download className="size-4" />
            <AlertTitle>No complaints in the local database for this filter</AlertTitle>
            <AlertDescription>Run Sync now for the selected date range, or use npm run sync from the terminal.</AlertDescription>
          </Alert>
        ) : null}

        {detail ? (
          <DashboardView data={data} filters={data.filters} />
        ) : (
          <Tabs defaultValue="dashboard" className="gap-4">
            <TabsList>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="database">Database</TabsTrigger>
            </TabsList>
            <TabsContent value="dashboard">
              <DashboardView data={data} filters={data.filters} />
            </TabsContent>
            <TabsContent value="database">
              <DatabaseView data={data} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}
