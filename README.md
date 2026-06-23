# PCR OC 2026Jun

Mobile-first Put/Call Ratio tracker with an OptionCharts-backed API and Cloudflare Pages frontend.

The deployable UI lives in `public/`. It lets a phone user enter a symbol, choose 20/60 trading sessions, draw a PCR curve, add the symbol to a watchlist, remove saved curves, refresh watchlist curves, and sort by curve build date.

The active PCR data source is **OptionCharts only**. The app reads OptionCharts open-interest history and charts daily OI PCR.

```text
Daily OI PCR = total put open interest / total call open interest
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info and doc links |
| GET | `/health` | Health check for local/Express runs |
| GET | `/api/pcr/:ticker?days=20` | OptionCharts-powered PCR history |
| GET | `/api/watchlists` | Load shared watchlist symbols |
| POST | `/api/watchlists` | Save shared watchlist symbols |

Example:

```bash
curl "https://pcr-oc-2026jun.pages.dev/api/pcr/PLTR?days=20"
```

Response:

```json
{
  "ticker": "PLTR",
  "days": 20,
  "source": "optioncharts.io",
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

## Cloudflare Pages preparation

Cloudflare direct upload is prepared with `wrangler.toml`, Pages Functions in `functions/`, and these npm scripts:

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
CLOUDFLARE_ACCOUNT_ID=<ACCOUNT_ID> npx wrangler pages deploy public --project-name=pcr-oc-2026jun
```

## Deploy frontend on Cloudflare Pages

Use this to serve the static UI and API from Cloudflare.

1. **Cloudflare Pages**  
   - [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → select this repo.  
   - **Build settings:**  
     - **Framework preset:** None  
     - **Build command:** (leave empty)  
     - **Build output directory:** `public`  
   - **Project name:** use `pcr-oc-2026jun` so the default URL is **https://pcr-oc-2026jun.pages.dev**.  
   - Deploy. The site will be served from the `public` folder; `/api/*` routes are served by Pages Functions.

2. **Direct deploy**
   ```bash
   npm run pages:deploy
   ```

## Watchlists and data in the repo

- **Portfolios** are labeled **RH / AL / 33 / DF / 55 / 66** (stored as 1–6 in the app).
- **Default symbols** live in `lib/defaultWatchlists.js` (keys `"1"`–`"6"` = RH–66).
- **Cross-device sync:** Watchlists are served through `GET /api/watchlists` and saved through `POST /api/watchlists`. Without a Cloudflare KV binding named `WATCHLISTS`, the API falls back to the committed defaults.

## Env summary

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Local Express server port |
| `DATA_DIR` | ./data | Local Express watchlist JSON directory |
## OptionCharts PCR endpoint

The mobile chart calls:

```bash
GET /api/pcr/AAPL?days=20
```

This endpoint reads OptionCharts' open-interest history chart data and returns the latest requested number of OI put-call ratio points. It does not require an API token.
