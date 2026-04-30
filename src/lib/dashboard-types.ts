export type StatusGroup = "disposed" | "pending" | "unknown";

export type DashboardFilters = {
  from: string;
  to: string;
  district: string;
  policeStation: string;
  type: string;
  classOfIncident: string;
  source: string;
  status: "all" | StatusGroup;
};

export type OptionItem = {
  id: string;
  name: string;
  districtName?: string;
};

export type SummaryRow = {
  value: string | null;
  label: string;
  total: number;
  disposed: number;
  pending: number;
  unknown: number;
  totalSharePercent: number;
  disposedPercent: number;
  pendingPercent: number;
  avgDisposalDays: number | null;
};

export type TrendRow = {
  label: string;
  total: number;
  disposed: number;
  pending: number;
};

export type BucketRow = {
  label: string;
  count: number;
  percent: number;
};

export type TimeBucketCell = {
  label: string;
  count: number;
  percent: number;
};

export type TimeMatrixRow = {
  value: string | null;
  label: string;
  total: number;
  buckets: TimeBucketCell[];
};

export type DashboardSummary = {
  total: number;
  disposed: number;
  pending: number;
  unknown: number;
  disposedPercent: number;
  pendingPercent: number;
  overThirtyPending: number;
  avgDisposalDays: number | null;
  missingDisposalDates: number;
};

export type DatabaseSample = {
  id: string;
  regNum: string | null;
  districtName: string | null;
  policeStationName: string | null;
  responsiblePsCode: string | null;
  typeOfComplaint: string | null;
  classOfIncident: string | null;
  complaintPurpose: string | null;
  statusRaw: string | null;
  regDate: string | null;
  disposalDate: string | null;
  syncedAt: string;
};

export type DatabaseOverview = {
  totalComplaints: number;
  minRegDate: string | null;
  maxRegDate: string | null;
  latestSamples: DatabaseSample[];
  lastSuccessfulSync: {
    finishedAt: string | null;
    timeFrom: string | null;
    timeTo: string | null;
    fetchedCount: number;
    upsertedCount: number;
  } | null;
};

export type DashboardData = {
  filters: DashboardFilters;
  generatedAt: string;
  summary: DashboardSummary;
  districtRows: SummaryRow[];
  complaintTypeRows: SummaryRow[];
  classOfIncidentRows: SummaryRow[];
  monthlyTrends: TrendRow[];
  yearlyTrends: TrendRow[];
  pendencyBuckets: BucketRow[];
  disposalBuckets: BucketRow[];
  pendencyByDistrict: TimeMatrixRow[];
  pendencyByClass: TimeMatrixRow[];
  disposalByDistrict: TimeMatrixRow[];
  disposalByClass: TimeMatrixRow[];
  policeStationRows: SummaryRow[];
  database: DatabaseOverview;
  metadata: {
    districts: OptionItem[];
    policeStations: OptionItem[];
    complaintTypes: string[];
    incidentClasses: string[];
    complaintSources: string[];
    lastSync: {
      status: string;
      finishedAt: string | null;
      fetchedCount: number;
      upsertedCount: number;
      message: string | null;
    } | null;
  };
};
