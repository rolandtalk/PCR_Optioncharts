# PCR Tracker

Mobile-first Put/Call Ratio tracker with an Express scraper/API and a static Cloudflare Pages frontend.

The deployable UI lives in `public/`. It lets a phone user enter a symbol, choose 20/60 records, draw a PCR curve, add the symbol to a watchlist, remove saved curves, and sort by curve build date.

The existing API scrapes [optioncharts.io](https://optioncharts.io) option metrics and exposes them in this order: **IVR, TOI, PCRO, TOA, TV, PCRV, TVA**.

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

- **Timed:** 22:15 Taiwan time (14:15 UTC) on **trading days** (Mon–Fri). Runs inside the same API process (no separate service).
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

# Open the app:
# http://127.0.0.1:3000

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
   - `SCHEDULED_TICKERS` — comma-separated tickers to scrape at 22:15 Taiwan (default: `AVAV`).  
   - `DATA_DIR` — where to store snapshots (default: `./data`). For persistence across deploys, add a **Volume** and set `DATA_DIR` to the mount path (e.g. `/data`).

4. **Persistence (optional)**  
   To keep snapshots across redeploys: add a Volume in the Railway dashboard, mount it (e.g. at `/data`), and set `DATA_DIR=/data`.

5. **Cron**  
   No separate cron service. The app runs the scheduled scrape at **22:15 Taiwan (14:15 UTC)** on **Mon–Fri** inside the same process.

## Cloudflare Pages preparation

Cloudflare direct upload is prepared with `wrangler.toml` and these npm scripts:

```bash
npm run pages:dev
npm run pages:deploy
```

For direct deploy, you will need to provide these values in your terminal environment, not in the repo:

```bash
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-pages-token"
npm run pages:deploy
```

The API token needs Cloudflare Pages write access for the account/project. Keep it private. Do not paste it into source files or commit it.

Current Cloudflare docs for direct upload use:

```bash
CLOUDFLARE_ACCOUNT_ID=<ACCOUNT_ID> npx wrangler pages deploy <DIRECTORY> --project-name=<PROJECT_NAME>
```

For this repo, that becomes:

```bash
CLOUDFLARE_ACCOUNT_ID=<ACCOUNT_ID> npx wrangler pages deploy public --project-name=optionscan
```

## Deploy frontend on Cloudflare Pages (optionscan.pages.dev)

Use this to serve the **static UI** from Cloudflare while the **API** stays on Railway.

1. **Railway**  
   Deploy the full app (API + static) on Railway and note the public URL (e.g. `https://optioncharts-production.up.railway.app`).

2. **Point frontend at the API**  
   Edit `public/config.json`: set `railwayUrl` to your Railway URL (no trailing slash).  
   When the app is opened on a `*.pages.dev` host, it will use this URL for all `/api/*` requests.

3. **Cloudflare Pages**  
   - [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → select this repo.  
   - **Build settings:**  
     - **Framework preset:** None  
     - **Build command:** (leave empty)  
     - **Build output directory:** `public`  
   - **Project name:** use `optionscan` so the default URL is **https://optionscan.pages.dev**.  
   - Deploy. The site will be served from the `public` folder; `/data/watchlists.json` and `/config.json` come from the repo.

4. **Custom domain (optional)**  
   In the Pages project → **Custom domains** → add `optionscan.pages.dev` if you want it explicitly set (often it’s already the default).

## Watchlists and data in the repo

- **Portfolios** are labeled **RH / AL / 33 / DF / 55 / 66** (stored as 1–6 in the app).
- **Default symbols** live in `public/data/watchlists.json` (keys `"1"`–`"6"` = RH–66). The app loads this on first visit and seeds empty portfolios; you can edit the file and commit to change defaults.
- In the UI, **Export for repo** downloads the current watchlists as `watchlists.json`; save it to `public/data/watchlists.json` and commit to sync your symbols to the repo.
- **Cross-device sync:** Watchlists are saved on the API server (Railway). When you add or remove symbols, the app pushes to `POST /api/watchlists`. When you open the app on another phone or browser, it loads from `GET /api/watchlists`, so you see the same symbols everywhere. Option data (snapshots) already lives on the server, so it’s the same on all devices. For watchlists to persist across Railway redeploys, use a **Volume** and set `DATA_DIR` to the volume path (same as for snapshots).

## See records across devices (Railway Volume)

Without a **Volume**, the app’s data directory is wiped on every deploy or restart, so other devices never see the same watchlists or option records. Do this once on Railway:

1. Open **[Railway](https://railway.app)** → your project → select the **optioncharts** service.
2. **Add a Volume:** Press **⌘K** (or right‑click the canvas) → **Add Volume** → choose the **optioncharts** service.
3. **Mount path:** Set the volume’s mount path to **`/app/data`** (the app’s default `DATA_DIR` is `./data` = `/app/data` in the container). No need to set a `DATA_DIR` variable.
4. **Redeploy** the service (e.g. from the Deployments tab) so the new volume is mounted.

After that, watchlists and snapshots are stored on the volume and persist across restarts and deploys. All devices using **optionscan.pages.dev** will then load the same symbols and option data from the API.

## Env summary

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port (Railway sets this) |
| `SCHEDULED_TICKERS` | AVAV | Tickers to scrape on schedule (comma-separated) |
| `DATA_DIR` | ./data | Directory for snapshot JSON (use volume path on Railway to persist) |
| `RAILWAY` | — | Set in Dockerfile for Playwright sandbox flags |
| `MARKETDATA_API_TOKEN` | — | Marketdata.app Bearer token used by `/api/pcr/:ticker` |

## Marketdata PCR endpoint

The mobile chart calls:

```bash
GET /api/pcr/AAPL?days=20&scope=near&dte=30
```

This endpoint uses Marketdata.app's stock candles API to find real trading sessions, then uses the option chain API with Bearer token authentication to compute put/call ratios from option-chain volume and open-interest fields. By default it uses `scope=near&dte=30`, meaning the chain closest to 30 days to expiration, which is cheaper and more reliable for newer or less-liquid symbols than querying every expiration. Use `scope=all` only when you explicitly want full-chain PCR.

For local development, put the token in `.env.local`:

```bash
MARKETDATA_API_TOKEN=...
```

For Railway production, add the same variable in the Railway service variables before or immediately after deploying the backend.
