-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "regNum" TEXT,
    "srNo" TEXT,
    "districtName" TEXT,
    "typeOfComplaint" TEXT,
    "complaintSource" TEXT,
    "receptionMode" TEXT,
    "incidentType" TEXT,
    "classOfIncident" TEXT,
    "respondentCategories" TEXT,
    "complainantType" TEXT,
    "complaintPurpose" TEXT,
    "statusRaw" TEXT,
    "statusGroup" TEXT NOT NULL,
    "regDate" TIMESTAMP(3),
    "disposalDate" TIMESTAMP(3),
    "disposalDays" INTEGER,
    "submitPsCode" TEXT,
    "transferPsCode" TEXT,
    "responsiblePsCode" TEXT,
    "submitOfficeCode" TEXT,
    "transferOfficeCode" TEXT,
    "responsibleOfficeCode" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliceStation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "districtName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoliceStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timeFrom" TIMESTAMP(3),
    "timeTo" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "upsertedCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintAggDaily" (
    "id" SERIAL NOT NULL,
    "regDate" TIMESTAMP(3) NOT NULL,
    "districtKey" TEXT NOT NULL,
    "psKey" TEXT NOT NULL,
    "typeKey" TEXT NOT NULL,
    "classKey" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "statusGroup" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "disposedDaysSum" INTEGER NOT NULL DEFAULT 0,
    "disposedDaysCount" INTEGER NOT NULL DEFAULT 0,
    "disposedMissingDateCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintAggDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintAggDisposalBucketDaily" (
    "id" SERIAL NOT NULL,
    "regDate" TIMESTAMP(3) NOT NULL,
    "districtKey" TEXT NOT NULL,
    "psKey" TEXT NOT NULL,
    "typeKey" TEXT NOT NULL,
    "classKey" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "statusGroup" TEXT NOT NULL,
    "disposalBucket" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintAggDisposalBucketDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregateRefreshState" (
    "id" INTEGER NOT NULL,
    "lastRefreshedAt" TIMESTAMP(3),
    "lastRangeFrom" TIMESTAMP(3),
    "lastRangeTo" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "message" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregateRefreshState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Complaint_regDate_idx" ON "Complaint"("regDate");

-- CreateIndex
CREATE INDEX "Complaint_districtName_idx" ON "Complaint"("districtName");

-- CreateIndex
CREATE INDEX "Complaint_statusGroup_idx" ON "Complaint"("statusGroup");

-- CreateIndex
CREATE INDEX "Complaint_typeOfComplaint_idx" ON "Complaint"("typeOfComplaint");

-- CreateIndex
CREATE INDEX "Complaint_classOfIncident_idx" ON "Complaint"("classOfIncident");

-- CreateIndex
CREATE INDEX "Complaint_complaintSource_idx" ON "Complaint"("complaintSource");

-- CreateIndex
CREATE INDEX "Complaint_responsiblePsCode_idx" ON "Complaint"("responsiblePsCode");

-- CreateIndex
CREATE UNIQUE INDEX "District_name_key" ON "District"("name");

-- CreateIndex
CREATE INDEX "PoliceStation_districtId_idx" ON "PoliceStation"("districtId");

-- CreateIndex
CREATE INDEX "PoliceStation_districtName_idx" ON "PoliceStation"("districtName");

-- CreateIndex
CREATE INDEX "SyncRun_kind_idx" ON "SyncRun"("kind");

-- CreateIndex
CREATE INDEX "SyncRun_status_idx" ON "SyncRun"("status");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "ComplaintAggDaily_regDate_idx" ON "ComplaintAggDaily"("regDate");

-- CreateIndex
CREATE INDEX "ComplaintAggDaily_districtKey_idx" ON "ComplaintAggDaily"("districtKey");

-- CreateIndex
CREATE INDEX "ComplaintAggDaily_psKey_idx" ON "ComplaintAggDaily"("psKey");

-- CreateIndex
CREATE INDEX "ComplaintAggDaily_typeKey_idx" ON "ComplaintAggDaily"("typeKey");

-- CreateIndex
CREATE INDEX "ComplaintAggDaily_classKey_idx" ON "ComplaintAggDaily"("classKey");

-- CreateIndex
CREATE INDEX "ComplaintAggDaily_sourceKey_idx" ON "ComplaintAggDaily"("sourceKey");

-- CreateIndex
CREATE INDEX "ComplaintAggDaily_statusGroup_idx" ON "ComplaintAggDaily"("statusGroup");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintAggDaily_regDate_districtKey_psKey_typeKey_classKe_key" ON "ComplaintAggDaily"("regDate", "districtKey", "psKey", "typeKey", "classKey", "sourceKey", "statusGroup");

-- CreateIndex
CREATE INDEX "ComplaintAggDisposalBucketDaily_regDate_idx" ON "ComplaintAggDisposalBucketDaily"("regDate");

-- CreateIndex
CREATE INDEX "ComplaintAggDisposalBucketDaily_districtKey_idx" ON "ComplaintAggDisposalBucketDaily"("districtKey");

-- CreateIndex
CREATE INDEX "ComplaintAggDisposalBucketDaily_psKey_idx" ON "ComplaintAggDisposalBucketDaily"("psKey");

-- CreateIndex
CREATE INDEX "ComplaintAggDisposalBucketDaily_typeKey_idx" ON "ComplaintAggDisposalBucketDaily"("typeKey");

-- CreateIndex
CREATE INDEX "ComplaintAggDisposalBucketDaily_classKey_idx" ON "ComplaintAggDisposalBucketDaily"("classKey");

-- CreateIndex
CREATE INDEX "ComplaintAggDisposalBucketDaily_sourceKey_idx" ON "ComplaintAggDisposalBucketDaily"("sourceKey");

-- CreateIndex
CREATE INDEX "ComplaintAggDisposalBucketDaily_statusGroup_idx" ON "ComplaintAggDisposalBucketDaily"("statusGroup");

-- CreateIndex
CREATE INDEX "ComplaintAggDisposalBucketDaily_disposalBucket_idx" ON "ComplaintAggDisposalBucketDaily"("disposalBucket");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintAggDisposalBucketDaily_regDate_districtKey_psKey_t_key" ON "ComplaintAggDisposalBucketDaily"("regDate", "districtKey", "psKey", "typeKey", "classKey", "sourceKey", "statusGroup", "disposalBucket");

