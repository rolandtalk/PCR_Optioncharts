import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const WATCHLISTS_FILE = join(DATA_DIR, 'watchlists.json');
const MAX_WATCHLIST_LEN = 30;

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load watchlists from disk. Shape: { "1": ["AVAV", ...], "2": [], ... "6": [] }
 */
export function loadWatchlists() {
  ensureDir();
  if (!existsSync(WATCHLISTS_FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync(WATCHLISTS_FILE, 'utf8'));
    const out = {};
    for (let i = 1; i <= 6; i++) {
      const key = String(i);
      const list = Array.isArray(raw[key]) ? raw[key] : [];
      out[key] = list.slice(0, MAX_WATCHLIST_LEN).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Save watchlists to disk. Same shape.
 */
export function saveWatchlists(watchlists) {
  ensureDir();
  const out = {};
  for (let i = 1; i <= 6; i++) {
    const key = String(i);
    const list = Array.isArray(watchlists[key]) ? watchlists[key] : [];
    out[key] = list.slice(0, MAX_WATCHLIST_LEN).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  }
  writeFileSync(WATCHLISTS_FILE, JSON.stringify(out, null, 0), 'utf8');
}
