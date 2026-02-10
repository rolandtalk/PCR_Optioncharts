import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const SNAPSHOTS_FILE = join(DATA_DIR, 'snapshots.json');
const MAX_SNAPSHOTS_PER_TICKER = 500;

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadSnapshots() {
  ensureDir();
  if (!existsSync(SNAPSHOTS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SNAPSHOTS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSnapshots(snapshots) {
  ensureDir();
  writeFileSync(SNAPSHOTS_FILE, JSON.stringify(snapshots, null, 0), 'utf8');
}

/**
 * Append a snapshot. Shape: { ticker, timestamp (ISO), IVR, TOI, ... }
 */
export function appendSnapshot(record) {
  const snapshots = loadSnapshots();
  const ticker = (record.ticker || '').toUpperCase();
  if (!ticker) return;
  if (!Array.isArray(snapshots[ticker])) snapshots[ticker] = [];
  snapshots[ticker].unshift({
    ...record,
    timestamp: record.timestamp || new Date().toISOString(),
  });
  snapshots[ticker] = snapshots[ticker].slice(0, MAX_SNAPSHOTS_PER_TICKER);
  saveSnapshots(snapshots);
}

/**
 * Get latest N snapshots for a ticker (default 100).
 */
export function getSnapshots(ticker, limit = 100) {
  const snapshots = loadSnapshots();
  const list = snapshots[(ticker || '').toUpperCase()] || [];
  return list.slice(0, limit);
}
