# OptionCharts Scraper API

Scrapes [optioncharts.io](https://optioncharts.io) option metrics and exposes them as an API. Metrics are returned in this order: **IVR, TOI, PCRO, TOA, TV, PCRV, TVA**.

| Field | Meaning |
|-------|--------|
| IVR | IV Rank |
| TOI | Today's Open Interest |
| PCRO | Put-Call Ratio (Open Interest) |
| TOA | Today vs Open Interest Avg (30-day) |
| TV | Today's Volume |
| PCRV | Put-Call Ratio (Volume) |
| TVA | Today vs Volume Avg (30-day) |

## Scraping schedule

- **Timed:** 20:50 Taiwan time (12:50 UTC) on **trading days** (Mon–Fri). Runs inside the same API process (no separate service).
- **Manual:** Call the API anytime.

**One API** handles both: the scheduled job is a cron inside the app that calls the same scrape logic. You do **not** need two separate APIs.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info and doc links |
| GET | `/health` | Health check (for Railway) |
| GET | `/api/options/:ticker` | **Manual trigger** — scrape now, return metrics, and append to snapshots |
| GET | `/api/options/:ticker/snapshots?limit=50` | Stored snapshots for that ticker |

Example:

```bash
curl "https://your-app.railway.app/api/options/AVAV"
```

Response (order IVR → TOI → PCRO → TOA → TV → PCRV → TVA):

```json
{
  "ticker": "AVAV",
  "IVR": "90.49%",
  "TOI": "44,984",
  "PCRO": "0.86",
  "TOA": "95.58%",
  "TV": "4,087",
  "PCRV": "0.39",
  "TVA": "52.17%",
  "timestamp": "2026-02-10T12:50:00.000Z",
  "source": "manual"
}
```

## Run locally

```bash
npm install
npx playwright install chromium
npm start
# Manual scrape:
curl http://localhost:3000/api/options/AVAV
```

CLI (no server):

```bash
node scrape-avav.js AVAV
```

## Deploy on Railway

1. **Connect repo**  
   New Project → Deploy from GitHub → select this repo.

2. **Build**  
   Railway will use the repo `Dockerfile` (Playwright image with Chromium). No extra build step.

3. **Env (optional)**  
   - `PORT` — set by Railway.  
   - `SCHEDULED_TICKERS` — comma-separated tickers to scrape at 20:50 Taiwan (default: `AVAV`).  
   - `DATA_DIR` — where to store snapshots (default: `./data`). For persistence across deploys, add a **Volume** and set `DATA_DIR` to the mount path (e.g. `/data`).

4. **Persistence (optional)**  
   To keep snapshots across redeploys: add a Volume in the Railway dashboard, mount it (e.g. at `/data`), and set `DATA_DIR=/data`.

5. **Cron**  
   No separate cron service. The app runs the scheduled scrape at **20:50 Taiwan (12:50 UTC)** on **Mon–Fri** inside the same process.

## Env summary

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port (Railway sets this) |
| `SCHEDULED_TICKERS` | AVAV | Tickers to scrape on schedule (comma-separated) |
| `DATA_DIR` | ./data | Directory for snapshot JSON (use volume path on Railway to persist) |
| `RAILWAY` | — | Set in Dockerfile for Playwright sandbox flags |
