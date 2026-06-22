# PCR Tracker

Mobile-first Put/Call Ratio tracker with a Marketdata.app-backed Express API and a static Cloudflare Pages frontend.

The deployable UI lives in `public/`. It lets a phone user enter a symbol, choose 20/60 trading sessions, draw a PCR curve, add the symbol to a watchlist, remove saved curves, refresh watchlist curves, and sort by curve build date.

The active PCR data source is **Marketdata.app only**. The app uses Marketdata stock candles to identify trading sessions and Marketdata option-chain open interest to compute daily OI PCR.

```text
Daily OI PCR = total put open interest / total call open interest
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info and doc links |
| GET | `/health` | Health check (for Railway) |
| GET | `/api/pcr/:ticker?days=20&scope=near&dte=30` | Marketdata-powered PCR history |
| GET | `/api/watchlists` | Load shared watchlist symbols |
| POST | `/api/watchlists` | Save shared watchlist symbols |

Example:

```bash
curl "https://your-app.railway.app/api/pcr/PLTR?days=20&scope=near&dte=30"
```

Response:

```json
{
  "ticker": "PLTR",
  "days": 20,
  "source": "marketdata.app",
  "scope": "near",
  "dte": 30,
  "ratioField": "PCRO",
  "points": [
    {
      "date": "2026-06-18",
      "PCRO": 1.08,
      "putOpenInterest": 123,
      "callOpenInterest": 114
    }
  ]
}
```

## Run locally

```bash
npm install
npm start

# Open the app:
# http://127.0.0.1:3000

# PCR history:
curl "http://localhost:3000/api/pcr/PLTR?days=20"
```

## Deploy on Railway

1. **Connect repo**  
   New Project → Deploy from GitHub → select this repo.

2. **Build**  
   Railway will use the repo `Dockerfile` (Playwright image with Chromium). No extra build step.

3. **Env**  
   - `PORT` — set by Railway.  
   - `MARKETDATA_API_TOKEN` — Marketdata.app Bearer token.  
   - `DATA_DIR` — where to store watchlists (default: `./data`). For persistence across deploys, add a **Volume** and set `DATA_DIR` to the mount path (e.g. `/data`).

4. **Persistence (optional)**  
   To keep watchlists across redeploys: add a Volume in the Railway dashboard, mount it (e.g. at `/data`), and set `DATA_DIR=/data`.

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
   Deploy the full app (API + static) on Railway and note the public URL (e.g. `https://optionscan.up.railway.app`).

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
- **Cross-device sync:** Watchlists are saved on the API server (Railway). When you add or remove symbols, the app pushes to `POST /api/watchlists`. When you open the app on another phone or browser, it loads from `GET /api/watchlists`, so you see the same symbols everywhere. PCR curves are fetched live from Marketdata.app.

## Persist Watchlists Across Devices (Railway Volume)

Without a **Volume**, the app’s data directory is wiped on every deploy or restart, so other devices may not see the same watchlists. Do this once on Railway:

1. Open **[Railway](https://railway.app)** → your project → select the **optionscan** service.
2. **Add a Volume:** Press **⌘K** (or right-click the canvas) → **Add Volume** → choose the **optionscan** service.
3. **Mount path:** Set the volume’s mount path to **`/app/data`** (the app’s default `DATA_DIR` is `./data` = `/app/data` in the container). No need to set a `DATA_DIR` variable.
4. **Redeploy** the service (e.g. from the Deployments tab) so the new volume is mounted.

After that, watchlists are stored on the volume and persist across restarts and deploys. All devices using **optionscan.pages.dev** will then load the same symbols from the API.

## Env summary

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port (Railway sets this) |
| `DATA_DIR` | ./data | Directory for watchlist JSON (use volume path on Railway to persist) |
| `RAILWAY` | — | Set in Dockerfile for Playwright sandbox flags |
| `MARKETDATA_API_TOKEN` | — | Marketdata.app Bearer token used by `/api/pcr/:ticker` |

## Marketdata PCR endpoint

The mobile chart calls:

```bash
GET /api/pcr/AAPL?days=20&scope=near&dte=30
```

This endpoint uses Marketdata.app's stock candles API to find real trading sessions, then uses the option chain API with Bearer token authentication to compute put/call ratios from option-chain open-interest fields. By default it uses `scope=near&dte=30`, meaning the chain closest to 30 days to expiration. Use `scope=all` only when you explicitly want full-chain PCR.

For local development, put the token in `.env.local`:

```bash
MARKETDATA_API_TOKEN=...
```

For Railway production, add the same variable in the Railway service variables before or immediately after deploying the backend.
