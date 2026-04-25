import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const EVENTS_FILE = path.join(DATA_DIR, "external_events.json");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");

let eventsCache = null;
let reportsCache = null;

// small helper to avoid corruption on partial writes
async function writeAtomic(filePath, jsonObj) {
  const tmp = filePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(jsonObj, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

async function readJson(filePath, fallback) {
  try {
    const s = await fs.readFile(filePath, "utf8");
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

async function loadCacheIfEmpty() {
  if (eventsCache === null) {
    eventsCache = await readJson(EVENTS_FILE, { events: [] });
  }
  if (reportsCache === null) {
    reportsCache = await readJson(REPORTS_FILE, { reports: [] });
  }
}

export async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await loadCacheIfEmpty();

  if (!eventsCache?.events) {
    eventsCache = { events: [] };
    await writeAtomic(EVENTS_FILE, eventsCache);
  }
  if (!reportsCache?.reports) {
    reportsCache = { reports: [] };
    await writeAtomic(REPORTS_FILE, reportsCache);
  }
}

export async function getAll() {
  await loadCacheIfEmpty();
  return {
    externalEvents: eventsCache.events || [],
    reports: reportsCache.reports || [],
  };
}

export async function upsertExternalEvents(incoming) {
  await loadCacheIfEmpty();
  const map = new Map((eventsCache.events || []).map(e => [e.id, e]));

  let inserted = 0;
  for (const e of incoming) {
    if (!map.has(e.id)) inserted++;
    map.set(e.id, e);
  }

  const merged = Array.from(map.values());
  const newEventsObj = { events: merged };

  // Update cache immediately
  eventsCache = newEventsObj;

  try {
    await writeAtomic(EVENTS_FILE, newEventsObj);
  } catch (err) {
    console.error("CRITICAL: Failed to write external events to disk, cache may be out of sync. Reloading from disk.");
    eventsCache = await readJson(EVENTS_FILE, { events: [] });
    throw err;
  }

  return { inserted, total: merged.length };
}

export async function addReport({ type, severity, description, lat, lon }) {
  await loadCacheIfEmpty();
  const now = Date.now();

  const report = {
    id: "r_" + crypto.randomBytes(8).toString("hex"),
    type,
    severity,
    description,
    lat,
    lon,
    time: now,
  };

  const arr = reportsCache.reports ? [...reportsCache.reports] : [];
  arr.push(report);

  // simple retention: cap to last 2000
  arr.sort((a, b) => b.time - a.time);
  const capped = arr.slice(0, 2000);

  const newReportsObj = { reports: capped };

  // Update cache immediately
  reportsCache = newReportsObj;

  try {
    await writeAtomic(REPORTS_FILE, newReportsObj);
  } catch (err) {
    console.error("CRITICAL: Failed to write reports to disk, cache may be out of sync. Reloading from disk.");
    reportsCache = await readJson(REPORTS_FILE, { reports: [] });
    throw err;
  }

  return report;
}
