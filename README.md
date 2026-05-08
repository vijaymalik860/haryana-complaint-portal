# Haryana Police Complaint Supervision Portal

Local Next.js dashboard for PHQ supervision of complaint disposal and pendency.
It syncs CCTNS complaint and master data into Postgres, then serves district,
complaint-type, trend, pendency, disposal-time, and police-station analysis.

## Local Setup

```bash
npm install
npm run db:init
npm run sync
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Set `DATABASE_URL` in `.env` to your Postgres connection string (for example,
Neon).

## Useful Commands

```bash
npm run sync
npm run sync -- --from 2026-04-01 --to 2026-04-29
npm run sync:watch
npm test
npm run lint
npm run build
```

## Data Handling

The sync stores only dashboard fields needed for analytics. It excludes
complainant name, mobile, address, email, and complaint description.

Police-station ownership uses `TRANSFER_PS_CD` when present and non-zero,
otherwise `SUBMIT_PS_CD`.

Pending age is calculated from `COMPL_REG_DT` to today in Asia/Kolkata.

